import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const linkLabels = [];
const activeLinks = [];

export const Loader = {
  async load(modelName) {
    const res = await fetch(`./models/${modelName}.json`);
    if (!res.ok) throw new Error(`Model not found: ${modelName}`);
    return await res.json();
  }
};

function getHubWorldPosition(classMesh) {
  const hub = classMesh.getObjectByName('class-hub');
  if (!hub) return classMesh.getWorldPosition(new THREE.Vector3());
  return hub.getWorldPosition(new THREE.Vector3());
}

function pathPoint(p0, p1, c, t) {
  const mt = 1 - t;
  return new THREE.Vector3()
    .copy(p0).multiplyScalar(mt * mt)
    .add(new THREE.Vector3().copy(c).multiplyScalar(2 * mt * t))
    .add(new THREE.Vector3().copy(p1).multiplyScalar(t * t));
}

export function createLinkBetweenClass(linkData, classById) {
  const sourceClass = classById.get(linkData.sourceClassId);
  const targetClass = classById.get(linkData.targetClassId);
  if (!sourceClass || !targetClass) return null;

  const rendering = linkData.rendering ?? {};
  const lineStyle = rendering.lineStyle ?? 'solid';
  const mat = new THREE.LineBasicMaterial({
    color: rendering.lineColor ?? '#333333',
    linewidth: rendering.lineWidth ?? 2
  });
  if (lineStyle === 'dashed' || lineStyle === 'dotted') {
    mat.dashSize = lineStyle === 'dotted' ? 0.04 : 0.15;
    mat.gapSize = lineStyle === 'dotted' ? 0.08 : 0.1;
  }

  const geometry = new THREE.BufferGeometry();
  const line = new THREE.Line(geometry, mat);
  line.renderOrder = rendering.zIndex ?? 5;

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry((rendering.arrowheadSize ?? 0.1) * 0.45, rendering.arrowheadSize ?? 0.1, 12),
    new THREE.MeshBasicMaterial({ color: rendering.lineColor ?? '#333333' })
  );
  arrow.visible = rendering.arrowheadVisibility !== false;
  arrow.renderOrder = (rendering.zIndex ?? 5) + 1;

  const labelDiv = document.createElement('div');
  labelDiv.className = 'label link-label';
  labelDiv.textContent = rendering.labelText ?? '';
  labelDiv.style.font = `${rendering.labelFontSize ?? 12}px Arial`;
  labelDiv.style.color = rendering.labelColor ?? '#111111';
  labelDiv.style.background = rendering.labelBackgroundColor ?? 'rgba(255,255,255,0.9)';
  labelDiv.style.padding = '1px 4px';
  labelDiv.style.borderRadius = '3px';
  const labelObj = new CSS2DObject(labelDiv);
  linkLabels.push(labelObj);

  const linkGroup = new THREE.Group();
  linkGroup.add(line, arrow, labelObj);

  const handle = { linkData, sourceClass, targetClass, line, arrow, labelObj, linkGroup };
  activeLinks.push(handle);
  recalculateAllLinks();
  return handle;
}

export function recalculateAllLinks() {
  const pairBuckets = new Map();
  for (const l of activeLinks) {
    const k = [l.linkData.sourceClassId, l.linkData.targetClassId].sort((a,b)=>a-b).join(':');
    if (!pairBuckets.has(k)) pairBuckets.set(k, []);
    pairBuckets.get(k).push(l);
  }

  for (const bucket of pairBuckets.values()) {
    const count = bucket.length;
    bucket.forEach((l, idx) => {
      const p0 = getHubWorldPosition(l.sourceClass);
      const p1 = getHubWorldPosition(l.targetClass);
      const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(p1, p0);
      const n = new THREE.Vector3(-dir.y, dir.x, 0).normalize();

      const spacing = l.linkData.rendering?.curveOffset ?? 0.35;
      const offsetIndex = idx - (count - 1) / 2;
      const bidirectional = l.linkData.sourceClassId > l.linkData.targetClassId ? -1 : 1;
      const control = mid.clone().addScaledVector(n, spacing * offsetIndex * bidirectional);

      const points = [];
      const seg = 40;
      for (let i = 0; i <= seg; i++) points.push(pathPoint(p0, p1, control, i / seg));
      l.line.geometry.setFromPoints(points);
      l.line.computeLineDistances();

      const arrowT = 0.93;
      const arrowPos = pathPoint(p0, p1, control, arrowT);
      const prev = pathPoint(p0, p1, control, arrowT - 0.03);
      l.arrow.position.copy(arrowPos);
      l.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowPos.clone().sub(prev).normalize());

      const labelT = l.linkData.rendering?.labelPositionAlongPath ?? 0.5;
      const lp = pathPoint(p0, p1, control, labelT);
      const tangent = pathPoint(p0, p1, control, Math.min(labelT + 0.03, 1)).sub(pathPoint(p0, p1, control, Math.max(labelT - 0.03, 0))).normalize();
      const labelOffset = l.linkData.rendering?.labelOffsetFromPath ?? 0.15;
      lp.addScaledVector(n, labelOffset);
      l.labelObj.position.copy(lp);
      if (l.linkData.rendering?.labelRotationBehavior === 'follow') {
        const angle = Math.atan2(tangent.y, tangent.x);
        l.labelObj.element.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
      } else {
        l.labelObj.element.style.transform = 'translate(-50%, -50%)';
      }
    });
  }
}

export function updateLinkFontSizes(camera) {
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  camera.getWorldPosition(c);
  for (const label of linkLabels) {
    label.getWorldPosition(p);
    const d = Math.max(1, p.distanceTo(c));
    const size = THREE.MathUtils.clamp(120 / d, 9, 18);
    label.element.style.fontSize = `${size.toFixed(1)}px`;
  }
}
