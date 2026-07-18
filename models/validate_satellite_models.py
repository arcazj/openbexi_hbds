#!/usr/bin/python3
import json
import sys
from pathlib import Path

def box(node):
    p=node['position']; s=node['size']
    return (p['x']-s['width']/2,p['x']+s['width']/2,p['y']-s['height']/2,p['y']+s['height']/2)

def overlaps(a,b):
    ax1,ax2,ay1,ay2=box(a); bx1,bx2,by1,by2=box(b)
    return not (ax2<=bx1 or bx2<=ax1 or ay2<=by1 or by2<=ay1)

def contained(child,parent):
    cx1,cx2,cy1,cy2=box(child); px1,px2,py1,py2=box(parent)
    return cx1>=px1 and cx2<=px2 and cy1>=py1 and cy2<=py2

def validate(path):
    d=json.loads(Path(path).read_text(encoding='utf-8'))
    classes=d['hypergraph']['class']
    rels=d['hypergraph'].get('link',[])
    ids=[c['id'] for c in classes]
    assert len(ids)==len(set(ids)), 'Duplicate node IDs'
    rid=[r['id'] for r in rels]
    assert len(rid)==len(set(rid)), 'Duplicate link IDs'
    by={c['id']:c for c in classes}
    hyper=[c for c in classes if c.get('type')=='hyperclass']
    child=[c for c in classes if c.get('type')!='hyperclass']
    assert hyper, 'No hyperclasses'
    for c in classes:
        assert c.get('rendering',{}).get('class',{}).get('material')=='metallic', f"Non-metallic node {c['id']}"
        assert c.get('rendering',{}).get('class',{}).get('color'), f"No class color {c['id']}"
    for h in hyper:
        kids=h.get('children',[])
        for kid in kids:
            assert kid in by, f"Missing child id {kid}"
            if by[kid].get('type')!='hyperclass':
                assert by[kid].get('parentClassId')==h['id'], f"Parent mismatch {kid}"
                assert contained(by[kid],h), f"Child not contained {kid}"
    roots=hyper
    for i,a in enumerate(roots):
        for b in roots[i+1:]:
            assert not overlaps(a,b), f"Root hyperclass overlap {a['id']} {b['id']}"
    for h in hyper:
        kids=[by[k] for k in h.get('children',[]) if by[k].get('type')!='hyperclass']
        for i,a in enumerate(kids):
            for b in kids[i+1:]:
                assert not overlaps(a,b), f"Sibling overlap {a['id']} {b['id']}"
    for r in rels:
        assert r['sourceClassId'] in by, f"Missing source {r['id']}"
        assert r['targetClassId'] in by, f"Missing target {r['id']}"
    layout=d.get('metadata',{}).get('layout',{})
    layout_mode=layout.get('mode',layout.get('algorithm'))
    assert str(layout_mode).lower() in {'grid','radial'}, 'Layout mode must be grid or radial'
    print(f'OK: {path}')

if __name__=='__main__':
    paths=sys.argv[1:] or ['models/satellite_world_complete_structure.json','models/satellite_world_simple_structure.json']
    for p in paths: validate(p)
