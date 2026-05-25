import * as THREE from 'three';
import { attachAttributesToMesh, createClassSurfaceMaterial, createIconTitleLabel, applyLabelFontSettings } from './hbds_class.js?v=material-surface-20260525a';

const hyperclassLabels = [];
let lastSizingCamera = null;
let lastSizingRenderer = null;

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
  const attrRendering = hyperClassData.rendering?.attributes ?? {};
  const textColor = hyperClassData.rendering?.textColor ?? '#000000';

  const shape = roundedRect(sz.width, sz.height, classCfg.cornerRadius ?? 0.3);
  const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  const hyperColor = new THREE.Color(classCfg.metallicColor ?? classCfg.color ?? '#FFFFFF');
  const opacity = classCfg.opacity ?? 0.18;
  const mat = createClassSurfaceMaterial(
    {
      ...classCfg,
      opacity,
      metalness: classCfg.metalness ?? 0.42,
      roughness: classCfg.roughness ?? 0.28
    },
    hyperColor,
    opacity,
    { depthWrite: opacity >= 0.85 }
  );
  mat.userData.hbdsHyperclassPanel = true;

  const hyperMesh = new THREE.Mesh(geom, mat);
  hyperMesh.position.set(
    hyperClassData.position?.x ?? 0,
    hyperClassData.position?.y ?? 0,
    hyperClassData.position?.z ?? 0
  );

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({
      color: classCfg.borderColor ?? '#111111',
      linewidth: classCfg.borderWidth ?? 1
    })
  );
  border.name = 'hyperclass-border';
  border.raycast = () => {};
  hyperMesh.add(border);

  const title = createIconTitleLabel(hyperClassData, {
    className: 'label class-label hyperclass-label',
    isHyperclass: true,
    textColor,
    font: hyperClassData.rendering?.font,
    modelFont: hyperClassData.modelFont,
    legacyFont: 'bold 18px Arial',
    iconFont: 'bold 18px Arial',
    iconSize: classCfg.iconSize ?? 1,
    legacyPosition: new THREE.Vector3(0, sz.height / 2 - 0.22, 0.08),
    iconPosition: new THREE.Vector3(0, sz.height / 2 - 0.4, 0.08),
    onIconLoaded: () => {
      if (lastSizingCamera) updateLabelFontSizes(lastSizingCamera, lastSizingRenderer);
    }
  });
  title.userData = {
    ...title.userData,
    labelKind: 'title',
    nodeSize: { width: sz.width, height: sz.height },
    nodeType: 'hyperclass',
    text: hyperClassData.name ?? 'Hyperclass'
  };
  hyperMesh.add(title);
  hyperclassLabels.push(title);

  const hub = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 24),
    new THREE.MeshBasicMaterial({ color: '#FF0000' })
  );
  hub.name = 'class-hub';
  hub.userData.hubRadius = 0.04;
  hub.position.set((sz.width * 0.85) / 2, (sz.height * 0.85) / 2, 0.08);
  hub.raycast = () => {};
  hyperMesh.add(hub);

  hyperMesh.userData.linkHub = hub;


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
      ...attrRendering,
      checkboxColor: attrRendering.checkboxColor ?? '#A9A9A9',
      checkboxMaterial: attrRendering.checkboxMaterial ?? attrRendering.material ?? 'metallic',
      shape: attrRendering.shape ?? 'square',
      size: {
        width: attrRendering.size?.width ?? 0.1,
        height: attrRendering.size?.height ?? attrRendering.size?.width ?? 0.1
      }
    },
    connections: {
      lineColor: hyperClassData.rendering?.connections?.lineColor ?? '#000000',
      lineWidth: hyperClassData.rendering?.connections?.lineWidth ?? 0.01
    },
    textColor,
    modelFont: hyperClassData.modelFont,
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
  lastSizingCamera = camera ?? lastSizingCamera;
  lastSizingRenderer = renderer ?? lastSizingRenderer;
  const wp = new THREE.Vector3();
  const cp = new THREE.Vector3();
  camera.getWorldPosition(cp);
  const viewportHeight = Math.max(1, renderer?.domElement?.clientHeight ?? globalThis.innerHeight ?? 800);
  hyperclassLabels.forEach(label => {
    label.getWorldPosition(wp);
    const dist = Math.max(1, wp.distanceTo(cp));
    const nodeWidth = label.userData?.nodeSize?.width ?? label.parent?.userData?.modelData?.size?.width ?? 4;
    const pixelsPerWorldUnit = getPixelsPerWorldUnit(camera, dist, viewportHeight);
    const availableWidthPx = Math.max(72, (nodeWidth - 0.36) * pixelsPerWorldUnit);
    const distanceSize = THREE.MathUtils.clamp(150 / dist, 2.8, 22);
    const verticalCap = Math.max(1.5, 0.24 * pixelsPerWorldUnit);
    const text = label.userData?.text || label.element.textContent || '';
    const fitSize = availableWidthPx / Math.max(1, String(text).length * 0.62 + (label.element.classList.contains('hbds-icon-title') ? 1.25 : 0));
    const configuredSize = Number(label.userData?.fontSettings?.size);
    const dynamicSize = THREE.MathUtils.clamp(Math.min(distanceSize, fitSize, verticalCap), 1.5, 22);
    const size = Number.isFinite(configuredSize)
      ? Math.max(1.5, Math.min(configuredSize, dynamicSize))
      : dynamicSize;
    applyHyperclassTitleSizing(label.element, availableWidthPx, size);
  });
}

function getPixelsPerWorldUnit(camera, distance, viewportHeight) {
  if (camera?.isPerspectiveCamera) {
    const fov = camera.fov * Math.PI / 180;
    return viewportHeight / Math.max(1e-6, 2 * Math.tan(fov / 2) * Math.max(distance, 1e-6));
  }
  if (camera?.isOrthographicCamera) return viewportHeight / Math.max(1e-6, camera.top - camera.bottom);
  return 80;
}

function applyHyperclassTitleSizing(element, availableWidthPx, fontSize) {
  element.style.fontSize = `${fontSize.toFixed(1)}px`;
  if (element.__hbdsFontSettings) applyLabelFontSettings(element, { ...element.__hbdsFontSettings, size: fontSize });
  element.style.maxWidth = `${Math.round(availableWidthPx)}px`;
  element.style.overflow = 'hidden';
  element.style.textOverflow = 'ellipsis';
  element.style.whiteSpace = 'nowrap';
  const row = element.querySelector?.('.hbds-icon-title-row');
  const title = row?.querySelector?.('span') || row?.lastElementChild;
  if (row) {
    row.style.maxWidth = `${Math.round(availableWidthPx)}px`;
    row.style.overflow = 'hidden';
  }
  if (title) {
    const icon = row?.querySelector?.('img');
    const iconWidth = icon ? icon.getBoundingClientRect().width + fontSize * 0.45 : 0;
    title.style.maxWidth = `${Math.max(30, Math.round(availableWidthPx - iconWidth))}px`;
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
    title.style.whiteSpace = 'nowrap';
  }
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

export function createHyperclassData(input={}, defaults={}){ return normalizeHyperclassData({ ...defaults, ...input, id: input.id ?? `hyper_${Math.random().toString(36).slice(2,8)}`, type:'hyperclass' }); }
export function updateHyperclassData(hyperclassData, patch={}){ return normalizeHyperclassData({ ...hyperclassData, ...patch, rendering:{ ...(hyperclassData.rendering||{}), ...(patch.rendering||{}) }, type:'hyperclass' }); }
export function normalizeHyperclassData(h={}) {
  const name=h.name||'Hyperclass';
  const size=h.size||{width:4,height:3.2};
  const titleWidth=Math.min(8.5,Math.max(4,name.length*0.105+0.9));
  return {
    ...h,
    type:'hyperclass',
    name,
    attributes:Array.isArray(h.attributes)?h.attributes:[],
    children:Array.isArray(h.children)?h.children:[],
    position:h.position||{x:0,y:0,z:0},
    size:{...size,width:Math.max(size.width||0,titleWidth),height:size.height||3.2},
    rendering:{
      ...(h.rendering||{}),
      class:{
        ...(h.rendering?.class||{}),
        material:h.rendering?.class?.material ?? 'metallic',
        metalness:h.rendering?.class?.metalness ?? 0.42,
        roughness:h.rendering?.class?.roughness ?? 0.28,
        emissiveIntensity:h.rendering?.class?.emissiveIntensity ?? 0.035
      }
    }
  };
}
export function validateHyperclassData(h){ const errors=[]; if(h?.type!=='hyperclass') errors.push('type must be hyperclass'); if(!Array.isArray(h?.children)) errors.push('children must be array'); return {valid:errors.length===0,errors,warnings:[]}; }
export function addChildData(hyperclassData, childId){ const children=new Set(hyperclassData.children||[]); children.add(childId); return { ...hyperclassData, children:[...children] }; }
export function removeChildData(hyperclassData, childId){ return { ...hyperclassData, children:(hyperclassData.children||[]).filter(id=>id!==childId) }; }
