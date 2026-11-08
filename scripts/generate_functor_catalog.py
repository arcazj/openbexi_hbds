"""Generate the browser's read-only catalog from the proposed OpenAPI contract."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    spec = json.loads((ROOT / 'openapi_docs/hbds-openapi.json').read_text(encoding='utf-8'))
    prefix = '/api/models/{modelName}/functors/'
    entries = []
    for path, methods in spec['paths'].items():
        operation = methods.get('post', {})
        if not path.startswith(prefix) or 'x-hbds-signature' not in operation:
            continue
        entries.append({
            'name': path[len(prefix):],
            'group': operation['tags'][0],
            'category': operation['x-hbds-category'],
            'description': operation['description'].split('\n\n')[0],
            **operation['x-hbds-signature'],
            'sources': operation['x-hbds-source'],
        })
    entries.sort(key=lambda entry: entry['name'])
    assert len(entries) == len({entry['name'] for entry in entries}) == 141
    content = json.dumps({'contractVersion': spec['info']['version'], 'functors': entries}, indent=2, ensure_ascii=False) + '\n'
    target = ROOT / 'js/hbds_functor_catalog.json'
    if args.check:
        if target.read_text(encoding='utf-8') != content:
            raise SystemExit('Functor catalog is stale. Run python scripts/generate_functor_catalog.py')
        print('Functor catalog matches all 141 OpenAPI definitions.')
    else:
        target.write_text(content, encoding='utf-8')


if __name__ == '__main__':
    main()
