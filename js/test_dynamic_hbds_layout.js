import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { getData,setData,resetData,validateData,createClass,deleteClass,createHyperclass,deleteHyperclass,createAttribute,createLink,deleteLink,refreshSceneFromData,saveScene,optimizeAndRefreshLayout,fitModelToCanvas } from './hbds_model.js';

let scene,camera,renderer,labelRenderer,orbitControls,dragControls,diagramGroup; const draggableObjects=[];
let selectedElementId=null,selectedParentHyperclassId=null,selectedAttributeOwnerId=null,selectedLinkSourceId=null,selectedLinkTargetId=null;
let nextClassNumber=1,nextHyperclassNumber=1,nextAttributeNumber=1,nextLinkNumber=1;
const ctx=()=>({scene,camera,renderer,css2DRenderer:labelRenderer,orbitControls,dragControls,diagramGroup,draggableObjects,setDiagramGroup:(g)=>diagramGroup=g,setDragControls:(d)=>dragControls=d,setupDragControls:setupDrag,renderOnce});
const shouldOptimizeAfterCrud=()=>document.getElementById('auto-optimize-toggle')?.checked===true;
const idItems=()=>getData().hypergraph.class;
function updateSmartMenusFromData(){ const nodes=(idItems()||[]).filter(Boolean), hy=nodes.filter(n=>n?.type==='hyperclass'); const set=(id,arr,sel,ph)=>{const el=document.getElementById(id);el.innerHTML=''; if(ph){const o=document.createElement('option');o.value='';o.textContent=ph;el.appendChild(o);} arr.forEach(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=`${n.name} (${n.id})`;el.appendChild(o);}); if(sel!=null) el.value=String(sel);}; set('selected-element-select',nodes,selectedElementId,'-- Select element --'); set('parent-hyperclass-select',hy,selectedParentHyperclassId,'-- No parent hyperclass --'); set('attribute-owner-select',nodes,selectedAttributeOwnerId,'-- Select owner --'); set('link-source-select',nodes,selectedLinkSourceId,'-- Select source --'); set('link-target-select',nodes,selectedLinkTargetId,'-- Select target --'); }
function updateJsonPreviewFromData(){ document.getElementById('json-preview').value=JSON.stringify(getData(),null,2); }
function renderOnce(){ renderer.render(scene,camera); labelRenderer.render(scene,camera); }
function ensureLighting(){
  const ambient=new THREE.AmbientLight(0xffffff,0.95);
  ambient.name='hbds-ambient-light';
  scene.add(ambient);
  const key=new THREE.DirectionalLight(0xffffff,0.75);
  key.name='hbds-key-light';
  key.position.set(8,10,14);
  scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,0.45);
  fill.name='hbds-fill-light';
  fill.position.set(-10,-6,8);
  scene.add(fill);
}
function setupDrag(){ if(dragControls) dragControls.dispose(); dragControls=new DragControls(draggableObjects,camera,labelRenderer.domElement); let dragObjectsBackup=null; dragControls.addEventListener('dragstart',(ev)=>{dragObjectsBackup=dragControls.objects.slice(); dragControls.objects=[ev.object]; orbitControls.enabled=false;}); dragControls.addEventListener('dragend',()=>{if(dragObjectsBackup) dragControls.objects=dragObjectsBackup; orbitControls.enabled=true; updateJsonPreviewFromData();}); }
async function afterCrud(){
  if(shouldOptimizeAfterCrud()) await optimizeAndRefreshLayout(ctx());
  else refreshSceneFromData(ctx());
  if(document.getElementById('auto-fit-toggle')?.checked===true) fitModelToCanvas(ctx(),{padding:1.2,updateOverview:true});
  updateSmartMenusFromData();
  updateJsonPreviewFromData();
}
async function handleAddClass(){ await createClass({name:`class${nextClassNumber++}`,attributes:[],parentClassId:selectedParentHyperclassId||null},{context:ctx(),optimizeLayout:shouldOptimizeAfterCrud(),refresh:true}); await afterCrud(); }
async function handleAddHyperclass(){ await createHyperclass({name:`hyperclass${nextHyperclassNumber++}`,attributes:[],children:[],parentClassId:selectedParentHyperclassId||null},{context:ctx(),optimizeLayout:shouldOptimizeAfterCrud(),refresh:true}); await afterCrud(); }
async function handleAddAttribute(){ const owner=selectedAttributeOwnerId||selectedElementId; if(!owner) return; await createAttribute(owner,{name:`att${nextAttributeNumber++}`},{context:ctx(),optimizeLayout:shouldOptimizeAfterCrud(),refresh:true}); await afterCrud(); }
async function handleAddLink(){ if(!selectedLinkSourceId||!selectedLinkTargetId) return; await createLink({id:`link${nextLinkNumber++}`,sourceClassId:selectedLinkSourceId,targetClassId:selectedLinkTargetId,rendering:{labelText:`link${nextLinkNumber}` }},{context:ctx(),optimizeLayout:shouldOptimizeAfterCrud(),refresh:true}); await afterCrud(); }
async function handleDeleteSelected(){ if(!selectedElementId) return; const n=(getData()?.hypergraph?.class||[]).find(c=>c?.id===selectedElementId); if(n?.type==='hyperclass') await deleteHyperclass(selectedElementId,{context:ctx(),optimizeLayout:shouldOptimizeAfterCrud(),refresh:true,cascade:true}); else await deleteClass(selectedElementId,{context:ctx(),optimizeLayout:shouldOptimizeAfterCrud(),refresh:true}); selectedElementId=null; await afterCrud(); }
async function init(){ scene=new THREE.Scene(); scene.background=new THREE.Color('#f4f4f4'); camera=new THREE.PerspectiveCamera(52,(window.innerWidth-360)/window.innerHeight,0.1,2000); camera.position.set(0,0,12); renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setSize(window.innerWidth-360,window.innerHeight); document.getElementById('container').appendChild(renderer.domElement); labelRenderer=new CSS2DRenderer(); labelRenderer.setSize(window.innerWidth-360,window.innerHeight); document.body.appendChild(labelRenderer.domElement); orbitControls=new OrbitControls(camera,renderer.domElement); orbitControls.enableRotate=false;
ensureLighting();
await setData({hypergraph:{class:[],link:[]}}, {context:ctx(),refresh:true}); updateSmartMenusFromData(); updateJsonPreviewFromData();
document.getElementById('add-class-button').onclick=handleAddClass; document.getElementById('add-hyperclass-button').onclick=handleAddHyperclass; document.getElementById('add-attribute-button').onclick=handleAddAttribute; document.getElementById('add-link-button').onclick=handleAddLink; document.getElementById('delete-selected-button').onclick=handleDeleteSelected; document.getElementById('optimize-layout-button').onclick=()=>optimizeAndRefreshLayout(ctx()); document.getElementById('fit-model-button').onclick=()=>fitModelToCanvas(ctx(),{padding:1.2,updateOverview:true}); document.getElementById('save-model-button').onclick=()=>saveScene(ctx(),{fileName:'dynamic_hbds_test_model.json'}); document.getElementById('reset-model-button').onclick=async()=>{resetData({context:ctx(),refresh:true}); await afterCrud();};
['selected-element-select','parent-hyperclass-select','attribute-owner-select','link-source-select','link-target-select'].forEach(id=>document.getElementById(id).onchange=(e)=>{const v=e.target.value||null; if(id==='selected-element-select') selectedElementId=v; if(id==='parent-hyperclass-select') selectedParentHyperclassId=v; if(id==='attribute-owner-select') selectedAttributeOwnerId=v; if(id==='link-source-select') selectedLinkSourceId=v; if(id==='link-target-select') selectedLinkTargetId=v;});
(function anim(){requestAnimationFrame(anim); orbitControls.update(); renderOnce();})(); }
init();
