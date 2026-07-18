import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const linkLabels = [];
const activeLinks = [];
const ORTHOGONAL_CLEARANCE = 0.55;
const PARALLEL_ROUTE_GAP = 0.28;
const MIN_LABEL_SEGMENT = 0.65;
const LANE_COLLISION_EPSILON = 0.18;
const LANE_OVERLAP_MIN = 0.2;
const RELATIONSHIP_PORT_RADIUS = 0.065;
const RELATIONSHIP_PORT_STUB = 0.24;
const PORT_SIDES = ['top', 'right', 'bottom', 'left'];
const DEFAULT_LINK_FONT_SETTINGS = {
  size: 12,
  family: 'Arial, sans-serif',
  bold: false,
  italic: false,
  underline: false
};
const MAX_LINK_FONT_SIZE = 72;
const MIN_READABLE_LINK_FONT_SIZE = 14;
const DEFAULT_ARROW_TYPE = 'triangle';
const DEFAULT_ARROW_DIRECTION = 'source-to-target';
export const LINK_ARROW_TYPES = [
  'triangle',
  'outline',
  'chevron',
  'double-chevron',
  'triple-chevron',
  'filled-triangle',
  'hollow-triangle',
  'dotted',
  'bar-arrow',
  'double-bar-arrow',
  'cone',
  'diamond',
  'none'
];
export const LINK_ARROW_DIRECTIONS = [
  'source-to-target',
  'target-to-source',
  'bidirectional',
  'none'
];

export const Loader = {
  async load(modelName) {
    const res = await fetch(`./models/${modelName}.json`);
    if (!res.ok) throw new Error(`Model not found: ${modelName}`);
    return await res.json();
  }
};

export function clearLinkRegistry() {
  linkLabels.length = 0;
  activeLinks.length = 0;
}

function resolveLinkLabelFontSettings(rendering = {}, modelFont = {}) {
  const individual = rendering.font && typeof rendering.font === 'object' ? rendering.font : {};
  const model = modelFont && typeof modelFont === 'object' ? modelFont : {};
  const fallback = {
    ...DEFAULT_LINK_FONT_SETTINGS,
    ...model,
    size: clampLinkFontSize(model.linkSize ?? model.size ?? model.fontSize ?? model.labelFontSize, DEFAULT_LINK_FONT_SETTINGS.size),
    family: normalizeFontFamily(model.family ?? model.fontFamily, DEFAULT_LINK_FONT_SETTINGS.family),
    bold: toBooleanFontValue(model.bold ?? model.fontWeight, DEFAULT_LINK_FONT_SETTINGS.bold),
    italic: toBooleanFontValue(model.italic ?? model.fontStyle, DEFAULT_LINK_FONT_SETTINGS.italic),
    underline: toBooleanFontValue(model.underline ?? model.textDecoration ?? model.textDecorationLine, DEFAULT_LINK_FONT_SETTINGS.underline)
  };
  return {
    size: clampLinkFontSize(rendering.labelFontSize ?? individual.size ?? individual.fontSize, fallback.size),
    family: normalizeFontFamily(individual.family ?? individual.fontFamily, fallback.family),
    bold: toBooleanFontValue(individual.bold ?? individual.fontWeight, fallback.bold),
    italic: toBooleanFontValue(individual.italic ?? individual.fontStyle, fallback.italic),
    underline: toBooleanFontValue(individual.underline ?? individual.textDecoration ?? individual.textDecorationLine, fallback.underline)
  };
}

function applyLinkLabelFontSettings(element, fontSettings = DEFAULT_LINK_FONT_SETTINGS) {
  if (!element) return;
  const font = {
    ...DEFAULT_LINK_FONT_SETTINGS,
    ...fontSettings,
    size: clampLinkFontSize(fontSettings.size, DEFAULT_LINK_FONT_SETTINGS.size),
    family: normalizeFontFamily(fontSettings.family, DEFAULT_LINK_FONT_SETTINGS.family)
  };
  element.__hbdsFontSettings = font;
  element.style.fontSize = `${font.size}px`;
  element.style.fontFamily = font.family;
  element.style.fontWeight = font.bold ? '700' : '400';
  element.style.fontStyle = font.italic ? 'italic' : 'normal';
  element.style.textDecoration = font.underline ? 'underline' : 'none';
  const paddingY = THREE.MathUtils.clamp(font.size * 0.12, 0.2, 2);
  const paddingX = THREE.MathUtils.clamp(font.size * 0.42, 0.8, 8);
  element.style.padding = `${paddingY.toFixed(1)}px ${paddingX.toFixed(1)}px`;
  element.style.borderRadius = `${Math.max(2, font.size * 1.2).toFixed(1)}px`;
}

export function createLinkBetweenClass(linkData, classById, options = {}) {
  const sourceClass = classById.get(linkData.sourceClassId);
  const targetClass = classById.get(linkData.targetClassId);
  if (!sourceClass || !targetClass) return null;

  const rendering = linkData.rendering ?? {};
  const lineStyle = normalizeLineStyle(rendering.lineStyle);
  const isDashed = lineStyle === 'dashed' || lineStyle === 'dotted';
  const Material = isDashed ? THREE.LineDashedMaterial : THREE.LineBasicMaterial;
  const resolvedLineWidth = resolveLineWidth(rendering.lineWidth, lineStyle);
  const materialOptions = {
    color: rendering.lineColor ?? '#333333',
    linewidth: resolvedLineWidth
  };
  if (isDashed) {
    materialOptions.dashSize = lineStyle === 'dotted' ? 0.04 : 0.18;
    materialOptions.gapSize = lineStyle === 'dotted' ? 0.08 : 0.12;
  }
  const mat = new Material(materialOptions);

  const geometry = new THREE.BufferGeometry();
  const line = new THREE.Line(geometry, mat);
  line.name = 'link-route';
  line.renderOrder = rendering.zIndex ?? 5;

  const arrow = createLinkArrowMarkerGroup(rendering);

  const sourcePort = createRelationshipPortMarker('source', rendering);
  const targetPort = createRelationshipPortMarker('target', rendering);
  const labelFont = resolveLinkLabelFontSettings(rendering, linkData.modelFont);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'label link-label';
  labelDiv.textContent = rendering.labelText ?? '';
  applyLinkLabelFontSettings(labelDiv, labelFont);
  labelDiv.style.color = rendering.labelColor ?? rendering.textColor ?? '#111111';
  labelDiv.style.background = rendering.labelBackgroundColor ?? 'rgba(255,255,255,0.9)';
  labelDiv.style.borderRadius = '999px';
  labelDiv.style.border = '1px solid rgba(55,65,81,0.45)';
  labelDiv.style.whiteSpace = 'nowrap';
  labelDiv.style.textAlign = 'center';
  const labelObj = new CSS2DObject(labelDiv);
  labelObj.userData = {
    labelKind: 'link',
    text: rendering.labelText ?? '',
    fontSettings: labelFont
  };
  linkLabels.push(labelObj);

  const linkGroup = new THREE.Group();
  linkGroup.add(line, arrow, sourcePort, targetPort, labelObj);

  const handle = { linkData, sourceClass, targetClass, line, arrow, sourcePort, targetPort, labelObj, linkGroup };
  activeLinks.push(handle);
  if (options.recalculate !== false && options.deferRecalculate !== true) {
    recalculateAllLinks();
  }
  return handle;
}

export function recalculateAllLinks() {
  const pairBuckets = new Map();
  const occupiedLanes = [];
  const occupiedLabels = [];
  const occupiedLabelParents = new WeakSet();
  const obstacleBoxesByParent = new WeakMap();
  for (const link of activeLinks) {
    const key = [String(link.linkData.sourceClassId), String(link.linkData.targetClassId)].sort().join(':');
    if (!pairBuckets.has(key)) pairBuckets.set(key, []);
    pairBuckets.get(key).push(link);
  }

  for (const bucket of pairBuckets.values()) {
    const count = bucket.length;
    const laneDescriptors = getBucketLaneDescriptors(bucket);
    bucket.forEach((link, index) => {
      const parent = link.linkGroup.parent;
      if (parent && !occupiedLabelParents.has(parent)) {
        occupiedLabels.push(...getStaticAttributeLabelBounds(parent));
        occupiedLabelParents.add(parent);
      }
      const obstacleBoxes = getCachedObstacleBoxes(obstacleBoxesByParent, parent, link.sourceClass, link.targetClass);
      const lane = laneDescriptors.get(link);
      const portPair = chooseRelationshipPortPair(link, parent, lane, obstacleBoxes);
      const route = buildOrthogonalRoute({
        link,
        p0: portPair.source.point,
        p1: portPair.target.point,
        parent,
        index,
        count,
        lane,
        occupiedLanes,
        obstacleBoxes,
        sourcePort: portPair.source,
        targetPort: portPair.target
      });
      separateLinkLabel(route, occupiedLabels, link.linkData.rendering ?? {});

      replaceLineGeometry(link.line, route.points);
      link.line.userData.baseRoutePoints = route.basePoints.map(point => point.clone());
      link.line.userData.relationshipPorts = {
        sourceSide: portPair.source.side,
        targetSide: portPair.target.side
      };
      link.line.computeLineDistances?.();
      updateLinkArrowMarkerGroup(link.arrow, route, link.linkData.rendering ?? {});
      updateRelationshipPort(link.sourcePort, portPair.source, route);
      updateRelationshipPort(link.targetPort, portPair.target, route);
      link.labelObj.position.copy(route.labelPosition);

      if (link.linkData.rendering?.labelRotationBehavior === 'follow') {
        const angle = Math.atan2(route.labelTangent.y, route.labelTangent.x);
        link.labelObj.element.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
      } else {
        link.labelObj.element.style.transform = 'translate(-50%, -50%)';
      }
    });
  }
}

function replaceLineGeometry(line, points) {
  const nextGeometry = new THREE.BufferGeometry().setFromPoints(points);
  if (line.geometry) {
    line.geometry.dispose();
  }
  line.geometry = nextGeometry;
}

function normalizeLineStyle(style) {
  const clean = String(style || 'solid').trim().toLowerCase();
  return ['solid', 'dashed', 'dotted', 'thick', 'thin'].includes(clean) ? clean : 'solid';
}

function resolveLineWidth(value, lineStyle = 'solid') {
  const base = toPositiveNumber(value, 2);
  if (lineStyle === 'thick') return base * 1.8;
  if (lineStyle === 'thin') return Math.max(0.1, base * 0.55);
  return base;
}

function normalizeArrowDirection(direction) {
  const clean = String(direction || DEFAULT_ARROW_DIRECTION).trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (['source-to-target', 'forward', 'target', 'to-target'].includes(clean)) return 'source-to-target';
  if (['target-to-source', 'reverse', 'source', 'to-source'].includes(clean)) return 'target-to-source';
  if (['bidirectional', 'bi-directional', 'both', 'two-way', 'two-way-arrow'].includes(clean)) return 'bidirectional';
  if (['none', 'no-arrow', 'plain'].includes(clean)) return 'none';
  return DEFAULT_ARROW_DIRECTION;
}

function normalizeArrowheadType(type) {
  return normalizeArrowType(type);
}

function normalizeArrowType(type) {
  const clean = String(type || DEFAULT_ARROW_TYPE).trim().toLowerCase().replace(/[_\s]+/g, '-');
  const aliases = {
    arrow: 'triangle',
    filled: 'triangle',
    'filled-arrow': 'triangle',
    triangle: 'triangle',
    'filled-triangle': 'filled-triangle',
    outline: 'outline',
    'outline-arrow': 'outline',
    hollow: 'outline',
    'hollow-arrow': 'outline',
    'hollow-triangle': 'hollow-triangle',
    'triangle-outline': 'outline',
    chevron: 'chevron',
    'single-chevron': 'chevron',
    chevrons: 'double-chevron',
    'double-chevron': 'double-chevron',
    chevron2: 'double-chevron',
    'chevron-2': 'double-chevron',
    'triple-chevron': 'triple-chevron',
    chevron3: 'triple-chevron',
    'chevron-3': 'triple-chevron',
    dotted: 'dotted',
    'dotted-arrow': 'dotted',
    'dotted-arrowhead': 'dotted',
    dot: 'dotted',
    'bar-arrow': 'bar-arrow',
    'bar+arrow': 'bar-arrow',
    bar: 'bar-arrow',
    'double-bar-arrow': 'double-bar-arrow',
    'double-bar+arrow': 'double-bar-arrow',
    'double-bar': 'double-bar-arrow',
    cone: 'cone',
    diamond: 'diamond',
    none: 'none',
    plain: 'none',
    association: 'none',
    'no-arrow': 'none'
  };
  const normalized = aliases[clean] || clean;
  return LINK_ARROW_TYPES.includes(normalized) ? normalized : DEFAULT_ARROW_TYPE;
}

function resolveLinkArrowStyle(rendering = {}) {
  const lineStyle = normalizeLineStyle(rendering.lineStyle);
  const lineWidth = resolveLineWidth(rendering.lineWidth, lineStyle);
  const lineWidthScale = THREE.MathUtils.clamp(lineWidth / 2, 0.65, 1.8);
  const rawArrowheadSize = toPositiveNumber(rendering.arrowheadSize, 0.1);
  const arrowheadScale = toPositiveNumber(rendering.arrowheadScale, 0.6);
  const maxArrowheadSize = toPositiveNumber(rendering.maxArrowheadSize, 0.12);
  return {
    type: normalizeArrowType(rendering.arrowType ?? rendering.arrowheadType),
    direction: normalizeArrowDirection(rendering.arrowDirection),
    size: Math.min(rawArrowheadSize * arrowheadScale * lineWidthScale, maxArrowheadSize),
    color: rendering.arrowColor ?? rendering.lineColor ?? '#333333',
    lineWidth,
    renderOrder: (rendering.zIndex ?? 5) + 1,
    visible: rendering.arrowheadVisibility !== false
  };
}

function createLinkArrowMarkerGroup(rendering = {}) {
  const style = resolveLinkArrowStyle(rendering);
  const group = new THREE.Group();
  group.name = 'link-arrowheads';
  group.visible = style.visible && style.type !== 'none' && style.direction !== 'none';
  group.renderOrder = style.renderOrder;
  group.userData.relationshipArrow = true;
  group.userData.arrowType = style.type;
  group.userData.arrowDirection = style.direction;
  if (!group.visible) return group;

  if (style.direction === 'source-to-target' || style.direction === 'bidirectional') {
    const targetMarker = createArrowMarker(style.type, style);
    targetMarker.name = 'link-arrowhead-target';
    targetMarker.userData.arrowEndpoint = 'target';
    group.add(targetMarker);
  }
  if (style.direction === 'target-to-source' || style.direction === 'bidirectional') {
    const sourceMarker = createArrowMarker(style.type, style);
    sourceMarker.name = 'link-arrowhead-source';
    sourceMarker.userData.arrowEndpoint = 'source';
    group.add(sourceMarker);
  }
  return group;
}

function updateLinkArrowMarkerGroup(group, route, rendering = {}) {
  if (!group) return;
  const style = resolveLinkArrowStyle(rendering);
  group.visible = style.visible && style.type !== 'none' && style.direction !== 'none';
  if (!group.visible) return;
  for (const marker of group.children) {
    const endpoint = marker.userData?.arrowEndpoint === 'source' ? 'source' : 'target';
    const position = endpoint === 'source' ? route.sourceArrowPosition : route.targetArrowPosition;
    const tangent = endpoint === 'source'
      ? route.sourceTangent.clone().multiplyScalar(-1)
      : route.targetTangent;
    marker.position.copy(position);
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  }
}

function createArrowMarker(type, style) {
  const marker = new THREE.Group();
  marker.renderOrder = style.renderOrder;
  marker.userData.relationshipArrow = true;
  const normalized = normalizeArrowType(type);
  if (normalized === 'chevron') addChevronMarkers(marker, 1, style);
  else if (normalized === 'double-chevron') addChevronMarkers(marker, 2, style);
  else if (normalized === 'triple-chevron') addChevronMarkers(marker, 3, style);
  else if (normalized === 'outline' || normalized === 'hollow-triangle') addOutlineArrowMarker(marker, style);
  else if (normalized === 'dotted') addDottedArrowMarker(marker, style);
  else if (normalized === 'bar-arrow') addBarArrowMarker(marker, style, 1);
  else if (normalized === 'double-bar-arrow') addBarArrowMarker(marker, style, 2);
  else marker.add(createArrowheadMesh(normalized, style));
  return marker;
}

function arrowMaterial(style, options = {}) {
  return new THREE.MeshBasicMaterial({
    color: style.color,
    side: THREE.DoubleSide,
    depthTest: false,
    transparent: true,
    opacity: options.opacity ?? 1
  });
}

function arrowLineMaterial(style) {
  return new THREE.LineBasicMaterial({
    color: style.color,
    linewidth: Math.max(1, style.lineWidth),
    depthTest: false,
    transparent: true,
    opacity: 1
  });
}

function createArrowheadMesh(type, style) {
  const geometry = createArrowheadGeometry(type, style.size);
  const mesh = new THREE.Mesh(geometry, arrowMaterial(style));
  mesh.renderOrder = style.renderOrder;
  return mesh;
}

function createArrowheadGeometry(type, size) {
  if (type === 'cone') {
    const geometry = new THREE.ConeGeometry(size * 0.45, size, 12);
    geometry.translate(0, -size / 2, 0);
    return geometry;
  }

  const shape = new THREE.Shape();
  if (type === 'diamond') {
    shape.moveTo(0, 0);
    shape.lineTo(size * 0.45, -size * 0.5);
    shape.lineTo(0, -size);
    shape.lineTo(-size * 0.45, -size * 0.5);
    shape.lineTo(0, 0);
  } else {
    shape.moveTo(0, 0);
    shape.lineTo(-size * 0.48, -size);
    shape.lineTo(size * 0.48, -size);
    shape.lineTo(0, 0);
  }

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.translate(0, 0, 0.002);
  return geometry;
}

function addOutlineArrowMarker(marker, style) {
  const size = style.size;
  const outer = new THREE.Shape();
  outer.moveTo(0, 0);
  outer.lineTo(-size * 0.55, -size);
  outer.lineTo(size * 0.55, -size);
  outer.lineTo(0, 0);
  const inner = new THREE.Path();
  inner.moveTo(0, -size * 0.24);
  inner.lineTo(size * 0.28, -size * 0.82);
  inner.lineTo(-size * 0.28, -size * 0.82);
  inner.lineTo(0, -size * 0.24);
  outer.holes.push(inner);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(outer), arrowMaterial(style));
  mesh.renderOrder = style.renderOrder;
  marker.add(mesh);
}

function addChevronMarkers(marker, count, style) {
  const points = [];
  const size = style.size;
  const gap = size * 0.42;
  const startOffset = -((count - 1) * gap) / 2;
  for (let index = 0; index < count; index += 1) {
    const yOffset = startOffset - index * gap;
    const tip = new THREE.Vector3(0, yOffset, 0.002);
    const left = new THREE.Vector3(-size * 0.45, yOffset - size * 0.72, 0.002);
    const right = new THREE.Vector3(size * 0.45, yOffset - size * 0.72, 0.002);
    points.push(left, tip, tip, right);
  }
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), arrowLineMaterial(style));
  line.renderOrder = style.renderOrder;
  marker.add(line);
}

function addDottedArrowMarker(marker, style) {
  const size = style.size;
  const dotRadius = THREE.MathUtils.clamp(size * 0.105, 0.006, 0.026);
  const geometry = new THREE.CircleGeometry(dotRadius, 14);
  const material = arrowMaterial(style);
  const rows = [
    { y: -size * 0.08, xs: [0] },
    { y: -size * 0.3, xs: [-0.18, 0, 0.18] },
    { y: -size * 0.52, xs: [-0.34, -0.12, 0.12, 0.34] },
    { y: -size * 0.74, xs: [-0.5, -0.28, -0.06, 0.16, 0.38] }
  ];
  rows.forEach(row => {
    row.xs.forEach(x => {
      const dot = new THREE.Mesh(geometry, material);
      dot.position.set(x * size, row.y, 0.003);
      dot.renderOrder = style.renderOrder;
      marker.add(dot);
    });
  });
}

function addBarArrowMarker(marker, style, barCount) {
  marker.add(createArrowheadMesh('triangle', style));
  const size = style.size;
  for (let index = 0; index < barCount; index += 1) {
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 0.92, Math.max(size * 0.11, 0.008)),
      arrowMaterial(style)
    );
    bar.position.set(0, -size * (0.82 + index * 0.22), 0.003);
    bar.renderOrder = style.renderOrder;
    marker.add(bar);
  }
}

function createRelationshipPortMarker(kind, rendering = {}) {
  const radius = rendering.relationshipPortRadius ?? RELATIONSHIP_PORT_RADIUS;
  const ring = new THREE.Group();
  ring.name = `relationship-port-${kind}`;
  ring.userData.relationshipPort = true;
  ring.userData.portRadius = radius;
  ring.renderOrder = (rendering.zIndex ?? 5) + 3;

  const fillRing = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.58, radius, 36),
    new THREE.MeshBasicMaterial({
      color: rendering.relationshipPortFill ?? '#ffffff',
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: rendering.relationshipPortOpacity ?? 0.98
    })
  );
  fillRing.renderOrder = ring.renderOrder;
  ring.add(fillRing);

  const points = [];
  for (let i = 0; i < 36; i += 1) {
    const angle = (i / 36) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.002));
  }
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: rendering.relationshipPortStroke ?? '#475569',
      transparent: true,
      opacity: 0.78
    })
  );
  outline.renderOrder = ring.renderOrder + 1;
  ring.add(outline);

  return ring;
}

function updateRelationshipPort(marker, port, route) {
  if (!marker || !port) return;
  marker.position.copy(port.point);
  marker.visible = true;
  marker.userData.side = port.side;
  marker.userData.nodeId = port.node?.userData?.hbdsId ?? port.node?.userData?.classId ?? null;
  marker.userData.routeEndpoint = route?.arrowPosition?.clone?.() ?? null;
}

function chooseRelationshipPortPair(link, parent, lane, obstacleBoxes = []) {
  const rendering = link.linkData.rendering ?? {};
  const sourceCandidates = getRelationshipPortCandidates(link.sourceClass, parent, rendering.sourcePortSide ?? rendering.sourcePort);
  const targetCandidates = getRelationshipPortCandidates(link.targetClass, parent, rendering.targetPortSide ?? rendering.targetPort);
  let best = null;

  for (const source of sourceCandidates) {
    for (const target of targetCandidates) {
      if (link.sourceClass === link.targetClass && source.side === target.side) continue;
      const candidatePoints = buildBaseRoutePoints({
        link,
        p0: source.point,
        p1: target.point,
        parent,
        rendering,
        lane,
        sourcePort: source,
        targetPort: target
      });
      const adjusted = avoidObstacleIntersections(compactPoints(candidatePoints), obstacleBoxes, rendering);
      const score = scorePortPair(source, target, adjusted, obstacleBoxes);
      if (!best || score < best.score) best = { source, target, score };
    }
  }

  return best || {
    source: sourceCandidates[0],
    target: targetCandidates[0]
  };
}

function getRelationshipPortCandidates(node, parent, requestedSide) {
  const requested = normalizePortSide(requestedSide);
  const sides = requested ? [requested] : PORT_SIDES;
  return sides.map(side => {
    const localPoint = getPortLocalPosition(node, side);
    const worldPoint = node.localToWorld(localPoint.clone());
    const point = parent ? parent.worldToLocal(worldPoint.clone()) : worldPoint.clone();
    return {
      node,
      side,
      point,
      normal: getPortNormal(side),
      radius: RELATIONSHIP_PORT_RADIUS,
      explicit: Boolean(requested)
    };
  });
}

function normalizePortSide(side) {
  const clean = String(side || '').toLowerCase();
  return PORT_SIDES.includes(clean) ? clean : null;
}

function getPortLocalPosition(node, side) {
  const { width, height } = getRelationshipNodeSize(node);
  const z = node?.userData?.isHyperClass ? 0.095 : 0.075;
  if (side === 'top') return new THREE.Vector3(0, height / 2, z);
  if (side === 'bottom') return new THREE.Vector3(0, -height / 2, z);
  if (side === 'left') return new THREE.Vector3(-width / 2, 0, z);
  return new THREE.Vector3(width / 2, 0, z);
}

function getRelationshipNodeSize(node) {
  const model = node?.userData?.modelData || node?.userData?.sourceData || {};
  const size = model.size || {};
  const isHyperclass = node?.userData?.isHyperClass;
  return {
    width: Number(size.width) || (isHyperclass ? 4 : 1.2),
    height: Number(size.height) || (isHyperclass ? 3.2 : 1.6)
  };
}

function getPortNormal(side) {
  if (side === 'top') return new THREE.Vector3(0, 1, 0);
  if (side === 'bottom') return new THREE.Vector3(0, -1, 0);
  if (side === 'left') return new THREE.Vector3(-1, 0, 0);
  return new THREE.Vector3(1, 0, 0);
}

function scorePortPair(source, target, points, obstacleBoxes = []) {
  const direct = target.point.clone().sub(source.point);
  const directLength = Math.max(direct.length(), 1e-6);
  const direction = direct.clone().divideScalar(directLength);
  const sourceFacesTarget = source.normal.dot(direction);
  const targetFacesSource = target.normal.dot(direction.clone().multiplyScalar(-1));
  const facingPenalty = Math.max(0, 0.35 - sourceFacesTarget) * 4 + Math.max(0, 0.35 - targetFacesSource) * 4;
  const attributeSidePenalty = getAttributeSidePenalty(source) + getAttributeSidePenalty(target);
  const obstaclePenalty = countRouteObstacleIntersections(points, obstacleBoxes) * 1000;
  const bendPenalty = Math.max(0, points.length - 2) * 0.08;
  return obstaclePenalty + getRouteLength(points) + bendPenalty + facingPenalty + attributeSidePenalty;
}

function getAttributeSidePenalty(port) {
  const attributes = port?.node?.userData?.modelData?.attributes || port?.node?.userData?.sourceData?.attributes || [];
  if (port?.explicit || port?.side !== 'right' || !attributes.length) return 0;
  return Math.min(2.4, 0.65 + attributes.length * 0.18);
}

function countRouteObstacleIntersections(points, obstacleBoxes = []) {
  let count = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const horizontal = almostEqual(start.y, end.y);
    const vertical = almostEqual(start.x, end.x);
    if (!horizontal && !vertical) continue;
    for (const box of obstacleBoxes) {
      if (segmentIntersectsBox(start, end, box, horizontal)) count += 1;
    }
  }
  return count;
}

function getRouteLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += points[index].distanceTo(points[index - 1]);
  }
  return length;
}

function buildOrthogonalRoute({ link, p0, p1, parent, index, count, lane, occupiedLanes, obstacleBoxes, sourcePort, targetPort }) {
  const rendering = link.linkData.rendering ?? {};
  let points = buildBaseRoutePoints({ link, p0, p1, parent, rendering, lane, sourcePort, targetPort });
  points = separateSharedRouteLane(points, rendering, occupiedLanes);
  points = avoidObstacleIntersections(points, obstacleBoxes, rendering);
  const basePoints = compactPoints(points);
  const roundedPoints = roundOrthogonalCorners(basePoints, rendering.relationshipCornerRadius ?? rendering.curveRadius ?? rendering.cornerRadius ?? 0.16);
  const label = getLabelPlacement(basePoints, rendering, lane);
  return {
    points: roundedPoints,
    basePoints,
    sourceArrowPosition: roundedPoints[0].clone(),
    sourceTangent: getInitialTangent(roundedPoints),
    targetArrowPosition: roundedPoints[roundedPoints.length - 1].clone(),
    targetTangent: getTerminalTangent(roundedPoints),
    arrowPosition: roundedPoints[roundedPoints.length - 1].clone(),
    tangent: getTerminalTangent(roundedPoints),
    labelPosition: label.position,
    labelTangent: label.tangent
  };
}

function buildBaseRoutePoints({ link, p0, p1, parent, rendering, lane, sourcePort, targetPort }) {
  const routePoints = Array.isArray(rendering.routePoints) ? rendering.routePoints.filter(Boolean) : null;
  const sourceStub = getPortStubPoint(p0, sourcePort, rendering);
  const targetStub = getPortStubPoint(p1, targetPort, rendering);
  let points;

  if (routePoints?.length) {
    points = orthogonalizePoints([
      p0.clone(),
      sourceStub,
      ...routePoints.map(point => new THREE.Vector3(point.x, point.y, point.z ?? 0)),
      targetStub,
      p1.clone()
    ], rendering);
  } else if (link.linkData.sourceClassId === link.linkData.targetClassId) {
    points = buildSelfOrthogonalRoute(p0, p1, link.sourceClass, parent, rendering, lane, sourcePort, targetPort);
  } else {
    const middle = buildDefaultOrthogonalRoute(sourceStub, targetStub, link.sourceClass, link.targetClass, parent, rendering, lane);
    points = [p0.clone(), ...middle, p1.clone()];
  }

  return compactPoints(points);
}

function getPortStubPoint(point, port, rendering = {}) {
  const stub = rendering.relationshipPortStub ?? RELATIONSHIP_PORT_STUB;
  const normal = port?.normal ?? new THREE.Vector3(1, 0, 0);
  return point.clone().add(normal.clone().multiplyScalar(stub));
}

function getObstacleBoxes(parent, sourceNode, targetNode) {
  if (!parent?.traverse) return [];
  const boxes = [];
  parent.traverse(object => {
    if (!object.userData?.isClassLike) return;
    if (isRelatedObject(object, sourceNode) || isRelatedObject(object, targetNode)) return;
    boxes.push(expandBox(getNodeLocalBox(object, parent, object.position || new THREE.Vector3()), 0.12));
  });
  return boxes.filter(box => !box.isEmpty());
}

function isRelatedObject(candidate, node) {
  if (!candidate || !node) return false;
  return candidate === node || isAncestorObject(candidate, node) || isAncestorObject(node, candidate);
}

function isAncestorObject(ancestor, object) {
  let current = object;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function expandBox(box, amount) {
  const next = box.clone();
  next.min.x -= amount;
  next.min.y -= amount;
  next.max.x += amount;
  next.max.y += amount;
  return next;
}

function buildDefaultOrthogonalRoute(p0, p1, sourceNode, targetNode, parent, rendering, lane) {
  const sourceBox = getNodeLocalBox(sourceNode, parent, p0);
  const targetBox = getNodeLocalBox(targetNode, parent, p1);
  const union = sourceBox.clone().union(targetBox);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const clearance = rendering.orthogonalClearance ?? ORTHOGONAL_CLEARANCE;
  const style = rendering.orthogonalStyle ?? 'auto';
  const orientation = style === 'horizontal' || (style === 'auto' && Math.abs(dx) >= Math.abs(dy))
    ? 'horizontal'
    : 'vertical';

  if (orientation === 'horizontal') {
    const baseSide = (p0.y + p1.y) / 2 >= (union.min.y + union.max.y) / 2 ? 'top' : 'bottom';
    const side = getRouteSideForOrientation('horizontal', baseSide, rendering, lane);
    const distance = getLaneDistance(clearance, rendering, lane);
    const laneY = side === 'top'
      ? union.max.y + distance
      : union.min.y - distance;
    return [
      p0.clone(),
      new THREE.Vector3(p0.x, laneY, p0.z),
      new THREE.Vector3(p1.x, laneY, p1.z),
      p1.clone()
    ];
  }

  const baseSide = (p0.x + p1.x) / 2 >= (union.min.x + union.max.x) / 2 ? 'right' : 'left';
  const side = getRouteSideForOrientation('vertical', baseSide, rendering, lane);
  const distance = getLaneDistance(clearance, rendering, lane);
  const laneX = side === 'right'
    ? union.max.x + distance
    : union.min.x - distance;
  return [
    p0.clone(),
    new THREE.Vector3(laneX, p0.y, p0.z),
    new THREE.Vector3(laneX, p1.y, p1.z),
    p1.clone()
  ];
}

function buildSelfOrthogonalRoute(p0, p1, sourceNode, parent, rendering, lane, sourcePort, targetPort) {
  const box = getNodeLocalBox(sourceNode, parent, p0);
  const clearance = rendering.orthogonalClearance ?? ORTHOGONAL_CLEARANCE;
  const distance = getLaneDistance(clearance, rendering, lane);
  const side = sourcePort?.side === 'left' || targetPort?.side === 'left' ? -1 : 1;
  const laneX = side > 0 ? box.max.x + distance : box.min.x - distance;
  const laneY = box.max.y + distance;
  const sourceStub = getPortStubPoint(p0, sourcePort, rendering);
  const targetStub = getPortStubPoint(p1, targetPort, rendering);
  return [
    p0.clone(),
    sourceStub,
    new THREE.Vector3(laneX, sourceStub.y, p0.z),
    new THREE.Vector3(laneX, laneY, p0.z),
    new THREE.Vector3(targetStub.x, laneY, p0.z),
    targetStub,
    p1.clone()
  ];
}

function orthogonalizePoints(points, rendering) {
  const result = [];
  const horizontalFirst = rendering.orthogonalStyle === 'horizontal';
  points.forEach((point, index) => {
    if (index === 0) {
      result.push(point.clone());
      return;
    }
    const previous = result[result.length - 1];
    if (almostEqual(previous.x, point.x) || almostEqual(previous.y, point.y)) {
      result.push(point.clone());
      return;
    }
    result.push(horizontalFirst
      ? new THREE.Vector3(point.x, previous.y, point.z)
      : new THREE.Vector3(previous.x, point.y, point.z));
    result.push(point.clone());
  });
  return result;
}

function getBucketLaneDescriptors(bucket) {
  const counters = new Map();
  const descriptors = new Map();
  bucket.forEach((link, index) => {
    const hint = getLaneHint(link, index);
    const key = `${hint.key}:${hint.sideSign}`;
    const rank = counters.get(key) ?? 0;
    counters.set(key, rank + 1);
    descriptors.set(link, { ...hint, rank, index });
  });
  return descriptors;
}

function getLaneHint(link, index) {
  const rendering = link.linkData.rendering ?? {};
  const routeSide = rendering.routeSide;
  if (routeSide === 'top' || routeSide === 'right') {
    return { key: `explicit:${routeSide}`, sideSign: 1, explicitSide: routeSide };
  }
  if (routeSide === 'bottom' || routeSide === 'left') {
    return { key: `explicit:${routeSide}`, sideSign: -1, explicitSide: routeSide };
  }

  const curveOffset = Number(rendering.curveOffset);
  if (Number.isFinite(curveOffset) && Math.abs(curveOffset) > 1e-6) {
    return { key: 'curve', sideSign: Math.sign(curveOffset) || 1 };
  }

  const labelOffset = Number(rendering.labelOffsetFromPath);
  if (Number.isFinite(labelOffset) && Math.abs(labelOffset) > 1e-6) {
    return { key: 'label', sideSign: Math.sign(labelOffset) || 1 };
  }

  return { key: 'auto', sideSign: index % 2 === 0 ? 1 : -1 };
}

function getRouteSideForOrientation(orientation, baseSide, rendering, lane) {
  const routeSide = rendering.routeSide;
  if (orientation === 'horizontal' && (routeSide === 'top' || routeSide === 'bottom')) return routeSide;
  if (orientation === 'vertical' && (routeSide === 'left' || routeSide === 'right')) return routeSide;
  return lane?.sideSign < 0 ? getOppositeSide(baseSide) : baseSide;
}

function getLaneDistance(clearance, rendering, lane) {
  const gap = rendering.parallelRouteGap ?? PARALLEL_ROUTE_GAP;
  const curveOffset = Number(rendering.curveOffset);
  const curvePadding = Number.isFinite(curveOffset) ? Math.min(0.16, Math.abs(curveOffset) * 0.08) : 0;
  return clearance + curvePadding + (lane?.rank ?? 0) * gap;
}

function getOppositeSide(side) {
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'right') return 'left';
  return 'right';
}

function getNodeLocalBox(node, parent, fallbackPoint) {
  const worldBox = new THREE.Box3();
  const localBox = new THREE.Box3();
  node.updateWorldMatrix?.(true, true);
  collectNodeBounds(node, true);
  if (localBox.isEmpty()) {
    localBox.setFromCenterAndSize(fallbackPoint.clone(), new THREE.Vector3(0.5, 0.5, 0.01));
  }
  return localBox;

  function collectNodeBounds(object, isRoot) {
    if (!isRoot && object.userData?.isClassLike) return;
    if (!object.geometry || (!object.isMesh && !object.isLine && !object.isLineSegments)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox?.();
    if (object.geometry.boundingBox) {
      worldBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
      expandLocalBoxFromWorldBox(localBox, worldBox, parent);
    }
    object.children?.forEach(child => collectNodeBounds(child, false));
  }
}

function expandLocalBoxFromWorldBox(target, worldBox, parent) {
  for (const x of [worldBox.min.x, worldBox.max.x]) {
    for (const y of [worldBox.min.y, worldBox.max.y]) {
      for (const z of [worldBox.min.z, worldBox.max.z]) {
        const point = new THREE.Vector3(x, y, z);
        if (parent) parent.worldToLocal(point);
        target.expandByPoint(point);
      }
    }
  }
}

function compactPoints(points) {
  const compact = [];
  for (const point of points) {
    const last = compact[compact.length - 1];
    if (!last || !pointsAlmostEqual(last, point)) compact.push(point.clone());
  }
  for (let index = compact.length - 2; index > 0; index--) {
    const previous = compact[index - 1];
    const current = compact[index];
    const next = compact[index + 1];
    if ((almostEqual(previous.x, current.x) && almostEqual(current.x, next.x)) ||
      (almostEqual(previous.y, current.y) && almostEqual(current.y, next.y))) {
      compact.splice(index, 1);
    }
  }
  return compact.length >= 2 ? compact : points;
}

function roundOrthogonalCorners(points, radius = 0.16) {
  if (!radius || points.length < 3) return points.map(point => point.clone());
  const rounded = [points[0].clone()];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const inVector = previous.clone().sub(current);
    const outVector = next.clone().sub(current);
    const inLength = inVector.length();
    const outLength = outVector.length();

    if (inLength <= 1e-6 || outLength <= 1e-6 || Math.abs(inVector.normalize().dot(outVector.normalize())) > 0.999) {
      rounded.push(current.clone());
      continue;
    }

    const actualRadius = Math.min(radius, inLength * 0.42, outLength * 0.42);
    const pre = current.clone().add(previous.clone().sub(current).normalize().multiplyScalar(actualRadius));
    const post = current.clone().add(next.clone().sub(current).normalize().multiplyScalar(actualRadius));
    rounded.push(pre);

    const steps = 5;
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      const a = pre.clone().multiplyScalar((1 - t) * (1 - t));
      const b = current.clone().multiplyScalar(2 * (1 - t) * t);
      const c = post.clone().multiplyScalar(t * t);
      rounded.push(a.add(b).add(c));
    }

    rounded.push(post);
  }

  rounded.push(points[points.length - 1].clone());
  return compactPoints(rounded);
}

function separateSharedRouteLane(points, rendering, occupiedLanes = []) {
  const next = points.map(point => point.clone());
  const gap = rendering.globalRouteGap ?? rendering.parallelRouteGap ?? PARALLEL_ROUTE_GAP;
  let attempts = 0;

  while (attempts < 12) {
    const collision = findSharedRouteLaneCollision(next, occupiedLanes);
    if (!collision) break;
    const direction = getLaneNudgeDirection(collision.lane, next);
    nudgeLaneSegment(next, collision.lane, direction * gap);
    attempts += 1;
  }

  occupiedLanes.push(...getRouteLanes(next));
  return next;
}

function findSharedRouteLaneCollision(points, occupiedLanes = []) {
  if (!occupiedLanes.length) return null;
  const lanes = getRouteLanes(points);
  for (const lane of lanes) {
    for (const occupied of occupiedLanes) {
      if (routeLanesCollide(lane, occupied)) return { lane, occupied };
    }
  }
  return null;
}

function avoidObstacleIntersections(points, obstacleBoxes = [], rendering = {}) {
  if (!obstacleBoxes?.length) return points;
  const next = points.map(point => point.clone());
  const gap = rendering.obstacleRouteGap ?? rendering.parallelRouteGap ?? PARALLEL_ROUTE_GAP;
  let attempts = 0;

  while (attempts < 10) {
    const collision = findRouteObstacleCollision(next, obstacleBoxes);
    if (!collision) break;
    nudgeLaneSegment(next, collision.lane, collision.direction * gap);
    attempts += 1;
  }

  return next;
}

function findRouteObstacleCollision(points, obstacleBoxes) {
  for (let index = 2; index < points.length - 1; index++) {
    const start = points[index - 1];
    const end = points[index];
    const horizontal = almostEqual(start.y, end.y);
    const vertical = almostEqual(start.x, end.x);
    if (!horizontal && !vertical) continue;

    for (const box of obstacleBoxes) {
      if (!segmentIntersectsBox(start, end, box, horizontal)) continue;
      const lane = horizontal
        ? {
            index,
            orientation: 'horizontal',
            coord: start.y,
            min: Math.min(start.x, end.x),
            max: Math.max(start.x, end.x),
            length: start.distanceTo(end)
          }
        : {
            index,
            orientation: 'vertical',
            coord: start.x,
            min: Math.min(start.y, end.y),
            max: Math.max(start.y, end.y),
            length: start.distanceTo(end)
          };
      const direction = getObstacleNudgeDirection(lane, box);
      return { lane, direction };
    }
  }
  return null;
}

function segmentIntersectsBox(start, end, box, horizontal) {
  if (horizontal) {
    const y = start.y;
    if (y <= box.min.y || y >= box.max.y) return false;
    return Math.min(start.x, end.x) < box.max.x && Math.max(start.x, end.x) > box.min.x;
  }

  const x = start.x;
  if (x <= box.min.x || x >= box.max.x) return false;
  return Math.min(start.y, end.y) < box.max.y && Math.max(start.y, end.y) > box.min.y;
}

function getObstacleNudgeDirection(lane, box) {
  if (lane.orientation === 'horizontal') {
    const centerY = (box.min.y + box.max.y) / 2;
    return lane.coord >= centerY ? 1 : -1;
  }
  const centerX = (box.min.x + box.max.x) / 2;
  return lane.coord >= centerX ? 1 : -1;
}

function getPrimaryRouteLane(points) {
  const lanes = getRouteLanes(points);
  return lanes.reduce((best, lane) => !best || lane.length > best.length ? lane : best, null);
}

function getRouteLanes(points) {
  const lanes = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const horizontal = almostEqual(start.y, end.y);
    const vertical = almostEqual(start.x, end.x);
    if (!horizontal && !vertical) continue;
    const length = start.distanceTo(end);
    if (length < MIN_LABEL_SEGMENT) continue;
    const lane = horizontal
      ? {
          index,
          orientation: 'horizontal',
          coord: start.y,
          min: Math.min(start.x, end.x),
          max: Math.max(start.x, end.x),
          length
        }
      : {
          index,
          orientation: 'vertical',
          coord: start.x,
          min: Math.min(start.y, end.y),
          max: Math.max(start.y, end.y),
          length
        };
    lanes.push(lane);
  }
  return lanes.sort((a, b) => b.length - a.length);
}

function getLaneNudgeDirection(lane, points) {
  const first = points[0];
  const last = points[points.length - 1];
  if (lane.orientation === 'horizontal') {
    const midpoint = (first.y + last.y) / 2;
    return lane.coord >= midpoint ? 1 : -1;
  }
  const midpoint = (first.x + last.x) / 2;
  return lane.coord >= midpoint ? 1 : -1;
}

function routeLanesCollide(a, b) {
  if (a.orientation !== b.orientation) return false;
  if (Math.abs(a.coord - b.coord) > LANE_COLLISION_EPSILON) return false;
  return Math.min(a.max, b.max) - Math.max(a.min, b.min) > LANE_OVERLAP_MIN;
}

function nudgeLaneSegment(points, lane, amount) {
  const start = points[lane.index - 1];
  const end = points[lane.index];
  if (!start || !end) return;
  if (lane.orientation === 'horizontal') {
    start.y += amount;
    end.y += amount;
  } else {
    start.x += amount;
    end.x += amount;
  }
}

function getInitialTangent(points) {
  for (let index = 1; index < points.length; index++) {
    const tangent = points[index].clone().sub(points[index - 1]);
    if (tangent.lengthSq() > 1e-8) return tangent.normalize();
  }
  return new THREE.Vector3(1, 0, 0);
}

function getTerminalTangent(points) {
  for (let index = points.length - 1; index > 0; index--) {
    const tangent = points[index].clone().sub(points[index - 1]);
    if (tangent.lengthSq() > 1e-8) return tangent.normalize();
  }
  return new THREE.Vector3(1, 0, 0);
}

function getLabelPlacement(points, rendering, lane) {
  const strategy = rendering.labelPlacement ?? rendering.labelStrategy ?? 'best-segment';
  if (strategy === 'path' && typeof rendering.labelPositionAlongPath === 'number') {
    return getPointAlongPolyline(points, rendering.labelPositionAlongPath, rendering.labelOffsetFromPath ?? 0.12);
  }

  let best = null;
  let fallback = null;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const tangent = end.clone().sub(start);
    const length = tangent.length();
    if (length <= 1e-6) continue;
    const candidate = {
      position: start.clone().add(end).multiplyScalar(0.5),
      tangent: tangent.clone().normalize(),
      length,
      horizontal: almostEqual(start.y, end.y)
    };
    if (!fallback || candidate.length > fallback.length) fallback = candidate;
    if (candidate.horizontal && candidate.length >= MIN_LABEL_SEGMENT && (!best || candidate.length > best.length)) best = candidate;
  }

  best = best || fallback || { position: points[0].clone(), tangent: new THREE.Vector3(1, 0, 0), length: 0 };
  const offset = typeof rendering.labelOffsetFromPath === 'number'
    ? rendering.labelOffsetFromPath
    : ((lane?.sideSign ?? 1) * 0.1);
  if (offset) {
    best.position.add(getNormal(best.tangent).multiplyScalar(offset));
  }
  return best;
}

function separateLinkLabel(route, occupiedLabels, rendering) {
  const labelText = String(rendering.labelText ?? '');
  const boundsSize = {
    width: rendering.labelCollisionWidth ?? Math.max(0.85, labelText.length * 0.12),
    height: rendering.labelCollisionHeight ?? 0.42
  };
  const margin = rendering.labelCollisionMargin ?? 0.06;
  const basePosition = route.labelPosition.clone();
  const tangent = route.labelTangent.clone();
  if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
  tangent.normalize();
  const normal = getNormal(tangent);
  const candidates = [basePosition.clone()];

  for (let step = 1; step <= 10; step += 1) {
    const along = tangent.clone().multiplyScalar(0.34 * step);
    const away = normal.clone().multiplyScalar(0.2 * step);
    candidates.push(basePosition.clone().add(away));
    candidates.push(basePosition.clone().sub(away));
    candidates.push(basePosition.clone().add(along));
    candidates.push(basePosition.clone().sub(along));
    candidates.push(basePosition.clone().add(along).add(away));
    candidates.push(basePosition.clone().add(along).sub(away));
    candidates.push(basePosition.clone().sub(along).add(away));
    candidates.push(basePosition.clone().sub(along).sub(away));
  }

  let selectedBounds = null;
  for (const candidate of candidates) {
    const bounds = getLabelBounds(candidate, boundsSize);
    if (!occupiedLabels.some(occupied => labelBoundsCollide(bounds, occupied, margin))) {
      route.labelPosition.copy(candidate);
      selectedBounds = bounds;
      break;
    }
  }

  if (!selectedBounds) selectedBounds = getLabelBounds(route.labelPosition, boundsSize);
  occupiedLabels.push(selectedBounds);
}

function getLabelBounds(position, size) {
  return {
    minX: position.x - size.width / 2,
    maxX: position.x + size.width / 2,
    minY: position.y - size.height / 2,
    maxY: position.y + size.height / 2
  };
}

function getStaticAttributeLabelBounds(parent) {
  const bounds = [];
  const localPosition = new THREE.Vector3();
  parent.updateWorldMatrix?.(true, true);
  parent.traverse?.(object => {
    if (!object.isCSS2DObject || object.userData?.labelKind !== 'attribute') return;
    object.getWorldPosition(localPosition);
    parent.worldToLocal(localPosition);
    const text = String(object.userData?.text || object.element?.textContent || '');
    const width = Math.min(
      object.userData?.maxWorldWidth ?? 2.25,
      Math.max(0.24, text.length * 0.075)
    );
    const height = Math.max(0.08, (object.userData?.gapY ?? 0.17) * 0.9);
    bounds.push({
      minX: localPosition.x,
      maxX: localPosition.x + width,
      minY: localPosition.y - height / 2,
      maxY: localPosition.y + height / 2
    });
  });
  return bounds;
}

function labelBoundsCollide(a, b, margin = 0) {
  return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > -margin &&
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > -margin;
}

function getPointAlongPolyline(points, t, offset = 0) {
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const length = points[index].distanceTo(points[index - 1]);
    lengths.push(length);
    total += length;
  }
  if (!total) return { position: points[0].clone(), tangent: new THREE.Vector3(1, 0, 0) };
  const target = THREE.MathUtils.clamp(t, 0, 1) * total;
  let traveled = 0;
  for (let index = 1; index < points.length; index++) {
    const length = lengths[index - 1];
    if (traveled + length >= target) {
      const localT = length ? (target - traveled) / length : 0;
      const tangent = points[index].clone().sub(points[index - 1]).normalize();
      const position = points[index - 1].clone().lerp(points[index], localT);
      if (offset) position.add(getNormal(tangent).multiplyScalar(offset));
      return { position, tangent };
    }
    traveled += length;
  }
  return { position: points[points.length - 1].clone(), tangent: getTerminalTangent(points) };
}

function getNormal(tangent) {
  return new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
}

function almostEqual(a, b) {
  return Math.abs(a - b) < 1e-6;
}

function pointsAlmostEqual(a, b) {
  return almostEqual(a.x, b.x) && almostEqual(a.y, b.y) && almostEqual(a.z, b.z);
}

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toPositiveNumber(value, fallback) {
  const number = toFiniteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function clampLinkFontSize(value, fallback = DEFAULT_LINK_FONT_SETTINGS.size) {
  return THREE.MathUtils.clamp(toPositiveNumber(value, fallback), 1, MAX_LINK_FONT_SIZE);
}

function normalizeFontFamily(value, fallback) {
  const clean = String(value ?? '').trim();
  return clean || fallback || DEFAULT_LINK_FONT_SETTINGS.family;
}

function toBooleanFontValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value >= 600 || value === 1;
  const clean = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'bold', 'bolder', '600', '700', '800', '900', 'italic', 'underline'].includes(clean)) return true;
  if (['false', '0', 'no', 'normal', 'none', 'lighter', '400'].includes(clean)) return false;
  const numeric = Number(clean);
  if (Number.isFinite(numeric)) return numeric >= 600 || numeric === 1;
  return Boolean(fallback);
}

function getPixelsPerWorldUnit(camera, distance, viewportHeight) {
  if (camera?.isPerspectiveCamera) {
    const fov = camera.fov * Math.PI / 180;
    return viewportHeight / Math.max(1e-6, 2 * Math.tan(fov / 2) * Math.max(distance, 1e-6));
  }
  if (camera?.isOrthographicCamera) return viewportHeight / Math.max(1e-6, camera.top - camera.bottom);
  return 80;
}

function getFontSizeForTextWidth(text, availableWidthPx, extraPx = 0) {
  const estimatedEm = Math.max(1, String(text || '').length * 0.58);
  return Math.max(1, availableWidthPx - extraPx) / estimatedEm;
}

export function updateLinkFontSizes(camera, renderer) {
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  camera.getWorldPosition(c);
  const viewportHeight = Math.max(1, renderer?.domElement?.clientHeight ?? globalThis.innerHeight ?? 800);
  for (const label of linkLabels) {
    label.getWorldPosition(p);
    const d = Math.max(1, p.distanceTo(c));
    const font = label.userData?.fontSettings || DEFAULT_LINK_FONT_SETTINGS;
    const preferredSize = clampLinkFontSize(font.size, DEFAULT_LINK_FONT_SETTINGS.size);
    const pixelsPerWorldUnit = getPixelsPerWorldUnit(camera, d, viewportHeight);
    const rendering = label.parent?.userData?.linkData?.rendering || {};
    const collisionWidthWorld = rendering.labelCollisionWidth ?? Math.max(0.85, String(label.userData?.text || label.element.textContent || '').length * 0.12);
    const availableWidthPx = Math.max(42, collisionWidthWorld * pixelsPerWorldUnit);
    const minSize = Math.min(preferredSize, Math.max(MIN_READABLE_LINK_FONT_SIZE, preferredSize * 0.68));
    const preferredScale = Math.max(1, preferredSize / DEFAULT_LINK_FONT_SETTINGS.size);
    const distanceSize = THREE.MathUtils.clamp((120 * preferredScale) / d, minSize, Math.max(18, preferredSize));
    const fitSize = getFontSizeForTextWidth(label.userData?.text || label.element.textContent || '', availableWidthPx, 2);
    const dynamicSize = THREE.MathUtils.clamp(Math.min(distanceSize, fitSize), minSize, Math.max(18, preferredSize));
    const size = Math.max(minSize, Math.min(preferredSize, dynamicSize));
    applyLinkLabelFontSettings(label.element, { ...font, size });
  }
}

function getCachedObstacleBoxes(cache, parent, sourceClass, targetClass) {
  if (!parent || !cache) return getObstacleBoxes(parent, sourceClass, targetClass);
  let parentCache = cache.get(parent);
  if (!parentCache) {
    parentCache = new Map();
    cache.set(parent, parentCache);
  }
  const key = obstaclePairKey(sourceClass, targetClass);
  if (!parentCache.has(key)) {
    parentCache.set(key, getObstacleBoxes(parent, sourceClass, targetClass));
  }
  return parentCache.get(key);
}

function obstaclePairKey(sourceClass, targetClass) {
  return [sourceClass?.uuid || '', targetClass?.uuid || ''].sort().join(':');
}

export function createLinkData(input = {}, defaults = {}) {
  return normalizeLinkData({ ...defaults, ...input, id: input.id ?? `link_${Math.random().toString(36).slice(2, 8)}` });
}

export function updateLinkData(linkData, patch = {}) {
  return normalizeLinkData({ ...linkData, ...patch, rendering: { ...(linkData.rendering || {}), ...(patch.rendering || {}) } });
}

export function normalizeLinkData(linkData = {}) {
  const rendering = linkData.rendering || {};
  const arrowType = normalizeArrowType(rendering.arrowType ?? rendering.arrowheadType);
  const arrowDirection = normalizeArrowDirection(rendering.arrowDirection);
  return {
    ...linkData,
    allowSelfLink: linkData.allowSelfLink ?? true,
    rendering: {
      labelText: rendering.labelText ?? linkData.id ?? '',
      orthogonalStyle: rendering.orthogonalStyle ?? 'auto',
      ...rendering,
      arrowType,
      arrowDirection
    }
  };
}

export function validateLinkData(linkData, classById) {
  const errors = [];
  if (!linkData.sourceClassId) errors.push('missing sourceClassId');
  if (!linkData.targetClassId) errors.push('missing targetClassId');
  if (linkData.sourceClassId === linkData.targetClassId && !linkData.allowSelfLink) errors.push('self link not allowed');
  if (classById) {
    if (!classById.has(linkData.sourceClassId)) errors.push('source not found');
    if (!classById.has(linkData.targetClassId)) errors.push('target not found');
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}
