/* ─────────────────────────────── Imports ─────────────────────────────── */
import * as THREE from 'three';
import {CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';

const DEFAULT_EMPTY_ICON_PATH = './icons/empty.png';
const ICON_MANIFEST_PATH = './icons/generated_icons_manifest.json';
const CLASS_BODY_TYPES = new Set(['rectangle', 'image', 'shape']);
const CLASS_IMAGE_FITS = new Set(['contain', 'cover']);
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
let iconManifestLookupPromise = null;

export const DEFAULT_LABEL_FONT_SETTINGS = Object.freeze({
    size: 12,
    family: 'Arial, sans-serif',
    bold: false,
    italic: false,
    underline: false
});

export function normalizeLabelFontSettings(font = {}, fallback = DEFAULT_LABEL_FONT_SETTINGS) {
    const source = font && typeof font === 'object' ? font : {};
    const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_LABEL_FONT_SETTINGS;
    return {
        size: toPositiveNumber(source.size ?? source.fontSize ?? source.labelFontSize, base.size ?? DEFAULT_LABEL_FONT_SETTINGS.size),
        family: normalizeFontFamily(source.family ?? source.fontFamily, base.family ?? DEFAULT_LABEL_FONT_SETTINGS.family),
        bold: toBooleanFontValue(source.bold ?? source.fontWeight, base.bold ?? DEFAULT_LABEL_FONT_SETTINGS.bold),
        italic: toBooleanFontValue(source.italic ?? source.fontStyle, base.italic ?? DEFAULT_LABEL_FONT_SETTINGS.italic),
        underline: toBooleanFontValue(source.underline ?? source.textDecoration ?? source.textDecorationLine, base.underline ?? DEFAULT_LABEL_FONT_SETTINGS.underline)
    };
}

export function resolveLabelFontSettings(individualFont = {}, modelFont = {}, fallback = DEFAULT_LABEL_FONT_SETTINGS) {
    return normalizeLabelFontSettings(individualFont, normalizeLabelFontSettings(modelFont, fallback));
}

export function applyLabelFontSettings(element, fontSettings = DEFAULT_LABEL_FONT_SETTINGS) {
    if (!element) return;
    const font = normalizeLabelFontSettings(fontSettings);
    element.__hbdsFontSettings = font;
    element.style.fontSize = `${font.size}px`;
    element.style.fontFamily = font.family;
    element.style.fontWeight = font.bold ? '700' : '400';
    element.style.fontStyle = font.italic ? 'italic' : 'normal';
    element.style.textDecoration = font.underline ? 'underline' : 'none';
}

function normalizeFontFamily(value, fallback) {
    const clean = String(value ?? '').trim();
    return clean || fallback || DEFAULT_LABEL_FONT_SETTINGS.family;
}

function toBooleanFontValue(value, fallback = false) {
    if (value === undefined || value === null || value === '') return Boolean(fallback);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value >= 600 || value === 1;
    const clean = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'bold', 'bolder', '600', '700', '800', '900', 'italic', 'underline'].includes(clean)) return true;
    if (['false', '0', 'no', 'normal', 'none', 'lighter', '400'].includes(clean)) return false;
    const numeric = Number(clean);
    if (Number.isFinite(numeric)) return numeric >= 600 || numeric === 1;
    return Boolean(fallback);
}

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
                            material: 'metallic',
                            borderColor: '#000080',
                            cornerRadius: 0.1,
                            metalness: 0.46,
                            roughness: 0.24,
                            emissiveIntensity: 0.035
                        },
                        attributes: {
                            checkboxColor: '#A9A9A9',
                            checkboxMaterial: 'metallic',
                            shape: 'square',
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
const CLASS_SURFACE_MATERIAL_PROFILES = {
    metallic: {metalness: 0.46, roughness: 0.24, emissiveIntensity: 0.035},
    matte: {metalness: 0.02, roughness: 0.82, emissiveIntensity: 0.012},
    glossy: {metalness: 0.08, roughness: 0.08, emissiveIntensity: 0.018},
    plastic: {metalness: 0, roughness: 0.36, emissiveIntensity: 0.014},
    glass: {metalness: 0, roughness: 0.02, emissiveIntensity: 0, transmission: 0.55, clearcoat: 1, clearcoatRoughness: 0.04}
};

function normalizeClassSurfaceMaterial(value) {
    const clean = String(value || 'metallic').trim().toLowerCase();
    if (clean === 'basic') return 'flat';
    if (clean === 'mat') return 'matte';
    if (clean === 'shine' || clean === 'shiny') return 'glossy';
    if (clean === 'transparent') return 'glass';
    if (clean === 'flat' || CLASS_SURFACE_MATERIAL_PROFILES[clean]) return clean;
    return 'metallic';
}

export function createClass(classData) {
    const defaults = {
        size: {width: 1, height: 2},
        rendering: {
            class: {color: '#FFD700', cornerRadius: 0.1, material: 'metallic', metalness: 0.46, roughness: 0.24, emissiveIntensity: 0.035},
            attributes: {
                checkboxColor: '#A9A9A9',
                checkboxMaterial: 'metallic',
                shape: 'square',
                metalness: 0.2,
                roughness: 0.5,
                size: {width: 0.1, height: 0.1}
            },
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
    const bodyRendering = normalizeClassBodyRendering(classData, cfg.class);
    const hitGeom = createExtrudedClassBodyGeometry('roundedRectangle', sz, cfg.class.cornerRadius);
    const classColor = new THREE.Color(cfg.class.metallicColor ?? cfg.class.color);
    const classOpacity = cfg.class.opacity ?? 1;
    const classMat = createClassPanelMaterial(cfg.class, classColor, classOpacity);
    const classMesh = new THREE.Mesh(hitGeom, classMat);
    classMesh.position.z = Z_BASE;
    classMesh.userData.classId = classData.id;
    classMesh.userData.classType = 'class';
    classMesh.userData.isHyperClass = false;
    const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(hitGeom),
        new THREE.LineBasicMaterial({
            color: cfg.class.borderColor ?? '#000080',
            linewidth: cfg.class.borderWidth ?? 1
        })
    );
    border.name = 'class-border';
    border.raycast = () => {};
    classMesh.add(border);
    applyClassBodyRendering(classMesh, border, bodyRendering, cfg.class, sz, classColor, classOpacity);

    const titleObj = createIconTitleLabel(classData, {
        className: 'label class-label',
        isHyperclass: false,
        textColor: cfg.textColor,
        font: classData.rendering?.font,
        modelFont: classData.modelFont,
        legacyFont: 'bold 16px Arial',
        iconFont: 'bold 18px Arial',
        iconSize: cfg.class.iconSize ?? 0.95,
        legacyPosition: new THREE.Vector3(0, sz.height / 2 - 0.48, Z_OVERLAY),
        iconPosition: new THREE.Vector3(0, sz.height / 2 - 0.54, Z_OVERLAY),
        onIconLoaded: scheduleLabelFontSizeRefresh
    });
    titleObj.userData = {
        ...titleObj.userData,
        labelKind: 'title',
        nodeSize: {width: sz.width, height: sz.height},
        nodeType: 'class',
        text: classData.name ?? 'Class'
    };

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
    hub.userData.hubRadius = 0.04;
    hub.position.copy(hubPos);
    hub.raycast = () => {
    };
    titleObj.raycast = () => {
    };
    classMesh.add(hub);

    classMesh.userData.linkHub = hub;

    classMesh.add(titleObj);
    labels.push(titleObj);


    /* — Attributes: cube + line + label — */
    attachAttributesToMesh(classMesh, classData.attributes ?? [], {
        size: sz,
        attributes: cfg.attributes,
        connections: cfg.connections,
        textColor: cfg.textColor,
        modelFont: classData.modelFont,
        hubPosition: hubPos,
        z: Z_OVERLAY
    });

    return {classMesh};
}

function normalizeClassBodyRendering(classData, classRendering = {}) {
    const rawBodyType = String(classRendering.bodyType ?? classData?.bodyType ?? 'rectangle').trim();
    let bodyType = CLASS_BODY_TYPES.has(rawBodyType) ? rawBodyType : 'rectangle';
    const imageSrc = normalizeClassImageSource(classRendering.imageSrc ?? classRendering.image ?? classData?.imageSrc);
    const imageFit = CLASS_IMAGE_FITS.has(classRendering.imageFit) ? classRendering.imageFit : 'contain';
    const shapeType = CLASS_SHAPE_TYPES.has(classRendering.shapeType) ? classRendering.shapeType : 'roundedRectangle';

    if (bodyType === 'image' && !imageSrc) bodyType = 'rectangle';
    return { bodyType, imageSrc, imageFit, shapeType };
}

function normalizeClassImageSource(value) {
    const clean = String(value ?? '').trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean) || /^data:image\/png[;,]/i.test(clean)) return clean;
    const normalized = clean.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized.toLowerCase().startsWith('images/')) return '';
    if (!/\.png(?:[?#].*)?$/i.test(normalized)) return '';
    return `./${normalized}`;
}

function createClassPanelMaterial(classCfg, classColor, classOpacity) {
    return createClassSurfaceMaterial(classCfg, classColor, classOpacity);
}

export function createClassSurfaceMaterial(classCfg = {}, classColor = new THREE.Color('#FFD700'), classOpacity = 1, options = {}) {
    const materialName = normalizeClassSurfaceMaterial(classCfg.material ?? classCfg.surfaceMaterial);
    const isGlass = materialName === 'glass';
    const opacityFallback = isGlass ? 0.42 : 1;
    const opacitySource = classCfg.opacity === undefined && isGlass ? opacityFallback : (classCfg.opacity ?? classOpacity);
    const opacity = toFiniteNumber(opacitySource, opacityFallback);
    const transparent = options.transparent ?? (opacity < 1 || isGlass);
    const base = {
        color: classColor,
        side: THREE.DoubleSide,
        transparent,
        opacity
    };
    if (options.map) base.map = options.map;
    if (options.alphaTest !== undefined) base.alphaTest = options.alphaTest;
    if (options.depthWrite !== undefined) base.depthWrite = options.depthWrite;

    let material;
    if (materialName === 'flat') {
        material = new THREE.MeshBasicMaterial(base);
        material.userData.hbdsFlatPanel = true;
    } else {
        const profile = CLASS_SURFACE_MATERIAL_PROFILES[materialName] || CLASS_SURFACE_MATERIAL_PROFILES.metallic;
        if (isGlass && typeof THREE.MeshPhysicalMaterial === 'function') {
            material = new THREE.MeshPhysicalMaterial({
                ...base,
                metalness: toFiniteNumber(classCfg.metalness, profile.metalness),
                roughness: toFiniteNumber(classCfg.roughness, profile.roughness),
                transmission: toFiniteNumber(classCfg.transmission, profile.transmission),
                clearcoat: toFiniteNumber(classCfg.clearcoat, profile.clearcoat),
                clearcoatRoughness: toFiniteNumber(classCfg.clearcoatRoughness, profile.clearcoatRoughness),
                emissive: classColor,
                emissiveIntensity: toFiniteNumber(classCfg.emissiveIntensity, profile.emissiveIntensity),
                depthWrite: options.depthWrite ?? false
            });
        } else {
            material = new THREE.MeshStandardMaterial({
                ...base,
                metalness: toFiniteNumber(classCfg.metalness, profile.metalness),
                roughness: toFiniteNumber(classCfg.roughness, profile.roughness),
                emissive: classColor,
                emissiveIntensity: toFiniteNumber(classCfg.emissiveIntensity, profile.emissiveIntensity)
            });
        }
        material.userData.hbdsMetallicPanel = materialName === 'metallic';
    }
    material.userData.hbdsClassPanel = true;
    material.userData.hbdsClassSurfaceMaterial = materialName;
    return material;
}

function createClassHitMaterial() {
    return new THREE.MeshBasicMaterial({
        color: '#ffffff',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.001,
        depthWrite: false
    });
}

function applyClassBodyRendering(classMesh, border, bodyRendering, classCfg, size, classColor, classOpacity) {
    classMesh.userData.classBodyType = bodyRendering.bodyType;
    classMesh.userData.classBodyShapeType = bodyRendering.shapeType;
    classMesh.userData.classBodyImageSrc = bodyRendering.imageSrc;
    classMesh.userData.classBodyImageFit = bodyRendering.imageFit;

    if (bodyRendering.bodyType === 'shape') {
        installShapeClassBody(classMesh, border, bodyRendering, classCfg, size, classColor, classOpacity);
        return;
    }

    if (bodyRendering.bodyType === 'image') {
        installImageClassBody(classMesh, border, bodyRendering, classCfg, size, classColor, classOpacity);
    }
}

function activateTransparentClassHitBody(classMesh, border) {
    classMesh.material?.dispose?.();
    classMesh.material = createClassHitMaterial();
    classMesh.material.userData.hbdsClassHitBody = true;
    if (border) border.visible = false;
}

function installShapeClassBody(classMesh, border, bodyRendering, classCfg, size, classColor, classOpacity) {
    activateTransparentClassHitBody(classMesh, border);
    const visualGeometry = createExtrudedClassBodyGeometry(bodyRendering.shapeType, size, classCfg.cornerRadius);
    const visualMaterial = createClassPanelMaterial(classCfg, classColor, classOpacity);
    const visual = new THREE.Mesh(visualGeometry, visualMaterial);
    visual.name = 'class-shape-body';
    visual.userData.isClassBodyVisual = true;
    visual.raycast = () => {};
    const visualBorder = new THREE.LineSegments(
        new THREE.EdgesGeometry(visualGeometry),
        new THREE.LineBasicMaterial({
            color: classCfg.borderColor ?? '#000080',
            linewidth: classCfg.borderWidth ?? 1
        })
    );
    visualBorder.name = 'class-shape-border';
    visualBorder.raycast = () => {};
    visual.add(visualBorder);
    addClassBodyShapeDecorations(visual, bodyRendering.shapeType, size, classCfg);
    classMesh.add(visual);
}

function installImageClassBody(classMesh, border, bodyRendering, classCfg, size, classColor, classOpacity) {
    classMesh.userData.classBodyImageState = 'loading';
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin?.('anonymous');
    loader.load(
        bodyRendering.imageSrc,
        texture => {
            classMesh.userData.classBodyImageState = 'loaded';
            activateTransparentClassHitBody(classMesh, border);
            texture.colorSpace = THREE.SRGBColorSpace ?? texture.colorSpace;
            texture.needsUpdate = true;
            const imageSize = getTextureImageSize(texture);
            const targetSize = getImageBodyVisualSize(imageSize, size, bodyRendering.imageFit);
            if (bodyRendering.imageFit === 'cover') applyCoverTextureCrop(texture, imageSize, size);
            const visual = new THREE.Mesh(
                new THREE.PlaneGeometry(targetSize.width, targetSize.height),
                createImageBodyMaterial(texture, classCfg, classOpacity)
            );
            visual.name = 'class-image-body';
            visual.userData.isClassBodyVisual = true;
            visual.position.z = 0.004;
            visual.raycast = () => {};
            classMesh.add(visual);
        },
        undefined,
        () => {
            classMesh.userData.classBodyImageState = 'failed';
        }
    );
}

function createImageBodyMaterial(texture, classCfg, classOpacity) {
    const material = createClassSurfaceMaterial(
        {
            ...classCfg,
            metalness: classCfg.metalness ?? 0.18,
            roughness: classCfg.roughness ?? 0.42,
            emissiveIntensity: classCfg.emissiveIntensity ?? 0
        },
        new THREE.Color('#ffffff'),
        classOpacity,
        {
            map: texture,
            transparent: true,
            alphaTest: 0.02,
            depthWrite: false
        }
    );
    material.userData.hbdsImageClassBody = true;
    return material;
}

function getTextureImageSize(texture) {
    const image = texture?.image || {};
    return {
        width: Math.max(1, image.naturalWidth || image.videoWidth || image.width || 1),
        height: Math.max(1, image.naturalHeight || image.videoHeight || image.height || 1)
    };
}

function getImageBodyVisualSize(imageSize, targetSize, fit) {
    if (fit === 'cover') return { width: targetSize.width, height: targetSize.height };
    const scale = Math.min(targetSize.width / imageSize.width, targetSize.height / imageSize.height);
    return {
        width: imageSize.width * scale,
        height: imageSize.height * scale
    };
}

function applyCoverTextureCrop(texture, imageSize, targetSize) {
    const imageAspect = imageSize.width / imageSize.height;
    const targetAspect = targetSize.width / targetSize.height;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    if (imageAspect > targetAspect) {
        const repeatX = targetAspect / imageAspect;
        texture.repeat.x = repeatX;
        texture.offset.x = (1 - repeatX) / 2;
    } else if (imageAspect < targetAspect) {
        const repeatY = imageAspect / targetAspect;
        texture.repeat.y = repeatY;
        texture.offset.y = (1 - repeatY) / 2;
    }
}

function createExtrudedClassBodyGeometry(shapeType, size, cornerRadius = 0.1) {
    return new THREE.ExtrudeGeometry(createClassBodyShape(shapeType, size, cornerRadius), {
        depth: 0.05,
        bevelEnabled: false
    });
}

function createClassBodyShape(shapeType, size, cornerRadius = 0.1) {
    const type = CLASS_SHAPE_TYPES.has(shapeType) ? shapeType : 'roundedRectangle';
    if (type === 'rectangle') {
        return roundedRect(size.width, size.height, 0);
    }
    if (type === 'square') {
        const side = Math.min(size.width, size.height);
        return roundedRect(side, side, 0);
    }
    if (type === 'capsule') {
        return roundedRect(size.width, size.height, Math.min(size.width, size.height) / 2);
    }
    if (type === 'circle' || type === 'ellipse') {
        const shape = new THREE.Shape();
        const radiusX = type === 'circle' ? Math.min(size.width, size.height) / 2 : size.width / 2;
        const radiusY = type === 'circle' ? Math.min(size.width, size.height) / 2 : size.height / 2;
        shape.absellipse(0, 0, radiusX, radiusY, 0, Math.PI * 2, false, 0);
        return shape;
    }
    if (type === 'diamond') {
        return createClassPolygonShape([
            [0, size.height / 2],
            [size.width / 2, 0],
            [0, -size.height / 2],
            [-size.width / 2, 0]
        ]);
    }
    if (type === 'triangle') {
        return createClassPolygonShape([
            [0, size.height / 2],
            [size.width / 2, -size.height / 2],
            [-size.width / 2, -size.height / 2]
        ]);
    }
    if (type === 'pentagon') {
        return createRegularPolygonShape(5, size, -Math.PI / 2);
    }
    if (type === 'hexagon') {
        return createRegularPolygonShape(6, size, Math.PI / 6);
    }
    if (type === 'octagon') {
        return createRegularPolygonShape(8, size, Math.PI / 8);
    }
    if (type === 'star') {
        return createStarShape(size);
    }
    if (type === 'parallelogram') {
        const skew = size.width * 0.18;
        return createClassPolygonShape([
            [-size.width / 2 + skew, size.height / 2],
            [size.width / 2, size.height / 2],
            [size.width / 2 - skew, -size.height / 2],
            [-size.width / 2, -size.height / 2]
        ]);
    }
    if (type === 'trapezoid') {
        const inset = size.width * 0.18;
        return createClassPolygonShape([
            [-size.width / 2 + inset, size.height / 2],
            [size.width / 2 - inset, size.height / 2],
            [size.width / 2, -size.height / 2],
            [-size.width / 2, -size.height / 2]
        ]);
    }
    if (type === 'invertedTrapezoid') {
        const inset = size.width * 0.18;
        return createClassPolygonShape([
            [-size.width / 2, size.height / 2],
            [size.width / 2, size.height / 2],
            [size.width / 2 - inset, -size.height / 2],
            [-size.width / 2 + inset, -size.height / 2]
        ]);
    }
    if (type === 'document') {
        return createDocumentShape(size);
    }
    if (type === 'paperTape') {
        return createPaperTapeShape(size);
    }
    if (type === 'predefinedProcess' || type === 'internalStorage' || type === 'table' || type === 'tableColumns' || type === 'tableRows' || type === 'textLines' || type === 'bracketedList') {
        return roundedRect(size.width, size.height, 0);
    }
    if (type === 'manualInput') {
        return createClassPolygonShape([
            [-size.width / 2, size.height * 0.3],
            [size.width / 2, size.height / 2],
            [size.width / 2, -size.height / 2],
            [-size.width / 2, -size.height / 2]
        ]);
    }
    if (type === 'database') {
        return createDatabaseShape(size);
    }
    if (type === 'directAccessStorage') {
        return createDirectAccessStorageShape(size);
    }
    if (type === 'display') {
        return createDisplayShape(size);
    }
    if (type === 'storedData') {
        return createStoredDataShape(size);
    }
    if (type === 'triangleDown') {
        return createClassPolygonShape([
            [-size.width / 2, size.height / 2],
            [size.width / 2, size.height / 2],
            [0, -size.height / 2]
        ]);
    }
    if (type === 'circlePlus' || type === 'circleX') {
        const shape = new THREE.Shape();
        const radius = Math.min(size.width, size.height) / 2;
        shape.absellipse(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
        return shape;
    }
    if (type === 'offPageConnector') {
        return createClassPolygonShape([
            [-size.width / 2, size.height / 2],
            [size.width / 2, size.height / 2],
            [size.width / 2, -size.height * 0.14],
            [0, -size.height / 2],
            [-size.width / 2, -size.height * 0.14]
        ]);
    }
    if (type === 'braceLeft') {
        return createBraceShape(size, -1);
    }
    if (type === 'braceRight') {
        return createBraceShape(size, 1);
    }
    return roundedRect(size.width, size.height, cornerRadius);
}

function createDocumentShape(size) {
    const w = size.width;
    const h = size.height;
    const amp = Math.min(h * 0.12, w * 0.08);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.lineTo(w / 2, -h / 2 + amp * 0.35);
    shape.bezierCurveTo(w * 0.25, -h / 2 - amp, w * 0.08, -h / 2 + amp, -w * 0.12, -h / 2);
    shape.bezierCurveTo(-w * 0.28, -h / 2 - amp, -w * 0.38, -h / 2 + amp, -w / 2, -h / 2);
    shape.lineTo(-w / 2, h / 2);
    return shape;
}

function createPaperTapeShape(size) {
    const w = size.width;
    const h = size.height;
    const amp = Math.min(h * 0.13, w * 0.08);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, h / 2 - amp * 0.45);
    shape.bezierCurveTo(-w * 0.28, h / 2 + amp, w * 0.08, h / 2 - amp, w / 2, h / 2);
    shape.lineTo(w / 2, -h / 2 + amp * 0.45);
    shape.bezierCurveTo(w * 0.24, -h / 2 - amp, -w * 0.08, -h / 2 + amp, -w / 2, -h / 2);
    shape.lineTo(-w / 2, h / 2 - amp * 0.45);
    return shape;
}

function createDatabaseShape(size) {
    const w = size.width;
    const h = size.height;
    const ellipseH = Math.min(h * 0.2, w * 0.16);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, h / 2 - ellipseH);
    shape.bezierCurveTo(-w / 2, h / 2, w / 2, h / 2, w / 2, h / 2 - ellipseH);
    shape.lineTo(w / 2, -h / 2 + ellipseH);
    shape.bezierCurveTo(w / 2, -h / 2, -w / 2, -h / 2, -w / 2, -h / 2 + ellipseH);
    shape.lineTo(-w / 2, h / 2 - ellipseH);
    return shape;
}

function createDirectAccessStorageShape(size) {
    const w = size.width;
    const h = size.height;
    const ellipseW = Math.min(w * 0.2, h * 0.2);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + ellipseW, h / 2);
    shape.lineTo(w / 2 - ellipseW, h / 2);
    shape.bezierCurveTo(w / 2, h / 2, w / 2, -h / 2, w / 2 - ellipseW, -h / 2);
    shape.lineTo(-w / 2 + ellipseW, -h / 2);
    shape.bezierCurveTo(-w / 2, -h / 2, -w / 2, h / 2, -w / 2 + ellipseW, h / 2);
    return shape;
}

function createDisplayShape(size) {
    const w = size.width;
    const h = size.height;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.lineTo(w * 0.1, h / 2);
    shape.bezierCurveTo(w * 0.52, h / 2, w * 0.52, -h / 2, w * 0.1, -h / 2);
    shape.lineTo(-w / 2, -h / 2);
    return shape;
}

function createStoredDataShape(size) {
    const w = size.width;
    const h = size.height;
    const shape = new THREE.Shape();
    shape.moveTo(-w * 0.36, h / 2);
    shape.lineTo(w * 0.34, h / 2);
    shape.bezierCurveTo(w * 0.54, h * 0.32, w * 0.54, -h * 0.32, w * 0.34, -h / 2);
    shape.lineTo(-w * 0.36, -h / 2);
    shape.bezierCurveTo(-w * 0.14, -h * 0.3, -w * 0.14, h * 0.3, -w * 0.36, h / 2);
    return shape;
}

function createBraceShape(size, side = -1) {
    const w = size.width;
    const h = size.height;
    const leftPoints = [
        [-w * 0.06, h / 2],
        [-w * 0.34, h / 2],
        [-w * 0.48, h * 0.3],
        [-w * 0.24, h * 0.1],
        [-w * 0.48, 0],
        [-w * 0.24, -h * 0.1],
        [-w * 0.48, -h * 0.3],
        [-w * 0.34, -h / 2],
        [-w * 0.06, -h / 2],
        [-w * 0.22, -h * 0.28],
        [w * 0.04, -h * 0.08],
        [-w * 0.18, 0],
        [w * 0.04, h * 0.08],
        [-w * 0.22, h * 0.28]
    ];
    return createClassPolygonShape(side < 0 ? leftPoints : leftPoints.map(([x, y]) => [-x, y]));
}

function addClassBodyShapeDecorations(visual, shapeType, size, classCfg) {
    const polylines = getClassBodyShapeDecorationPolylines(shapeType, size);
    if (!polylines.length) return;
    const material = new THREE.LineBasicMaterial({
        color: classCfg.borderColor ?? '#000080',
        linewidth: classCfg.borderWidth ?? 1,
        depthTest: false
    });
    const group = new THREE.Group();
    group.name = 'class-shape-decoration';
    group.position.z = 0.058;
    group.renderOrder = 10;
    group.raycast = () => {};
    polylines.forEach((points, index) => {
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => new THREE.Vector3(x, y, 0))),
            material
        );
        line.name = `class-shape-decoration-line-${index}`;
        line.raycast = () => {};
        group.add(line);
    });
    visual.add(group);
}

function getClassBodyShapeDecorationPolylines(shapeType, size) {
    const w = size.width;
    const h = size.height;
    const left = -w / 2;
    const right = w / 2;
    const top = h / 2;
    const bottom = -h / 2;
    if (shapeType === 'predefinedProcess') {
        const inset = w * 0.18;
        return [
            [[left + inset, bottom], [left + inset, top]],
            [[right - inset, bottom], [right - inset, top]]
        ];
    }
    if (shapeType === 'internalStorage') {
        return [
            [[left + w * 0.25, bottom], [left + w * 0.25, top]],
            [[left, top - h * 0.25], [right, top - h * 0.25]]
        ];
    }
    if (shapeType === 'database') {
        const ellipseH = Math.min(h * 0.2, w * 0.16);
        return [createEllipsePolyline(0, top - ellipseH, w / 2, ellipseH, 0, Math.PI * 2, 40)];
    }
    if (shapeType === 'directAccessStorage') {
        const ellipseW = Math.min(w * 0.2, h * 0.2);
        return [createEllipsePolyline(left + ellipseW, 0, ellipseW, h / 2, 0, Math.PI * 2, 40)];
    }
    if (shapeType === 'circlePlus') {
        const radius = Math.min(w, h) * 0.28;
        return [
            [[-radius, 0], [radius, 0]],
            [[0, -radius], [0, radius]]
        ];
    }
    if (shapeType === 'circleX') {
        const radius = Math.min(w, h) * 0.24;
        return [
            [[-radius, -radius], [radius, radius]],
            [[-radius, radius], [radius, -radius]]
        ];
    }
    if (shapeType === 'table' || shapeType === 'tableColumns' || shapeType === 'tableRows') {
        const lines = [];
        if (shapeType !== 'tableRows') {
            lines.push([[left + w / 3, bottom], [left + w / 3, top]]);
            lines.push([[right - w / 3, bottom], [right - w / 3, top]]);
        }
        if (shapeType !== 'tableColumns') {
            lines.push([[left, bottom + h / 3], [right, bottom + h / 3]]);
            lines.push([[left, top - h / 3], [right, top - h / 3]]);
        }
        return lines;
    }
    if (shapeType === 'textLines') {
        const x0 = left + w * 0.22;
        const x1 = right - w * 0.16;
        return [-0.22, 0, 0.22].map(offset => [[x0, h * offset], [x1, h * offset]]);
    }
    if (shapeType === 'bracketedList') {
        const bracketX = left + w * 0.16;
        const bracketEnd = left + w * 0.28;
        const lineX = left + w * 0.38;
        const lineEnd = right - w * 0.12;
        const yTop = top - h * 0.18;
        const yBottom = bottom + h * 0.18;
        return [
            [[bracketEnd, yTop], [bracketX, yTop], [bracketX, yBottom], [bracketEnd, yBottom]],
            [[lineX, h * 0.22], [lineEnd, h * 0.22]],
            [[lineX, 0], [lineEnd, 0]],
            [[lineX, -h * 0.22], [lineEnd, -h * 0.22]]
        ];
    }
    return [];
}

function createEllipsePolyline(cx, cy, rx, ry, startAngle, endAngle, segments = 32) {
    const points = [];
    for (let index = 0; index <= segments; index += 1) {
        const angle = startAngle + (endAngle - startAngle) * index / segments;
        points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
    }
    return points;
}

function createRegularPolygonShape(sides, size, rotation = 0) {
    const points = [];
    for (let index = 0; index < sides; index += 1) {
        const angle = rotation + index * Math.PI * 2 / sides;
        points.push([Math.cos(angle) * size.width / 2, Math.sin(angle) * size.height / 2]);
    }
    return createClassPolygonShape(points);
}

function createStarShape(size) {
    const points = [];
    const outerX = size.width / 2;
    const outerY = size.height / 2;
    const innerX = outerX * 0.48;
    const innerY = outerY * 0.48;
    for (let index = 0; index < 10; index += 1) {
        const outer = index % 2 === 0;
        const angle = -Math.PI / 2 + index * Math.PI / 5;
        points.push([
            Math.cos(angle) * (outer ? outerX : innerX),
            Math.sin(angle) * (outer ? outerY : innerY)
        ]);
    }
    return createClassPolygonShape(points);
}

function createClassPolygonShape(points) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], index) => {
        if (index === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    });
    shape.closePath();
    return shape;
}

export function attachAttributesToMesh(classMesh, attributes, options = {}) {
    const size = options.size ?? {width: 1, height: 2};
    const attrCfg = normalizeAttributeRenderingConfig(options.attributes);
    const connCfg = options.connections ?? {lineColor: "#000000", lineWidth: 0.01};
    const textColor = options.textColor ?? "#000000";
    const modelFont = normalizeLabelFontSettings(options.modelFont);

    const cbW = attrCfg.size.width;
    const cbH = attrCfg.size.height ?? cbW;
    const gapY = options.gapY ?? 0.17;
    const startY = options.startY ?? (size.height / 2 - 0.1);
    const colX = options.colX ?? (size.width / 2 + 0.25 + cbW);
    const hubPos = options.hubPosition ?? new THREE.Vector3((size.width * 0.9) / 2, (size.height * 0.9) / 2, options.z ?? 0.06);
    const z = options.z ?? 0.06;

    attributes.forEach((attribute, idx) => {
        const attrName = getAttributeDisplayName(attribute, idx);
        const y = startY - idx * gapY;

        const marker = new THREE.Mesh(
            createAttributeMarkerGeometry(attrCfg),
            createAttributeMarkerMaterial(attrCfg)
        );
        marker.name = 'attribute-marker';
        marker.userData.attributeName = attrName;
        marker.userData.attributeIndex = idx;
        marker.userData.attributeShape = attrCfg.shape;
        marker.position.set(colX, y, z);
        marker.raycast = () => {
        };
        classMesh.add(marker);

        // connecting line
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([hubPos, marker.position.clone()]),
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
        const fontSettings = resolveLabelFontSettings(getAttributeFontSettings(attribute) ?? attrCfg.font, modelFont);
        aDiv.className = 'label attribute-label';
        aDiv.style.color = textColor;
        applyLabelFontSettings(aDiv, fontSettings);
        aDiv.style.lineHeight = '1.05';
        aDiv.style.whiteSpace = 'nowrap';
        aDiv.textContent = attrName;
        const aLbl = new CSS2DObject(aDiv);
        aLbl.position.set(colX + cbW + 0.06, y, z);
        aLbl.center.set(0, 0.5);
        aLbl.userData = {
            labelKind: 'attribute',
            text: attrName,
            gapY,
            maxWorldWidth: options.attributeLabelMaxWidth ?? 2.25,
            fontSettings
        };
        classMesh.add(aLbl);
        labels.push(aLbl);
    });
}

export function createIconTitleLabel(classData, options = {}) {
    const label = document.createElement('div');
    const name = classData?.name ?? (options.isHyperclass ? 'Hyperclass' : 'Class');
    const width = classData?.size?.width ?? (options.isHyperclass ? 4 : 1.2);
    const estimatedTitleWidth = Math.max(130, name.length * 14 + (options.iconSize ? options.iconSize * 20 : 38));
    const maxTextWidth = options.titleMaxWidth ?? Math.max(estimatedTitleWidth, Math.min(420, width * 120));
    const fontSettings = resolveLabelFontSettings(options.font ?? classData?.rendering?.font, options.modelFont ?? classData?.modelFont);
    label.className = options.className ?? 'label class-label';
    label.setAttribute('data-class', name);
    label.setAttribute('data-hyperclass', options.isHyperclass ? 'true' : 'false');
    label.style.color = options.textColor ?? '#000000';
    applyLabelFontSettings(label, fontSettings);
    label.style.maxWidth = `${maxTextWidth}px`;
    label.style.overflow = 'visible';
    label.style.textAlign = 'center';
    label.style.textOverflow = 'clip';
    label.style.whiteSpace = 'nowrap';
    label.style.overflowWrap = 'normal';
    label.style.lineHeight = '1.12';
    label.textContent = name;

    const labelObj = new CSS2DObject(label);
    labelObj.position.copy(options.legacyPosition ?? new THREE.Vector3(0, 0, 0.06));
    labelObj.userData = {
        ...labelObj.userData,
        labelKind: 'title',
        nodeSize: {width, height: classData?.size?.height ?? (options.isHyperclass ? 3.2 : 1.6)},
        nodeType: options.isHyperclass ? 'hyperclass' : 'class',
        text: name,
        fontSettings
    };
    installOptionalIcon(label, labelObj, classData, options);
    return labelObj;
}

function installOptionalIcon(label, labelObj, classData, options) {
    const name = classData?.name ?? '';
    const estimatedTitleWidth = Math.max(130, String(name).length * 14 + (options.iconSize ? options.iconSize * 20 : 38));

    const img = new Image();

    img.onload = () => {
        const icon = img.cloneNode(false);
        const title = document.createElement('span');
        const row = document.createElement('span');
        title.textContent = classData?.rendering?.iconTitleText ?? classData?.name ?? '';

        row.append(icon, title);
        label.replaceChildren(row);
        label.classList.add('hbds-icon-title');
        label.dataset.iconSrc = img.src;
        label.style.padding = '0';
        label.style.background = 'transparent';
        label.style.boxShadow = 'none';
        const currentFontSize = label.style.fontSize || globalThis.getComputedStyle?.(label)?.fontSize;
        if (labelObj.userData?.fontSettings) {
            applyLabelFontSettings(label, labelObj.userData.fontSettings);
        } else {
            label.style.fontWeight = '700';
            label.style.fontFamily = 'Arial, sans-serif';
            if (currentFontSize) label.style.fontSize = currentFontSize;
        }
        label.style.lineHeight = '1';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'visible';
        label.style.maxWidth = `${options.titleMaxWidth ?? Math.max(estimatedTitleWidth, Math.min(460, (classData?.size?.width ?? 1.2) * 126))}px`;

        row.className = 'hbds-icon-title-row';
        row.style.display = 'inline-flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '0.34em';
        row.style.maxWidth = '100%';
        row.style.width = 'auto';
        row.style.background = 'transparent';
        row.style.lineHeight = '1';
        row.style.verticalAlign = 'middle';
        row.style.whiteSpace = 'nowrap';

        title.style.display = 'inline-block';
        title.style.lineHeight = '1.12';
        title.style.verticalAlign = 'middle';
        title.style.maxWidth = 'none';
        title.style.overflow = 'visible';
        title.style.textOverflow = 'clip';
        title.style.whiteSpace = 'nowrap';
        title.style.overflowWrap = 'normal';

        icon.alt = '';
        icon.decoding = 'async';
        icon.draggable = false;
        icon.src = getTransparentPngSource(img) ?? img.src;
        icon.style.width = `${options.iconSize ?? 1.7}em`;
        icon.style.height = `${options.iconSize ?? 1.7}em`;
        icon.style.objectFit = 'contain';
        icon.style.flex = '0 0 auto';
        icon.style.imageRendering = 'auto';
        icon.style.background = 'transparent';
        icon.style.mixBlendMode = classData?.rendering?.iconBlendMode ?? options.iconBlendMode ?? 'multiply';
        icon.style.display = 'block';

        if (options.iconPosition) labelObj.position.copy(options.iconPosition);
        options.onIconLoaded?.(labelObj, label);
    };
    img.onerror = () => {
        if (img.dataset.fallbackAttempted === 'true') return;
        img.dataset.fallbackAttempted = 'true';
        if (!isSameIconPath(img.src, DEFAULT_EMPTY_ICON_PATH)) img.src = DEFAULT_EMPTY_ICON_PATH;
    };
    resolveIconPathForClass(classData).then((resolvedPath) => {
        img.src = resolvedPath ?? DEFAULT_EMPTY_ICON_PATH;
    });
}

function normalizeAttributeRenderingConfig(config = {}) {
    const source = config && typeof config === 'object' ? config : {};
    const size = source.size && typeof source.size === 'object' ? source.size : {};
    const width = toPositiveNumber(size.width, 0.1);
    const height = toPositiveNumber(size.height ?? size.width, width);
    return {
        ...source,
        checkboxColor: source.checkboxColor ?? '#A9A9A9',
        checkboxMaterial: source.checkboxMaterial ?? source.material ?? 'metallic',
        shape: source.shape ?? 'square',
        metalness: toFiniteNumber(source.metalness, 0.2),
        roughness: toFiniteNumber(source.roughness, 0.5),
        opacity: toFiniteNumber(source.opacity, 1),
        size: {width, height}
    };
}

function createAttributeMarkerGeometry(attrCfg) {
    const width = attrCfg.size.width;
    const height = attrCfg.size.height ?? width;
    const shape = String(attrCfg.shape || 'square').toLowerCase();

    if (shape === 'circle' || shape === 'ellipse') {
        const geometry = new THREE.CircleGeometry(0.5, 32);
        geometry.scale(width, height, 1);
        return geometry;
    }

    if (shape === 'diamond') {
        return createAttributeShapeGeometry([
            [0, height / 2],
            [width / 2, 0],
            [0, -height / 2],
            [-width / 2, 0]
        ]);
    }

    if (shape === 'triangle') {
        return createAttributeShapeGeometry([
            [0, height / 2],
            [width / 2, -height / 2],
            [-width / 2, -height / 2]
        ]);
    }

    return new THREE.BoxGeometry(width, height, width);
}

function createAttributeShapeGeometry(points) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], index) => {
        if (index === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    });
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
}

function createAttributeMarkerMaterial(attrCfg) {
    const transparent = attrCfg.opacity < 1;
    const base = {
        color: attrCfg.checkboxColor,
        side: THREE.DoubleSide,
        transparent,
        opacity: attrCfg.opacity
    };
    const material = String(attrCfg.checkboxMaterial || 'metallic').toLowerCase();
    if (material === 'flat' || material === 'basic') {
        return new THREE.MeshBasicMaterial(base);
    }
    return new THREE.MeshStandardMaterial({
        ...base,
        metalness: attrCfg.metalness,
        roughness: attrCfg.roughness
    });
}

function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function toPositiveNumber(value, fallback) {
    const number = toFiniteNumber(value, fallback);
    return number > 0 ? number : fallback;
}

function getTransparentPngSource(image) {
    if (!isPngIcon(image.src)) return null;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        if (!canvas.width || !canvas.height) return null;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(image, 0, 0);

        const data = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let index = 0; index < data.data.length; index += 4) {
            const red = data.data[index];
            const green = data.data[index + 1];
            const blue = data.data[index + 2];
            const alpha = data.data[index + 3];
            if (alpha === 0) continue;

            const min = Math.min(red, green, blue);
            const max = Math.max(red, green, blue);
            const spread = max - min;
            if (min >= 225 && spread <= 36) data.data[index + 3] = 0;
        }

        context.putImageData(data, 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}

function isPngIcon(src) {
    try {
        const url = new URL(src, window.location.href);
        return url.pathname.toLowerCase().endsWith('.png');
    } catch {
        return /\.png(?:$|[?#])/i.test(String(src || ''));
    }
}

function isSameIconPath(src, path) {
    try {
        return new URL(src, window.location.href).href === new URL(path, window.location.href).href;
    } catch {
        return String(src || '') === String(path || '');
    }
}

async function resolveIconPathForClass(classData) {
    const explicit = getExplicitIconPath(classData);
    const manifestLookup = await getIconManifestLookup();

    if (explicit) {
        const manifestPath = getManifestIconPath(manifestLookup, explicit);
        if (manifestPath) return manifestPath;

        const directPath = getDirectExplicitIconPath(explicit);
        if (directPath) return directPath;
    }

    if (classData?.name) {
        const manifestPath = getManifestIconPath(manifestLookup, String(classData.name));
        if (manifestPath) return manifestPath;
    }

    return DEFAULT_EMPTY_ICON_PATH;
}

function getExplicitIconPath(classData) {
    return classData?.icon
        ?? classData?.iconPath
        ?? classData?.rendering?.icon
        ?? classData?.rendering?.iconPath
        ?? classData?.rendering?.class?.icon
        ?? classData?.rendering?.class?.iconPath
        ?? null;
}

function getIconManifestLookup() {
    if (!iconManifestLookupPromise) {
        iconManifestLookupPromise = fetch(ICON_MANIFEST_PATH)
            .then(response => response.ok ? response.json() : null)
            .then(buildIconManifestLookup)
            .catch(() => new Map());
    }
    return iconManifestLookupPromise;
}

function buildIconManifestLookup(manifest) {
    const lookup = new Map();
    const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];

    icons.forEach((entry) => {
        const iconPath = getIconPathFromManifestEntry(entry);
        if (!iconPath) return;
        addIconLookupAlias(lookup, entry.name, iconPath);
        addIconLookupAlias(lookup, entry.icon, iconPath);
    });

    return lookup;
}

function getIconPathFromManifestEntry(entry) {
    const icon = String(entry?.icon ?? '').trim();
    if (!icon) return null;
    if (isPathLike(icon)) return icon;
    return `./icons/${encodeURIComponent(icon)}`;
}

function addIconLookupAlias(lookup, value, iconPath) {
    for (const key of getIconLookupKeys(value)) {
        if (!lookup.has(key)) lookup.set(key, iconPath);
    }
}

function getManifestIconPath(lookup, value) {
    for (const key of getIconLookupKeys(value)) {
        const iconPath = lookup?.get(key);
        if (iconPath) return iconPath;
    }
    return null;
}

function getIconLookupKeys(value) {
    const clean = String(value ?? '').trim();
    if (!clean) return [];

    const decoded = safeDecodeURIComponent(clean);
    const leaf = decoded.split(/[?#]/)[0].split(/[\\/]/).pop() ?? decoded;
    const leafWithoutExtension = leaf.replace(/\.[a-z0-9]+$/i, '');
    const aliases = [
        clean,
        decoded,
        leaf,
        leafWithoutExtension,
        ...getIconNameVariants(decoded),
        ...getIconNameVariants(leaf),
        ...getIconNameVariants(leafWithoutExtension)
    ];

    const keys = new Set();
    aliases.forEach((alias) => {
        const key = getIconLookupKey(alias);
        if (key) keys.add(key);
    });
    return [...keys];
}

function getIconLookupKey(value) {
    const clean = String(value ?? '').trim();
    if (!clean) return '';
    const decoded = safeDecodeURIComponent(clean);
    const leaf = decoded.split(/[?#]/)[0].split(/[\\/]/).pop() ?? decoded;
    return getSafeIconFilename(leaf.replace(/\.[a-z0-9]+$/i, ''));
}

function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function getDirectExplicitIconPath(value) {
    const clean = String(value ?? '').trim();
    if (!clean) return null;
    const hasExtension = /\.[a-z0-9]+(?:[?#].*)?$/i.test(clean);
    if (isPathLike(clean)) return clean;
    if (hasExtension) return `./icons/${encodeURIComponent(clean)}`;
    return null;
}

function getIconNameVariants(name) {
    const trimmed = name.trim();
    if (!trimmed) return [];
    const spaced = trimmed.replace(/\s+/g, ' ');
    const underscored = spaced.replace(/\s+/g, '_');
    const hyphenated = spaced.replace(/\s+/g, '-');
    const compact = spaced.replace(/\s+/g, '');
    const safe = getSafeIconFilename(spaced);
    return [
        spaced,
        spaced.toLowerCase(),
        spaced.toUpperCase(),
        underscored,
        underscored.toLowerCase(),
        hyphenated,
        hyphenated.toLowerCase(),
        compact,
        compact.toLowerCase(),
        safe
    ];
}

function getSafeIconFilename(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function isPathLike(value) {
    return /^(?:\.{0,2}\/|\/|https?:|data:)/i.test(value) || value.includes('/');
}

function getAttributeDisplayName(attribute, index) {
    if (typeof attribute === 'string') return attribute;
    if (typeof attribute === 'number' || typeof attribute === 'boolean') return String(attribute);
    if (!attribute || typeof attribute !== 'object') return `attribute${index + 1}`;
    return String(attribute.name ?? attribute.label ?? attribute.title ?? attribute.id ?? `attribute${index + 1}`);
}

function getAttributeFontSettings(attribute) {
    if (!attribute || typeof attribute !== 'object') return null;
    return attribute.font ?? attribute.rendering?.font ?? null;
}
/**
 * NEW: Dynamically scales CSS2D labels based on camera distance.
 * @param {THREE.Camera} camera - The scene camera.
 */
const labels = []; // Store all labels for easy access
let lastSizingCamera = null;
let lastSizingRenderer = null;
let labelFontSizeRefreshScheduled = false;

function scheduleLabelFontSizeRefresh() {
    if (!lastSizingCamera || labelFontSizeRefreshScheduled) return;
    labelFontSizeRefreshScheduled = true;
    const schedule = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : callback => setTimeout(callback, 0);
    schedule(() => {
        labelFontSizeRefreshScheduled = false;
        if (lastSizingCamera) updateLabelFontSizes(lastSizingCamera, lastSizingRenderer);
    });
}

export function updateLabelFontSizes(camera, renderer) {
    lastSizingCamera = camera ?? lastSizingCamera;
    lastSizingRenderer = renderer ?? lastSizingRenderer;
    const tempVec = new THREE.Vector3();
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);
    const viewportHeight = Math.max(1, renderer?.domElement?.clientHeight ?? globalThis.innerHeight ?? 800);

    labels.forEach(label => {
        if (!label.element) return;

        label.getWorldPosition(tempVec);
        const distance = tempVec.distanceTo(cameraPos);
        const pixelsPerWorldUnit = getPixelsPerWorldUnit(camera, distance, viewportHeight);

        if (label.element.classList.contains('class-label')) {
            const nodeWidth = label.userData?.nodeSize?.width ?? label.parent?.userData?.modelData?.size?.width ?? 1.2;
            const availableWidthPx = Math.max(42, (nodeWidth - 0.22) * pixelsPerWorldUnit);
            const distanceSize = THREE.MathUtils.clamp(132 / Math.max(distance, 1e-6), 3.2, 19);
            const verticalCap = Math.max(1.4, 0.22 * pixelsPerWorldUnit);
            const text = label.userData?.text || label.element.textContent || '';
            const fitSize = getFontSizeForTextWidth(text, availableWidthPx, label.element.classList.contains('hbds-icon-title') ? 1.25 : 0);
            const configuredSize = Number(label.userData?.fontSettings?.size);
            const dynamicSize = THREE.MathUtils.clamp(Math.min(distanceSize, fitSize, verticalCap), 1.4, 19);
            const fontSize = Number.isFinite(configuredSize)
                ? Math.max(1.4, Math.min(configuredSize, dynamicSize))
                : dynamicSize;
            applyTitleLabelSizing(label.element, availableWidthPx, fontSize);
        } else {
            const maxWorldWidth = label.userData?.maxWorldWidth ?? 1.75;
            const availableWidthPx = Math.max(34, maxWorldWidth * pixelsPerWorldUnit);
            const gapY = label.userData?.gapY ?? 0.17;
            const verticalCap = Math.max(1.1, gapY * pixelsPerWorldUnit * 0.78);
            const distanceSize = THREE.MathUtils.clamp(110 / Math.max(distance, 1e-6), 1.1, 11.2);
            const configuredSize = Number(label.userData?.fontSettings?.size);
            const dynamicSize = THREE.MathUtils.clamp(Math.min(distanceSize, verticalCap), 1.1, 11.2);
            const fontSize = Number.isFinite(configuredSize)
                ? Math.max(1.1, Math.min(configuredSize, dynamicSize))
                : dynamicSize;
            applyAttributeLabelSizing(label.element, availableWidthPx, fontSize);
        }
        label.element.style.transform = 'translateZ(0)';
    });
}

function getPixelsPerWorldUnit(camera, distance, viewportHeight) {
    if (camera?.isPerspectiveCamera) {
        const fov = camera.fov * Math.PI / 180;
        return viewportHeight / Math.max(1e-6, 2 * Math.tan(fov / 2) * Math.max(distance, 1e-6));
    }
    if (camera?.isOrthographicCamera) {
        return viewportHeight / Math.max(1e-6, camera.top - camera.bottom);
    }
    return 80;
}

function getFontSizeForTextWidth(text, availableWidthPx, extraEm = 0) {
    const estimatedEm = Math.max(1, String(text || '').length * 0.62 + extraEm);
    return availableWidthPx / estimatedEm;
}

function applyTitleLabelSizing(element, availableWidthPx, fontSize) {
    element.style.fontSize = `${fontSize.toFixed(1)}px`;
    if (element.__hbdsFontSettings) applyLabelFontSettings(element, {...element.__hbdsFontSettings, size: fontSize});
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
        title.style.maxWidth = `${Math.max(24, Math.round(availableWidthPx - iconWidth))}px`;
        title.style.overflow = 'hidden';
        title.style.textOverflow = 'ellipsis';
        title.style.whiteSpace = 'nowrap';
    }
}

function applyAttributeLabelSizing(element, availableWidthPx, fontSize) {
    element.style.fontSize = `${fontSize.toFixed(1)}px`;
    if (element.__hbdsFontSettings) applyLabelFontSettings(element, {...element.__hbdsFontSettings, size: fontSize});
    element.style.lineHeight = '1';
    element.style.maxWidth = `${Math.round(availableWidthPx)}px`;
    element.style.overflow = 'hidden';
    element.style.textOverflow = 'ellipsis';
    element.style.whiteSpace = 'nowrap';
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

export function createClassData(input={}, defaults={}) {
  return normalizeClassData({ ...defaults, ...input, id: input.id ?? `class_${Math.random().toString(36).slice(2,8)}`, type: input.type && input.type!=='hyperclass' ? input.type : 'roundedRectangle' });
}
export function updateClassData(classData, patch={}) { return normalizeClassData({ ...classData, ...patch, rendering: { ...(classData.rendering||{}), ...(patch.rendering||{}) } }); }
export function deleteClassData(currentData, classId){ const next=JSON.parse(JSON.stringify(currentData)); next.hypergraph.class=(next.hypergraph.class||[]).filter(c=>c.id!==classId); return next; }
export function normalizeClassData(classData={}) {
  const name=classData.name||'Class';
  const size=classData.size||{width:1.2,height:1.6};
  const titleWidth=Math.min(5.4,Math.max(1.2,name.length*0.115+0.52));
  return {
    ...classData,
    name,
    attributes: Array.isArray(classData.attributes)?classData.attributes:[],
    position: classData.position||{x:0,y:0,z:0},
    size:{...size,width:Math.max(size.width||0,titleWidth),height:size.height||1.6},
    type: classData.type==='hyperclass'?'roundedRectangle':(classData.type||'roundedRectangle')
  };
}
export function validateClassData(classData){ const errors=[]; if(!classData?.id) errors.push('missing id'); if(!Array.isArray(classData?.attributes)) errors.push('attributes must be array'); return { valid: errors.length===0, errors, warnings: [] }; }
