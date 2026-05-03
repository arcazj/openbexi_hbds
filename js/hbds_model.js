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
