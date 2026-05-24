import * as THREE from 'three';
import { Loader as ClassLoader, createClass as createClassMesh, updateLabelFontSizes, createClassData, updateClassData, normalizeClassData, validateClassData } from './hbds_class.js?v=font-zoom-20260523a';
import { Loader as HyperClassLoader, createHyperClass, updateLabelFontSizes as updateHyperClassLabelFontSizes, createHyperclassData, updateHyperclassData, normalizeHyperclassData, validateHyperclassData, addChildData, removeChildData } from './hbds_hyperclass_class.js?v=font-zoom-20260523a';
import { createLinkBetweenClass, updateLinkFontSizes, recalculateAllLinks, clearLinkRegistry, createLinkData, updateLinkData, normalizeLinkData, validateLinkData } from './hbds_class_link.js?v=font-zoom-20260523a';
import { createLinkBetweenHyperClass, updateLinkFontSizes as updateHyperClassLinkFontSizes } from './hbds_hyperclass_link.js?v=font-zoom-20260523a';

export const DEFAULT_SCENE_SETTINGS = {
  background: '#eef2f6',
  ambient: 0.82,
  front: 0.16,
  sources: [
    { intensity: 0.14, direction: { x: -5, y: 7, z: 13 } },
    { intensity: 0.1, direction: { x: 8, y: -6, z: 10 } }
  ]
};

export const DEFAULT_LAYOUT_SETTINGS = {
  algorithm: 'grid'
};
export const DEFAULT_FONT_SETTINGS = {
  size: 12,
  family: 'Arial, sans-serif',
  bold: false,
  italic: false,
  underline: false
};
const DEFAULT_FIT_PADDING = 1.15;

let data = { hypergraph: { class: [], link: [] } };
const history=[];
const modelRuntime={ classById:new Map(), linkGroups:[], diagramGroup:null, draggableObjects:[] };
const GRID_GAP_X = 1.15;
const GRID_GAP_Y = 0.78;
const ROOT_GAP_X = 2.6;
const ROOT_GAP_Y = 2.2;
const MIN_HYPERCLASS_GAP = 0.8;
const CLASS_MIN_WIDTH = 1.35;
const CLASS_MIN_HEIGHT = 1.75;
const HYPERCLASS_MIN_WIDTH = 4;
const HYPERCLASS_MIN_HEIGHT = 3.2;
const HYPERCLASS_PADDING = { left: 0.65, right: 0.75, top: 0.9, bottom: 0.55 };
const HIDDEN_MODEL_VALUES = new Set([
  'models/hyperclasse_human_and_car.json',
  'models/hyperclasse_link_human_and_car.json'
]);
const CLASS_BODY_TYPES = new Set(['rectangle','image','shape']);
const CLASS_IMAGE_FITS = new Set(['contain','cover']);
const CLASS_SHAPE_TYPES = new Set([
  'roundedRectangle',
  'rectangle',
  'square',
  'circle',
  'ellipse',
  'diamond',
  'triangle',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'capsule',
  'parallelogram',
  'trapezoid',
  'invertedTrapezoid',
  'document',
  'paperTape',
  'predefinedProcess',
  'manualInput',
  'database',
  'directAccessStorage',
  'internalStorage',
  'display',
  'storedData',
  'triangleDown',
  'circlePlus',
  'circleX',
  'offPageConnector',
  'braceLeft',
  'braceRight',
  'textLines',
  'bracketedList',
  'table',
  'tableColumns',
  'tableRows'
]);
const clone=(v)=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
const nextId=(p)=>`${p}_${Math.random().toString(36).slice(2,8)}`;
export const getData=()=>data;
export function normalizeData(inputData){
  const m=clone(inputData||{}); m.hypergraph=m.hypergraph||{};
  m.metadata=normalizeModelMetadata({
    ...(m.layout!==undefined?{layout:m.layout}:{}),
    ...(m.sceneSettings!==undefined?{sceneSettings:m.sceneSettings}:{}),
    ...(m.hypergraph.metadata||{}),
    ...(m.metadata||{})
  });
  const legacyRelationships=Array.isArray(m.hypergraph.relationships)
    ? m.hypergraph.relationships
    : (Array.isArray(m.hypergraph.relationship)?m.hypergraph.relationship:[]);
  const normalizedLegacyLinks=legacyRelationships.map(rel=>({
    ...rel,
    sourceClassId:rel.sourceClassId??rel.source,
    targetClassId:rel.targetClassId??rel.target,
    name:rel.name||rel.label||''
  }));
  if(Array.isArray(m.hypergraph.hyperclass) && (!Array.isArray(m.hypergraph.class) || m.hypergraph.class.length===0)){
    const flattened=[];
    for(const rawHyperclass of m.hypergraph.hyperclass){
      const hyperclass={...rawHyperclass,type:'hyperclass',children:[]};
      delete hyperclass.classes;
      flattened.push(hyperclass);
      const nestedClasses=Array.isArray(rawHyperclass?.classes)?rawHyperclass.classes:[];
      for(const child of nestedClasses){
        const childNode={...child,attributes:Array.isArray(child.attributes)?child.attributes:child.specific_attributes||[],parentClassId:hyperclass.id};
        delete childNode.specific_attributes;
        flattened.push(childNode);
        hyperclass.children.push(childNode.id);
      }
    }
    if(Array.isArray(m.hypergraph.class)) flattened.push(...m.hypergraph.class);
    m.hypergraph.class=flattened;
    m.hypergraph.link=normalizedLegacyLinks.length
      ? normalizedLegacyLinks
      : (Array.isArray(m.hypergraph.link)?m.hypergraph.link:[]);
  }
  m.hypergraph.class=Array.isArray(m.hypergraph.class)?m.hypergraph.class:[];
  m.hypergraph.link=normalizedLegacyLinks.length
    ? normalizedLegacyLinks
    : (Array.isArray(m.hypergraph.link)?m.hypergraph.link:[]);
  const ids=new Set(); const byId=new Map();
  m.hypergraph.class=m.hypergraph.class.map((n,i)=>{let x=clone(n||{}); if(x.type==='hyperclass') x=normalizeHyperclassData(x); else x=normalizeClassData(x); x.id=x.id??nextId('node'); while(ids.has(x.id)) x.id=nextId('node'); ids.add(x.id); x.name=x.name||`Node ${i+1}`; x.attributes=Array.isArray(x.attributes)?x.attributes:[]; if(x.type==='hyperclass') x.children=Array.isArray(x.children)?x.children:[]; byId.set(x.id,x); return x;});
  for(const n of m.hypergraph.class){ if(n.parentClassId && (!byId.has(n.parentClassId)||byId.get(n.parentClassId).type!=='hyperclass')) n.parentClassId=null; }
  for(const h of m.hypergraph.class.filter(n=>n.type==='hyperclass')){ h.children=(h.children||[]).filter(id=>byId.has(id)); for(const cid of h.children){byId.get(cid).parentClassId=h.id;} }
  m.hypergraph.link=m.hypergraph.link.map(l=>normalizeLinkData(l)).filter(l=>l.sourceClassId&&l.targetClassId&&byId.has(l.sourceClassId)&&byId.has(l.targetClassId));
  return m;
}
export function normalizeModelMetadata(metadata={}){
  const source=metadata&&typeof metadata==='object'?metadata:{};
  return {
    ...source,
    sceneSettings:normalizeSceneSettings(source.sceneSettings || source.scene || source.settings),
    layout:normalizeLayoutSettings(source.layout),
    font:normalizeFontSettings(source.font || source.fontSettings || source.labelFont)
  };
}
export function normalizeSceneSettings(settings={}){
  const source=settings&&typeof settings==='object'?settings:{};
  const legacySourceOne=source.sourceOne || source.keyLight || {};
  const legacySourceTwo=source.sourceTwo || source.fillLight || {};
  const sources=Array.isArray(source.sources)&&source.sources.length
    ? source.sources
    : [
        {
          intensity:source.key ?? legacySourceOne.intensity,
          direction:legacySourceOne.direction || { x:source.keyX, y:source.keyY, z:source.keyZ }
        },
        {
          intensity:source.fill ?? legacySourceTwo.intensity,
          direction:legacySourceTwo.direction || { x:source.fillX, y:source.fillY, z:source.fillZ }
        }
      ];
  return {
    background:normalizeHexColor(source.background, DEFAULT_SCENE_SETTINGS.background),
    ambient:toFiniteNumber(source.ambient, DEFAULT_SCENE_SETTINGS.ambient),
    front:toFiniteNumber(source.front, DEFAULT_SCENE_SETTINGS.front),
    sources:[
      normalizeLightSource(sources[0], DEFAULT_SCENE_SETTINGS.sources[0]),
      normalizeLightSource(sources[1], DEFAULT_SCENE_SETTINGS.sources[1])
    ]
  };
}
export function normalizeLayoutSettings(layout={}){
  if(typeof layout==='string') return { algorithm:normalizeLayoutAlgorithm(layout) };
  const source=layout&&typeof layout==='object'?layout:{};
  const rootFitSource=hasFitMetricFields(source)?source:null;
  const fit=normalizeFitSettings(source.fit ?? source.fitMetrics ?? rootFitSource);
  const normalized={ ...source, algorithm:normalizeLayoutAlgorithm(source.algorithm) };
  delete normalized.fitMetrics;
  if(fit) normalized.fit=fit;
  else if('fit' in source) normalized.fit=null;
  return normalized;
}
export function normalizeFontSettings(font={},fallback=DEFAULT_FONT_SETTINGS){
  const source=font&&typeof font==='object'?font:{};
  const base=fallback&&typeof fallback==='object'?fallback:DEFAULT_FONT_SETTINGS;
  return {
    size:toPositiveNumber(source.size ?? source.fontSize ?? source.labelFontSize, base.size ?? DEFAULT_FONT_SETTINGS.size),
    family:normalizeFontFamily(source.family ?? source.fontFamily, base.family ?? DEFAULT_FONT_SETTINGS.family),
    bold:toBooleanFontValue(source.bold ?? source.fontWeight, base.bold ?? DEFAULT_FONT_SETTINGS.bold),
    italic:toBooleanFontValue(source.italic ?? source.fontStyle, base.italic ?? DEFAULT_FONT_SETTINGS.italic),
    underline:toBooleanFontValue(source.underline ?? source.textDecoration ?? source.textDecorationLine, base.underline ?? DEFAULT_FONT_SETTINGS.underline)
  };
}
export function getSceneSettings(currentData=data){
  return clone(normalizeSceneSettings(currentData?.metadata?.sceneSettings));
}
export function getLayoutSettings(currentData=data){
  return clone(normalizeLayoutSettings(currentData?.metadata?.layout));
}
export function getFontSettings(currentData=data){
  return clone(normalizeFontSettings(currentData?.metadata?.font));
}
export function setSceneSettings(sceneSettings, options={}){
  data=normalizeData({ ...data, metadata:{ ...(data.metadata||{}), sceneSettings } });
  if(options.applyContext!==false) applyDataMetadataToContext(options.context);
  if(options.refresh===true) refreshSceneFromData(options.context);
  return getSceneSettings();
}
export function setLayoutSettings(layoutSettings, options={}){
  data=normalizeData({ ...data, metadata:{ ...(data.metadata||{}), layout:layoutSettings } });
  if(options.applyContext!==false) applyDataMetadataToContext(options.context);
  if(options.refresh===true) refreshSceneFromData(options.context);
  return getLayoutSettings();
}
export function setFontSettings(fontSettings, options={}){
  data=normalizeData({ ...data, metadata:{ ...(data.metadata||{}), font:fontSettings } });
  if(options.applyContext!==false) applyDataMetadataToContext(options.context);
  if(options.refresh===true) refreshSceneFromData(options.context);
  return getFontSettings();
}
function normalizeLightSource(source={},fallback){
  const direction=source?.direction || {};
  return {
    intensity:toFiniteNumber(source?.intensity, fallback.intensity),
    direction:{
      x:toFiniteNumber(direction.x, fallback.direction.x),
      y:toFiniteNumber(direction.y, fallback.direction.y),
      z:toFiniteNumber(direction.z, fallback.direction.z)
    }
  };
}
function normalizeHexColor(value,fallback){
  const clean=String(value||'').trim();
  if(/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  if(/^#[0-9a-f]{3}$/i.test(clean)) return `#${clean.slice(1).split('').map(c=>c+c).join('')}`;
  return fallback;
}
function toFiniteNumber(value,fallback){
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
}
function toPositiveNumber(value,fallback){
  const number=toFiniteNumber(value,fallback);
  return number>0?number:fallback;
}
function normalizeFontFamily(value,fallback){
  const clean=String(value??'').trim();
  return clean||fallback||DEFAULT_FONT_SETTINGS.family;
}
function toBooleanFontValue(value,fallback=false){
  if(value===undefined||value===null||value==='') return Boolean(fallback);
  if(typeof value==='boolean') return value;
  if(typeof value==='number') return value>=600||value===1;
  const clean=String(value).trim().toLowerCase();
  if(['true','1','yes','bold','bolder','600','700','800','900','italic','underline'].includes(clean)) return true;
  if(['false','0','no','normal','none','lighter','400'].includes(clean)) return false;
  const numeric=Number(clean);
  if(Number.isFinite(numeric)) return numeric>=600||numeric===1;
  return Boolean(fallback);
}
function roundFitNumber(value){
  const number=Number(value);
  return Number.isFinite(number)?Number(number.toFixed(4)):0;
}
function hasFitMetricFields(source={}){
  return [
    'fitHeightDistance',
    'fitWidthDistance',
    'distance',
    'diagramWidth',
    'diagramHeight',
    'diagramDepth',
    'radius',
    'cameraAspect',
    'cameraFov',
    'padding'
  ].some(key=>source?.[key]!==undefined);
}
function normalizeFitSettings(fit){
  if(!fit || typeof fit!=='object') return null;
  const center=fit.center&&typeof fit.center==='object'
    ? {
        x:toFiniteNumber(fit.center.x,0),
        y:toFiniteNumber(fit.center.y,0),
        z:toFiniteNumber(fit.center.z,0)
      }
    : { x:0, y:0, z:0 };
  return {
    padding:toFiniteNumber(fit.padding,DEFAULT_FIT_PADDING),
    fitHeightDistance:toFiniteNumber(fit.fitHeightDistance ?? fit.heightDistance,0),
    fitWidthDistance:toFiniteNumber(fit.fitWidthDistance ?? fit.widthDistance,0),
    distance:toFiniteNumber(fit.distance,0),
    diagramWidth:toFiniteNumber(fit.diagramWidth ?? fit.width,0),
    diagramHeight:toFiniteNumber(fit.diagramHeight ?? fit.height,0),
    diagramDepth:toFiniteNumber(fit.diagramDepth ?? fit.depth,0),
    radius:toFiniteNumber(fit.radius,0),
    center,
    cameraAspect:toFiniteNumber(fit.cameraAspect ?? fit.aspect,1),
    cameraFov:toFiniteNumber(fit.cameraFov ?? fit.fov,50)
  };
}
function normalizeLayoutAlgorithm(value){
  const clean=String(value||'none').toLowerCase();
  return ['none','grid','hierarchy','radial'].includes(clean)?clean:'none';
}
function applyDataMetadataToContext(context){
  if(!context) return;
  context.applyModelSceneSettings?.(getSceneSettings());
  context.applyModelLayoutSettings?.(getLayoutSettings());
  context.applyModelFontSettings?.(getFontSettings());
  applyFitMetadataToContext(context,{ updateOverview:true, preserveMetadata:true });
}
export function validateData(currentData=data){
  const e=[],w=[];
  const hg=currentData?.hypergraph;
  if(!Array.isArray(hg?.class)) e.push('missing hypergraph.class');
  if(!Array.isArray(hg?.link)) e.push('missing hypergraph.link');
  const ids=new Set();
  const byId=new Map();
  for(const c of hg?.class||[]){
    if(ids.has(c.id)) e.push(`duplicate class id ${c.id}`);
    ids.add(c.id);
    byId.set(c.id,c);
    if(!Array.isArray(c.attributes)) e.push(`invalid attributes for ${c.id}`);
    validateClassBodyRendering(c,w);
  }
  const lids=new Set();
  for(const l of hg?.link||[]){
    if(l.id&&lids.has(l.id)) e.push(`duplicate link id ${l.id}`);
    if(l.id) lids.add(l.id);
    if(!byId.has(l.sourceClassId)) e.push(`missing link source ${l.sourceClassId}`);
    if(!byId.has(l.targetClassId)) e.push(`missing link target ${l.targetClassId}`);
  }
  return {valid:e.length===0,errors:e,warnings:w};
}
function validateClassBodyRendering(node,warnings){
  const renderingClass=node?.rendering?.class||{};
  const hasBodyFields=['bodyType','imageSrc','imageFit','shapeType'].some(key=>renderingClass[key]!==undefined);
  if(node?.type==='hyperclass'){
    if(hasBodyFields) warnings.push(`hyperclass ${node.id} ignores image/shape body rendering fields`);
    return;
  }
  const bodyType=renderingClass.bodyType;
  if(bodyType!==undefined&&!CLASS_BODY_TYPES.has(bodyType)){
    warnings.push(`class ${node.id} has unsupported bodyType ${bodyType}`);
    return;
  }
  if(bodyType==='image'){
    if(!renderingClass.imageSrc) warnings.push(`class ${node.id} image body is missing imageSrc`);
    else if(!isAllowedClassImageSource(renderingClass.imageSrc)) warnings.push(`class ${node.id} imageSrc should be a PNG under ./images or an http(s) URL`);
    if(renderingClass.imageFit!==undefined&&!CLASS_IMAGE_FITS.has(renderingClass.imageFit)) warnings.push(`class ${node.id} has unsupported imageFit ${renderingClass.imageFit}`);
  }
  if(bodyType==='shape'&&renderingClass.shapeType!==undefined&&!CLASS_SHAPE_TYPES.has(renderingClass.shapeType)){
    warnings.push(`class ${node.id} has unsupported shapeType ${renderingClass.shapeType}`);
  }
}
function isAllowedClassImageSource(value){
  const clean=String(value||'').trim();
  if(/^https?:\/\//i.test(clean)||/^data:image\/png[;,]/i.test(clean)) return true;
  const normalized=clean.replace(/\\/g,'/').replace(/^\.\//,'');
  return normalized.toLowerCase().startsWith('images/')&&/\.png(?:[?#].*)?$/i.test(normalized);
}
export function refreshSceneFromData(context){ if(!context) return; const {scene,setDiagramGroup,diagramGroup,setDragControls,dragControls,draggableObjects=[]}=context; const modelFont=getFontSettings(); clearLinkRegistry(); if(diagramGroup){scene?.remove(diagramGroup); diagramGroup.traverse(o=>{if(o.geometry) o.geometry.dispose?.(); if(o.material) o.material.dispose?.(); if(o.isCSS2DObject) o.element?.remove?.();});}
  if(dragControls){dragControls.dispose(); setDragControls?.(null);} const dg=new THREE.Group(); scene?.add(dg); setDiagramGroup?.(dg); modelRuntime.diagramGroup=dg; modelRuntime.classById.clear(); modelRuntime.linkGroups=[];
  for(const cd of data.hypergraph.class){ const renderData={...cd,modelFont}; const r=cd.type==='hyperclass'?createHyperClass(null,renderData):createClassMesh(renderData); const m=r.classMesh; m.visible=cd.visible!==false&&cd.rendering?.visible!==false; m.userData={...m.userData,hbdsId:cd.id,modelData:clone(cd),isClassLike:true,isHyperClass:cd.type==='hyperclass',isHbdsClass:true,isLocked:cd.locked===true}; dg.add(m); modelRuntime.classById.set(cd.id,m);}
  for(const cd of data.hypergraph.class){
    const node=modelRuntime.classById.get(cd.id);
    if(!node) continue;
    const p=cd.position||{x:0,y:0,z:0};
    if(cd.parentClassId){
      const parent=modelRuntime.classById.get(cd.parentClassId);
      if(parent){
        const parentWorld=new THREE.Vector3();
        parent.getWorldPosition(parentWorld);
        parent.add(node);
        node.position.set((p.x||0)-parentWorld.x,(p.y||0)-parentWorld.y,(p.z||0)-parentWorld.z);
        continue;
      }
    }
    node.position.set(p.x||0,p.y||0,p.z||0);
  }
  for(const ld of data.hypergraph.link){ const s=modelRuntime.classById.get(ld.sourceClassId), t=modelRuntime.classById.get(ld.targetClassId); if(!s||!t) continue; const renderLinkData={...ld,modelFont}; const r=(s.userData.isHyperClass||t.userData.isHyperClass)?createLinkBetweenHyperClass(dg,s,t,renderLinkData):createLinkBetweenClass(renderLinkData,modelRuntime.classById); if(!r) continue; r.linkGroup.visible=ld.visible!==false&&ld.rendering?.visible!==false; r.linkGroup.userData={...r.linkGroup.userData,linkData:clone(renderLinkData),sourceClassId:ld.sourceClassId,targetClassId:ld.targetClassId,isHBDSLink:true,isHbdsLink:true}; dg.add(r.linkGroup); modelRuntime.linkGroups.push(r.linkGroup);}
  draggableObjects.length=0; for(const cd of data.hypergraph.class){ const o=modelRuntime.classById.get(cd.id); if(o&&o.visible!==false&&!o.userData?.isLocked) draggableObjects.push(o); }
  modelRuntime.draggableObjects=draggableObjects;
  context.setupDragControls?.(); recalculateAllLinks(); updateLabelFontSizes(context.camera, context.renderer); updateHyperClassLabelFontSizes(context.camera, context.renderer); updateLinkFontSizes(context.camera, context.renderer); updateHyperClassLinkFontSizes(context.camera, context.renderer); context.renderOnce?.(); }
export function updateLayoutFromData(context){ recalculateAllLinks(); updateLabelFontSizes(context.camera, context.renderer); updateHyperClassLabelFontSizes(context.camera, context.renderer); updateLinkFontSizes(context.camera, context.renderer); updateHyperClassLinkFontSizes(context.camera, context.renderer); context.renderOnce?.(); }
export function updateSceneLabelScales(context){ if(!context?.camera) return; updateLabelFontSizes(context.camera, context.renderer); updateHyperClassLabelFontSizes(context.camera, context.renderer); updateLinkFontSizes(context.camera, context.renderer); updateHyperClassLinkFontSizes(context.camera, context.renderer); context.renderOnce?.(); }
export function refreshDiagramBoundsAndCamera(context, options={}){
  if(!context?.diagramGroup) return null;
  const box=new THREE.Box3().setFromObject(context.diagramGroup);
  if(box.isEmpty()){
    context.diagramGroup.userData.boundingBox=null;
    context.diagramGroup.userData.boundingSphere=null;
    return null;
  }
  const sphere=box.getBoundingSphere(new THREE.Sphere());
  context.diagramGroup.userData.boundingBox=box.clone();
  context.diagramGroup.userData.boundingSphere=sphere.clone();
  if(options.fitToView && context.camera){
    const padding=options.padding??1.2;
    const fovR=context.camera.fov*Math.PI/180;
    const dist=Math.abs((sphere.radius*padding)/Math.sin(fovR/2));
    context.camera.position.set(sphere.center.x,sphere.center.y,sphere.center.z+dist);
    context.camera.lookAt(sphere.center);
    context.orbitControls?.target.copy(sphere.center);
    context.orbitControls?.update?.();
    context.setCamera2D?.();
    updateFitMetadataFromContext(context,{padding});
  }
  context.renderOnce?.();
  return {box,sphere};
}
export function fitModelToCanvas(context, options = {}) {
  if (!context?.diagramGroup || !context?.camera) return null;
  const box = new THREE.Box3().setFromObject(context.diagramGroup);
  if (box.isEmpty()) return null;
  const metrics = calculateFitMetrics(box, context.camera, options);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = Math.max(metrics.distance, 1);
  context.diagramGroup.userData.boundingBox = box.clone();
  context.diagramGroup.userData.boundingSphere = sphere.clone();
  context.orbitControls?.target.copy(sphere.center);
  context.camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + dist);
  context.camera.lookAt(sphere.center);
  context.camera.updateProjectionMatrix();
  context.orbitControls?.update?.();
  context.renderOnce?.();
  if (options.updateOverview) updateModelOverview(context);
  saveFitMetadata(metrics);
  return { box, sphere, fit: metrics };
}

export function applyFitMetadataToContext(context, options = {}) {
  if (!context?.camera) return false;
  const fit = normalizeFitSettings(options.fit ?? getLayoutSettings().fit);
  if (!hasUsableFitSettings(fit)) return false;
  const center = new THREE.Vector3(fit.center.x, fit.center.y, fit.center.z);
  const storedDistance = fit.distance > 0
    ? fit.distance
    : (fit.fitHeightDistance > 0 ? fit.fitHeightDistance : (fit.fitWidthDistance > 0 ? fit.fitWidthDistance : 1));
  if (Number.isFinite(fit.cameraFov) && fit.cameraFov > 1 && options.applyFov !== false) {
    context.camera.fov = fit.cameraFov;
  }
  context.orbitControls?.target.copy(center);
  context.camera.position.set(center.x, center.y, center.z + storedDistance);
  context.camera.lookAt(center);
  context.camera.updateProjectionMatrix();
  context.orbitControls?.update?.();
  updateSceneLabelScales(context);
  context.renderOnce?.();
  if (options.updateOverview) updateModelOverview(context);
  if (options.preserveMetadata !== true) saveFitMetadata(fit);
  return true;
}

function calculateFitMetrics(box, camera, options = {}) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const size = box.getSize(new THREE.Vector3());
  const previousFit = getLayoutSettings().fit || {};
  const padding = options.padding ?? previousFit.padding ?? DEFAULT_FIT_PADDING;
  const fovR = camera.fov * Math.PI / 180;
  const fitHeightDistance = (sphere.radius * padding) / Math.tan(fovR / 2);
  const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 1e-6);
  const distance = Math.max(fitHeightDistance, fitWidthDistance, 1);
  return {
    padding: roundFitNumber(padding),
    fitHeightDistance: roundFitNumber(fitHeightDistance),
    fitWidthDistance: roundFitNumber(fitWidthDistance),
    distance: roundFitNumber(distance),
    diagramWidth: roundFitNumber(size.x),
    diagramHeight: roundFitNumber(size.y),
    diagramDepth: roundFitNumber(size.z),
    radius: roundFitNumber(sphere.radius),
    center: {
      x: roundFitNumber(sphere.center.x),
      y: roundFitNumber(sphere.center.y),
      z: roundFitNumber(sphere.center.z)
    },
    cameraAspect: roundFitNumber(camera.aspect),
    cameraFov: roundFitNumber(camera.fov)
  };
}

function saveFitMetadata(fit) {
  if (!fit) return getLayoutSettings();
  return setLayoutSettings({ ...getLayoutSettings(), fit }, { applyContext: false });
}

function updateFitMetadataFromContext(context, options = {}) {
  if (!context?.diagramGroup || !context?.camera) return getLayoutSettings();
  const box = new THREE.Box3().setFromObject(context.diagramGroup);
  if (box.isEmpty()) return getLayoutSettings();
  const fit = calculateFitMetrics(box, context.camera, options);
  const center = context.orbitControls?.target
    ? context.orbitControls.target.clone()
    : box.getCenter(new THREE.Vector3());
  const cameraDistance = context.camera.position.distanceTo(center);
  fit.center = {
    x: roundFitNumber(center.x),
    y: roundFitNumber(center.y),
    z: roundFitNumber(center.z)
  };
  fit.distance = roundFitNumber(cameraDistance);
  return saveFitMetadata(fit).fit;
}

function hasUsableFitSettings(fit) {
  return Boolean(fit && (fit.distance > 0 || fit.fitHeightDistance > 0 || fit.fitWidthDistance > 0));
}

export function isPointerOverInteractiveObject(event, context) {
  if (!context?.camera || !context?.diagramGroup || !context?.renderer?.domElement) return false;
  const rect = context.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, context.camera);
  const hits = raycaster.intersectObjects(context.diagramGroup.children, true);
  return hits.some(hit => hit.object?.parent?.userData?.isClassLike || hit.object?.userData?.isClassLike);
}

export function panCameraByScreenDelta(context, dx, dy) {
  if (!context?.camera || !context?.orbitControls || !context?.renderer?.domElement) return;
  const distance = context.camera.position.distanceTo(context.orbitControls.target);
  const fov = context.camera.fov * Math.PI / 180;
  const worldHeight = 2 * Math.tan(fov / 2) * distance;
  const worldWidth = worldHeight * context.camera.aspect;
  const dxWorld = -dx / context.renderer.domElement.clientWidth * worldWidth;
  const dyWorld = dy / context.renderer.domElement.clientHeight * worldHeight;
  context.camera.position.x += dxWorld;
  context.camera.position.y += dyWorld;
  context.orbitControls.target.x += dxWorld;
  context.orbitControls.target.y += dyWorld;
  context.orbitControls.update();
}

export function initModelOverview(context) {
  const canvas = document.getElementById('model-overview-canvas');
  if (!canvas) return;
  canvas.width = Math.max(1, canvas.clientWidth || 180);
  canvas.height = Math.max(1, canvas.clientHeight || 140);
  updateModelOverview(context);
}

function getOverviewTransform(context, canvas) {
  const box = new THREE.Box3().setFromObject(context.diagramGroup);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const min = box.min.clone();
  const max = box.max.clone();
  const pad = 12;
  const scaleX = (canvas.width - 2 * pad) / Math.max(size.x, 1e-6);
  const scaleY = (canvas.height - 2 * pad) / Math.max(size.y, 1e-6);
  const scale = Math.min(scaleX, scaleY);
  return { min, max, pad, scale, box };
}

function worldToOverview(pos, transform, canvas) {
  const x = transform.pad + (pos.x - transform.min.x) * transform.scale;
  const y = canvas.height - transform.pad - (pos.y - transform.min.y) * transform.scale;
  return { x, y };
}
export function updateModelOverview(context){
  const canvas = document.getElementById('model-overview-canvas');
  if (!canvas || !context?.diagramGroup) return;
  canvas.width = Math.max(1, canvas.clientWidth || 180);
  canvas.height = Math.max(1, canvas.clientHeight || 140);
  const transform = getOverviewTransform(context, canvas);
  if (!transform) return;
  context.diagramGroup.userData.boundingBox = transform.box.clone();
  context.diagramGroup.userData.boundingSphere = transform.box.getBoundingSphere(new THREE.Sphere());
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fbfbfb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawOverviewLinks(ctx, transform, context);
  drawOverviewHyperclasses(ctx, transform, context);
  drawOverviewClasses(ctx, transform, context);
  updateOverviewViewport(context, transform);
}
export function setupCanvasPanControls(context){
  const host = context?.css2DRenderer?.domElement || context?.renderer?.domElement;
  if (!host || !context?.camera) return;
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;
  host.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const is3D = document.getElementById('view-toggle')?.checked;
    const inOverviewPanel = event.target instanceof Element
      ? Boolean(event.target.closest('#model-overview'))
      : false;
    const editable = document.getElementById('editable-toggle')?.checked ?? true;
    if (is3D || inOverviewPanel) return;
    if (editable && isPointerOverInteractiveObject(event, context)) return;
    event.preventDefault?.();
    isPanning = true;
    lastX = event.clientX;
    lastY = event.clientY;
    host.style.cursor = 'grabbing';
    host.setPointerCapture?.(event.pointerId);
  });
  host.addEventListener('pointermove', (event) => {
    if (!isPanning) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    panCameraByScreenDelta(context, dx, dy);
    context.renderOnce?.();
    updateModelOverview(context);
  });
  const stopPan = (event) => {
    if (!isPanning) return;
    isPanning = false;
    host.style.cursor = '';
    host.releasePointerCapture?.(event.pointerId);
  };
  host.addEventListener('pointerup', stopPan);
  host.addEventListener('pointercancel', stopPan);
}
export function drawOverviewHyperclasses(ctx, transform, context) {
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  context.diagramGroup.traverse(obj => {
    if (!obj.userData?.isHyperClass) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const canvas = ctx.canvas;
    const p1 = worldToOverview(new THREE.Vector3(box.min.x, box.max.y, 0), transform, canvas);
    const p2 = worldToOverview(new THREE.Vector3(box.max.x, box.min.y, 0), transform, canvas);
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
  });
}
export function drawOverviewClasses(ctx, transform, context) {
  ctx.fillStyle = '#1f6feb';
  context.diagramGroup.traverse(obj => {
    if (!obj.userData?.isClassLike || obj.userData?.isHyperClass) return;
    const p = worldToOverview(obj.getWorldPosition(new THREE.Vector3()), transform, ctx.canvas);
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  });
}
export function drawOverviewLinks(ctx, transform, context) {
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  const byId = new Map();
  context.diagramGroup.traverse(obj => {
    if (obj.userData?.hbdsId) byId.set(obj.userData.hbdsId, obj);
  });
  data.hypergraph.link.forEach(l => {
    const s = byId.get(l.sourceClassId);
    const t = byId.get(l.targetClassId);
    if (!s || !t) return;
    const ps = worldToOverview(s.getWorldPosition(new THREE.Vector3()), transform, ctx.canvas);
    const pt = worldToOverview(t.getWorldPosition(new THREE.Vector3()), transform, ctx.canvas);
    ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
  });
}
export function updateOverviewViewport(context, transform) {
  const viewport = document.getElementById('model-overview-viewport');
  if (!viewport || !context?.camera || !context?.orbitControls) return;
  const canvas = document.getElementById('model-overview-canvas');
  const distance = context.camera.position.distanceTo(context.orbitControls.target);
  const fov = context.camera.fov * Math.PI / 180;
  const visibleHeight = 2 * Math.tan(fov / 2) * distance;
  const visibleWidth = visibleHeight * context.camera.aspect;
  const left = context.orbitControls.target.x - visibleWidth / 2;
  const right = context.orbitControls.target.x + visibleWidth / 2;
  const top = context.orbitControls.target.y + visibleHeight / 2;
  const bottom = context.orbitControls.target.y - visibleHeight / 2;
  const p1 = worldToOverview(new THREE.Vector3(left, top, 0), transform, canvas);
  const p2 = worldToOverview(new THREE.Vector3(right, bottom, 0), transform, canvas);
  viewport.style.left = `${Math.min(p1.x, p2.x)}px`;
  viewport.style.top = `${Math.min(p1.y, p2.y)}px`;
  viewport.style.width = `${Math.abs(p2.x - p1.x)}px`;
  viewport.style.height = `${Math.abs(p2.y - p1.y)}px`;
  setupOverviewViewportDrag(context, transform);
}
let overviewDragBound = false;
function overviewToWorld(x, y, transform, canvas) {
  const worldX = transform.min.x + (x - transform.pad) / transform.scale;
  const worldY = transform.min.y + ((canvas.height - y) - transform.pad) / transform.scale;
  return { x: worldX, y: worldY };
}
function setupOverviewViewportDrag(context, transform) {
  if (overviewDragBound) return;
  const viewport = document.getElementById('model-overview-viewport');
  const canvas = document.getElementById('model-overview-canvas');
  if (!viewport || !canvas) return;
  let dragging = false;
  viewport.addEventListener('pointerdown', (e) => {
    dragging = true;
    viewport.setPointerCapture?.(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging || !context?.camera || !context?.orbitControls) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const world = overviewToWorld(cx, cy, getOverviewTransform(context, canvas), canvas);
    const dx = world.x - context.orbitControls.target.x;
    const dy = world.y - context.orbitControls.target.y;
    context.orbitControls.target.set(world.x, world.y, context.orbitControls.target.z);
    context.camera.position.x += dx;
    context.camera.position.y += dy;
    context.orbitControls.update();
    context.renderOnce?.();
    updateModelOverview(context);
  });
  const stop = (e) => {
    dragging = false;
    viewport.releasePointerCapture?.(e.pointerId);
  };
  viewport.addEventListener('pointerup', stop);
  viewport.addEventListener('pointercancel', stop);
  overviewDragBound = true;
}
export function commitDataChange(operationName, updater, options={}){ const before=clone(data); const result=updater(data); data=normalizeData(data); const v=validateData(data); if(!v.valid && options.rollbackOnError!==false){ data=before; throw new Error(`Invalid data after ${operationName}: ${v.errors.join('; ')}`);} if(options.refresh!==false) refreshSceneFromData(options.context); if(options.optimizeLayout===true) updateLayoutFromData(options.context); if(options.saveHistory!==false) history.push({operationName,before,after:clone(data)}); return result; }
export function setData(nextData, options={}){ data=normalizeData(nextData); const v=validateData(data); if(!v.valid) throw new Error(v.errors.join('; ')); if(options.refresh!==false) refreshSceneFromData(options.context); applyDataMetadataToContext(options.context); return getData(); }
export function resetData(options={}){ return setData({metadata:{layout:DEFAULT_LAYOUT_SETTINGS,sceneSettings:DEFAULT_SCENE_SETTINGS,font:DEFAULT_FONT_SETTINGS},hypergraph:{class:[],link:[]}},options); }
export function readClass(id){return data.hypergraph.class.find(c=>c.id===id)||null;} export const readHyperclass=readClass;
export function createClass(input,options={}){ return commitDataChange('createClass',d=>{ const c=createClassData(input); d.hypergraph.class.push(c); if(c.parentClassId) addChildToHyperclass(c.parentClassId,c.id,{...options,refresh:false,saveHistory:false}); return c;},options); }
export function updateClass(id,patch,options={}){ return commitDataChange('updateClass',d=>{ const i=d.hypergraph.class.findIndex(c=>c.id===id&&c.type!=='hyperclass'); if(i<0) throw new Error('class not found'); d.hypergraph.class[i]=updateClassData(d.hypergraph.class[i],patch); return d.hypergraph.class[i];},options); }
export function deleteLinksForNode(id,options={}){ return commitDataChange('deleteLinksForNode',d=>{ d.hypergraph.link=d.hypergraph.link.filter(l=>l.sourceClassId!==id&&l.targetClassId!==id);},options); }
export function deleteClass(id,options={}){ return commitDataChange('deleteClass',d=>{ const node=d.hypergraph.class.find(c=>c.id===id); if(!node) return false; d.hypergraph.class=d.hypergraph.class.filter(c=>c.id!==id); d.hypergraph.class.filter(c=>c.type==='hyperclass').forEach(h=>h.children=removeChildData(h,id).children); d.hypergraph.link=d.hypergraph.link.filter(l=>l.sourceClassId!==id&&l.targetClassId!==id); return true;},options); }
export function createHyperclass(input,options={}){ return commitDataChange('createHyperclass',d=>{ const h=createHyperclassData(input); d.hypergraph.class.push(h); if(h.parentClassId) addChildToHyperclass(h.parentClassId,h.id,{...options,refresh:false,saveHistory:false}); return h;},options); }
export function updateHyperclass(id,patch,options={}){ return commitDataChange('updateHyperclass',d=>{ const i=d.hypergraph.class.findIndex(c=>c.id===id&&c.type==='hyperclass'); if(i<0) throw new Error('hyperclass not found'); d.hypergraph.class[i]=updateHyperclassData(d.hypergraph.class[i],patch); return d.hypergraph.class[i];},options); }
export function deleteHyperclass(id,options={cascade:true}){ return commitDataChange('deleteHyperclass',d=>{ const ids=new Set([id]); if(options.cascade!==false){ let changed=true; while(changed){changed=false; for(const c of d.hypergraph.class){ if(c.parentClassId&&ids.has(c.parentClassId)&&!ids.has(c.id)){ids.add(c.id);changed=true;}} } d.hypergraph.class=d.hypergraph.class.filter(c=>!ids.has(c.id)); } else d.hypergraph.class=d.hypergraph.class.filter(c=>c.id!==id).map(c=>c.parentClassId===id?{...c,parentClassId:null}:c); d.hypergraph.link=d.hypergraph.link.filter(l=>!ids.has(l.sourceClassId)&&!ids.has(l.targetClassId)); d.hypergraph.class.filter(c=>c.type==='hyperclass').forEach(h=>h.children=(h.children||[]).filter(cid=>!ids.has(cid))); return true;},options); }
export function addChildToHyperclass(parentId,childId,options={}){ return commitDataChange('addChild',d=>{ const p=d.hypergraph.class.find(c=>c.id===parentId&&c.type==='hyperclass'); const c=d.hypergraph.class.find(c=>c.id===childId); if(!p||!c) throw new Error('invalid parent/child'); p.children=addChildData(p,childId).children; c.parentClassId=parentId; },options);}
export function removeChildFromHyperclass(parentId,childId,options={}){ return commitDataChange('removeChild',d=>{ const p=d.hypergraph.class.find(c=>c.id===parentId&&c.type==='hyperclass'); const c=d.hypergraph.class.find(c=>c.id===childId); if(!p||!c) return false; p.children=removeChildData(p,childId).children; if(c.parentClassId===parentId) c.parentClassId=null; return true;},options);}
export const moveChildToHyperclass=(cid,pid,options={})=>commitDataChange('moveChild',d=>{const c=d.hypergraph.class.find(n=>n.id===cid); if(!c) throw new Error('child not found'); d.hypergraph.class.filter(n=>n.type==='hyperclass').forEach(h=>h.children=(h.children||[]).filter(x=>x!==cid)); if(pid){const p=d.hypergraph.class.find(n=>n.id===pid&&n.type==='hyperclass'); if(!p) throw new Error('parent not hyperclass'); p.children.push(cid); c.parentClassId=pid;} else c.parentClassId=null;},options);
export function readAttributes(ownerId){return readClass(ownerId)?.attributes||[];}
export function createAttribute(ownerId,attributeInput,options={}){ return commitDataChange('createAttribute',d=>{ const o=d.hypergraph.class.find(c=>c.id===ownerId); if(!o) throw new Error('owner not found'); o.attributes=o.attributes||[]; if(o.attributes.length&&typeof o.attributes[0]==='string') o.attributes.push(attributeInput?.name||String(attributeInput)); else o.attributes.push(typeof attributeInput==='string'?attributeInput:{id:attributeInput?.id||nextId('att'),name:attributeInput?.name||'attribute'}); },options);}
export const updateAttribute=(ownerId,key,patch,options={})=>commitDataChange('updateAttribute',d=>{const o=d.hypergraph.class.find(c=>c.id===ownerId); if(!o) throw new Error('owner not found'); const i=typeof key==='number'?key:o.attributes.findIndex(a=>typeof a==='string'?a===key:a.name===key||a.id===key); if(i<0) throw new Error('attribute not found'); const current=o.attributes[i]; if(typeof current==='string'){ if(patch&&typeof patch==='object'){ const keys=Object.keys(patch).filter(k=>k!=='name'); o.attributes[i]=keys.length?{...patch,name:patch.name??current}:{name:patch.name??current}; } else o.attributes[i]=patch?.name||patch; } else o.attributes[i]={...current,...(typeof patch==='string'?{name:patch}:patch)};},options);
export const deleteAttribute=(ownerId,key,options={})=>commitDataChange('deleteAttribute',d=>{const o=d.hypergraph.class.find(c=>c.id===ownerId); if(!o) throw new Error('owner not found'); const i=typeof key==='number'?key:o.attributes.findIndex(a=>typeof a==='string'?a===key:a.name===key||a.id===key); if(i>=0) o.attributes.splice(i,1);},options);
export const readLink=(idOrPred)=>typeof idOrPred==='function'?data.hypergraph.link.find(idOrPred)||null:data.hypergraph.link.find(l=>l.id===idOrPred)||null;
export const createLink=(input,options={})=>commitDataChange('createLink',d=>{const l=createLinkData(input); const byId=new Map(d.hypergraph.class.map(c=>[c.id,c])); const v=validateLinkData(l,byId); if(!v.valid) throw new Error(v.errors.join('; ')); d.hypergraph.link.push(l); return l;},options);
export const updateLink=(idOrPred,patch,options={})=>commitDataChange('updateLink',d=>{const i=d.hypergraph.link.findIndex(l=>typeof idOrPred==='function'?idOrPred(l):l.id===idOrPred); if(i<0) throw new Error('link not found'); d.hypergraph.link[i]=updateLinkData(d.hypergraph.link[i],patch);},options);
export const deleteLink=(idOrPred,options={})=>commitDataChange('deleteLink',d=>{d.hypergraph.link=d.hypergraph.link.filter(l=>!(typeof idOrPred==='function'?idOrPred(l):l.id===idOrPred||(idOrPred?.sourceClassId===l.sourceClassId&&idOrPred?.targetClassId===l.targetClassId)));},options);
async function loadModelData(modelName, options={}){
  const value=String(modelName||'').trim();
  const allowedBasePath=options.allowedBasePath==null?null:normalizeModelDirectoryPath(options.allowedBasePath);
  const defaultBasePath=normalizeModelDirectoryPath(options.defaultBasePath ?? allowedBasePath ?? 'models/');
  const resourcePath=normalizeModelResourcePath(value,defaultBasePath);
  if(allowedBasePath && !resourcePath.startsWith(allowedBasePath)){
    throw new Error(`Model path "${value}" is outside ${allowedBasePath}`);
  }
  return loadJsonResource(withCacheBust(`./${resourcePath}`),`Model not found: ${value}`);
}
export async function listAvailableModels(options='models/models_manifest.json', maybeModelsPath){
  const config=typeof options==='string'
    ? { manifestPath:options, modelsPath:maybeModelsPath ?? 'models/' }
    : (options||{});
  const modelsPath=normalizeModelDirectoryPath(config.modelsPath ?? 'models/');
  const manifestPath=config.manifestPath ?? `${modelsPath}models_manifest.json`;
  const hiddenValues=config.hiddenValues ?? (modelsPath==='models/'?[...HIDDEN_MODEL_VALUES]:[]);
  const hiddenSet=new Set(hiddenValues.map(value=>canonicalModelValue(value,modelsPath)));
  const manifestItems=await loadModelManifestItems(manifestPath,modelsPath);
  const discoveredItems=config.discover === false ? [] : await discoverModelDirectoryItems(modelsPath);
  return mergeModelItems({ hiddenValues:hiddenSet, defaultBasePath:modelsPath },manifestItems,discoveredItems);
}

async function loadModelManifestItems(manifestPath,defaultBasePath='models/'){
  try {
    const manifest=await loadJsonResource(withCacheBust(`./${manifestPath}`),`manifest not found: ${manifestPath}`);
    const items=Array.isArray(manifest?.models)?manifest.models:[];
    return items.filter(Boolean).map(item=>({
      value:normalizeModelResourcePath(item.value||item.path||item.id||'',defaultBasePath),
      label:item.label||item.name||item.value||'',
      description:item.description||'',
      tags:Array.isArray(item.tags)?item.tags:[]
    })).filter(item=>item.value);
  } catch {
    return [];
  }
}

async function discoverModelDirectoryItems(modelsPath){
  try {
    const normalizedPath=normalizeModelDirectoryPath(modelsPath);
    const text=await loadTextResource(withCacheBust(`./${normalizedPath}`));
    return extractModelFilesFromDirectoryHtml(text,normalizedPath).map(fileName=>({
      value:`${normalizedPath}${fileName}`,
      label:labelFromModelFile(fileName),
      description:`Model file: ${fileName}`,
      tags:['model']
    }));
  } catch {
    return [];
  }
}

function extractModelFilesFromDirectoryHtml(html,modelsPath){
  const files=new Set();
  const collect=href=>{
    try {
      const base=new URL(`./${modelsPath}`, globalThis.location?.href || import.meta.url);
      const url=new URL(href,base);
      const fileName=decodeURIComponent(url.pathname.split('/').pop()||'');
      if(/\.json$/i.test(fileName) && !/manifest\.json$/i.test(fileName)) files.add(fileName);
    } catch {}
  };

  if(typeof DOMParser!=='undefined'){
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('a[href]').forEach(link=>collect(link.getAttribute('href')));
  }
  for(const match of html.matchAll(/href=["']([^"']+\.json)["']/gi)) collect(match[1]);
  return [...files].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}

function mergeModelItems(options={},...groups){
  if(Array.isArray(options)){
    groups=[options,...groups];
    options={};
  }
  const hiddenValues=options.hiddenValues || HIDDEN_MODEL_VALUES;
  const defaultBasePath=normalizeModelDirectoryPath(options.defaultBasePath ?? 'models/');
  const byKey=new Map();
  for(const group of groups){
    for(const item of group){
      const key=canonicalModelValue(item.value,defaultBasePath);
      if(!key || hiddenValues.has(key) || byKey.has(key)) continue;
      byKey.set(key,item);
    }
  }
  return [...byKey.values()];
}

function normalizeModelDirectoryPath(path){
  const clean=String(path||'models/').trim().replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+/,'');
  if(!clean) return 'models/';
  return clean.endsWith('/')?clean:`${clean}/`;
}

function normalizeModelResourcePath(value,defaultBasePath='models/'){
  const basePath=normalizeModelDirectoryPath(defaultBasePath);
  const clean=String(value||'').trim().replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+/,'');
  if(!clean) return '';
  if(clean.split('/').includes('..')) throw new Error(`Unsupported model path: ${value}`);
  if(clean.includes('/') || /\.json$/i.test(clean)) return /\.json$/i.test(clean)?clean:`${clean}.json`;
  return `${basePath}${clean.replace(/\.json$/i,'')}.json`;
}

function canonicalModelValue(value,defaultBasePath='models/'){
  return normalizeModelResourcePath(value,defaultBasePath).toLowerCase();
}

function labelFromModelFile(fileName){
  return String(fileName||'')
    .replace(/\.json$/i,'')
    .replace(/[_-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/\b\w/g,char=>char.toUpperCase());
}
function withCacheBust(path){
  const separator=String(path).includes('?')?'&':'?';
  return `${path}${separator}v=${Date.now()}`;
}
async function loadJsonResource(path,message){
  try {
    return JSON.parse(await loadTextResource(path));
  } catch (error) {
    throw new Error(message || error?.message || String(error));
  }
}
async function loadTextResource(path){
  if(typeof fetch==='function'){
    const response=await fetch(path);
    if(!response.ok) throw new Error(`Request failed: ${path}`);
    return response.text();
  }
  if(typeof XMLHttpRequest==='function'){
    return new Promise((resolve,reject)=>{
      const request=new XMLHttpRequest();
      request.open('GET',path,true);
      request.onload=()=>request.status>=200&&request.status<300?resolve(request.responseText):reject(new Error(`Request failed: ${path}`));
      request.onerror=()=>reject(new Error(`Request failed: ${path}`));
      request.send();
    });
  }
  throw new Error('No browser request API available');
}
export async function loadAndRenderScene(modelName, context, options={}){
  const raw=await loadModelData(modelName,options);
  setData(raw,{context,refresh:true});
  const loaded=getData();
  const layoutAlgorithm=loaded?.metadata?.layout?.algorithm || 'none';
  if(options.autoApplyLayout!==false && layoutAlgorithm!=='none' && modelNeedsLayoutPlacement(loaded)){
    await optimizeAndRefreshLayout(context,{ algorithm:layoutAlgorithm });
  }
  applyFitMetadataToContext(context,{ updateOverview:true, preserveMetadata:true });
  return getData();
}

function modelNeedsLayoutPlacement(model){
  const nodes=Array.isArray(model?.hypergraph?.class)?model.hypergraph.class:[];
  if(!nodes.length) return false;
  return nodes.some(node=>{
    const p=node?.position;
    return !p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y));
  });
}
export function prepareSceneSnapshot(context, options={}){ if(options.updateFitMetadata!==false) updateFitMetadataFromContext(context,options); return getData(); }
export function saveScene(context, options={}){ const snapshot=prepareSceneSnapshot(context,options); const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=options.fileName||'hbds_saved_model.json'; a.click(); URL.revokeObjectURL(url); return snapshot; }
function getNodeSize(node){
  return getNodeBodySize(node);
}
function getNodeBodySize(node){
  const base=node?.size||{};
  const attrCount=Array.isArray(node?.attributes)?node.attributes.length:0;
  if(node?.type==='hyperclass'){
    return {
      width:Math.max(base.width||0,HYPERCLASS_MIN_WIDTH),
      height:Math.max(base.height||0,HYPERCLASS_MIN_HEIGHT)
    };
  }
  return {
    width:Math.max(base.width||0,CLASS_MIN_WIDTH),
    height:Math.max(base.height||0,CLASS_MIN_HEIGHT,0.55+attrCount*0.16)
  };
}
function getOptimizedHyperclassBaseSize(){
  return { width:HYPERCLASS_MIN_WIDTH, height:HYPERCLASS_MIN_HEIGHT };
}
function getNodeVisualMetrics(node){
  const body=getNodeBodySize(node);
  const attributeRight=getAttributeRightExtent(node);
  return {
    body,
    width:body.width+attributeRight,
    height:body.height,
    offsetX:attributeRight/2,
    offsetY:0,
    attributeRight
  };
}
function getAttributeRightExtent(node){
  const attributes=Array.isArray(node?.attributes)?node.attributes:[];
  if(!attributes.length) return 0;
  const cbW=node?.rendering?.attributes?.size?.width ?? 0.1;
  const longest=Math.max(...attributes.map((attribute,index)=>getAttributeDisplayName(attribute,index).length));
  const labelWidth=Math.min(2.2,Math.max(0.46,longest*0.055));
  return 0.25 + cbW*2 + 0.12 + labelWidth + 0.18;
}
function getAttributeDisplayName(attribute,index){
  if(typeof attribute==='string') return attribute;
  if(typeof attribute==='number' || typeof attribute==='boolean') return String(attribute);
  if(!attribute || typeof attribute!=='object') return `attribute${index+1}`;
  return String(attribute.name ?? attribute.label ?? attribute.title ?? attribute.id ?? `attribute${index+1}`);
}
function getGridDimensions(childCount){
  if(childCount<=1) return {cols:1,rows:1};
  if(childCount===2) return {cols:1,rows:2};
  if(childCount===3) return {cols:1,rows:3};
  if(childCount===4) return {cols:2,rows:2};
  if(childCount<=6) return {cols:2,rows:Math.ceil(childCount/2)};
  if(childCount<=9) return {cols:3,rows:Math.ceil(childCount/3)};
  if(childCount<=16) return {cols:4,rows:Math.ceil(childCount/4)};
  const cols=Math.ceil(Math.sqrt(childCount));
  return {cols,rows:Math.ceil(childCount/cols)};
}
function getChildrenByParent(nodes){
  const childrenByParent=new Map();
  nodes.forEach(n=>{ if(n.parentClassId){ const a=childrenByParent.get(n.parentClassId)||[]; a.push(n); childrenByParent.set(n.parentClassId,a); } });
  return childrenByParent;
}
function sortByName(a,b){
  return String(a.name).localeCompare(String(b.name));
}
function buildGridMetrics(items,metrics,options={}){
  const {cols,rows}=options.dimensions || getGridDimensions(items.length);
  const gapX=options.gapX ?? GRID_GAP_X;
  const gapY=options.gapY ?? GRID_GAP_Y;
  const colWidths=Array(cols).fill(0);
  const rowHeights=Array(rows).fill(0);
  items.forEach((item,index)=>{
    const col=index%cols;
    const row=Math.floor(index/cols);
    const metric=metrics.get(item.id) || getNodeVisualMetrics(item);
    colWidths[col]=Math.max(colWidths[col],metric.width);
    rowHeights[row]=Math.max(rowHeights[row],metric.height);
  });
  return {
    cols,
    rows,
    gapX,
    gapY,
    colWidths,
    rowHeights,
    width:colWidths.reduce((sum,width)=>sum+width,0)+Math.max(0,cols-1)*gapX,
    height:rowHeights.reduce((sum,height)=>sum+height,0)+Math.max(0,rows-1)*gapY
  };
}
function measureLayoutTree(node,childrenByParent,metrics){
  const kids=(childrenByParent.get(node.id)||[]).sort(sortByName);
  if(node.type!=='hyperclass' || kids.length===0){
    const metric=getNodeVisualMetrics(node);
    node.size=metric.body;
    metrics.set(node.id,metric);
    return metric;
  }

  kids.forEach(child=>measureLayoutTree(child,childrenByParent,metrics));
  const grid=buildGridMetrics(kids,metrics);
  const base=getOptimizedHyperclassBaseSize(node);
  node.size={
    width:Math.max(base.width,grid.width+HYPERCLASS_PADDING.left+HYPERCLASS_PADDING.right),
    height:Math.max(base.height,grid.height+HYPERCLASS_PADDING.top+HYPERCLASS_PADDING.bottom)
  };
  const metric=getNodeVisualMetrics(node);
  metrics.set(node.id,metric);
  return metric;
}
function placeMeasuredTree(node,cx,cy,childrenByParent,metrics){
  const kids=(childrenByParent.get(node.id)||[]).sort(sortByName);
  if(!node.position) node.position={x:0,y:0,z:0};
  node.position.x=cx;
  node.position.y=cy;
  node.position.z=0;
  if(node.type!=='hyperclass' || kids.length===0) return;

  const grid=buildGridMetrics(kids,metrics);
  const contentLeft=cx-node.size.width/2+HYPERCLASS_PADDING.left;
  const contentTop=cy+node.size.height/2-HYPERCLASS_PADDING.top;
  let yCursor=contentTop;
  for(let row=0;row<grid.rows;row++){
    let xCursor=contentLeft;
    const rowHeight=grid.rowHeights[row];
    for(let col=0;col<grid.cols;col++){
      const index=row*grid.cols+col;
      const child=kids[index];
      const colWidth=grid.colWidths[col];
      if(child){
        const metric=metrics.get(child.id);
        const childX=xCursor+colWidth/2-(metric?.offsetX||0);
        const childY=yCursor-rowHeight/2-(metric?.offsetY||0);
        placeMeasuredTree(child,childX,childY,childrenByParent,metrics);
      }
      xCursor+=colWidth+grid.gapX;
    }
    yCursor-=rowHeight+grid.gapY;
  }
}
function optimizeLayoutGrid(){
  const nodes=data.hypergraph.class||[];
  const childrenByParent=getChildrenByParent(nodes);
  const roots=nodes.filter(n=>!n.parentClassId).sort(sortByName);
  const metrics=new Map();
  roots.forEach(root=>measureLayoutTree(root,childrenByParent,metrics));
  const rootCount=roots.length;
  const rootCols=Math.max(1,Math.ceil(Math.sqrt(rootCount)));
  const rootRows=Math.ceil(rootCount/rootCols);
  const rootGrid=buildGridMetrics(roots,metrics,{dimensions:{cols:rootCols,rows:rootRows},gapX:ROOT_GAP_X,gapY:ROOT_GAP_Y});
  roots.forEach((root,idx)=>{
    const col=idx%rootCols;
    const row=Math.floor(idx/rootCols);
    const xStart=-rootGrid.width/2+rootGrid.colWidths.slice(0,col).reduce((sum,width)=>sum+width+ROOT_GAP_X,0);
    const yStart=rootGrid.height/2-rootGrid.rowHeights.slice(0,row).reduce((sum,height)=>sum+height+ROOT_GAP_Y,0);
    const metric=metrics.get(root.id);
    const x=xStart+rootGrid.colWidths[col]/2-(metric?.offsetX||0);
    const y=yStart-rootGrid.rowHeights[row]/2-(metric?.offsetY||0);
    placeMeasuredTree(root,x,y,childrenByParent,metrics);
  });
}
function optimizeLayoutRadial(){
  const nodes=data.hypergraph.class||[];
  const roots=nodes.filter(n=>!n.parentClassId).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const radiusStep = 5;
  roots.forEach((root, idx)=>{
    const angle=(Math.PI*2*idx)/Math.max(roots.length,1);
    if(!root.position) root.position={x:0,y:0,z:0};
    root.position.x=Math.cos(angle)*radiusStep;
    root.position.y=Math.sin(angle)*radiusStep;
    root.position.z=0;
  });
}
function optimizeLayoutHierarchy(){
  const nodes=data.hypergraph.class||[];
  const childrenByParent=new Map();
  nodes.forEach(n=>{ if(n.parentClassId){ const a=childrenByParent.get(n.parentClassId)||[]; a.push(n); childrenByParent.set(n.parentClassId,a); } });
  const roots=nodes.filter(n=>!n.parentClassId).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const rowGap=3.8, colGap=4.2;
  function layoutLevel(parent, depth, centerX){
    const kids=(childrenByParent.get(parent.id)||[]).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    kids.forEach((child,i)=>{
      const offset=i-(kids.length-1)/2;
      if(!child.position) child.position={x:0,y:0,z:0};
      child.position.x=centerX+offset*colGap;
      child.position.y=-depth*rowGap;
      child.position.z=0;
      layoutLevel(child, depth+1, child.position.x);
    });
  }
  roots.forEach((root, i)=>{
    if(!root.position) root.position={x:0,y:0,z:0};
    root.position.x=(i-(roots.length-1)/2)*colGap*1.2;
    root.position.y=0;
    root.position.z=0;
    layoutLevel(root,1,root.position.x);
  });
}
function applyLayoutByAlgorithm(algorithm='grid'){
  if(algorithm==='radial') return optimizeLayoutRadial();
  if(algorithm==='hierarchy') return optimizeLayoutHierarchy();
  return optimizeLayoutGrid();
}

function layoutChildrenInsideParents(){
  const nodes=data.hypergraph.class||[];
  const childrenByParent=getChildrenByParent(nodes);
  const metrics=new Map();
  const roots=nodes.filter(n=>!n.parentClassId);
  roots.forEach(root=>measureLayoutTree(root,childrenByParent,metrics));
  roots.forEach(root=>{
    const p=root.position||{x:0,y:0,z:0};
    placeMeasuredTree(root,p.x||0,p.y||0,childrenByParent,metrics);
  });
}
function getNodeBounds(node){
  const size=getNodeSize(node);
  const pos=node?.position||{x:0,y:0};
  return {
    minX:(pos.x||0)-size.width/2,
    maxX:(pos.x||0)+size.width/2,
    minY:(pos.y||0)-size.height/2,
    maxY:(pos.y||0)+size.height/2
  };
}
function isAncestor(ancestorId,nodeId,byId){
  let current=byId.get(nodeId);
  while(current?.parentClassId){
    if(current.parentClassId===ancestorId) return true;
    current=byId.get(current.parentClassId);
  }
  return false;
}
function overlapDepth(a,b,gap=MIN_HYPERCLASS_GAP){
  const x=Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX);
  const y=Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY);
  if(x<=-gap || y<=-gap) return null;
  return {x:x+gap,y:y+gap};
}
function resolveHyperclassOverlaps(){
  const nodes=data.hypergraph.class||[];
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const hyperclasses=nodes.filter(n=>n.type==='hyperclass');
  if(hyperclasses.length<2) return;

  for(let iter=0; iter<80; iter++){
    let moved=false;
    for(let i=0;i<hyperclasses.length;i++){
      for(let j=i+1;j<hyperclasses.length;j++){
        const a=hyperclasses[i];
        const b=hyperclasses[j];
        if(isAncestor(a.id,b.id,byId) || isAncestor(b.id,a.id,byId)) continue;
        const ab=getNodeBounds(a);
        const bb=getNodeBounds(b);
        const overlap=overlapDepth(ab,bb);
        if(!overlap) continue;
        if(!a.position) a.position={x:0,y:0,z:0};
        if(!b.position) b.position={x:0,y:0,z:0};
        const dx=(b.position.x||0)-(a.position.x||0);
        const dy=(b.position.y||0)-(a.position.y||0);
        const separateX=Math.abs(dx)>=Math.abs(dy);
        const sign=(separateX?dx:dy)>=0?1:-1;
        if(separateX){
          const shift=overlap.x/2;
          a.position.x-=sign*shift;
          b.position.x+=sign*shift;
        } else {
          const shift=overlap.y/2;
          a.position.y-=sign*shift;
          b.position.y+=sign*shift;
        }
        moved=true;
      }
    }
    if(!moved) break;
  }
}
export async function optimizeAndRefreshLayout(context, options={}){
  const algorithm=normalizeLayoutAlgorithm(options.algorithm||getLayoutSettings().algorithm);
  setLayoutSettings({ ...getLayoutSettings(), algorithm }, { applyContext:false });
  applyDataMetadataToContext(context);
  if(algorithm==='none'){
    updateLayoutFromData(context,options);
    return { algorithm, skipped:true };
  }
  applyLayoutByAlgorithm(algorithm);
  layoutChildrenInsideParents();
  resolveHyperclassOverlaps();
  refreshSceneFromData(context);
  updateLayoutFromData(context,options);
  return { algorithm };
}
