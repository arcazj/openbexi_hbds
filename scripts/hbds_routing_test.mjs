import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/hbds_routing.js',import.meta.url),'utf8');
const {findOrthogonalPath}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const cases=[
  {start:{x:0,y:0},end:{x:10,y:0},boxes:[{minX:3,maxX:7,minY:-5,maxY:5}]},
  {start:{x:0,y:0},end:{x:8,y:12},boxes:[{minX:-2,maxX:6,minY:3,maxY:6},{minX:2,maxX:12,minY:8,maxY:10}]},
  {start:{x:-4,y:-4},end:{x:4,y:4},boxes:[{minX:-2,maxX:1,minY:-6,maxY:2},{minX:0,maxX:3,minY:1,maxY:3}]},
  {start:{x:0,y:0},end:{x:0,y:0},boxes:[]}
];
for (const {start,end,boxes} of cases) {
  const path=findOrthogonalPath(start,end,boxes);
  assert.ok(path);
  assert.deepEqual(path[0],start); assert.deepEqual(path.at(-1),end);
  assert.deepEqual(findOrthogonalPath(start,end,boxes),path,'routing must be deterministic');
  for (let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i];
    assert.ok(a.x===b.x||a.y===b.y,'diagonal route');
    for (const box of boxes) {
      const blocked=a.y===b.y
        ? a.y>box.minY&&a.y<box.maxY&&Math.min(a.x,b.x)<box.maxX&&Math.max(a.x,b.x)>box.minX
        : a.x>box.minX&&a.x<box.maxX&&Math.min(a.y,b.y)<box.maxY&&Math.max(a.y,b.y)>box.minY;
      assert.equal(blocked,false,'route crosses an obstacle');
    }
  }
}
assert.equal(findOrthogonalPath({x:0,y:0},{x:4,y:0},[{minX:-1,maxX:1,minY:-1,maxY:1}]),null);
const length = path => path.slice(1).reduce((n,b,i)=>n+Math.abs(b.x-path[i].x)+Math.abs(b.y-path[i].y),0);
assert.equal(length(findOrthogonalPath({x:0,y:0},{x:10,y:8},[])),18,'clear route must have Manhattan length');
assert.equal(length(findOrthogonalPath({x:0,y:0},{x:10,y:0},[{minX:3,maxX:7,minY:-2,maxY:2}],0.15)),14.3,'barrier route takes the nearest clear edge');
const endpointBodies=[{minX:-2,maxX:0,minY:-1,maxY:1},{minX:10,maxX:12,minY:-1,maxY:1}];
assert.equal(length(findOrthogonalPath({x:0.24,y:0},{x:9.76,y:0},endpointBodies)),9.52,'facing ports connect directly without detouring around endpoints');
console.log('PASS orthogonal routing: wide barriers, staggered barriers, overlapping obstacles, endpoints and blocked paths');
