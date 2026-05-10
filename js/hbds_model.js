import * as THREE from 'three';
import { Loader as ClassLoader, createClass as createClassMesh, updateLabelFontSizes, createClassData, updateClassData, normalizeClassData, validateClassData } from './hbds_class.js';
import { Loader as HyperClassLoader, createHyperClass, updateLabelFontSizes as updateHyperClassLabelFontSizes, createHyperclassData, updateHyperclassData, normalizeHyperclassData, validateHyperclassData, addChildData, removeChildData } from './hbds_hyperclass_class.js';
import { createLinkBetweenClass, updateLinkFontSizes, recalculateAllLinks, createLinkData, updateLinkData, normalizeLinkData, validateLinkData } from './hbds_class_link.js';
import { createLinkBetweenHyperClass, updateLinkFontSizes as updateHyperClassLinkFontSizes } from './hbds_hyperclass_link.js';

let data = { hypergraph: { class: [], link: [] } };
const history=[];
const modelRuntime={ classById:new Map(), linkGroups:[], diagramGroup:null, draggableObjects:[] };
const GRID_GAP_X = 0.9;
const GRID_GAP_Y = 0.9;
const ROOT_GAP_X = 2.6;
const ROOT_GAP_Y = 2.2;
const clone=(v)=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
const nextId=(p)=>`${p}_${Math.random().toString(36).slice(2,8)}`;
export const getData=()=>data;
export function normalizeData(inputData){
  const m=clone(inputData||{}); m.hypergraph=m.hypergraph||{};
  m.hypergraph.class=Array.isArray(m.hypergraph.class)?m.hypergraph.class:[];
  m.hypergraph.link=Array.isArray(m.hypergraph.link)?m.hypergraph.link:[];
  const ids=new Set(); const byId=new Map();
  m.hypergraph.class=m.hypergraph.class.map((n,i)=>{let x=clone(n||{}); if(x.type==='hyperclass') x=normalizeHyperclassData(x); else x=normalizeClassData(x); x.id=x.id??nextId('node'); while(ids.has(x.id)) x.id=nextId('node'); ids.add(x.id); x.name=x.name||`Node ${i+1}`; x.attributes=Array.isArray(x.attributes)?x.attributes:[]; if(x.type==='hyperclass') x.children=Array.isArray(x.children)?x.children:[]; byId.set(x.id,x); return x;});
  for(const n of m.hypergraph.class){ if(n.parentClassId && (!byId.has(n.parentClassId)||byId.get(n.parentClassId).type!=='hyperclass')) n.parentClassId=null; }
  for(const h of m.hypergraph.class.filter(n=>n.type==='hyperclass')){ h.children=(h.children||[]).filter(id=>byId.has(id)); for(const cid of h.children){byId.get(cid).parentClassId=h.id;} }
  m.hypergraph.link=m.hypergraph.link.map(l=>normalizeLinkData(l)).filter(l=>l.sourceClassId&&l.targetClassId&&byId.has(l.sourceClassId)&&byId.has(l.targetClassId));
  return m;
}
export function validateData(currentData=data){const e=[],w=[]; const hg=currentData?.hypergraph; if(!Array.isArray(hg?.class)) e.push('missing hypergraph.class'); if(!Array.isArray(hg?.link)) e.push('missing hypergraph.link'); const ids=new Set(); const byId=new Map(); for(const c of hg?.class||[]){if(ids.has(c.id)) e.push(`duplicate class id ${c.id}`); ids.add(c.id); byId.set(c.id,c); if(!Array.isArray(c.attributes)) e.push(`invalid attributes for ${c.id}`);} const lids=new Set(); for(const l of hg?.link||[]){ if(l.id&&lids.has(l.id)) e.push(`duplicate link id ${l.id}`); if(l.id) lids.add(l.id); if(!byId.has(l.sourceClassId)) e.push(`missing link source ${l.sourceClassId}`); if(!byId.has(l.targetClassId)) e.push(`missing link target ${l.targetClassId}`);} return {valid:e.length===0,errors:e,warnings:w};}
export function refreshSceneFromData(context){ if(!context) return; const {scene,setDiagramGroup,diagramGroup,setDragControls,dragControls,draggableObjects=[]}=context; if(diagramGroup){scene?.remove(diagramGroup); diagramGroup.traverse(o=>{if(o.geometry) o.geometry.dispose?.(); if(o.material) o.material.dispose?.(); if(o.isCSS2DObject) o.element?.remove?.();});}
  if(dragControls){dragControls.dispose(); setDragControls?.(null);} const dg=new THREE.Group(); scene?.add(dg); setDiagramGroup?.(dg); modelRuntime.diagramGroup=dg; modelRuntime.classById.clear(); modelRuntime.linkGroups=[];
  for(const cd of data.hypergraph.class){ const r=cd.type==='hyperclass'?createHyperClass(null,cd):createClassMesh(cd); const m=r.classMesh; m.userData={...m.userData,hbdsId:cd.id,modelData:clone(cd),isClassLike:true,isHyperClass:cd.type==='hyperclass',isHbdsClass:true}; dg.add(m); modelRuntime.classById.set(cd.id,m);} 
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
  for(const ld of data.hypergraph.link){ const s=modelRuntime.classById.get(ld.sourceClassId), t=modelRuntime.classById.get(ld.targetClassId); if(!s||!t) continue; const r=(s.userData.isHyperClass||t.userData.isHyperClass)?createLinkBetweenHyperClass(dg,s,t,ld):createLinkBetweenClass(ld,modelRuntime.classById); if(!r) continue; r.linkGroup.userData={...r.linkGroup.userData,linkData:clone(ld),sourceClassId:ld.sourceClassId,targetClassId:ld.targetClassId,isHBDSLink:true,isHbdsLink:true}; dg.add(r.linkGroup); modelRuntime.linkGroups.push(r.linkGroup);} 
  draggableObjects.length=0; for(const cd of data.hypergraph.class){ const o=modelRuntime.classById.get(cd.id); if(o) draggableObjects.push(o); }
  modelRuntime.draggableObjects=draggableObjects;
  context.setupDragControls?.(); recalculateAllLinks(); updateLabelFontSizes(context.camera); updateHyperClassLabelFontSizes(context.camera, context.renderer); updateLinkFontSizes(context.camera); updateHyperClassLinkFontSizes(context.camera, context.renderer); context.renderOnce?.(); }
export function updateLayoutFromData(context){ recalculateAllLinks(); updateLabelFontSizes(context.camera); updateHyperClassLabelFontSizes(context.camera, context.renderer); updateLinkFontSizes(context.camera); updateHyperClassLinkFontSizes(context.camera, context.renderer); context.renderOnce?.(); }
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
  }
  context.renderOnce?.();
  return {box,sphere};
}
export function fitModelToCanvas(context, options = {}) {
  if (!context?.diagramGroup || !context?.camera) return null;
  const box = new THREE.Box3().setFromObject(context.diagramGroup);
  if (box.isEmpty()) return null;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const padding = options.padding ?? 1.15;
  const fovR = context.camera.fov * Math.PI / 180;
  const fitHeightDistance = (sphere.radius * padding) / Math.tan(fovR / 2);
  const fitWidthDistance = fitHeightDistance / Math.max(context.camera.aspect, 1e-6);
  const dist = Math.max(fitHeightDistance, fitWidthDistance, 1);
  context.diagramGroup.userData.boundingBox = box.clone();
  context.diagramGroup.userData.boundingSphere = sphere.clone();
  context.orbitControls?.target.copy(sphere.center);
  context.camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + dist);
  context.camera.lookAt(sphere.center);
  context.camera.updateProjectionMatrix();
  context.orbitControls?.update?.();
  context.renderOnce?.();
  if (options.updateOverview) updateModelOverview(context);
  return { box, sphere };
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
    const is3D = document.getElementById('view-toggle')?.checked;
    const inOverviewPanel = event.target instanceof Element
      ? Boolean(event.target.closest('#model-overview'))
      : false;
    const editable = document.getElementById('editable-toggle')?.checked ?? true;
    if (is3D || inOverviewPanel) return;
    if (editable && isPointerOverInteractiveObject(event, context)) return;
    if (editable) return;
    isPanning = true;
    lastX = event.clientX;
    lastY = event.clientY;
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
export function setData(nextData, options={}){ data=normalizeData(nextData); const v=validateData(data); if(!v.valid) throw new Error(v.errors.join('; ')); if(options.refresh!==false) refreshSceneFromData(options.context); return getData(); }
export function resetData(options={}){ return setData({hypergraph:{class:[],link:[]}},options); }
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
export const updateAttribute=(ownerId,key,patch,options={})=>commitDataChange('updateAttribute',d=>{const o=d.hypergraph.class.find(c=>c.id===ownerId); if(!o) throw new Error('owner not found'); const i=typeof key==='number'?key:o.attributes.findIndex(a=>typeof a==='string'?a===key:a.name===key||a.id===key); if(i<0) throw new Error('attribute not found'); o.attributes[i]=typeof o.attributes[i]==='string'?(patch?.name||patch):{...o.attributes[i],...(typeof patch==='string'?{name:patch}:patch)};},options);
export const deleteAttribute=(ownerId,key,options={})=>commitDataChange('deleteAttribute',d=>{const o=d.hypergraph.class.find(c=>c.id===ownerId); if(!o) throw new Error('owner not found'); const i=typeof key==='number'?key:o.attributes.findIndex(a=>typeof a==='string'?a===key:a.name===key||a.id===key); if(i>=0) o.attributes.splice(i,1);},options);
export const readLink=(idOrPred)=>typeof idOrPred==='function'?data.hypergraph.link.find(idOrPred)||null:data.hypergraph.link.find(l=>l.id===idOrPred)||null;
export const createLink=(input,options={})=>commitDataChange('createLink',d=>{const l=createLinkData(input); const byId=new Map(d.hypergraph.class.map(c=>[c.id,c])); const v=validateLinkData(l,byId); if(!v.valid) throw new Error(v.errors.join('; ')); d.hypergraph.link.push(l); return l;},options);
export const updateLink=(idOrPred,patch,options={})=>commitDataChange('updateLink',d=>{const i=d.hypergraph.link.findIndex(l=>typeof idOrPred==='function'?idOrPred(l):l.id===idOrPred); if(i<0) throw new Error('link not found'); d.hypergraph.link[i]=updateLinkData(d.hypergraph.link[i],patch);},options);
export const deleteLink=(idOrPred,options={})=>commitDataChange('deleteLink',d=>{d.hypergraph.link=d.hypergraph.link.filter(l=>!(typeof idOrPred==='function'?idOrPred(l):l.id===idOrPred||(idOrPred?.sourceClassId===l.sourceClassId&&idOrPred?.targetClassId===l.targetClassId)));},options);
async function loadModelData(modelName){
  const value=String(modelName||'').trim();
  const isDirectPath=value.includes('/') || value.endsWith('.json');
  if(isDirectPath){
    const response=await fetch(`./${value}`);
    if(!response.ok) throw new Error(`Model not found: ${value}`);
    return response.json();
  }
  try {
    return await HyperClassLoader.load(value);
  } catch {
    return ClassLoader.load(value);
  }
}
export async function listAvailableModels(manifestPath='models/models_manifest.json'){
  try {
    const response=await fetch(`./${manifestPath}`);
    if(!response.ok) throw new Error(`manifest not found: ${manifestPath}`);
    const manifest=await response.json();
    const items=Array.isArray(manifest?.models)?manifest.models:[];
    return items.filter(Boolean).map(item=>({
      value:item.value||item.path||item.id||'',
      label:item.label||item.name||item.value||'',
      description:item.description||'',
      tags:Array.isArray(item.tags)?item.tags:[]
    })).filter(item=>item.value);
  } catch {
    return [];
  }
}
export async function loadAndRenderScene(modelName, context){ const raw=await loadModelData(modelName); setData(raw,{context,refresh:true}); return getData(); }
export function saveScene(context, options={}){ const blob=new Blob([JSON.stringify(getData(),null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=options.fileName||'hbds_saved_model.json'; a.click(); URL.revokeObjectURL(url); return getData(); }
function getNodeSize(node){
  const base=node?.size||{};
  const attrCount=Array.isArray(node?.attributes)?node.attributes.length:0;
  const minH=node?.type==='hyperclass'?3.2:2;
  const minW=node?.type==='hyperclass'?4:1;
  const attrW=node?.type==='hyperclass' ? 3.2 : 1.2;
  const width=Math.max(base.width||1, minW, attrW);
  const height=Math.max(base.height||minH, minH + attrCount*0.2);
  return { width, height };
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
function optimizeLayoutGrid(){
  const nodes=data.hypergraph.class||[];
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const childrenByParent=new Map();
  nodes.forEach(n=>{ if(n.parentClassId){ const a=childrenByParent.get(n.parentClassId)||[]; a.push(n); childrenByParent.set(n.parentClassId,a); } });
  const roots=nodes.filter(n=>!n.parentClassId).sort((a,b)=>String(a.name).localeCompare(String(b.name)));

  function layoutNode(node, cx, cy){
    const kids=(childrenByParent.get(node.id)||[]).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    const own=getNodeSize(node);
    if(!node.position) node.position={x:0,y:0,z:0};
    node.position.x=cx; node.position.y=cy; node.position.z=0;
    if(node.type!=='hyperclass' || kids.length===0) return own;

    const {cols,rows}=getGridDimensions(kids.length);
    const childSizes=kids.map(getNodeSize);
    const cellW=Math.max(...childSizes.map(s=>s.width))+GRID_GAP_X;
    const cellH=Math.max(...childSizes.map(s=>s.height))+GRID_GAP_Y;
    const padX = 1.2;
    const padY = 1.1;
    const gridW=Math.max(cellW*cols, own.width-padX);
    const gridH=Math.max(cellH*rows, own.height-padY);
    const attrRows=Math.max(1,Math.ceil((Array.isArray(node.attributes)?node.attributes.length:0)/Math.max(1,Math.floor((gridH)/0.16))));
    const attrPadX = attrRows > 1 ? 0.8 : 0.5;
    node.size={width:Math.max(own.width,gridW+padX+attrPadX),height:Math.max(own.height,gridH+padY)};

    const startX=cx-gridW/2+cellW/2;
    const startY=cy+gridH/2-cellH/2;
    kids.forEach((child, idx)=>{
      const col=idx%cols;
      const row=Math.floor(idx/cols);
      const x=startX + col*cellW;
      const y=startY - row*cellH;
      layoutNode(child,x,y);
    });
    return node.size;
  }

  const rootCount=roots.length;
  const rootCols=Math.max(1,Math.ceil(Math.sqrt(rootCount)));
  const rootRows=Math.ceil(rootCount/rootCols);
  roots.forEach((root,idx)=>{
    const col=idx%rootCols;
    const row=Math.floor(idx/rootCols);
    const x=(col-(rootCols-1)/2)*(6+ROOT_GAP_X);
    const y=((rootRows-1)/2-row)*(5+ROOT_GAP_Y);
    layoutNode(root,x,y);
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
export async function optimizeAndRefreshLayout(context, options={}){
  const algorithm=options.algorithm||'grid';
  applyLayoutByAlgorithm(algorithm);
  refreshSceneFromData(context);
  updateLayoutFromData(context,options);
  return { algorithm };
}
