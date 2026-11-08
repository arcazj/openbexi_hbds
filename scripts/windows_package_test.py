"""Install, run, upgrade and uninstall a native Windows release in temporary folders."""
from __future__ import annotations
import argparse
import json
import os
import platform
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def wait(predicate, label, timeout=45):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        try:
            value=predicate()
            if value: return value
        except (OSError, ValueError): pass
        time.sleep(.15)
    raise AssertionError('Timed out: '+label)

def read_json(path): return json.loads(path.read_text(encoding='utf-8'))

def browser_check(base):
    import collaboration_browser_regression as browser
    port=browser.get_free_port()
    process=browser.launch_browser(port)
    page=None
    try:
        browser.wait_for_browser(port,process)
        page=browser.BrowserPage(browser.create_target(port))
        page.cdp.send('Network.enable')
        page.cdp.send('Network.setBlockedURLs',{'urls':['https://*']})
        page.navigate(base+'/index.html#edit')
        browser.wait_for(page,"return Boolean(document.querySelector('#view-frame')?.contentWindow?.HBDSQuerySource);",'packaged offline editor',timeout=70)
        page.click('[data-view="query"]')
        browser.wait_for(page,"return document.querySelector('#query-frame')?.contentDocument?.querySelector('#mq-functor')?.disabled===false;",'packaged offline Query')
        assert page.evaluate("document.querySelector('#app-version').textContent==='v2.7'")
        assert not page.significant_errors(),page.significant_errors()
        print('PASS packaged browser: offline editor, renderer, Query and version',flush=True)
    finally:
        if page: page.close()
        browser.terminate_process(process,'package-browser')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arch',choices=('x64','arm64'),required=True)
    parser.add_argument('--skip-browser',action='store_true')
    args=parser.parse_args()
    native='arm64' if platform.machine().lower() in ('arm64','aarch64') else 'x64'
    if os.name!='nt' or args.arch!=native: raise RuntimeError('Run this check on the package native Windows architecture.')
    import winreg
    for view in (winreg.KEY_WOW64_32KEY,winreg.KEY_WOW64_64KEY):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,r'Software\OpenBEXI\HBDS',0,winreg.KEY_READ|view):
                raise RuntimeError('An existing user installation is present; use a clean Windows user for the installer check.')
        except FileNotFoundError: pass
    version=(ROOT/'VERSION').read_text().strip()
    installer=ROOT/'dist'/f'openbexi-hbds-{version}-windows-{args.arch}-setup.exe'
    with tempfile.TemporaryDirectory(prefix='hbds-windows-package-') as temporary:
        folder=Path(temporary).resolve()
        folder.relative_to(Path(tempfile.gettempdir()).resolve())
        install=folder/'Application';data=folder/'UserData'
        env={**os.environ,'HBDS_DATA_DIR':str(data),'HBDS_AI_ENABLED':'0','PYTHONDONTWRITEBYTECODE':'1'}
        for key in ('OPENAI_API_KEY','ANTHROPIC_API_KEY','HBDS_AI_CUSTOM_API_KEY'): env.pop(key,None)
        process=None
        blocker=socket.socket()
        try:
            try: blocker.bind(('127.0.0.1',8010));blocker.listen()
            except OSError: blocker.close()
            subprocess.run([str(installer),'/S','/D='+str(install)],env=env,check=True,timeout=180)
            python=install/'runtime/python.exe'
            launcher=install/'launcher.py'
            assert python.exists() and (install/'LICENSE.txt').exists()
            machine=subprocess.check_output([str(python),'-c','import platform;print(platform.machine())'],text=True).strip().lower()
            assert machine in (('arm64','aarch64') if args.arch=='arm64' else ('amd64','x86_64')),machine
            process=subprocess.Popen([str(python),str(launcher),'--no-browser'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            session=data/'desktop-session.json'
            state=wait(lambda:read_json(session),'launcher state')
            assert state['port']!=8010,'Launcher did not handle the occupied port'
            base='http://127.0.0.1:'+str(state['port'])
            with urllib.request.urlopen(base+'/api/openapi.json') as response:
                assert json.load(response)['info']['version']==version
            for path in ('/index.html','/js/vendor/three/build/three.module.js','/js/vendor/swagger-ui-dist/swagger-ui-bundle.js','/models/models_manifest.json'):
                print('Checking packaged asset '+path,flush=True)
                with urllib.request.urlopen(base+path) as response: assert response.status==200
            subprocess.run([str(python),str(launcher),'--no-browser'],env=env,check=True,timeout=15)
            assert read_json(session)['pid']==state['pid'],'Second launch replaced the running server'
            if not args.skip_browser: browser_check(base)
            modified=data/'models/human_and_car_links.json'
            model=read_json(modified);model.setdefault('metadata',{})['packageTest']='Keep user changes'
            from collaboration_browser_regression import request_json
            revision=request_json(base,'/api/models/'+modified.name)['metadata']['revision']
            request_json(base,'/api/models/'+modified.name,method='POST',payload=model,headers={'If-Match':revision})
            assert request_json(base,'/api/models/'+modified.name)['model']['metadata']['packageTest']=='Keep user changes'
            assert read_json(modified)['metadata']['packageTest']=='Keep user changes'
            assert 'packageTest' not in read_json(install/'models'/modified.name).get('metadata',{})
            removed=data/'models/transportation_links.json';removed.unlink()
            backup=data/'models/.backups/user-work.json';backup.parent.mkdir(exist_ok=True);backup.write_text('user backup')
            # Upgrading while running must stop the server and preserve work.
            subprocess.run([str(installer),'/S','/D='+str(install)],env=env,check=True,timeout=180)
            process.wait(timeout=15);process=None
            process=subprocess.Popen([str(python),str(launcher),'--no-browser'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            state=wait(lambda:read_json(session),'restarted upgraded app')
            assert read_json(modified)['metadata']['packageTest']=='Keep user changes'
            assert not removed.exists(),'Upgrade restored an intentionally deleted model'
            assert backup.read_text()=='user backup'
            # /_?= keeps the uninstaller in place so its exit code is observable.
            subprocess.run([str(install/'Uninstall.exe'),'/S','_?='+str(install)],env=env,check=True,timeout=180)
            process.wait(timeout=15);process=None
            assert not python.exists(),'Uninstaller left the runtime behind'
            assert read_json(modified)['metadata']['packageTest']=='Keep user changes'
            assert backup.read_text()=='user backup'
            print(f'PASS {args.arch}: native bundled runtime, install, launch, occupied port, repeat launch, upgrade, deleted-example preservation and uninstall/data preservation',flush=True)
        finally:
            if process and process.poll() is None:
                try:
                    subprocess.run([str(install/'runtime/python.exe'),str(install/'launcher.py'),'--stop'],env=env,timeout=20)
                    process.wait(timeout=20)
                except (OSError,subprocess.TimeoutExpired):
                    process.kill();process.wait(timeout=10)
            if (install/'runtime/python.exe').exists() and (install/'Uninstall.exe').exists():
                subprocess.run([str(install/'Uninstall.exe'),'/S','_?='+str(install)],env=env,timeout=180)
            blocker.close()

if __name__=='__main__':main()
