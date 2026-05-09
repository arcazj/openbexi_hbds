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
    const defaults = {
        size: {width: 1, height: 2},
        rendering: {
            class: {color: '#FFD700', cornerRadius: 0.1},
            attributes: {checkboxColor: '#A9A9A9', size: {width: 0.1, height: 0.1}},
            connections: {lineColor: '#000000', lineWidth: 0.01},
            textColor: '#000000'
        }
    };

    const sz = classData.size ?? defaults.size;
    const cfg = {
        class: {...defaults.rendering.class, ...(classData.rendering?.class ?? {})},
        attributes: {
            ...defaults.rendering.attributes,
            ...(classData.rendering?.attributes ?? {}),
            size: {
                ...defaults.rendering.attributes.size,
                ...(classData.rendering?.attributes?.size ?? {})
            }
        },
        connections: {...defaults.rendering.connections, ...(classData.rendering?.connections ?? {})},
        textColor: classData.rendering?.textColor ?? defaults.rendering.textColor
    };

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
    classMesh.userData.classId = classData.id;
    classMesh.userData.classType = 'class';
    classMesh.userData.isHyperClass = false;

    /* — Class name label (CSS2D) — */
    const titleDiv = document.createElement('div');
    titleDiv.className = 'label class-label';
    titleDiv.setAttribute('data-class', classData.name ?? '');
    titleDiv.setAttribute('data-hyperclass', 'false');
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
    hub.name = 'class-hub';
    hub.position.copy(hubPos);
    hub.raycast = () => {
    };
    titleObj.raycast = () => {
    };
    classMesh.add(hub);

    const hubTop = hub.clone();
    hubTop.position.set(0, sz.height / 2 - 0.12, Z_OVERLAY);
    const hubBottom = hub.clone();
    hubBottom.position.set(0, -sz.height / 2 + 0.12, Z_OVERLAY);
    const hubLeft = hub.clone();
    hubLeft.position.set(-sz.width / 2 + 0.12, 0, Z_OVERLAY);
    const hubRight = hub.clone();
    hubRight.position.set(sz.width / 2 - 0.12, 0, Z_OVERLAY);
    const hubCenter = hub.clone();
    hubCenter.position.set(0, 0, Z_OVERLAY);
    [hubTop, hubBottom, hubLeft, hubRight, hubCenter].forEach(h => { h.raycast = () => {}; classMesh.add(h); });
    classMesh.userData.hubs = { top: hubTop, right: hubRight, bottom: hubBottom, left: hubLeft, center: hubCenter };
    classMesh.userData.linkHub = hubCenter;

    classMesh.add(titleObj);
    labels.push(titleObj);


    /* — Attributes: cube + line + label — */
    attachAttributesToMesh(classMesh, classData.attributes ?? [], {
        size: sz,
        attributes: cfg.attributes,
        connections: cfg.connections,
        textColor: cfg.textColor,
        hubPosition: hubPos,
        z: Z_OVERLAY
    });

    return {classMesh};
}

export function attachAttributesToMesh(classMesh, attributes, options = {}) {
    const size = options.size ?? {width: 1, height: 2};
    const attrCfg = options.attributes ?? {checkboxColor: "#A9A9A9", size: {width: 0.1, height: 0.1}};
    const connCfg = options.connections ?? {lineColor: "#000000", lineWidth: 0.01};
    const textColor = options.textColor ?? "#000000";

    const cbW = attrCfg.size.width;
    const cbH = attrCfg.size.height ?? cbW;
    const gapY = options.gapY ?? 0.15;
    const startY = options.startY ?? (size.height / 2 - 0.1);
    const colX = options.colX ?? (size.width / 2 + 0.25 + cbW);
    const hubPos = options.hubPosition ?? new THREE.Vector3((size.width * 0.9) / 2, (size.height * 0.9) / 2, options.z ?? 0.06);
    const z = options.z ?? 0.06;

    attributes.forEach((attrName, idx) => {
        const y = startY - idx * gapY;

        // checkbox cube
        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(cbW, cbH, cbW),
            new THREE.MeshStandardMaterial({
                color: attrCfg.checkboxColor,
                metalness: 1,
                roughness: 0.25
            })
        );
        cube.position.set(colX, y, z);
        cube.raycast = () => {
        };
        classMesh.add(cube);

        // connecting line
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([hubPos, cube.position.clone()]),
            new THREE.LineBasicMaterial({
                color: connCfg.lineColor,
                linewidth: connCfg.lineWidth
            })
        );
        line.raycast = () => {
        };
        classMesh.add(line);

        // attribute label
        const aDiv = document.createElement('div');
        aDiv.className = 'label attribute-label';
        aDiv.style.color = textColor;
        aDiv.style.font = '12px Arial';
        aDiv.textContent = attrName;
        const aLbl = new CSS2DObject(aDiv);
        aLbl.position.set(colX + cbW + 0.12, y, z);
        aLbl.center.set(0, 0.5);
        classMesh.add(aLbl);
        labels.push(aLbl);
    });
}
/**
 * NEW: Dynamically scales CSS2D labels based on camera distance.
 * @param {THREE.Camera} camera - The scene camera.
 */
const labels = []; // Store all labels for easy access
export function updateLabelFontSizes(camera) {
    const tempVec = new THREE.Vector3();
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);

    labels.forEach(label => {
        if (!label.element) return;

        label.getWorldPosition(tempVec);
        const distance = tempVec.distanceTo(cameraPos);

        let scaleFactor, minSize, maxSize;

        // Differentiate between class and attribute labels
        if (label.element.classList.contains('class-label')) {
            scaleFactor = 150; // Larger base size for class names
            minSize = 14;
            maxSize = 32;
        } else {
            scaleFactor = 100; // Smaller base size for attributes
            minSize = 8;
            maxSize = 16;
        }

        // Calculate font size and clamp it within the defined range
        const fontSize = THREE.MathUtils.clamp(scaleFactor / distance, minSize, maxSize);

        label.element.style.fontSize = `${fontSize.toFixed(1)}px`;
        // Force hardware acceleration for smoother scaling and crisp text
        label.element.style.transform = 'translateZ(0)';
    });
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
