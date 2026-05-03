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
  const scoreBefore = scoreLayout(layout);
  const optimized = optimizeLayoutGraph(layout, options);
  let validation = validateOptimizedLayout(optimized);

  for (let pass = 0; pass < 2 && hasHardValidationErrors(validation); pass++) {
    cleanupRemainingCollisions(optimized, validation, options);
    chooseAttributeLayoutsForAllNodes(optimized, options);
    routeAllLinks(optimized, options);
    validation = validateOptimizedLayout(optimized);
  }

  updateSceneFromLayout(context, optimized);
  refreshLabelsAndLinks(context);
  context.renderOnce?.();

  const scoreAfter = scoreLayout(optimized);
  console.info('HBDS layout optimization summary', {
    scoreBefore,
    scoreAfter,
    classOverlaps: validation.classOverlaps.length,
    attributeOverlaps: validation.attributeOverlaps.length,
    childContainmentErrors: validation.childContainmentErrors.length,
    linkNodeCrossings: validation.linkNodeCrossings.length,
    linkHyperclassCrossings: validation.linkHyperclassCrossings.length,
    linkAttributeCrossings: validation.linkAttributeCrossings.length
  });
}

const DEFAULT_LAYOUT_OPTIONS = {
  iterations: 170,
  borderPadding: 0.75,
  titleBandHeight: 0.55,
  parentAttributePanelWidth: 1.65,
  childPadding: 0.55,
  childGapX: 0.75,
  childGapY: 0.75,
  attributeGap: 0.12,
  attributeNodeGap: 0.25,
  hyperclassMinWidth: 4.0,
  hyperclassMinHeight: 3.0,
  maxStep: 0.22
};

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
  const mergedOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  const nodeById = new Map();
  const nodes = sceneModel.nodes.map((object, index) => {
    const modelData = object.userData?.modelData || {};
    const id = object.userData?.hbdsId || modelData.id || `node_${index}`;
    const name = modelData.name || id;
    const isHyperClass = !!object.userData?.isHyperClass;
    const parentClassId = object.userData?.parentClassId || modelData.parentClassId || null;
    const position = object.getWorldPosition(new THREE.Vector3());
    const size = computeNodeBounds(object, modelData, mergedOptions);
    const attributes = Array.isArray(modelData.attributes) ? modelData.attributes.map((a, i) => ({
      ownerId: id, name: (a?.name || a || `attr_${i}`).toString(), index: i
    })) : [];
    const node = {
      id, name, type: modelData.type || 'class', isHyperClass, parentClassId,
      children: Array.isArray(modelData.children) ? modelData.children.slice() : [],
      object, modelData,
      position, velocity: new THREE.Vector2(),
      size: { ...size }, minSize: { width: size.width, height: size.height },
      bounds: makeBox(position.x, position.y, size.width, size.height),
      contentBounds: null, attributeRegion: null,
      attributes, attributeBoxes: [], linkAnchors: {}
    };
    nodeById.set(id, node);
    return node;
  });

  const links = [];
  sceneModel.links.forEach(linkObj => {
    const rendering = linkObj.userData?.linkData?.rendering || {};
    const sourceClassId = linkObj.userData?.sourceClassId || linkObj.userData?.linkData?.sourceClassId;
    const targetClassId = linkObj.userData?.targetClassId || linkObj.userData?.linkData?.targetClassId;
    const sourceNode = nodeById.get(sourceClassId);
    const targetNode = nodeById.get(targetClassId);
    if (!sourceNode || !targetNode) return;
    links.push({ sourceClassId, targetClassId, sourceNode, targetNode, rendering, linkObj, route: null, labelBox: null, score: 0 });
  });

  const layout = { context, nodes, nodeById, links, options: mergedOptions };
  layoutChildrenForAllHyperclasses(layout, mergedOptions);
  chooseAttributeLayoutsForAllNodes(layout, mergedOptions);
  distributeParallelLinkOffsets(layout.links, mergedOptions);
  routeAllLinks(layout, mergedOptions);
  return layout;
}

function computeNodeBounds(object, modelData, options = {}) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const fallback = modelData?.size || {};
  const baseW = Math.max(size.x || fallback.width || 1.4, 0.8);
  const baseH = Math.max(size.y || fallback.height || 0.8, 0.6);
  const isHyper = modelData?.type === 'hyperclass' || object.userData?.isHyperClass;
  return {
    width: isHyper ? Math.max(baseW, options.hyperclassMinWidth || 4) : baseW,
    height: isHyper ? Math.max(baseH, options.hyperclassMinHeight || 3) : baseH
  };
}

function computeAttributeBounds(name, options = {}) {
  const font = 0.18;
  const width = Math.max(font, String(name || '').length * font * 0.55) + 0.28;
  return { width, height: font * 1.25 + 0.06, marker: 0.08, font };
}

function seededRandom(seedText) { let seed = 0; for (let i = 0; i < seedText.length; i++) seed = ((seed << 5) - seed + seedText.charCodeAt(i)) | 0; return () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) % 1000000) / 1000000; }; }

function makeBox(cx, cy, w, h) { return { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2, width: w, height: h, cx, cy }; }
function overlapArea(a, b) { const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)); const oy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)); return ox * oy; }
function boxContains(outer, inner) { return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY; }
function pointInBox(point, box) { return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY; }
function segmentsIntersect(a, b, c, d) {
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p, q, r) => q.x >= Math.min(p.x, r.x) && q.x <= Math.max(p.x, r.x) && q.y >= Math.min(p.y, r.y) && q.y <= Math.max(p.y, r.y);
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}
function lineIntersectsBox(start, end, rect) {
  const box = makeBox(rect.x, rect.y, rect.width, rect.height);
  if (pointInBox(start, box) || pointInBox(end, box)) return true;
  const edges = [
    [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }],
    [{ x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }],
    [{ x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }],
    [{ x: box.minX, y: box.maxY }, { x: box.minX, y: box.minY }]
  ];
  return edges.some(([e1, e2]) => segmentsIntersect(start, end, e1, e2));
}

function layoutChildrenForAllHyperclasses(layout, options) { layout.nodes.filter(n => n.isHyperClass).forEach(h => layoutChildrenInsideHyperclass(h, layout, options)); }
function layoutChildrenInsideHyperclass(hyperNode, layout, options) {
  const kids = layout.nodes.filter(n => n.parentClassId === hyperNode.id);
  hyperNode.contentBounds = computeHyperclassContentArea(hyperNode, options);
  if (!kids.length) return;
  const cols = Math.ceil(Math.sqrt(kids.length)); const rows = Math.ceil(kids.length / cols);
  const area = hyperNode.contentBounds;
  const cellW = (area.maxX - area.minX) / cols; const cellH = (area.maxY - area.minY) / rows;
  kids.forEach((k, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    k.position.x = area.minX + cellW * (col + 0.5);
    k.position.y = area.maxY - cellH * (row + 0.5);
    k.bounds = makeBox(k.position.x, k.position.y, k.size.width, k.size.height);
  });
  resizeHyperclassToFitChildren(layout, hyperNode, options);
}
function computeHyperclassContentArea(hyperNode, options) {
  const b = makeBox(hyperNode.position.x, hyperNode.position.y, hyperNode.size.width, hyperNode.size.height);
  return { minX: b.minX + options.borderPadding, maxX: b.maxX - options.borderPadding - options.parentAttributePanelWidth, minY: b.minY + options.borderPadding, maxY: b.maxY - options.borderPadding - options.titleBandHeight };
}
function resizeHyperclassToFitChildren(layout, hyperNode, options) { const kids = layout.nodes.filter(n => n.parentClassId === hyperNode.id); if (!kids.length) return; let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity; kids.forEach(k=>{minX=Math.min(minX,k.bounds.minX);minY=Math.min(minY,k.bounds.minY);maxX=Math.max(maxX,k.bounds.maxX);maxY=Math.max(maxY,k.bounds.maxY);}); const w = (maxX-minX)+options.borderPadding*2+options.parentAttributePanelWidth; const h = (maxY-minY)+options.borderPadding*2+options.titleBandHeight; hyperNode.size.width=Math.max(hyperNode.minSize.width,w); hyperNode.size.height=Math.max(hyperNode.minSize.height,h); hyperNode.bounds=makeBox(hyperNode.position.x,hyperNode.position.y,hyperNode.size.width,hyperNode.size.height); hyperNode.contentBounds = computeHyperclassContentArea(hyperNode, options); }

function chooseAttributeLayoutsForAllNodes(layout, options) { layout.nodes.forEach(n => chooseBestAttributeLayout(n, layout, options)); }
function chooseBestAttributeLayout(node, layout, options) {
  const candidates = ['right','left','top','bottom'];
  let best = null;
  for (const side of candidates) {
    const candidate = computeAttributeFootprint(node, side, options);
    const score = attributeOverlapPenalty(candidate, layout) + (side === 'right' ? 0 : 10);
    if (!best || score < best.score) best = { candidate, score };
  }
  applyAttributeLayout(node, best.candidate);
}
function computeAttributeFootprint(node, side, options) {
  const boxes = []; const gap = options.attributeGap;
  node.attributes.forEach((attr, i) => {
    const d = computeAttributeBounds(attr.name, options);
    let x = node.position.x, y = node.position.y;
    if (side === 'right') { x += node.size.width / 2 + options.attributeNodeGap + d.width / 2; y += node.size.height / 2 - (i + 0.7) * (d.height + gap); }
    if (side === 'left') { x -= node.size.width / 2 + options.attributeNodeGap + d.width / 2; y += node.size.height / 2 - (i + 0.7) * (d.height + gap); }
    if (side === 'top') { x += -node.size.width / 2 + (i + 0.7) * (d.width + gap); y += node.size.height / 2 + options.attributeNodeGap + d.height / 2; }
    if (side === 'bottom') { x += -node.size.width / 2 + (i + 0.7) * (d.width + gap); y -= node.size.height / 2 + options.attributeNodeGap + d.height / 2; }
    boxes.push({ ...attr, combinedBox: makeBox(x, y, d.width, d.height), side });
  });
  return { side, boxes };
}
function attributeOverlapPenalty(candidate, layout) { let p=0; for (const a of candidate.boxes) { for (const n of layout.nodes) p += overlapArea(a.combinedBox, n.bounds) * 1000; } return p; }
function applyAttributeLayout(node, candidate) { node.attributeBoxes = candidate.boxes; node.attributeRegion = candidate.side; }

function optimizeLayoutGraph(layout, options = {}) {
  const o = { ...layout.options, ...options };
  const rng = seededRandom(layout.nodes.map(n => n.id).sort().join('|'));
  let best = cloneLayout(layout); let bestScore = scoreLayout(layout);
  for (let i = 0; i < o.iterations; i++) {
    applyRepulsion(layout, 10);
    applyEdgeAttraction(layout, 0.01);
    resolveCollisions(layout, o.childGapX);
    enforceHyperclassContainment(layout, o.childPadding);
    applyVelocities(layout, o.maxStep, 0.85);
    layoutChildrenForAllHyperclasses(layout, o);
    chooseAttributeLayoutsForAllNodes(layout, o);
    routeAllLinks(layout, o);
    // deterministic micro-jitter for tie breaks
    if (i % 10 === 0) layout.nodes.forEach(n => { n.position.x += (rng()-0.5)*0.001; n.position.y += (rng()-0.5)*0.001; n.bounds = makeBox(n.position.x,n.position.y,n.size.width,n.size.height); });
    const s = scoreLayout(layout);
    if (s < bestScore) { bestScore = s; best = cloneLayout(layout); }
  }
  restoreLayout(layout, best);
  return layout;
}
function applyRepulsion(layout, strength) { for (let i=0;i<layout.nodes.length;i++) for (let j=i+1;j<layout.nodes.length;j++) { const a=layout.nodes[i], b=layout.nodes[j]; if (a.parentClassId && a.parentClassId===b.parentClassId) continue; const dx=a.position.x-b.position.x, dy=a.position.y-b.position.y; const d2=Math.max(dx*dx+dy*dy,0.01); const f=strength/d2; const inv=1/Math.sqrt(d2); a.velocity.x += dx*inv*f; a.velocity.y += dy*inv*f; b.velocity.x -= dx*inv*f; b.velocity.y -= dy*inv*f; } }
function applyEdgeAttraction(layout, strength) { layout.links.forEach(l=>{ const dx=l.targetNode.position.x-l.sourceNode.position.x, dy=l.targetNode.position.y-l.sourceNode.position.y; l.sourceNode.velocity.x += dx*strength; l.sourceNode.velocity.y += dy*strength; l.targetNode.velocity.x -= dx*strength; l.targetNode.velocity.y -= dy*strength; }); }
function resolveCollisions(layout, padding) { for (let i=0;i<layout.nodes.length;i++) for (let j=i+1;j<layout.nodes.length;j++) { const a=layout.nodes[i], b=layout.nodes[j]; const ox=(a.size.width+b.size.width)/2+padding-Math.abs(a.position.x-b.position.x); const oy=(a.size.height+b.size.height)/2+padding-Math.abs(a.position.y-b.position.y); if (ox>0&&oy>0) { if (ox<oy) { const s=Math.sign((a.position.x-b.position.x)||1)*ox*0.5; a.velocity.x+=s; b.velocity.x-=s; } else { const s=Math.sign((a.position.y-b.position.y)||1)*oy*0.5; a.velocity.y+=s; b.velocity.y-=s; } } } }
function enforceHyperclassContainment(layout) { layout.nodes.forEach(n=>{ if (!n.parentClassId) return; const p=layout.nodeById.get(n.parentClassId); if (!p?.contentBounds) return; n.position.x=Math.min(p.contentBounds.maxX-n.size.width/2, Math.max(p.contentBounds.minX+n.size.width/2, n.position.x)); n.position.y=Math.min(p.contentBounds.maxY-n.size.height/2, Math.max(p.contentBounds.minY+n.size.height/2, n.position.y)); n.bounds=makeBox(n.position.x,n.position.y,n.size.width,n.size.height); }); }
function applyVelocities(layout,maxStep,damp){ layout.nodes.forEach(n=>{ n.velocity.multiplyScalar(damp); n.position.x += Math.max(-maxStep,Math.min(maxStep,n.velocity.x)); n.position.y += Math.max(-maxStep,Math.min(maxStep,n.velocity.y)); n.bounds=makeBox(n.position.x,n.position.y,n.size.width,n.size.height); }); }

function distributeParallelLinkOffsets(links) { const grp = new Map(); links.forEach(l=>{ const k=[l.sourceClassId,l.targetClassId].sort().join('|'); if(!grp.has(k)) grp.set(k,[]); grp.get(k).push(l);}); const offsets=[0.35,-0.35,0.65,-0.65,0.95,-0.95]; grp.forEach(arr=>arr.forEach((l,i)=>{ l.rendering.curveOffset=offsets[i]??(1.25*(i+1)); })); }
function routeAllLinks(layout) { layout.links.forEach(l => chooseBestLinkRoute(l, layout)); }
function chooseBestLinkRoute(link, layout) {
  const candidates = buildLinkRouteCandidates(link);
  let best = null;
  candidates.forEach(route => {
    let p = 0;
    layout.nodes.forEach(n => { if (n.id !== link.sourceClassId && n.id !== link.targetClassId && routeIntersectsObstacle(route, n.bounds)) p += n.isHyperClass ? 450000 : 500000; });
    layout.nodes.forEach(n => n.attributeBoxes.forEach(a => { if (routeIntersectsObstacle(route, a.combinedBox)) p += 400000; }));
    if (!best || p < best.p) best = { route, p };
  });
  applyLinkRoute(link, best.route);
}
function buildLinkRouteCandidates(link) { const s=link.sourceNode.position, t=link.targetNode.position; const mid={x:(s.x+t.x)/2,y:(s.y+t.y)/2}; return [ [{x:s.x,y:s.y},{x:t.x,y:t.y}], [{x:s.x,y:s.y},{x:mid.x,y:s.y},{x:mid.x,y:t.y},{x:t.x,y:t.y}], [{x:s.x,y:s.y},{x:s.x,y:mid.y},{x:t.x,y:mid.y},{x:t.x,y:t.y}] ]; }
function routeIntersectsObstacle(route, b) { for (let i=0;i<route.length-1;i++) if (lineIntersectsBox(route[i], route[i+1], {x:b.cx,y:b.cy,width:b.width,height:b.height})) return true; return false; }
function applyLinkRoute(link, route) { link.route = route; link.rendering.routePoints = route.slice(1, -1).map(p => ({ x: p.x, y: p.y, z: 0 })); link.linkObj.userData.linkData.rendering = { ...(link.linkObj.userData.linkData.rendering || {}), ...link.rendering, routePoints: link.rendering.routePoints }; }

function scoreLayout(layout) {
  const v = validateOptimizedLayout(layout);
  return 1000000*v.classOverlaps.length + 800000*v.attributeOverlaps.length + 700000*v.childContainmentErrors.length + 500000*v.linkNodeCrossings.length + 450000*v.linkHyperclassCrossings.length + 400000*v.linkAttributeCrossings.length;
}
function validateOptimizedLayout(layout) {
  const out = { classOverlaps: [], hyperclassOverlaps: [], attributeOverlaps: [], parentAttributeCollisions: [], childContainmentErrors: [], linkNodeCrossings: [], linkHyperclassCrossings: [], linkAttributeCrossings: [], linkLabelCollisions: [], warnings: [] };
  for (let i=0;i<layout.nodes.length;i++) for (let j=i+1;j<layout.nodes.length;j++) { const a=layout.nodes[i],b=layout.nodes[j]; if (overlapArea(a.bounds,b.bounds)>0) (a.isHyperClass&&b.isHyperClass?out.hyperclassOverlaps:out.classOverlaps).push([a.id,b.id]); }
  layout.nodes.forEach(n => n.attributeBoxes.forEach(a => { layout.nodes.forEach(m => { if (m.id!==n.id && overlapArea(a.combinedBox,m.bounds)>0) out.attributeOverlaps.push([n.id,m.id,a.name]); }); }));
  layout.nodes.forEach(n => { if (!n.parentClassId) return; const p=layout.nodeById.get(n.parentClassId); if (p?.contentBounds && !boxContains(p.contentBounds, n.bounds)) out.childContainmentErrors.push([n.id,p.id]); });
  layout.links.forEach(l=>{ layout.nodes.forEach(n=>{ if (n.id!==l.sourceClassId&&n.id!==l.targetClassId && routeIntersectsObstacle(l.route||[], n.bounds)) (n.isHyperClass?out.linkHyperclassCrossings:out.linkNodeCrossings).push([l.sourceClassId,l.targetClassId,n.id]); n.attributeBoxes.forEach(a=>{ if (routeIntersectsObstacle(l.route||[], a.combinedBox)) out.linkAttributeCrossings.push([l.sourceClassId,l.targetClassId,a.name]); }); }); });
  return out;
}
function hasHardValidationErrors(v){ return v.classOverlaps.length||v.attributeOverlaps.length||v.childContainmentErrors.length||v.linkNodeCrossings.length||v.linkHyperclassCrossings.length||v.linkAttributeCrossings.length; }
function cleanupRemainingCollisions(layout) { layout.nodes.forEach(n=>{ n.size.width += n.isHyperClass ? 0.18 : 0; n.size.height += n.isHyperClass ? 0.12 : 0; n.bounds=makeBox(n.position.x,n.position.y,n.size.width,n.size.height);}); resolveCollisions(layout,1.0); applyVelocities(layout,0.3,0.7); }

function cloneLayout(layout){ return JSON.parse(JSON.stringify({ nodes: layout.nodes.map(n=>({id:n.id,position:n.position,size:n.size,attributeBoxes:n.attributeBoxes,attributeRegion:n.attributeRegion,contentBounds:n.contentBounds,bounds:n.bounds})), links: layout.links.map(l=>({sourceClassId:l.sourceClassId,targetClassId:l.targetClassId,route:l.route,rendering:l.rendering})) })); }
function restoreLayout(layout,snapshot){ snapshot.nodes.forEach(ns=>{ const n=layout.nodeById.get(ns.id); if(!n) return; n.position.x=ns.position.x; n.position.y=ns.position.y; n.size=ns.size; n.attributeBoxes=ns.attributeBoxes||[]; n.attributeRegion=ns.attributeRegion; n.contentBounds=ns.contentBounds; n.bounds=ns.bounds; }); snapshot.links.forEach(ls=>{ const l=layout.links.find(x=>x.sourceClassId===ls.sourceClassId&&x.targetClassId===ls.targetClassId); if(l){ l.route=ls.route; l.rendering=ls.rendering; applyLinkRoute(l,l.route||[]);} }); }

function updateSceneFromLayout(context, layout) {
  layout.nodes.forEach(n => {
    const parent = n.object.parent || context.diagramGroup;
    const worldTarget = new THREE.Vector3(n.position.x, n.position.y, n.position.z ?? 0);
    const local = parent.worldToLocal(worldTarget);
    n.object.position.set(local.x, local.y, n.object.position.z);
    if (n.modelData?.position) {
      n.modelData.position.x = n.position.x; n.modelData.position.y = n.position.y;
      n.object.userData.modelData.position = cloneModelData(n.modelData.position);
    }
    if (n.isHyperClass && n.modelData?.size) {
      n.modelData.size.width = n.size.width;
      n.modelData.size.height = n.size.height;
      n.object.userData.modelData.size = cloneModelData(n.modelData.size);
      n.object.scale.set(n.size.width / n.minSize.width, n.size.height / n.minSize.height, 1);
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
