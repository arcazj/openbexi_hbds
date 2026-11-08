"""Vendor pinned browser dependencies with upstream integrity verification."""
from __future__ import annotations
import base64
import hashlib
import io
import json
import posixpath
import re
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / 'packaging' / 'browser-dependencies.json'

def download(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read()

def main():
    lock = json.loads(LOCK.read_text()) if LOCK.exists() else {}
    for name, version in [('three', '0.176.0'), ('swagger-ui-dist', '5.31.0')]:
        if name not in lock:
            metadata = json.loads(download(f'https://registry.npmjs.org/{name}/{version}'))
            lock[name] = {'version': version, 'url': metadata['dist']['tarball'], 'integrity': metadata['dist']['integrity']}
        item = lock[name]
        data = download(item['url'])
        algorithm, digest = item['integrity'].split('-', 1)
        if base64.b64encode(hashlib.new(algorithm, data).digest()).decode() != digest:
            raise RuntimeError(f'Integrity mismatch for {name}')
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            paths = ['LICENSE']
            if name == 'three':
                paths += ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js',
                          'examples/jsm/controls/DragControls.js', 'examples/jsm/renderers/CSS2DRenderer.js']
            else:
                paths += ['NOTICE', 'swagger-ui.css', 'swagger-ui-bundle.js']
            seen = set()
            while paths:
                path = paths.pop()
                if path in seen: continue
                seen.add(path)
                try: member = archive.getmember('package/' + path)
                except KeyError:
                    if path == 'NOTICE': continue
                    raise
                content = archive.extractfile(member).read()
                target = ROOT / 'js' / 'vendor' / name / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
                if name == 'three' and path.endswith('.js'):
                    for relative in re.findall(r'''(?:from\s*|import\s*\()\s*['"](\.[^'"]+\.js)['"]''', content.decode()):
                        dependency = posixpath.normpath(posixpath.join(posixpath.dirname(path), relative))
                        if dependency.startswith('../'): raise RuntimeError('Unexpected dependency path')
                        paths.append(dependency)
        print(f'Vendored {name} {item["version"]}: {len(seen)} files', flush=True)
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    LOCK.write_text(json.dumps(lock, indent=2) + '\n')

if __name__ == '__main__': main()
