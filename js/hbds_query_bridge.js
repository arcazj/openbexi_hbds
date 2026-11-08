// Same-origin bridge. Query receives model data, never editor configuration.
export function installQuerySource({ read, diagram, tree = null, showModel = null }) {
  const highlights = createQueryHighlights(diagram);
  window.HBDSQuerySource = Object.freeze({ read, tree, showModel, locate: highlights.locate,
    clearHighlights: highlights.clear, refreshHighlights: highlights.refresh,
    setQueryOpen(open) {
      const changed = document.body.classList.contains('hbds-query-diagram') !== open;
      document.body.classList.toggle('hbds-query-diagram', open);
      if (!open) highlights.clear();
      if (changed) {
        diagram().resize();
        requestAnimationFrame(() => diagram().resize());
      }
    }
  });
  announceQuerySource();
}
export function announceQuerySource() {
  if (window.parent !== window) window.parent.postMessage({ type: 'hbds-query-source-ready' }, window.location.origin);
}
// Screen-space outlines follow the actual scene geometry in 2-D and 3-D.
// Highlighting preserves the current camera, layout, model data and selection.
function createQueryHighlights(diagram) {
  const viewport = document.getElementById('diagram-viewport');
  const make = tag => document.createElementNS('http://www.w3.org/2000/svg', tag);
  const overlay = make('svg'); overlay.id = 'hbds-query-highlights';
  overlay.setAttribute('aria-hidden', 'true'); overlay.dataset.count = '0'; viewport.append(overlay);
  let entries = [], sceneRoot = null;
  const corners = (box, THREE) => [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(
    i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  function ownBounds(object, THREE) {
    if (!object.geometry) return new THREE.Box3();
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    return object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
  }
  function clear() {
    for (const entry of entries) for (const label of entry.labels) label.element.classList.remove('hbds-query-highlight');
    entries = []; sceneRoot = null; overlay.replaceChildren(); overlay.dataset.count = '0';
  }
  function refresh() {
    if (!entries.length) return null;
    const { THREE, diagramGroup, camera } = diagram();
    if (diagramGroup !== sceneRoot) { clear(); return null; }
    diagramGroup.updateMatrixWorld(true); camera.updateMatrixWorld();
    const rect = viewport.getBoundingClientRect(), width = rect.width, height = rect.height;
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const entry of entries) {
      const box = ownBounds(entry.object, THREE);
      const world = entry.route ? Array.from({ length: entry.object.geometry.attributes.position.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(entry.object.geometry.attributes.position, i).applyMatrix4(entry.object.matrixWorld)) : corners(box, THREE);
      const points = world.map(point => point.project(camera)).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.z >= -1 && point.z <= 1)
        .map(point => ({ x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 }));
      entry.group.style.display = points.length ? '' : 'none';
      if (!points.length) continue;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      const include = (x, y) => { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); };
      points.forEach(point => include(point.x, point.y));
      for (const label of entry.labels) {
        const labelRect = label.element.getBoundingClientRect();
        if (labelRect.width && labelRect.height) {
          include(labelRect.left - rect.left - 4, labelRect.top - rect.top - 4);
          include(labelRect.right - rect.left + 4, labelRect.bottom - rect.top + 4);
        }
      }
      if (entry.route) entry.shape.setAttribute('d', points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' '));
      else {
        entry.shape.setAttribute('x', left - 4); entry.shape.setAttribute('y', top - 4);
        entry.shape.setAttribute('width', Math.max(8, right - left + 8)); entry.shape.setAttribute('height', Math.max(8, bottom - top + 8));
      }
      entry.hiddenLabel.setAttribute('x', left); entry.hiddenLabel.setAttribute('y', top - 9);
    }
  }
  function locate(records) {
    clear();
    const { diagramGroup, render } = diagram();
    diagramGroup.updateMatrixWorld(true);
    const nodes = new Map(), links = new Map();
    diagramGroup.traverse(object => {
      if (object.userData?.isClassLike) nodes.set(String(object.userData.hbdsId), object);
      if (object.userData?.isHbdsLink) links.set(String(object.userData.linkData.id), object);
    });
    const seen = new Set();
    for (const record of records) {
      const key = JSON.stringify([record.type, record.id]);
      if (seen.has(key)) continue;
      seen.add(key);
      const owner = nodes.get(record.ownerId || record.id), link = links.get(record.id);
      const attribute = ['classAttribute', 'hyperattribute'].includes(record.type), route = ['classLink', 'hyperlink'].includes(record.type);
      const object = attribute ? owner?.children.find(child => child.name === 'attribute-marker' && child.userData.attributeIndex === record.attributeIndex)
        : route ? link?.getObjectByName('link-route') : owner;
      if (!object?.geometry) continue;
      const labels = (route ? link.children : owner.children).filter(child => child.isCSS2DObject && (attribute
        ? child.userData.attributeIndex === record.attributeIndex && child.userData.labelKind === 'attribute'
        : child.userData.labelKind === (route ? 'link' : 'title')));
      const group = make('g'), shape = make(route ? 'path' : 'rect'), hiddenLabel = make('text');
      group.dataset.id = record.id; group.dataset.type = record.type;
      shape.setAttribute('class', route ? 'query-route' : 'query-outline');
      if (!route) shape.setAttribute('rx', '4');
      let visible = true;
      for (let current = object; current; current = current.parent) if (!current.visible) visible = false;
      if (!visible) hiddenLabel.textContent = `Hidden: ${record.name || record.id}`;
      group.append(shape, hiddenLabel); overlay.append(group);
      entries.push({ object, labels, route, group, shape, hiddenLabel });
      labels.forEach(label => label.element.classList.add('hbds-query-highlight'));
    }
    sceneRoot = diagramGroup; overlay.dataset.count = String(entries.length);
    render(); refresh();
    return { count: entries.length, missing: seen.size - entries.length };
  }
  return { locate, clear, refresh };
}
