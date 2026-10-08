// Orthogonal path search used when the inexpensive lane adjustment is blocked.
// Axes follow obstacle edges, so cost depends on diagram complexity, not pixels.
export function findOrthogonalPath(start, end, boxes, gap = 0.15, simpleOnly = false, separation = null) {
  if ([start,end].some(p=>boxes.some(b=>p.x>b.minX && p.x<b.maxX && p.y>b.minY && p.y<b.maxY))) return null;
  const blocked = (a,b) => borderBlocksSegment(a,b,separation) || boxes.some(box => a.y === b.y
    ? a.y > box.minY && a.y < box.maxY && Math.min(a.x,b.x)<box.maxX && Math.max(a.x,b.x)>box.minX
    : a.x > box.minX && a.x < box.maxX && Math.min(a.y,b.y)<box.maxY && Math.max(a.y,b.y)>box.minY);
  // Clear Manhattan routes are already shortest. Most links need no grid search.
  for (const corner of [{x:end.x,y:start.y},{x:start.x,y:end.y}]) {
    if (!blocked(start,corner) && !blocked(corner,end) &&
        (!separation || routeSeparationPenalty([start,corner,end],separation.lanes,separation.laneGap) === 0))
      return [start,corner,end];
  }
  if (simpleOnly) return null;
  const extraX=[], extraY=[];
  if (separation) {
    const clearance=separation.clearance ?? 0.4, laneGap=separation.laneGap ?? 0.7;
    for (const border of separation.borders || []) {
      const across=border.orientation==='horizontal' ? extraY : extraX;
      across.push(border.coord-clearance, border.coord+clearance);
    }
    const margin=Math.max(3,(Math.abs(start.x-end.x)+Math.abs(start.y-end.y))*0.2);
    for (const lane of separation.lanes || []) {
      // Distant links still contribute collision costs, but their lane offsets
      // need not multiply the grid used for this connection's local detour.
      const horizontal=lane.orientation==='horizontal';
      const near=Math.min(horizontal ? start.y : start.x,horizontal ? end.y : end.x)-margin;
      const far=Math.max(horizontal ? start.y : start.x,horizontal ? end.y : end.x)+margin;
      const low=Math.min(horizontal ? start.x : start.y,horizontal ? end.x : end.y)-margin;
      const high=Math.max(horizontal ? start.x : start.y,horizontal ? end.x : end.y)+margin;
      if(lane.coord<near || lane.coord>far || lane.max<low || lane.min>high) continue;
      const across=lane.orientation==='horizontal' ? extraY : extraX;
      across.push(lane.coord-laneGap, lane.coord+laneGap);
    }
  }
  const axis=separation ? routingAxis : (a,b,values)=>[...new Set([a,b,...values])].sort((x,y)=>x-y);
  const xs = axis(start.x,end.x,[...extraX,...boxes.flatMap(b => [b.minX-gap,b.maxX+gap])]);
  const ys = axis(start.y,end.y,[...extraY,...boxes.flatMap(b => [b.minY-gap,b.maxY+gap])]);
  const nx = xs.length, count = nx * ys.length * 3;
  const costs = new Float64Array(count).fill(Infinity), previous = new Int32Array(count).fill(-1);
  const startKey = (ys.indexOf(start.y)*nx + xs.indexOf(start.x))*3;
  const endCell = ys.indexOf(end.y)*nx + xs.indexOf(end.x);
  const heap = [], edges = new Map();
  const laneCosts=separation ? buildLaneCosts(xs,ys,separation.lanes || [],separation.laneGap ?? 0.7) : null;
  const blockedEdges=separation ? buildBlockedEdges(xs,ys,boxes,separation) : null;
  const less = (a,b) => a.score < b.score || (a.score === b.score &&
    (separation && a.cost!==b.cost ? a.cost>b.cost : a.key<b.key));
  function push(entry) {
    let i = heap.length;
    heap.push(entry);
    while (i > 0) {
      const parent = (i-1)>>1;
      if (!less(entry,heap[parent])) break;
      heap[i]=heap[parent]; i=parent;
    }
    heap[i]=entry;
  }
  function pop() {
    const first=heap[0], last=heap.pop();
    if (heap.length) {
      let i=0;
      while (i*2+1<heap.length) {
        let child=i*2+1;
        if (child+1<heap.length && less(heap[child+1],heap[child])) child++;
        if (!less(heap[child],last)) break;
        heap[i]=heap[child]; i=child;
      }
      heap[i]=last;
    }
    return first;
  }
  function clear(a,b,x,y,xx,yy) {
    if (blockedEdges) return !blockedEdges[y===yy ? 'horizontal' : 'vertical'][Math.min(a,b)];
    const key = Math.min(a,b)*nx*ys.length + Math.max(a,b);
    if (!edges.has(key)) {
      edges.set(key,!blocked({x,y},{x:xx,y:yy}));
    }
    return edges.get(key);
  }
  costs[startKey]=0;
  push({key:startKey,cost:0,score:Math.abs(start.x-end.x)+Math.abs(start.y-end.y)});
  while (heap.length) {
    const current=pop();
    if (current.cost!==costs[current.key]) continue;
    const cell=Math.floor(current.key/3), direction=current.key%3;
    const ix=cell%nx, iy=Math.floor(cell/nx), x=xs[ix], y=ys[iy];
    if (cell===endCell) {
      const path=[];
      for (let key=current.key; key>=0; key=previous[key]) {
        const c=Math.floor(key/3);
        path.push({x:xs[c%nx],y:ys[Math.floor(c/nx)]});
      }
      return path.reverse();
    }
    for (const [dx,dy,nextDirection] of [[-1,0,1],[1,0,1],[0,-1,2],[0,1,2]]) {
      const xx=ix+dx, yy=iy+dy;
      if (xx<0||yy<0||xx>=nx||yy>=ys.length) continue;
      const nextCell=yy*nx+xx;
      if (!clear(cell,nextCell,x,y,xs[xx],ys[yy])) continue;
      const key=nextCell*3+nextDirection;
      const penalty=laneCosts ? laneCosts[nextDirection===1 ? 'horizontal' : 'vertical'][Math.min(cell,nextCell)] : 0;
      const cost=current.cost+Math.abs(x-xs[xx])+Math.abs(y-ys[yy])+(direction && direction!==nextDirection ? 0.35 : 0)+penalty;
      if (cost>=costs[key]-1e-9) continue;
      costs[key]=cost; previous[key]=current.key;
      push({key,cost,score:cost+Math.abs(xs[xx]-end.x)+Math.abs(ys[yy]-end.y)});
    }
  }
  return null;
}

function routingAxis(start,end,coordinates) {
  const axis=[];
  for(const value of [...new Set([start,end,...coordinates])].sort((a,b)=>a-b)) {
    const previous=axis.at(-1);
    if(previous===undefined || value-previous>1e-7) axis.push(value);
    // Floating-point arithmetic can otherwise create hundreds of practically
    // identical lanes. Preserve exact port coordinates when merging them.
    else if(value===start || value===end) {
      if(previous===start || previous===end) axis.push(value);
      else axis[axis.length-1]=value;
    }
  }
  return axis;
}

function axisLowerBound(values,value) {
  let low=0,high=values.length;
  while(low<high) {const mid=(low+high)>>1;if(values[mid]<value)low=mid+1;else high=mid;}
  return low;
}

function buildBlockedEdges(xs,ys,boxes,separation) {
  const nx=xs.length, horizontal=new Uint8Array(nx*ys.length), vertical=new Uint8Array(nx*ys.length);
  function mark(horizontalEdge,low,high,near,far) {
    const along=horizontalEdge ? xs : ys, across=horizontalEdge ? ys : xs;
    const output=horizontalEdge ? horizontal : vertical;
    const start=Math.max(0,axisLowerBound(along,low)-1), end=Math.min(along.length-1,axisLowerBound(along,high));
    for(let j=axisLowerBound(across,near);j<across.length && across[j]<far;j++) {
      if(across[j]<=near) continue;
      for(let i=start;i<end;i++) if(Math.min(along[i+1],high)>Math.max(along[i],low)) output[horizontalEdge ? j*nx+i : i*nx+j]=1;
    }
  }
  for(const box of boxes) {
    mark(true,box.minX,box.maxX,box.minY,box.maxY);
    mark(false,box.minY,box.maxY,box.minX,box.maxX);
  }
  const clearance=(separation.clearance ?? 0.4)-1e-7;
  for(const border of separation.borders || []) {
    const isHorizontal=border.orientation==='horizontal';
    mark(isHorizontal,border.min,border.max,border.coord-clearance,border.coord+clearance);
    if(!border.crossable) {
      // Block perpendicular crossings, including a grid vertex on the border.
      mark(!isHorizontal,border.coord-1e-7,border.coord+1e-7,border.min,border.max);
    }
  }
  return {horizontal,vertical};
}

// Precompute lane costs once per grid. Scanning all existing links for every
// A* edge becomes prohibitively expensive on diagrams with hundreds of routes.
function buildLaneCosts(xs,ys,lanes,gap) {
  const nx=xs.length, count=nx*ys.length;
  const horizontal=new Float64Array(count), vertical=new Float64Array(count);
  const lowerBound=axisLowerBound;
  for(const lane of lanes) {
    const isHorizontal=lane.orientation==='horizontal';
    const along=isHorizontal ? xs : ys, across=isHorizontal ? ys : xs;
    const parallel=isHorizontal ? horizontal : vertical, crossing=isHorizontal ? vertical : horizontal;
    const low=Math.max(0,lowerBound(along,lane.min)-1), high=Math.min(along.length-1,lowerBound(along,lane.max));
    const near=lowerBound(across,lane.coord-gap+1e-7), far=lowerBound(across,lane.coord+gap-1e-7);
    for(let j=near;j<far;j++) for(let i=low;i<high;i++) {
      const overlap=Math.min(along[i+1],lane.max)-Math.max(along[i],lane.min);
      if(overlap>1e-7) parallel[isHorizontal ? j*nx+i : i*nx+j]+=overlap*30;
    }
    const edge=lowerBound(across,lane.coord)-1;
    if(edge>=0 && edge<across.length-1) for(let i=lowerBound(along,lane.min+1e-7);i<along.length && along[i]<lane.max-1e-7;i++) {
      crossing[isHorizontal ? edge*nx+i : i*nx+edge]+=2.5;
    }
  }
  return {horizontal,vertical};
}

// Containing hyperclasses are traversable only when a link must enter or leave
// them. Even then a route must cross the border, rather than run along it.
function borderBlocksSegment(a,b,separation) {
  if (!separation || (a.x===b.x && a.y===b.y)) return false;
  const horizontal=a.y===b.y, clearance=separation.clearance ?? 0.4;
  for (const border of separation.borders || []) {
    if (horizontal === (border.orientation==='horizontal')) {
      const coord=horizontal ? a.y : a.x, low=horizontal ? Math.min(a.x,b.x) : Math.min(a.y,b.y);
      const high=horizontal ? Math.max(a.x,b.x) : Math.max(a.y,b.y);
      if (Math.abs(coord-border.coord)<clearance-1e-7 && Math.min(high,border.max)-Math.max(low,border.min)>1e-7) return true;
    } else if (!border.crossable) {
      const coord=horizontal ? a.y : a.x, low=horizontal ? Math.min(a.x,b.x) : Math.min(a.y,b.y);
      const high=horizontal ? Math.max(a.x,b.x) : Math.max(a.y,b.y);
      if (coord>border.min && coord<border.max && low<border.coord && high>border.coord) return true;
    }
  }
  return false;
}

export function routeSeparationPenalty(points, lanes = [], gap = 0.7) {
  let cost=0;
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i], horizontal=Math.abs(a.y-b.y)<1e-7;
    const coord=horizontal ? a.y : a.x;
    const low=horizontal ? Math.min(a.x,b.x) : Math.min(a.y,b.y);
    const high=horizontal ? Math.max(a.x,b.x) : Math.max(a.y,b.y);
    for (const lane of lanes) {
      if (horizontal === (lane.orientation==='horizontal')) {
        const overlap=Math.min(high,lane.max)-Math.max(low,lane.min);
        if (overlap>1e-7 && Math.abs(coord-lane.coord)<gap-1e-7) cost+=overlap*30;
      } else if (coord>lane.min && coord<lane.max && lane.coord>low && lane.coord<high) cost+=2.5;
    }
  }
  return cost;
}
