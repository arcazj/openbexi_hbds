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


function getNodeHubs(node) {
  return node?.userData?.hubs || null;
}

function getFallbackHub(node) {
  return node?.userData?.linkHub || node?.getObjectByName('class-hub') || node;
}

function getHubWorldPosition(hub) {
  return hub.getWorldPosition(new THREE.Vector3());
}

function chooseBestHubPair(sourceNode, targetNode) {
  const sourceHubs = getNodeHubs(sourceNode);
  const targetHubs = getNodeHubs(targetNode);
  const sourceCandidates = sourceHubs ? Object.values(sourceHubs).filter(Boolean) : [getFallbackHub(sourceNode)];
  const targetCandidates = targetHubs ? Object.values(targetHubs).filter(Boolean) : [getFallbackHub(targetNode)];
  let best = { sourceHub: sourceCandidates[0], targetHub: targetCandidates[0], d2: Infinity };
  for (const sHub of sourceCandidates) {
    const s = getHubWorldPosition(sHub);
    for (const tHub of targetCandidates) {
      const t = getHubWorldPosition(tHub);
      const d2 = s.distanceToSquared(t);
      if (d2 < best.d2) best = { sourceHub: sHub, targetHub: tHub, d2 };
    }
  }
  return best;
}

function getBestSourceHub(sourceNode, targetNode) {
  return chooseBestHubPair(sourceNode, targetNode).sourceHub;
}

function getBestTargetHub(targetNode, sourceNode) {
  return chooseBestHubPair(sourceNode, targetNode).targetHub;
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
  labelDiv.style.padding = '2px 8px';
  labelDiv.style.borderRadius = '999px';
  labelDiv.style.border = '1px solid rgba(55,65,81,0.45)';
  labelDiv.style.whiteSpace = 'nowrap';
  labelDiv.style.textAlign = 'center';
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
      const parent = l.linkGroup.parent;
      const sourceHub = getBestSourceHub(l.sourceClass, l.targetClass);
      const targetHub = getBestTargetHub(l.targetClass, l.sourceClass);
      const p0World = getHubWorldPosition(sourceHub);
      const p1World = getHubWorldPosition(targetHub);
      const p0 = parent ? parent.worldToLocal(p0World.clone()) : p0World;
      const p1 = parent ? parent.worldToLocal(p1World.clone()) : p1World;
      const routePts = Array.isArray(l.linkData.rendering?.routePoints) ? l.linkData.rendering.routePoints : null;
      const points = [];
      let tangent = new THREE.Vector3(1, 0, 0);
      let lp;
      if (routePts && routePts.length) {
        points.push(p0.clone(), ...routePts.map(p => new THREE.Vector3(p.x, p.y, p.z ?? 0)), p1.clone());
        l.line.geometry.setFromPoints(points);
        l.line.computeLineDistances();
        const last = points[points.length - 1];
        const prev = points[Math.max(0, points.length - 2)];
        tangent = last.clone().sub(prev).normalize();
        l.arrow.position.copy(last);
        l.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        const labelIndex = Math.max(1, Math.floor((points.length - 1) * (l.linkData.rendering?.labelPositionAlongPath ?? 0.5)));
        lp = points[labelIndex].clone();
      } else if (l.linkData.sourceClassId === l.linkData.targetClassId) {
        const loopRadius = l.linkData.rendering?.selfLoopRadius ?? 0.75;
        const loopLift = l.linkData.rendering?.selfLoopLift ?? 0.85;
        const center = p0.clone().add(new THREE.Vector3(loopRadius, loopLift, 0));
        const seg = 56;
        for (let i = 0; i <= seg; i++) {
          const a = (Math.PI * 2 * i) / seg;
          points.push(new THREE.Vector3(
            center.x + loopRadius * Math.cos(a),
            center.y + loopRadius * Math.sin(a),
            p0.z
          ));
        }
        l.line.geometry.setFromPoints(points);
        l.line.computeLineDistances();
        const arrowIdx = Math.floor(seg * 0.92);
        const arrowPos = points[arrowIdx].clone();
        const prev = points[Math.max(arrowIdx - 1, 0)].clone();
        tangent = arrowPos.clone().sub(prev).normalize();
        l.arrow.position.copy(arrowPos);
        l.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        lp = center.clone().add(new THREE.Vector3(0, 0, 0));
      } else {
        const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(p1, p0);
        const n = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
        const spacing = l.linkData.rendering?.curveOffset ?? 0.35;
        const offsetIndex = idx - (count - 1) / 2;
        const bidirectional = l.linkData.sourceClassId > l.linkData.targetClassId ? -1 : 1;
        const control = mid.clone().addScaledVector(n, spacing * offsetIndex * bidirectional);
        const seg = 40;
        for (let i = 0; i <= seg; i++) points.push(pathPoint(p0, p1, control, i / seg));
        l.line.geometry.setFromPoints(points);
        l.line.computeLineDistances();
        const arrowT = 0.93;
        const arrowPos = pathPoint(p0, p1, control, arrowT);
        const prev = pathPoint(p0, p1, control, arrowT - 0.03);
        tangent = arrowPos.clone().sub(prev).normalize();
        l.arrow.position.copy(arrowPos);
        l.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        const labelT = l.linkData.rendering?.labelPositionAlongPath ?? 0.5;
        lp = pathPoint(p0, p1, control, labelT);
        const labelOffset = l.linkData.rendering?.labelOffsetFromPath ?? 0.15;
        lp.addScaledVector(n, labelOffset);
      }
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

export function createLinkData(input={}, defaults={}){ return normalizeLinkData({ ...defaults, ...input, id: input.id ?? `link_${Math.random().toString(36).slice(2,8)}` }); }
export function updateLinkData(linkData, patch={}){ return normalizeLinkData({ ...linkData, ...patch, rendering:{ ...(linkData.rendering||{}), ...(patch.rendering||{}) } }); }
export function normalizeLinkData(linkData={}){ return { ...linkData, allowSelfLink: linkData.allowSelfLink ?? true, rendering:{ labelText: linkData.rendering?.labelText ?? linkData.id ?? '', ...(linkData.rendering||{}) } }; }
export function validateLinkData(linkData, classById){ const errors=[]; if(!linkData.sourceClassId) errors.push('missing sourceClassId'); if(!linkData.targetClassId) errors.push('missing targetClassId'); if(linkData.sourceClassId===linkData.targetClassId && !linkData.allowSelfLink) errors.push('self link not allowed'); if(classById){ if(!classById.has(linkData.sourceClassId)) errors.push('source not found'); if(!classById.has(linkData.targetClassId)) errors.push('target not found'); } return {valid:errors.length===0,errors,warnings:[]}; }
