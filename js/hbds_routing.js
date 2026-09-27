// Orthogonal path search used when the inexpensive lane adjustment is blocked.
// Axes follow obstacle edges, so cost depends on diagram complexity, not pixels.
export function findOrthogonalPath(start, end, boxes, gap = 0.15) {
  const xs = [...new Set([start.x, end.x, ...boxes.flatMap(b => [b.minX-gap, b.maxX+gap])])].sort((a,b)=>a-b);
  const ys = [...new Set([start.y, end.y, ...boxes.flatMap(b => [b.minY-gap, b.maxY+gap])])].sort((a,b)=>a-b);
  const nx = xs.length, count = nx * ys.length * 3;
  const costs = new Float64Array(count).fill(Infinity), previous = new Int32Array(count).fill(-1);
  const startKey = (ys.indexOf(start.y)*nx + xs.indexOf(start.x))*3;
  const endCell = ys.indexOf(end.y)*nx + xs.indexOf(end.x);
  const heap = [], edges = new Map();
  const less = (a,b) => a.score < b.score || (a.score === b.score && a.key < b.key);
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
    const key = Math.min(a,b)*nx*ys.length + Math.max(a,b);
    if (!edges.has(key)) {
      const horizontal = y === yy;
      edges.set(key,!boxes.some(box => horizontal
        ? y > box.minY && y < box.maxY && Math.min(x,xx)<box.maxX && Math.max(x,xx)>box.minX
        : x > box.minX && x < box.maxX && Math.min(y,yy)<box.maxY && Math.max(y,yy)>box.minY));
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
      const cost=current.cost+Math.abs(x-xs[xx])+Math.abs(y-ys[yy])+(direction && direction!==nextDirection ? 0.35 : 0);
      if (cost>=costs[key]-1e-9) continue;
      costs[key]=cost; previous[key]=current.key;
      push({key,cost,score:cost+Math.abs(xs[xx]-end.x)+Math.abs(ys[yy]-end.y)});
    }
  }
  return null;
}
