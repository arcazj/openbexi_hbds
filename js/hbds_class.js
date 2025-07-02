/* ─────────────────────────────── Imports ─────────────────────────────── */
import * as THREE from 'three';
import {CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';

/* ─────────────────────────────── Loader ──────────────────────────────── */
export const Loader = {
    fallbackHumanModel: {
        hypergraph: {
            class: [
                {
                    id: 1,
                    name: 'Human',
                    type: 'roundedRectangle',
                    attributes: [
                        'Last name', 'First name', 'Middle name', 'Age', 'Weight', 'Height',
                        'Sex', 'Date of birth', 'Place of birth', 'Nationality',
                        'Marital status', 'Occupation', 'Education level',
                        'Address', 'Phone number', 'Email'
                    ],
                    position: {x: 0, y: 0, z: 0},
                    size: {width: 2.2, height: 3.8},
                    rendering: {
                        class: {
                            color: '#FFD700',
                            borderColor: '#000080',
                            cornerRadius: 0.1
                        },
                        attributes: {
                            checkboxColor: '#A9A9A9',
                            size: {width: 0.1, height: 0.1}
                        },
                        connections: {
                            lineColor: '#000000',
                            lineWidth: 0.01
                        },
                        textColor: '#000000'
                    }
                }
            ]
        }
    },

    /** Fetch `/models/<modelName>.json`; fall back to built-in “Human”. */
    async load(modelName) {
        try {
            const res = await fetch(`./models/${modelName}.json`);
            if (!res.ok) throw new Error(`Model not found: ${modelName}`);
            return await res.json();
        } catch (err) {
            console.warn(`Failed to load '${modelName}'. Using fallback.`, err.message);
            return this.fallbackHumanModel;
        }
    }
};

/* ───────────────────── HDBS class-card builder ──────────────────────── */
/**
 * Build a complete class graphic (rectangle, border, labels, check-boxes, lines, red hub).
 * Returns `{ group, classMesh }` so the caller can attach DragControls
 * to `classMesh` but add the entire `group` to the scene.
 */
export function createClass(classData) {
    const cfg = classData.rendering;
    const sz = classData.size;

    const Z_BASE = 0;
    const Z_OVERLAY = 0.06;

    /* — Rounded rectangle mesh (draggable) — */
    const shape = roundedRect(sz.width, sz.height, cfg.class.cornerRadius);
    const extrudeGeom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.05,
        bevelEnabled: false
    });
    const classMat = new THREE.MeshStandardMaterial({
        color: cfg.class.color,
        metalness: 1,
        roughness: 0.25
    });
    const classMesh = new THREE.Mesh(extrudeGeom, classMat);
    classMesh.position.z = Z_BASE;

    /* — Class name label (CSS2D) — */
    const titleDiv = document.createElement('div');
    titleDiv.className = 'label class-label';
    titleDiv.style.color = cfg.textColor;
    titleDiv.style.font = 'bold 16px Arial';
    titleDiv.textContent = classData.name;
    const titleObj = new CSS2DObject(titleDiv);
    titleObj.position.set(0, sz.height / 2 - 0.25, Z_OVERLAY);

    /* — Central red hub — */
    const hubPos = new THREE.Vector3(
        (sz.width * 0.9) / 2,
        (sz.height * 0.9) / 2,
        Z_OVERLAY
    );
    const hub = new THREE.Mesh(
        new THREE.CircleGeometry(0.04, 32),
        new THREE.MeshBasicMaterial({color: '#FF0000'})
    );
    hub.position.copy(hubPos);
    hub.raycast = () => {
    };
    titleObj.raycast = () => {
    };
    classMesh.add(hub);
    classMesh.add(titleObj);


    /* — Attributes: cube + line + label — */
    const cbW = cfg.attributes.size.width;
    const cbH = cfg.attributes.size.height ?? cbW;
    const gapY = 0.15;                                           // vertical spacing
    const startY = sz.height / 2 - 0.1;
    const colX = sz.width / 2 + 0.25 + cbW;                  // cube centre X

    classData.attributes.forEach((attrName, idx) => {
        const y = startY - idx * gapY;

        // checkbox cube
        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(cbW, cbH, cbW),
            new THREE.MeshStandardMaterial({
                color: cfg.attributes.checkboxColor,
                metalness: 1,
                roughness: 0.25
            })
        );
        cube.position.set(colX, y, Z_OVERLAY);
        cube.raycast = () => {
        };
        classMesh.add(cube);

        // connecting line
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([hubPos, cube.position]),
            new THREE.LineBasicMaterial({
                color: cfg.connections.lineColor,
                linewidth: cfg.connections.lineWidth
            })
        );
        line.raycast = () => {
        };
        classMesh.add(line);

        // attribute label
        const aDiv = document.createElement('div');
        aDiv.className = 'label attribute-label';
        aDiv.style.color = cfg.textColor;
        aDiv.style.font = '12px Arial';
        aDiv.textContent = attrName;
        const aLbl = new CSS2DObject(aDiv);
        aLbl.position.set(colX + cbW + 0.12, y, Z_OVERLAY);
        aLbl.center.set(0, 0.5);
        classMesh.add(aLbl);
    });

    return {classMesh};
}

/* ───────────────────────── roundedRect helper ───────────────────────── */
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
