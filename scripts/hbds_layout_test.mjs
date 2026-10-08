import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const source = readFileSync(new URL('../js/hbds_layout.js', import.meta.url), 'utf8');
const { optimizeModelLayout, getLayoutVisualMetrics, getAttributeColumnLayout, normalizeAttributeSpacing } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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
    for (const link of links) if (link.rendering?.routePoints) delete link.rendering.routePoints;
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

const timeline=JSON.parse(readFileSync(new URL('../models/openbexi_timeline.json',import.meta.url),'utf8'));
for (const algorithm of ['grid','radial','hierarchy']) {
  const defaults=clone(timeline), explicitOff=clone(timeline), separated=clone(timeline);
  delete defaults.metadata.layout.separateLinks;
  explicitOff.metadata.layout.separateLinks=false;
  separated.metadata.layout.separateLinks=true;
  optimizeModelLayout(defaults,algorithm); optimizeModelLayout(explicitOff,algorithm);
  optimizeModelLayout(separated,algorithm);
  assert.deepEqual(defaults.hypergraph,separated.hypergraph,'missing preference must use separated links by default');
  checkGeometry(separated,`separated Timeline ${algorithm}`);
  assert.deepEqual(contents(separated),contents(explicitOff),'separation must not change domain structure');
  assert.deepEqual(separated.hypergraph.link,explicitOff.hypergraph.link,'separation must not change relationships');
  const group=m=>m.hypergraph.class.find(n=>n.id==='obt_model');
  assert.ok(group(separated).size.width>group(explicitOff).size.width,'separated layout reserves extra route space');
  const geometry=clone(separated.hypergraph);
  optimizeModelLayout(separated,algorithm);
  assert.deepEqual(separated.hypergraph,geometry,'separated layout must not grow on repeat');
  separated.metadata.layout.separateLinks=false;
  optimizeModelLayout(separated,algorithm);
  assert.deepEqual(separated.hypergraph,explicitOff.hypergraph,'turning separation off restores legacy algorithm spacing');
}
console.log('PASS separated layouts: enabled default, containment, stability and toggle-off');

for(const type of ['class','hyperclass']) for(const count of [0,1,2,4,12,40]) for(const markerSize of [0.1,0.6]) {
  const node={type,name:'Attribute example',attributes:Array(count).fill('attribute'),rendering:{attributes:{size:{width:markerSize,height:markerSize}}}};
  const metrics=getLayoutVisualMetrics(node);
  const size=clone(metrics.body), point={x:size.width*0.45,y:size.height*(type==='hyperclass' ? 0.425 : 0.45),z:type==='hyperclass' ? 0.08 : 0.06};
  const column=getAttributeColumnLayout(size,count,node.rendering.attributes,point);
  assert.deepEqual(size,metrics.body,'placing attributes must not resize the container');
  assert.equal(column.startY,point.y,'ATT1 aligns with the existing circular connection point');
  assert.equal(column.z,point.z,'connector and markers share the connection point layer');
  const taller=getAttributeColumnLayout({...size,height:size.height*3},count+10,node.rendering.attributes,point);
  assert.equal(column.gapY,taller.gapY,'spacing must not depend on container height or attribute count');
  if(!count) {assert.equal(column.rightWidth,0);continue;}
  assert.ok(column.gapY>=0.36-1e-8,'dense columns reserve minimum row spacing');
  assert.ok(column.gapY>=markerSize+0.02-1e-8,'large markers have clear space between rows');
  assert.ok(Math.abs(column.markerX-markerSize/2-column.borderX-0.4)<1e-8,'consistent border gap');
  assert.ok(column.labelX>column.markerX+markerSize/2,'labels start after markers');
  assert.ok(column.labelX+column.labelWidth<=metrics.width-metrics.body.width/2,'layout includes the entire attribute column');
}
console.log('PASS attribute columns: fixed spacing, connection point alignment, unchanged sizes, sparse/dense rows and marker sizes');
for (const spacing of [0,0.02,0.25,1]) {
  const size={width:2,height:3},point={x:0.9,y:1.35,z:0.06};
  const column=getAttributeColumnLayout(size,50,{spacing},point);
  assert.ok(Math.abs(column.gapY-column.textHeight-spacing)<1e-8,'spacing is clear space, independent of font height');
  assert.equal(column.textHeight,0.34,'text reserves twice the former 0.17-unit height');
  assert.equal(column.startY,point.y,'spacing leaves ATT1 anchored');
  assert.deepEqual(size,{width:2,height:3},'spacing does not resize the container');
}
for (const value of [undefined,null,'','bad',NaN,Infinity]) assert.equal(normalizeAttributeSpacing(value),0.02);
assert.equal(normalizeAttributeSpacing(-1),0);
assert.equal(normalizeAttributeSpacing(9),1);
console.log('PASS adjustable attribute spacing: compact default, bounds, large lists and stable ATT1');
