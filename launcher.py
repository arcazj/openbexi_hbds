"""Local desktop launcher. Application assets and user work are separate."""
from __future__ import annotations
import argparse
import hmac
import json
import os
import secrets
import shutil
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True

def workspace_path():
    if os.environ.get('HBDS_DATA_DIR'):
        return Path(os.environ['HBDS_DATA_DIR']).expanduser().resolve()
    return Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local' / 'share'))) / 'OpenBEXI' / 'HBDS'

def initialize_workspace(workspace):
    workspace.mkdir(parents=True, exist_ok=True)
    if workspace == APP_DIR: raise ValueError('The desktop data folder must be separate from application files.')
    # Track seeded names: user changes and intentional deletions survive upgrades.
    seeded_path = workspace / 'seeded-models.json'
    seeded = set(json.loads(seeded_path.read_text())) if seeded_path.exists() else set()
    for scope in ('models', 'test_models'):
        destination = workspace / scope
        destination.mkdir(exist_ok=True)
        for source in (APP_DIR / scope).glob('*.json'):
            if source.name.endswith('manifest.json'): continue
            key = scope + '/' + source.name
            target = destination / source.name
            if key not in seeded and not target.exists(): shutil.copy2(source, target)
            seeded.add(key)
    temporary = seeded_path.with_suffix('.tmp')
    temporary.write_text(json.dumps(sorted(seeded), indent=2), encoding='utf-8')
    temporary.replace(seeded_path)

def controller(state, action):
    port = int(state['port'])
    if not 0 < port < 65536: raise ValueError('Invalid local port')
    req = urllib.request.Request(f'http://127.0.0.1:{port}/_desktop/{action}', data=b'',
                                 headers={'X-HBDS-Desktop-Token': state['token']}, method='POST')
    with urllib.request.urlopen(req, timeout=2) as response:
        return json.load(response)

def read_state(path):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError): return None

def main():
    parser = argparse.ArgumentParser(description='OpenBEXI HBDS desktop launcher')
    parser.add_argument('--stop', action='store_true')
    parser.add_argument('--no-browser', action='store_true', help='Run without opening a browser (packaging checks)')
    args = parser.parse_args()
    workspace = workspace_path()
    workspace.mkdir(parents=True, exist_ok=True)
    state_path = workspace / 'desktop-session.json'
    if args.stop:
        state = read_state(state_path)
        if state:
            try:
                controller(state, 'stop')
                for _ in range(100):
                    if not state_path.exists(): return 0
                    time.sleep(.1)
                return 1
            except (OSError, ValueError, KeyError): pass
        return 0
    # Hold this lock for the server's entire lifetime, including initialization.
    lock = (workspace / 'desktop.lock').open('a+b')
    lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        for _ in range(100):
            state = read_state(state_path)
            try:
                if state and controller(state, 'status').get('application') == 'openbexi_hbds':
                    if not args.no_browser: webbrowser.open(f'http://127.0.0.1:{state["port"]}/')
                    return 0
            except (OSError, ValueError, KeyError): pass
            time.sleep(.1)
        raise RuntimeError('Another OpenBEXI HBDS instance is still starting or stopping.')
    initialize_workspace(workspace)
    os.environ['HBDS_DATA_DIR'] = str(workspace)
    import server
    token = secrets.token_urlsafe(32)

    class DesktopHandler(server.HBDSRequestHandler):
        def do_POST(self):
            if self.path in ('/_desktop/status', '/_desktop/stop'):
                if not hmac.compare_digest(self.headers.get('X-HBDS-Desktop-Token', ''), token):
                    self.send_error(403); return
                self.json_response({'application':'openbexi_hbds', 'version':server.APP_VERSION})
                if self.path.endswith('/stop'):
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            super().do_POST()

    server.reset_startup_logs()
    server.refresh_model_manifests()
    class DesktopServer(server.HBDSLocalServer):
        allow_reuse_address = False

        def server_bind(self):
            if os.name == 'nt':
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()

    try: httpd = DesktopServer(('127.0.0.1', 8010), DesktopHandler)
    except OSError as error:
        if error.errno not in (13, 48, 98, 10013, 10048) and getattr(error, 'winerror', None) not in (10013, 10048): raise
        httpd = DesktopServer(('127.0.0.1', 0), DesktopHandler)
    httpd.quiet = True
    httpd.api_enabled = True
    port = httpd.server_address[1]
    temporary = state_path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'port':port, 'token':token, 'pid':os.getpid(), 'version':server.APP_VERSION}), encoding='utf-8')
    temporary.replace(state_path)
    if not args.no_browser: webbrowser.open(f'http://127.0.0.1:{port}/')
    try: httpd.serve_forever()
    finally:
        httpd.server_close()
        state_path.unlink(missing_ok=True)
        lock.close()
    return 0

if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception as error:
        import traceback
        log = workspace_path() / 'launcher-error.log'
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_text(traceback.format_exc(), encoding='utf-8')
        if sys.stderr: print(str(error), file=sys.stderr)
        elif os.name == 'nt':
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, f'{error}\n\nDetails: {log}', 'OpenBEXI HBDS', 0x10)
        raise SystemExit(1)
