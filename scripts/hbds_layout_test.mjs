import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const source = readFileSync(new URL('../js/hbds_layout.js', import.meta.url), 'utf8');
const { optimizeModelLayout, getLayoutVisualMetrics } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const clone = value => structuredClone(value);
const contents = model => model.hypergraph.class.map(({ position, size, ...node }) => node);

function checkGeometry(model, context) {
  const nodes = model.hypergraph.class, byId = new Map(nodes.map(n => [n.id,n]));
  const boxes = new Map(nodes.map(node => {
    const m = getLayoutVisualMetrics(node), p = node.position;
    assert.ok([p.x,p.y,m.width,m.height].every(Number.isFinite), context);
    return [node.id, { minX:p.x+m.offsetX-m.width/2, maxX:p.x+m.offsetX+m.width/2,
      minY:p.y-m.height/2, maxY:p.y+m.height/2 }];
  }));
  const ancestor = (a,b) => {
    for (let n=byId.get(b.parentClassId); n; n=byId.get(n.parentClassId)) if (n.id===a.id) return true;
    return false;
  };
  for (let i=0;i<nodes.length;i++) {
    const node=nodes[i], box=boxes.get(node.id), parent=byId.get(node.parentClassId);
    if (parent) {
      const p=parent.position, s=parent.size;
      assert.ok(box.minX>=p.x-s.width/2-1e-8 && box.maxX<=p.x+s.width/2+1e-8 &&
        box.minY>=p.y-s.height/2-1e-8 && box.maxY<=p.y+s.height/2-0.3, `${context}: ${node.name} escapes parent/title area`);
    }
    for (const other of nodes.slice(i+1)) {
      if (ancestor(node,other)||ancestor(other,node)) continue;
      const b=boxes.get(other.id);
      assert.ok(Math.min(box.maxX,b.maxX)-Math.max(box.minX,b.minX)<=1e-8 ||
        Math.min(box.maxY,b.maxY)-Math.max(box.minY,b.minY)<=1e-8, `${context}: ${node.name} overlaps ${other.name}`);
    }
  }
}

let cases=0;
for (const directory of ['models','test_models']) {
  for (const file of readdirSync(new URL(`../${directory}/`,import.meta.url)).filter(f=>f.endsWith('.json'))) {
    const original=JSON.parse(readFileSync(new URL(`../${directory}/${file}`,import.meta.url),'utf8'));
    if (!original.hypergraph?.class) continue;
    // Apply the same membership normalization as the model loader.
    for (const group of original.hypergraph.class.filter(n=>n.type==='hyperclass')) {
      for (const id of group.children || []) {
        const child=original.hypergraph.class.find(n=>n.id===id);
        if (child) child.parentClassId=group.id;
      }
    }
    const model=clone(original), before=contents(model), links=clone(model.hypergraph.link);
    const firstByAlgorithm=new Map();
    for (const algorithm of ['radial','hierarchy','grid','radial','hierarchy']) {
      optimizeModelLayout(model,algorithm);
      checkGeometry(model,`${file} ${algorithm}`);
      assert.deepEqual(contents(model),before,'layout changed model content');
      assert.deepEqual(model.hypergraph.link,links,'layout changed relationships');
      const geometry=JSON.stringify(model.hypergraph.class.map(n=>[n.position,n.size]));
      optimizeModelLayout(model,algorithm);
      assert.equal(JSON.stringify(model.hypergraph.class.map(n=>[n.position,n.size])),geometry,'repeated layout drifted');
      if (firstByAlgorithm.has(algorithm)) assert.equal(geometry,firstByAlgorithm.get(algorithm),'switching layouts changed result');
      firstByAlgorithm.set(algorithm,geometry);
      cases++;
    }
  }
}

const chain={hypergraph:{class:['a','b','c'].map(id=>({id,name:id,attributes:[]})),link:[
  {sourceClassId:'a',targetClassId:'b'},{sourceClassId:'b',targetClassId:'c'}
]}};
optimizeModelLayout(chain,'hierarchy');
assert.ok(chain.hypergraph.class[0].position.y>chain.hypergraph.class[1].position.y);
assert.ok(chain.hypergraph.class[1].position.y>chain.hypergraph.class[2].position.y);
chain.hypergraph.link.push({sourceClassId:'c',targetClassId:'a'});
optimizeModelLayout(chain,'hierarchy');
checkGeometry(chain,'cyclic relationships');
const empty={hypergraph:{class:[],link:[]}};
for (const algorithm of ['radial','hierarchy','grid']) optimizeModelLayout(empty,algorithm);
console.log(`PASS layout containment, full footprints, model preservation, and stability: ${cases} model/layout cases; directed and cyclic graphs`);
