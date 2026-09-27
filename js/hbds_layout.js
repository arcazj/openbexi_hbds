// Layout operates on complete visual groups. All persisted positions are world
// coordinates; descendants are placed only after their parent's final position.
const PADDING = { left: 0.85, right: 0.85, top: 1.2, bottom: 0.85 };
const compare = (a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id));
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

export function getLayoutVisualMetrics(node) {
  const hyperclass = node.type === 'hyperclass';
  const count = node.attributes?.length || 0;
  const titleWidth = Math.min(8, String(node.rendering?.iconTitleText ?? node.name ?? '').length * 0.18 + 1);
  const body = {
    width: Math.max(positive(node.size?.width, 0), hyperclass ? 4 : 1.35, titleWidth),
    height: Math.max(positive(node.size?.height, 0), hyperclass ? 3.2 : 1.75,
      (hyperclass ? 0.75 : 0.45) + Math.max(0, count - 1) * (hyperclass ? 0.16 : 0.17))
  };
  const markerWidth = positive(node.rendering?.attributes?.size?.width, 0.1);
  // Reserve the full CSS2D attribute label width, including markers and margins.
  // Text length alone underestimates wide fonts and individually styled labels.
  const attributeRight = count ? (hyperclass ? 0.28 + markerWidth : 0.25 + markerWidth * 2) + 0.06 + 2.25 + 0.18 : 0;
  return { body, width: body.width + attributeRight, height: body.height, offsetX: attributeRight / 2, offsetY: 0 };
}

function gridColumns(count) {
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return Math.ceil(Math.sqrt(count));
}

function grid(items, gapX, gapY, columns = gridColumns(items.length)) {
  const rows = Math.ceil(items.length / columns);
  const widths = Array(columns).fill(0), heights = Array(rows).fill(0);
  items.forEach((item, i) => {
    widths[i % columns] = Math.max(widths[i % columns], item.width);
    heights[Math.floor(i / columns)] = Math.max(heights[Math.floor(i / columns)], item.height);
  });
  const positions = new Map();
  let top = 0;
  heights.forEach((height, row) => {
    let left = 0;
    widths.forEach((width, col) => {
      const item = items[row * columns + col];
      if (item) positions.set(item.id, { x: left + width / 2, y: -top - height / 2 });
      left += width + gapX;
    });
    top += height + gapY;
  });
  return centerArrangement(items, positions);
}

function centerArrangement(items, positions) {
  if (!items.length) return { width: 0, height: 0, positions };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const item of items) {
    const p = positions.get(item.id);
    minX = Math.min(minX, p.x - item.width / 2);
    maxX = Math.max(maxX, p.x + item.width / 2);
    minY = Math.min(minY, p.y - item.height / 2);
    maxY = Math.max(maxY, p.y + item.height / 2);
  }
  for (const p of positions.values()) {
    p.x -= (minX + maxX) / 2;
    p.y -= (minY + maxY) / 2;
  }
  return { width: maxX - minX, height: maxY - minY, positions };
}

function radial(items, gapX, gapY) {
  // Cards are wider than they are tall because attributes sit on the right.
  // An elliptical ring uses that aspect ratio instead of wasting vertical space.
  const aspect = items.length ? items.reduce((sum,item)=>sum+item.height+gapY,0)
    / items.reduce((sum,item)=>sum+item.width+gapX,0) : 1;
  const directions = items.map((_, i) => {
    const angle = (items.length === 4 ? Math.PI / 4 : Math.PI / 2) - 2 * Math.PI * i / items.length;
    return { x: Math.cos(angle), y: Math.sin(angle) * aspect };
  });
  let radius = 0;
  // For each pair, separation on either axis is enough. Solving the required
  // radius avoids iterative nudges and preserves the radial arrangement.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const dx = Math.abs(directions[i].x - directions[j].x);
      const dy = Math.abs(directions[i].y - directions[j].y);
      const rx = dx > 1e-8 ? ((items[i].width + items[j].width) / 2 + gapX) / dx : Infinity;
      const ry = dy > 1e-8 ? ((items[i].height + items[j].height) / 2 + gapY) / dy : Infinity;
      radius = Math.max(radius, Math.min(rx, ry));
    }
  }
  return centerArrangement(items, new Map(items.map((item, i) => [item.id, {
    x: directions[i].x * radius, y: directions[i].y * radius
  }])));
}

function hierarchy(items, edges, gapX, gapY) {
  const outgoing = new Map(items.map(item => [item.id, new Set()]));
  for (const [source, target] of edges) outgoing.get(source).add(target);
  // Condense cycles before assigning levels so mutual relationships cannot
  // cause infinite traversal or ever-growing ranks.
  const indices = new Map(), low = new Map(), active = new Set(), stack = [], components = [];
  let index = 0;
  function visit(id) {
    indices.set(id, index); low.set(id, index++); stack.push(id); active.add(id);
    for (const target of outgoing.get(id)) {
      if (!indices.has(target)) { visit(target); low.set(id, Math.min(low.get(id), low.get(target))); }
      else if (active.has(target)) low.set(id, Math.min(low.get(id), indices.get(target)));
    }
    if (low.get(id) === indices.get(id)) {
      const component = [];
      let member;
      do { member = stack.pop(); active.delete(member); component.push(member); } while (member !== id);
      components.push(component);
    }
  }
  for (const item of items) if (!indices.has(item.id)) visit(item.id);
  const componentOf = new Map();
  components.forEach((members, i) => members.forEach(id => componentOf.set(id, i)));
  const successors = components.map(() => new Set()), indegree = components.map(() => 0), ranks = components.map(() => 0);
  for (const [source, target] of edges) {
    const a = componentOf.get(source), b = componentOf.get(target);
    if (a !== b && !successors[a].has(b)) { successors[a].add(b); indegree[b]++; }
  }
  const ready = components.map((_, i) => i).filter(i => indegree[i] === 0);
  for (let i = 0; i < ready.length; i++) {
    const source = ready[i];
    for (const target of successors[source]) {
      ranks[target] = Math.max(ranks[target], ranks[source] + 1);
      if (--indegree[target] === 0) ready.push(target);
    }
  }
  const levels = [];
  for (const item of items) (levels[ranks[componentOf.get(item.id)]] ||= []).push(item);
  const positions = new Map();
  let top = 0;
  for (const level of levels) {
    // Keep connected peers near each other within a level. Disconnected and
    // cyclic peers wrap into rows instead of forming one unbounded wide row.
    const barycenter = item => {
      const upstream = edges.filter(([source, target]) => target === item.id && positions.has(source));
      return upstream.length ? upstream.reduce((sum, [source]) => sum + positions.get(source).x, 0) / upstream.length : 0;
    };
    level.sort((a, b) => barycenter(a) - barycenter(b) || compare(a, b));
    const row = grid(level, gapX, gapY, Math.ceil(Math.sqrt(level.length)));
    for (const item of level) {
      const p = row.positions.get(item.id);
      positions.set(item.id, { x: p.x, y: p.y - top - row.height / 2 });
    }
    top += row.height + Math.max(1.4, gapY);
  }
  return centerArrangement(items, positions);
}

export function optimizeModelLayout(model, algorithm = 'grid') {
  if (algorithm === 'none') return;
  const nodes = model.hypergraph?.class || [], links = model.hypergraph?.link || [];
  const byId = new Map(nodes.map(node => [node.id, node])), children = new Map(), metrics = new Map();
  for (const node of nodes) {
    const parent = byId.get(node.parentClassId);
    const key = parent?.type === 'hyperclass' ? parent.id : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }
  for (const siblings of children.values()) siblings.sort(compare);
  const roots = children.get(null) || [];
  function arrange(siblings, root = false) {
    const items = siblings.map(node => ({ id: node.id, name: node.name, ...metrics.get(node.id) }));
    // Keep room for the route and its label between rows. Closely packed
    // cards otherwise force a label far away from the relationship it names.
    const gapX = root ? 2.8 : 1.6, gapY = root ? 2.4 : 1.8;
    if (algorithm === 'radial') return radial(items, gapX, gapY);
    if (algorithm === 'hierarchy') {
      const representative = new Map();
      function include(node, id) {
        representative.set(node.id, id);
        for (const child of children.get(node.id) || []) include(child, id);
      }
      for (const node of siblings) include(node, node.id);
      const edges = links.map(link => [representative.get(link.sourceClassId), representative.get(link.targetClassId)])
        .filter(([a, b]) => a !== undefined && b !== undefined && a !== b);
      return hierarchy(items, edges, gapX, gapY);
    }
    return grid(items, gapX, gapY, root ? Math.max(1, Math.ceil(Math.sqrt(items.length))) : gridColumns(items.length));
  }
  const visiting = new Set();
  function measure(node) {
    if (visiting.has(node.id)) throw new Error('Cannot lay out cyclic hyperclass containment');
    visiting.add(node.id);
    const kids = children.get(node.id) || [];
    kids.forEach(measure);
    const content = arrange(kids);
    if (kids.length) node.size = {
      width: Math.max(4, content.width + PADDING.left + PADDING.right),
      height: Math.max(3.2, content.height + PADDING.top + PADDING.bottom)
    };
    const metric = getLayoutVisualMetrics(node);
    node.size = metric.body;
    metrics.set(node.id, { ...metric, content });
    visiting.delete(node.id);
  }
  roots.forEach(measure);
  if (metrics.size !== nodes.length) throw new Error('Cannot lay out cyclic hyperclass containment');
  function place(node, x, y) {
    const metric = metrics.get(node.id);
    node.position = { x: x - metric.offsetX, y: y - metric.offsetY, z: 0 };
    const contentX = node.position.x + (PADDING.left - PADDING.right) / 2;
    const contentY = node.position.y + (PADDING.bottom - PADDING.top) / 2;
    for (const child of children.get(node.id) || []) {
      const p = metric.content.positions.get(child.id);
      place(child, contentX + p.x, contentY + p.y);
    }
  }
  const arrangement = arrange(roots, true);
  for (const root of roots) {
    const p = arrangement.positions.get(root.id);
    place(root, p.x, p.y);
  }
  // Absolute waypoints belong to the previous arrangement. Regenerate routes
  // after moving nodes; manual layouts (algorithm none) retain their waypoints.
  for (const link of links) if (link.rendering?.routePoints) delete link.rendering.routePoints;
}
