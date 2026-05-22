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

export function createLinkBetweenClass(linkData, classById) {
  const sourceClass = classById.get(linkData.sourceClassId);
  const targetClass = classById.get(linkData.targetClassId);
  if (!sourceClass || !targetClass) return null;

  const rendering = linkData.rendering ?? {};
  const lineStyle = rendering.lineStyle ?? 'solid';
  const isDashed = lineStyle === 'dashed' || lineStyle === 'dotted';
  const Material = isDashed ? THREE.LineDashedMaterial : THREE.LineBasicMaterial;
  const materialOptions = {
    color: rendering.lineColor ?? '#333333',
    linewidth: rendering.lineWidth ?? 2
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

  const arrowheadType = normalizeArrowheadType(rendering.arrowheadType);
  const rawArrowheadSize = rendering.arrowheadSize ?? 0.1;
  const arrowheadSize = Math.min(rawArrowheadSize * (rendering.arrowheadScale ?? 0.6), rendering.maxArrowheadSize ?? 0.12);
  const arrowGeometry = createArrowheadGeometry(arrowheadType, arrowheadSize);
  const arrow = new THREE.Mesh(
    arrowGeometry,
    new THREE.MeshBasicMaterial({ color: rendering.lineColor ?? '#333333' })
  );
  arrow.name = 'link-arrowhead';
  arrow.visible = rendering.arrowheadVisibility !== false && arrowheadType !== 'none';
  arrow.renderOrder = (rendering.zIndex ?? 5) + 1;
  arrow.userData.relationshipArrow = true;

  const sourcePort = createRelationshipPortMarker('source', rendering);
  const targetPort = createRelationshipPortMarker('target', rendering);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'label link-label';
  labelDiv.textContent = rendering.labelText ?? '';
  labelDiv.style.font = `${rendering.labelFontSize ?? 12}px Arial`;
  labelDiv.style.color = rendering.labelColor ?? rendering.textColor ?? '#111111';
  labelDiv.style.background = rendering.labelBackgroundColor ?? 'rgba(255,255,255,0.9)';
  labelDiv.style.padding = '2px 8px';
  labelDiv.style.borderRadius = '999px';
  labelDiv.style.border = '1px solid rgba(55,65,81,0.45)';
  labelDiv.style.whiteSpace = 'nowrap';
  labelDiv.style.textAlign = 'center';
  const labelObj = new CSS2DObject(labelDiv);
  linkLabels.push(labelObj);

  const linkGroup = new THREE.Group();
  linkGroup.add(line, arrow, sourcePort, targetPort, labelObj);

  const handle = { linkData, sourceClass, targetClass, line, arrow, sourcePort, targetPort, labelObj, linkGroup };
  activeLinks.push(handle);
  recalculateAllLinks();
  return handle;
}

export function recalculateAllLinks() {
  const pairBuckets = new Map();
  const occupiedLanes = [];
  const occupiedLabels = [];
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
      const obstacleBoxes = getObstacleBoxes(parent, link.sourceClass, link.targetClass);
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
      link.arrow.position.copy(route.arrowPosition);
      link.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), route.tangent);
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

function normalizeArrowheadType(type) {
  const clean = String(type || 'triangle').toLowerCase();
  return ['triangle', 'cone', 'diamond', 'none'].includes(clean) ? clean : 'triangle';
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

export function updateLinkFontSizes(camera) {
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  camera.getWorldPosition(c);
  for (const label of linkLabels) {
    label.getWorldPosition(p);
    const d = Math.max(1, p.distanceTo(c));
    const size = THREE.MathUtils.clamp(120 / d, 6, 18);
    label.element.style.fontSize = `${size.toFixed(1)}px`;
  }
}

export function createLinkData(input = {}, defaults = {}) {
  return normalizeLinkData({ ...defaults, ...input, id: input.id ?? `link_${Math.random().toString(36).slice(2, 8)}` });
}

export function updateLinkData(linkData, patch = {}) {
  return normalizeLinkData({ ...linkData, ...patch, rendering: { ...(linkData.rendering || {}), ...(patch.rendering || {}) } });
}

export function normalizeLinkData(linkData = {}) {
  return {
    ...linkData,
    allowSelfLink: linkData.allowSelfLink ?? true,
    rendering: {
      labelText: linkData.rendering?.labelText ?? linkData.id ?? '',
      orthogonalStyle: linkData.rendering?.orthogonalStyle ?? 'auto',
      ...(linkData.rendering || {})
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
