import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { attachAttributesToMesh } from './hbds_class.js';

const hyperclassLabels = [];

export const Loader = {
  async load(modelNameOrPath) {
    const modelPath = modelNameOrPath.endsWith('.json')
      ? `./${modelNameOrPath.replace(/^\.\//, '')}`
      : `./models/${modelNameOrPath}.json`;
    const res = await fetch(modelPath);
    if (!res.ok) throw new Error(`Model not found: ${modelNameOrPath}`);
    return await res.json();
  }
};

export function createHyperClass(scene, hyperClassData, options = {}) {
  const sz = hyperClassData.size ?? { width: 4, height: 4 };
  const classCfg = hyperClassData.rendering?.class ?? {};
  const textColor = hyperClassData.rendering?.textColor ?? '#000000';

  const shape = roundedRect(sz.width, sz.height, classCfg.cornerRadius ?? 0.3);
  const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  const mat = new THREE.MeshStandardMaterial({
    color: classCfg.color ?? '#FFFFFF',
    transparent: true,
    opacity: classCfg.opacity ?? 0.14,
    metalness: 0.9,
    roughness: 0.35
  });

  const hyperMesh = new THREE.Mesh(geom, mat);
  hyperMesh.position.set(
    hyperClassData.position?.x ?? 0,
    hyperClassData.position?.y ?? 0,
    hyperClassData.position?.z ?? 0
  );

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: classCfg.borderColor ?? '#111111' })
  );
  hyperMesh.add(border);

  const titleDiv = document.createElement('div');
  titleDiv.className = 'label class-label hyperclass-label';
  titleDiv.setAttribute('data-class', hyperClassData.name ?? '');
  titleDiv.setAttribute('data-hyperclass', 'true');
  titleDiv.style.font = 'bold 18px Arial';
  titleDiv.style.color = textColor;
  titleDiv.textContent = hyperClassData.name ?? 'Hyperclass';
  const title = new CSS2DObject(titleDiv);
  title.position.set(0, sz.height / 2 - 0.22, 0.08);
  hyperMesh.add(title);
  hyperclassLabels.push(title);

  const hub = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 24),
    new THREE.MeshBasicMaterial({ color: '#FF0000' })
  );
  hub.name = 'class-hub';
  hub.position.set((sz.width * 0.85) / 2, (sz.height * 0.85) / 2, 0.08);
  hub.raycast = () => {};
  hyperMesh.add(hub);

  hyperMesh.userData = {
    ...hyperMesh.userData,
    classId: hyperClassData.id,
    classType: 'hyperclass',
    isHyperClass: true,
    children: hyperClassData.children ?? [],
    parentClassId: hyperClassData.parentClassId ?? null,
    sourceData: hyperClassData,
    selectable: true,
    editable: true,
    deletable: true,
    draggable: true
  };

  attachAttributesToMesh(hyperMesh, hyperClassData.attributes ?? [], {
    size: sz,
    attributes: {
      checkboxColor: hyperClassData.rendering?.attributes?.checkboxColor ?? '#A9A9A9',
      size: {
        width: hyperClassData.rendering?.attributes?.size?.width ?? 0.1,
        height: hyperClassData.rendering?.attributes?.size?.height ?? hyperClassData.rendering?.attributes?.size?.width ?? 0.1
      }
    },
    connections: {
      lineColor: hyperClassData.rendering?.connections?.lineColor ?? '#000000',
      lineWidth: hyperClassData.rendering?.connections?.lineWidth ?? 0.01
    },
    textColor,
    startY: sz.height / 2 - 0.45,
    gapY: 0.16,
    colX: sz.width / 2 + 0.28,
    hubPosition: hub.position.clone(),
    z: 0.08
  });


  if (scene) scene.add(hyperMesh);
  return { classMesh: hyperMesh };
}

export function updateLabelFontSizes(camera, renderer, options = {}) {
  const wp = new THREE.Vector3();
  const cp = new THREE.Vector3();
  camera.getWorldPosition(cp);
  hyperclassLabels.forEach(label => {
    label.getWorldPosition(wp);
    const dist = Math.max(1, wp.distanceTo(cp));
    const isTitle = label.element.classList.contains('class-label');
    const size = isTitle
      ? THREE.MathUtils.clamp(160 / dist, 14, 32)
      : THREE.MathUtils.clamp(100 / dist, 8, 16);
    label.element.style.fontSize = `${size.toFixed(1)}px`;
  });
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x, y + r);
  s.lineTo(x, y + h - r);
  s.quadraticCurveTo(x, y + h, x + r, y + h);
  s.lineTo(x + w - r, y + h);
  s.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  s.lineTo(x + w, y + r);
  s.quadraticCurveTo(x + w, y, x + w - r, y);
  s.lineTo(x + r, y);
  s.quadraticCurveTo(x, y, x, y + r);
  return s;
}
