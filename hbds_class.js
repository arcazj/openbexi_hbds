/* ---------- Imports ---------- */
import * as THREE from 'three';
import { OrbitControls }  from 'three/addons/controls/OrbitControls.js';
import { DragControls }   from 'three/addons/controls/DragControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ---------- Globals ---------- */
let scene, camera, renderer, css2DRenderer, orbitControls, dragControls;
let diagramGroup = new THREE.Group();
const draggableObjects = [];

/* ---------- DATA LOADER ---------- */
const Loader = {
    fallbackHumanModel: {
        "hypergraph": {
            "class": [{
                "id":1,"name":"Human","type":"roundedRectangle",
                "attributes":[ "Last name","First name","Middle name","Age","Weight",
                    "Height","Sex","Date of birth","Place of birth",
                    "Nationality","Marital status","Occupation",
                    "Education level","Address","Phone number","Email"],
                "position":{"x":0,"y":0,"z":0},
                "size":{"width":2.2,"height":3.8},
                "rendering":{
                    "class":{"color":"#FFD700","borderColor":"#000080","cornerRadius":0.1},
                    "attributes":{"checkboxColor":"#A9A9A9","size":{"width":0.1,"height":0.1}},
                    "connections":{"lineColor":"#000000","lineWidth":0.01},
                    "textColor":"#000000"
                }
            }]
        }
    },
    async load(modelName){
        try{
            const res = await fetch(`./models/${modelName}.json`);
            if(!res.ok) throw new Error(`Model not found: ${modelName}`);
            return await res.json();
        }catch(err){
            console.warn(`Failed to load '${modelName}'. Using fallback.`,err.message);
            return this.fallbackHumanModel;
        }
    }
};

/* ---------- HDBS ENTITY BUILDER ---------- */
const HDBSEntityBuilder = {
    create(classData){
        const group = new THREE.Group();
        const cfg   = classData.rendering;
        const sz    = classData.size;

        const Z_BASE=0, Z_BORDER=0.051, Z_OVERLAY=0.06;

        // Rounded rectangle mesh (draggable part)
        const shape = this.roundedRect(sz.width, sz.height, cfg.class.cornerRadius);
        const geom  = new THREE.ExtrudeGeometry(shape,{depth:0.05, bevelEnabled:false});
        const mat   = new THREE.MeshStandardMaterial({color:cfg.class.color,metalness:1,roughness:0.25});
        const classMesh = new THREE.Mesh(geom,mat);
        classMesh.position.z = Z_BASE;
        classMesh.userData.parentGroup = group; // <- link to parent card
        group.add(classMesh);

        // Border
        const lineGeom = new THREE.BufferGeometry().setFromPoints(shape.getPoints(100));
        const lineMat  = new THREE.LineBasicMaterial({color:cfg.class.borderColor});
        const border   = new THREE.LineLoop(lineGeom,lineMat);
        border.position.z = Z_BORDER;
        group.add(border);

        // Class name label
        const lblDiv = document.createElement('div');
        lblDiv.className='label class-label';
        lblDiv.textContent = classData.name;
        lblDiv.style.color = cfg.textColor;
        const lbl = new CSS2DObject(lblDiv);
        lbl.position.set(0, sz.height/2 - 0.25, Z_OVERLAY);
        group.add(lbl);

        // Central connection point
        const center = new THREE.Vector3(sz.width/2*0.9, sz.height/2*0.9, Z_OVERLAY);
        const circG  = new THREE.CircleGeometry(0.04,32);
        const circM  = new THREE.MeshBasicMaterial({color:'#FF0000'});
        const hub    = new THREE.Mesh(circG,circM);
        hub.position.copy(center);
        group.add(hub);

        // Attributes (checkbox, line, label)
        const attrX = sz.width/2 + 0.1;
        const startY = sz.height/2 - 0.2;
        const gap = 0.15;
        const cbW = cfg.attributes.size.width;

        classData.attributes.forEach((name,i)=>{
            const y = startY - i*gap;
            const cbGeom = new THREE.BoxGeometry(cbW,cfg.attributes.size.height,cbW);
            const cbMat  = new THREE.MeshStandardMaterial({
                color:cfg.attributes.checkboxColor,metalness:1,roughness:0.25});
            const cb = new THREE.Mesh(cbGeom,cbMat);
            cb.position.set(attrX + cbW/2 + 0.1, y, Z_OVERLAY);
            group.add(cb);

            const pts=[center, cb.position];
            const lnGeom=new THREE.BufferGeometry().setFromPoints(pts);
            const lnMat =new THREE.LineBasicMaterial({color:cfg.connections.lineColor,
                linewidth:cfg.connections.lineWidth});
            group.add(new THREE.Line(lnGeom, lnMat));

            const aDiv=document.createElement('div');
            aDiv.className='label attribute-label';
            aDiv.textContent=name;
            aDiv.style.color=cfg.textColor;
            const aLbl=new CSS2DObject(aDiv);
            aLbl.position.set(cb.position.x+cbW, y, Z_OVERLAY);
            aLbl.center.set(0,0.5);
            group.add(aLbl);
        });

        return {group, classMesh};
    },

    roundedRect(w,h,r){
        const s = new THREE.Shape();
        const x=-w/2, y=-h/2;
        s.moveTo(x, y+r);
        s.lineTo(x, y+h-r); s.quadraticCurveTo(x,y+h,x+r,y+h);
        s.lineTo(x+w-r,y+h); s.quadraticCurveTo(x+w,y+h,x+w,y+h-r);
        s.lineTo(x+w,y+r);   s.quadraticCurveTo(x+w,y,x+w-r,y);
        s.lineTo(x+r,y);     s.quadraticCurveTo(x,y,x,y+r);
        return s;
    }
};

/* ---------- MAIN APPLICATION ---------- */
function init(){
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#f0f0f0');

    camera = new THREE.PerspectiveCamera(50,window.innerWidth/window.innerHeight,0.1,1000);
    camera.position.set(0,0,10);

    const container=document.getElementById('container');
    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(window.innerWidth,window.innerHeight);
    container.appendChild(renderer.domElement);

    css2DRenderer=new CSS2DRenderer();
    css2DRenderer.setSize(window.innerWidth,window.innerHeight);
    css2DRenderer.domElement.style.position='absolute';
    css2DRenderer.domElement.style.top='0';
    container.appendChild(css2DRenderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff,0.9));
    const keyLight=new THREE.DirectionalLight(0xffffff,0.9);
    keyLight.position.set(1,2.5,6); scene.add(keyLight);
    const rim=new THREE.DirectionalLight(0xffffff,0.6);
    rim.position.set(-1,-4,-2); scene.add(rim);

    orbitControls=new OrbitControls(camera, css2DRenderer.domElement);
    orbitControls.enableRotate=false;

    window.addEventListener('resize',onResize);
    document.getElementById('view-toggle').addEventListener('change',toggleView);
    document.getElementById('model-select').addEventListener('change',e=>loadAndRenderScene(e.target.value));

    loadAndRenderScene('human');
}

async function loadAndRenderScene(modelName){
    /* ----- clear previous ----- */
    if(diagramGroup){
        scene.remove(diagramGroup);
        draggableObjects.length=0;
        diagramGroup.traverse(c=>{
            if((c.isMesh||c.isLine)&&c.geometry) c.geometry.dispose();
            if((c.isMesh||c.isLine)&&c.material) c.material.dispose();
            if(c.isCSS2DObject) c.element.remove();
        });
    }
    if(dragControls) dragControls.dispose();

    const data = await Loader.load(modelName);
    diagramGroup=new THREE.Group();
    scene.add(diagramGroup);

    data.hypergraph.class.forEach(cd=>{
        const {group,classMesh}=HDBSEntityBuilder.create(cd);
        group.position.set(cd.position.x,cd.position.y,cd.position.z);
        diagramGroup.add(group);
        draggableObjects.push(classMesh);  // only the rectangle is the handle
    });

    // Center diagram
    const box=new THREE.Box3().setFromObject(diagramGroup);
    const center=box.getCenter(new THREE.Vector3());
    diagramGroup.position.sub(center);
    box.getBoundingSphere(diagramGroup.userData.boundingSphere=new THREE.Sphere());

    setCamera2D();
    setupDragControls();
}

function setupDragControls(){
    dragControls=new DragControls(draggableObjects,camera,css2DRenderer.domElement); // unified target
    dragControls.transformGroup=true;

    dragControls.addEventListener('dragstart',ev=>{
        orbitControls.enabled=false;
    });

    dragControls.addEventListener('drag',ev=>{
    });

    dragControls.addEventListener('dragend',()=>{
        const is3D=document.getElementById('view-toggle').checked;
        orbitControls.enabled=!is3D;
    });

    toggleView({target:document.getElementById('view-toggle')});
}

/* ---------- Utility functions ---------- */
function onResize(){
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
    css2DRenderer.setSize(window.innerWidth,window.innerHeight);
}

function toggleView(e){
    const is3D=e.target.checked;
    orbitControls.enableRotate=is3D;
    orbitControls.enabled=true;
    if(dragControls) dragControls.enabled=!is3D;
    if(!is3D) setCamera2D();
}

function setCamera2D(){
    const sphere=diagramGroup.userData.boundingSphere;
    if(!sphere||sphere.radius===0){
        camera.position.set(0,0,10);
        camera.lookAt(0,0,0);
        orbitControls.target.set(0,0,0);
        orbitControls.update();
        return;
    }
    const fovR=camera.fov*Math.PI/180;
    const dist=Math.abs(sphere.radius/Math.sin(fovR/2));
    camera.position.set(0,0,dist*1.2);
    camera.lookAt(0,0,0);
    orbitControls.target.set(0,0,0);
    orbitControls.update();
}

function animate(){
    requestAnimationFrame(animate);
    if(orbitControls.enabled) orbitControls.update();
    renderer.render(scene,camera);
    css2DRenderer.render(scene,camera);
}

/* ---------- START ---------- */
init();
animate();
