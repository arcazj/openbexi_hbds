import * as THREE from 'three';

import {
  Loader as ClassLoader,
  createClass,
  updateLabelFontSizes
} from './hbds_class.js';

import {
  Loader as HyperClassLoader,
  createHyperClass,
  updateLabelFontSizes as updateHyperClassLabelFontSizes
} from './hbds_hyperclass_class.js';

import {
  createLinkBetweenClass,
  updateLinkFontSizes,
  recalculateAllLinks
} from './hbds_class_link.js';

import {
  Loader as HyperClassLinkLoader,
  createLinkBetweenHyperClass,
  updateLinkFontSizes as updateHyperClassLinkFontSizes
} from './hbds_hyperclass_link.js';

function cloneModelData(data) {
  return typeof structuredClone === 'function'
    ? structuredClone(data)
    : JSON.parse(JSON.stringify(data));
}

function stampNodeMetadata(classMesh, classData) {
  classMesh.userData.modelData = cloneModelData(classData);
  classMesh.userData.hbdsId = classData.id;
  classMesh.userData.isHyperClass = classData.type === 'hyperclass';
  classMesh.userData.isHbdsClass = true;
}

export async function loadAndRenderScene(modelName, context) {
  const {
    scene,
    camera,
    renderer,
    css2DRenderer,
    orbitControls,
    dragControls,
    diagramGroup,
    draggableObjects,
    setDiagramGroup,
    setDragControls,
    setupDragControls,
    setCamera2D,
    renderOnce
  } = context;

  if (diagramGroup) {
    scene.remove(diagramGroup);
    draggableObjects.length = 0;
    diagramGroup.traverse(c => {
      if ((c.isMesh || c.isLine) && c.geometry) c.geometry.dispose();
      if ((c.isMesh || c.isLine) && c.material) c.material.dispose();
      if (c.isCSS2DObject) c.element.remove();
    });
  }
  if (dragControls) {
    dragControls.dispose();
    setDragControls(null);
  }

  const data = await HyperClassLoader.load(modelName);
  const nextDiagramGroup = new THREE.Group();
  scene.add(nextDiagramGroup);
  setDiagramGroup(nextDiagramGroup);

  const classById = new Map();
  data.hypergraph.class.forEach(cd => {
    const isHyperClass = cd.type === 'hyperclass';
    const { classMesh } = isHyperClass
      ? createHyperClass(null, cd)
      : createClass(cd);

    if (!isHyperClass) {
      classMesh.position.set(cd.position.x, cd.position.y, cd.position.z);
    }

    stampNodeMetadata(classMesh, cd);
    nextDiagramGroup.add(classMesh);
    classById.set(cd.id, classMesh);
  });

  data.hypergraph.class.forEach(cd => {
    if (!cd.parentClassId) return;
    const parent = classById.get(cd.parentClassId);
    const child = classById.get(cd.id);
    if (!parent || !child) return;

    const childWorld = child.getWorldPosition(new THREE.Vector3());
    parent.worldToLocal(childWorld);
    nextDiagramGroup.remove(child);
    child.position.copy(childWorld);
    parent.add(child);
  });

  data.hypergraph.class.forEach(cd => {
    if (!cd.parentClassId) draggableObjects.push(classById.get(cd.id));
  });

  (data.hypergraph.link || []).forEach(ld => {
    const sourceObject = classById.get(ld.sourceClassId);
    const targetObject = classById.get(ld.targetClassId);
    const hasHyperEndpoint = sourceObject?.userData?.isHyperClass || targetObject?.userData?.isHyperClass;
    const link = hasHyperEndpoint
      ? createLinkBetweenHyperClass(nextDiagramGroup, sourceObject, targetObject, ld)
      : createLinkBetweenClass(ld, classById);

    if (!link) return;

    link.linkGroup.userData.linkData = cloneModelData(ld);
    link.linkGroup.userData.sourceClassId = ld.sourceClassId;
    link.linkGroup.userData.targetClassId = ld.targetClassId;
    link.linkGroup.userData.isHbdsLink = true;
    nextDiagramGroup.add(link.linkGroup);
  });

  const box = new THREE.Box3().setFromObject(nextDiagramGroup);
  const center = box.getCenter(new THREE.Vector3());
  nextDiagramGroup.position.sub(center);
  box.getBoundingSphere(nextDiagramGroup.userData.boundingSphere = new THREE.Sphere());

  setCamera2D();
  setupDragControls();

  orbitControls.addEventListener('change', () => {
    updateLabelFontSizes(camera);
    updateHyperClassLabelFontSizes(camera, renderer);
    updateLinkFontSizes(camera);
    updateHyperClassLinkFontSizes(camera, renderer);
    recalculateAllLinks();
    renderOnce();
  });

  updateLabelFontSizes(camera);
  updateHyperClassLabelFontSizes(camera, renderer);
  updateLinkFontSizes(camera);
  updateHyperClassLinkFontSizes(camera, renderer);
  recalculateAllLinks();
  renderOnce();
}

export function saveScene(context, options = {}) {
  const { diagramGroup } = context;
  if (!diagramGroup) return;

  const classEntries = [];
  const linkEntries = [];

  diagramGroup.traverse(obj => {
    if (obj.userData?.isHbdsClass && obj.userData?.modelData) {
      const savedClass = cloneModelData(obj.userData.modelData);
      const worldPos = obj.getWorldPosition(new THREE.Vector3());
      const localPos = diagramGroup.worldToLocal(worldPos.clone());

      savedClass.position = {
        x: localPos.x,
        y: localPos.y,
        z: localPos.z
      };

      classEntries.push(savedClass);
    }

    if (obj.userData?.isHbdsLink && obj.userData?.linkData) {
      const savedLink = cloneModelData(obj.userData.linkData);
      savedLink.sourceClassId = obj.userData.sourceClassId ?? savedLink.sourceClassId;
      savedLink.targetClassId = obj.userData.targetClassId ?? savedLink.targetClassId;
      linkEntries.push(savedLink);
    }
  });

  const savedModel = {
    hypergraph: {
      class: classEntries,
      link: linkEntries
    }
  };

  const blob = new Blob([JSON.stringify(savedModel, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.fileName || 'hbds_saved_model.json';
  a.click();
  URL.revokeObjectURL(url);
}

export async function optimizeAndRefreshLayout(context, options = {}) {
  if (!context?.diagramGroup) {
    console.warn('optimizeAndRefreshLayout: missing context or diagramGroup');
    return;
  }

  const sceneModel = collectSceneModel(context);
  if (!sceneModel.nodes.length) return;

  const layout = buildLayoutGraph(context, sceneModel, options);
  optimizeLayoutGraph(layout, options);
  updateSceneFromLayout(context, layout);
  refreshLabelsAndLinks(context);
  context.renderOnce?.();
}

function collectSceneModel(context) {
  const nodes = [];
  const links = [];
  context.diagramGroup.traverse(obj => {
    if (obj.userData?.isHbdsClass) nodes.push(obj);
    if (obj.userData?.isHbdsLink && obj.userData?.linkData) links.push(obj);
  });
  return { nodes, links };
}

function buildLayoutGraph(context, sceneModel, options = {}) {
  const nodes = [];
  const nodeById = new Map();
  sceneModel.nodes.forEach((object, index) => {
    const modelData = object.userData?.modelData || {};
    const id = object.userData?.hbdsId || modelData.id || `node_${index}`;
    const bounds = computeNodeBounds(object, modelData);
    const center = object.getWorldPosition(new THREE.Vector3());
    const node = {
      id, object, modelData, isHyperClass: !!object.userData?.isHyperClass,
      parentId: object.userData?.parentClassId || modelData.parentClassId || null,
      children: Array.isArray(modelData.children) ? modelData.children.slice() : [],
      center, x: center.x, y: center.y, z: center.z,
      width: bounds.width, height: bounds.height, baseWidth: bounds.width, baseHeight: bounds.height,
      vx: 0, vy: 0
    };
    nodes.push(node);
    nodeById.set(id, node);
  });

  const edges = [];
  sceneModel.links.forEach(linkObj => {
    const ld = linkObj.userData?.linkData || {};
    const sourceId = linkObj.userData?.sourceClassId || ld.sourceClassId;
    const targetId = linkObj.userData?.targetClassId || ld.targetClassId;
    if (!nodeById.get(sourceId) || !nodeById.get(targetId)) return;
    edges.push({ sourceId, targetId, linkObj });
  });

  return { nodes, edges, nodeById, seed: `${options.modelName || 'hbds'}_${nodes.map(n => n.id).join('|')}` };
}

function computeNodeBounds(object, modelData) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const fallback = modelData?.size || {};
  return {
    width: Math.max(size.x || fallback.width || 1.2, 0.8),
    height: Math.max(size.y || fallback.height || 0.8, 0.6)
  };
}
function computeAttributeBounds() { return { width: 0.2, height: 0.12 }; }
function seededRandom(seedText) {
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = ((seed << 5) - seed + seedText.charCodeAt(i)) | 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 0) % 1000000) / 1000000;
  };
}

function optimizeLayoutGraph(layout, options = {}) {
  const iterations = options.iterations ?? 220;
  const repulsion = options.repulsion ?? 14;
  const attraction = options.attraction ?? 0.012;
  const collisionPadding = options.collisionPadding ?? 0.4;
  const hyperclassPadding = options.hyperclassPadding ?? 0.6;
  const damping = options.damping ?? 0.84;
  const maxStep = options.maxStep ?? 0.2;
  let bestScore = scoreLayout(layout);
  let best = layout.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }));

  for (let i = 0; i < iterations; i++) {
    applyRepulsion(layout, repulsion);
    applyEdgeAttraction(layout, attraction);
    resolveCollisions(layout, collisionPadding);
    enforceHyperclassContainment(layout, hyperclassPadding);
    reduceLinkIntersections(layout);
    applyDamping(layout, damping, maxStep);
    const currentScore = scoreLayout(layout);
    if (currentScore < bestScore) {
      bestScore = currentScore;
      best = layout.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }));
    }
  }
  best.forEach(s => {
    const n = layout.nodeById.get(s.id);
    if (n) { n.x = s.x; n.y = s.y; n.width = s.width; n.height = s.height; }
  });
  snapToSoftGrid(layout, options.gridSize ?? 0.25);
}

function applyRepulsion(layout, strength) {
  const nodes = layout.nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const distSq = Math.max(dx * dx + dy * dy, 0.01);
      const force = strength / distSq;
      const invDist = 1 / Math.sqrt(distSq);
      const fx = dx * invDist * force;
      const fy = dy * invDist * force;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
  }
}
function applyEdgeAttraction(layout, strength) {
  layout.edges.forEach(e => {
    const s = layout.nodeById.get(e.sourceId), t = layout.nodeById.get(e.targetId);
    if (!s || !t) return;
    const dx = t.x - s.x, dy = t.y - s.y;
    s.vx += dx * strength; s.vy += dy * strength;
    t.vx -= dx * strength; t.vy -= dy * strength;
  });
}
function resolveCollisions(layout, padding) {
  for (let i = 0; i < layout.nodes.length; i++) for (let j = i + 1; j < layout.nodes.length; j++) {
    const a = layout.nodes[i], b = layout.nodes[j];
    const ox = (a.width + b.width) / 2 + padding - Math.abs(a.x - b.x);
    const oy = (a.height + b.height) / 2 + padding - Math.abs(a.y - b.y);
    if (ox > 0 && oy > 0) {
      if (ox < oy) { const push = ox * 0.5 * Math.sign((a.x - b.x) || 1); a.vx += push; b.vx -= push; }
      else { const push = oy * 0.5 * Math.sign((a.y - b.y) || 1); a.vy += push; b.vy -= push; }
    }
  }
}
function enforceHyperclassContainment(layout, padding) {
  layout.nodes.filter(n => n.isHyperClass).forEach(h => {
    const children = layout.nodes.filter(n => n.parentId === h.id);
    arrangeChildrenInsideHyperclass(layout, h, { padding });
    resizeHyperclassToFitChildren(layout, h, { padding });
    children.forEach(c => {
      const halfW = h.width / 2 - c.width / 2 - padding;
      const halfH = h.height / 2 - c.height / 2 - padding;
      c.x = Math.max(h.x - halfW, Math.min(h.x + halfW, c.x));
      c.y = Math.max(h.y - halfH, Math.min(h.y + halfH, c.y));
    });
  });
}
function arrangeChildrenInsideHyperclass(layout, hyperNode, options = {}) {
  const kids = layout.nodes.filter(n => n.parentId === hyperNode.id);
  if (!kids.length) return;
  const pad = options.padding ?? 0.6;
  if (kids.length === 1) { kids[0].x = hyperNode.x; kids[0].y = hyperNode.y; return; }
  if (kids.length === 2) {
    const horizontal = hyperNode.width >= hyperNode.height;
    const gap = horizontal ? hyperNode.width * 0.3 : hyperNode.height * 0.3;
    kids[0].x = hyperNode.x + (horizontal ? -gap / 2 : 0); kids[0].y = hyperNode.y + (horizontal ? 0 : gap / 2);
    kids[1].x = hyperNode.x + (horizontal ? gap / 2 : 0); kids[1].y = hyperNode.y + (horizontal ? 0 : -gap / 2);
    return;
  }
  const cols = Math.ceil(Math.sqrt(kids.length));
  const rows = Math.ceil(kids.length / cols);
  const availW = hyperNode.width - pad * 2;
  const availH = hyperNode.height - pad * 2;
  kids.forEach((k, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    k.x = hyperNode.x - availW / 2 + (col + 0.5) * (availW / cols);
    k.y = hyperNode.y + availH / 2 - (row + 0.5) * (availH / rows);
  });
}
function resizeHyperclassToFitChildren(layout, hyperNode, options = {}) {
  const kids = layout.nodes.filter(n => n.parentId === hyperNode.id);
  if (!kids.length) return;
  const pad = options.padding ?? 0.6;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  kids.forEach(k => {
    minX = Math.min(minX, k.x - k.width / 2); maxX = Math.max(maxX, k.x + k.width / 2);
    minY = Math.min(minY, k.y - k.height / 2); maxY = Math.max(maxY, k.y + k.height / 2);
  });
  const neededW = (maxX - minX) + pad * 2;
  const neededH = (maxY - minY) + pad * 2;
  hyperNode.width = Math.max(hyperNode.baseWidth, neededW);
  hyperNode.height = Math.max(hyperNode.baseHeight, neededH);
}
function reduceLinkIntersections(layout) {
  layout.nodes.forEach(n => {
    let crossings = 0;
    layout.edges.forEach(e => {
      const s = layout.nodeById.get(e.sourceId), t = layout.nodeById.get(e.targetId);
      if (!s || !t || s.id === n.id || t.id === n.id) return;
      if (lineIntersectsBox({ x: s.x, y: s.y }, { x: t.x, y: t.y }, n)) crossings++;
    });
    if (crossings > 0) { n.vx += 0.02 * crossings; n.vy -= 0.02 * crossings; }
  });
}
function lineIntersectsBox(p1, p2, boxNode) {
  const hw = boxNode.width / 2, hh = boxNode.height / 2;
  const corners = [
    { x: boxNode.x - hw, y: boxNode.y - hh }, { x: boxNode.x + hw, y: boxNode.y - hh },
    { x: boxNode.x + hw, y: boxNode.y + hh }, { x: boxNode.x - hw, y: boxNode.y + hh }
  ];
  return segmentsIntersect(p1, p2, corners[0], corners[1]) || segmentsIntersect(p1, p2, corners[1], corners[2]) ||
    segmentsIntersect(p1, p2, corners[2], corners[3]) || segmentsIntersect(p1, p2, corners[3], corners[0]);
}
function segmentsIntersect(a, b, c, d) {
  const ccw = (p1, p2, p3) => (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}
function applyDamping(layout, damping, maxStep) {
  layout.nodes.forEach(n => {
    n.vx *= damping; n.vy *= damping;
    n.x += Math.max(-maxStep, Math.min(maxStep, n.vx));
    n.y += Math.max(-maxStep, Math.min(maxStep, n.vy));
  });
}
function scoreLayout(layout) {
  return overlapPenalty(layout) + containmentPenalty(layout) + linkThroughNodePenalty(layout) + edgeLengthPenalty(layout);
}
function overlapPenalty(layout) {
  let p = 0;
  for (let i = 0; i < layout.nodes.length; i++) for (let j = i + 1; j < layout.nodes.length; j++) {
    const a = layout.nodes[i], b = layout.nodes[j];
    const ox = (a.width + b.width) / 2 - Math.abs(a.x - b.x);
    const oy = (a.height + b.height) / 2 - Math.abs(a.y - b.y);
    if (ox > 0 && oy > 0) p += ox * oy;
  }
  return p * 10;
}
const containmentPenalty = layout => layout.nodes.reduce((acc, n) => {
  if (!n.parentId) return acc;
  const p = layout.nodeById.get(n.parentId); if (!p) return acc + 10;
  const dx = Math.max(0, Math.abs(n.x - p.x) + n.width / 2 - p.width / 2);
  const dy = Math.max(0, Math.abs(n.y - p.y) + n.height / 2 - p.height / 2);
  return acc + (dx + dy) * 20;
}, 0);
function linkThroughNodePenalty(layout) { let p = 0; layout.edges.forEach(e => { const s = layout.nodeById.get(e.sourceId), t = layout.nodeById.get(e.targetId); if (!s || !t) return; layout.nodes.forEach(n => { if (n.id !== s.id && n.id !== t.id && lineIntersectsBox(s, t, n)) p += 4; }); }); return p; }
function edgeLengthPenalty(layout) { return layout.edges.reduce((acc, e) => { const s = layout.nodeById.get(e.sourceId), t = layout.nodeById.get(e.targetId); if (!s || !t) return acc; const d = Math.hypot(t.x - s.x, t.y - s.y); return acc + Math.abs(d - 4); }, 0); }
function snapToSoftGrid(layout, gridSize) { layout.nodes.forEach(n => { n.x = n.x * 0.8 + Math.round(n.x / gridSize) * gridSize * 0.2; n.y = n.y * 0.8 + Math.round(n.y / gridSize) * gridSize * 0.2; }); }
function updateSceneFromLayout(context, layout) {
  layout.nodes.forEach(n => {
    const parent = n.object.parent || context.diagramGroup;
    const worldTarget = new THREE.Vector3(n.x, n.y, n.z ?? 0);
    const local = parent.worldToLocal(worldTarget);
    n.object.position.set(local.x, local.y, n.object.position.z);
    if (n.modelData?.position) {
      n.modelData.position.x = n.x; n.modelData.position.y = n.y;
      n.object.userData.modelData.position = cloneModelData(n.modelData.position);
    }
  });
}
function refreshLabelsAndLinks(context) {
  recalculateAllLinks();
  updateLabelFontSizes(context.camera);
  updateHyperClassLabelFontSizes(context.camera, context.renderer);
  updateLinkFontSizes(context.camera);
  updateHyperClassLinkFontSizes(context.camera, context.renderer);
}
