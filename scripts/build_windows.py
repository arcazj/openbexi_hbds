"""Build unsigned x64/ARM64 installers using verified embedded runtimes."""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NSIS_URL = 'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.13/nsis-3.13.zip'
NSIS_SHA = 'ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8'
ROOT_FILES = {'VERSION','server.py','launcher.py','hbds_ai_contract.py','index.html','index_models.html',
              'test_dynamic_hbds_layout.html','functor_queries.html','license.html','LICENSE.txt',
              'COMMERCIAL_LICENSE.md','COMMERCIAL_ORDER_FORM.md','THIRD_PARTY_NOTICES.md','README.md','CHANGELOG.md'}
DIRECTORIES = {'js','css','icons','images','pictures','models','test_models','schemas','LICENSES','openapi_docs','doc'}

def fetch(url, expected, cache):
    path = cache / url.split('/')[-1]
    if not path.exists():
        with urllib.request.urlopen(url, timeout=120) as response: path.write_bytes(response.read())
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise RuntimeError('Download checksum mismatch: ' + path.name)
    return path

def unpack(path, destination):
    with zipfile.ZipFile(path) as archive:
        for item in archive.infolist(): (destination / item.filename).resolve().relative_to(destination.resolve())
        archive.extractall(destination)

def build(arch, compiler, cache, output):
    version = (ROOT/'VERSION').read_text().strip()
    runtime = json.loads((ROOT/'packaging/python-runtimes.json').read_text())[arch]
    source = fetch(runtime['url'], runtime['sha256'], cache)
    build_root = (ROOT/'build').resolve()
    build_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='windows-', dir=build_root) as temporary:
        stage = Path(temporary).resolve()
        stage.relative_to(build_root)
        payload = stage/'app'
        payload.mkdir()
        paths = subprocess.check_output(['git','ls-files','-co','--exclude-standard'], cwd=ROOT, text=True).splitlines()
        for value in sorted(set(paths)):
            relative = Path(value)
            if not (value in ROOT_FILES or relative.parts[0] in DIRECTORIES): continue
            if '.backups' in relative.parts or '__pycache__' in relative.parts or relative.suffix.lower() == '.pdf': continue
            file = ROOT/relative
            if not file.is_file(): continue
            target = payload/relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, target)
        for required in ('VERSION','launcher.py','LICENSE.txt','js/vendor/three/build/three.module.js',
                         'js/vendor/three/build/three.core.js','js/vendor/swagger-ui-dist/swagger-ui-bundle.js'):
            if not (payload/required).is_file(): raise RuntimeError('Missing required package file: '+required)
        unpack(source, payload/'runtime')
        pth = next((payload/'runtime').glob('python*._pth'))
        pth.write_text(pth.read_text() + '\n..\n', encoding='utf-8')
        (payload/'runtime'/'NSIS-LICENSE.txt').write_text((compiler.parent/'COPYING').read_text(encoding='utf-8'), encoding='utf-8')
        (payload/'OpenBEXI HBDS.cmd').write_text('@echo off\r\nstart "" "%~dp0runtime\\pythonw.exe" "%~dp0launcher.py"\r\n', encoding='utf-8')
        (payload/'Stop OpenBEXI HBDS.cmd').write_text('@echo off\r\n"%~dp0runtime\\python.exe" "%~dp0launcher.py" --stop\r\n', encoding='utf-8')
        (payload/'BUILD-INFO.json').write_text(json.dumps({'version':version, 'architecture':arch, 'python':runtime,
            'signed':False, 'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()}, indent=2)+'\n')
        basename = f'openbexi-hbds-{version}-windows-{arch}'
        portable = output/(basename+'-portable.zip')
        with zipfile.ZipFile(portable,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
            for file in sorted(payload.rglob('*')):
                if file.is_file(): archive.write(file,file.relative_to(payload).as_posix())
        uninstall = stage/'uninstall-files.nsh'
        files = [file for file in payload.rglob('*') if file.is_file()]
        directories = sorted([file for file in payload.rglob('*') if file.is_dir()], key=lambda p:len(p.parts), reverse=True)
        lines = ['Delete "$INSTDIR\\'+str(file.relative_to(payload)).replace('/','\\')+'"' for file in files]
        lines += ['RMDir "$INSTDIR\\'+str(file.relative_to(payload)).replace('/','\\')+'"' for file in directories]
        uninstall.write_text('\n'.join(lines)+'\n',encoding='utf-8')
        subprocess.run([str(compiler),'/V2',f'/DVERSION={version}',f'/DARCH={arch}',f'/DPAYLOAD={payload}',
                        f'/DOUTPUT={output/(basename+"-setup.exe")}',f'/DUNINSTALL_FILES={uninstall}',
                        str(ROOT/'packaging/windows.nsi')],check=True)
        print(f'Built {basename}: installer and portable ZIP',flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arch',choices=('x64','arm64','all'),default='all')
    args=parser.parse_args()
    cache=ROOT/'.tools/release/downloads';cache.mkdir(parents=True,exist_ok=True)
    compiler=ROOT/'.tools/release/nsis-3.13/makensis.exe'
    if not compiler.exists(): unpack(fetch(NSIS_URL,NSIS_SHA,cache),compiler.parent.parent)
    output=(ROOT/'dist').resolve();output.mkdir(exist_ok=True)
    for arch in (('x64','arm64') if args.arch=='all' else (args.arch,)): build(arch,compiler,cache,output)
    files=sorted([*output.glob('*.exe'),*output.glob('*.zip'),*output.glob('*.tar.gz')])
    (output/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.name+'\n' for path in files))

if __name__=='__main__': main()
