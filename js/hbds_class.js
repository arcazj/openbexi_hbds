/* ─────────────────────────────── Imports ─────────────────────────────── */
import * as THREE from 'three';
import {CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';

const DEFAULT_EMPTY_ICON_PATH = './icons/empty.png';
const ICON_MANIFEST_PATH = './icons/generated_icons_manifest.json';
let iconManifestLookupPromise = null;

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
    const classColor = new THREE.Color(cfg.class.metallicColor ?? cfg.class.color);
    const classOpacity = cfg.class.opacity ?? 1;
    const classMat = new THREE.MeshStandardMaterial({
        color: classColor,
        metalness: cfg.class.metalness ?? 0.46,
        roughness: cfg.class.roughness ?? 0.24,
        emissive: classColor,
        emissiveIntensity: cfg.class.emissiveIntensity ?? 0.035,
        side: THREE.DoubleSide,
        transparent: classOpacity < 1,
        opacity: classOpacity
    });
    classMat.userData.hbdsMetallicPanel = true;
    classMat.userData.hbdsClassPanel = true;
    const classMesh = new THREE.Mesh(extrudeGeom, classMat);
    classMesh.position.z = Z_BASE;
    classMesh.userData.classId = classData.id;
    classMesh.userData.classType = 'class';
    classMesh.userData.isHyperClass = false;
    const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(extrudeGeom),
        new THREE.LineBasicMaterial({
            color: cfg.class.borderColor ?? '#000080',
            linewidth: cfg.class.borderWidth ?? 1
        })
    );
    border.name = 'class-border';
    border.raycast = () => {};
    classMesh.add(border);

    const titleObj = createIconTitleLabel(classData, {
        className: 'label class-label',
        isHyperclass: false,
        textColor: cfg.textColor,
        legacyFont: 'bold 16px Arial',
        iconFont: 'bold 18px Arial',
        iconSize: cfg.class.iconSize ?? 0.95,
        legacyPosition: new THREE.Vector3(0, sz.height / 2 - 0.48, Z_OVERLAY),
        iconPosition: new THREE.Vector3(0, sz.height / 2 - 0.54, Z_OVERLAY),
        onIconLoaded: () => {
            if (lastSizingCamera) updateLabelFontSizes(lastSizingCamera, lastSizingRenderer);
        }
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
    const gapY = options.gapY ?? 0.17;
    const startY = options.startY ?? (size.height / 2 - 0.1);
    const colX = options.colX ?? (size.width / 2 + 0.25 + cbW);
    const hubPos = options.hubPosition ?? new THREE.Vector3((size.width * 0.9) / 2, (size.height * 0.9) / 2, options.z ?? 0.06);
    const z = options.z ?? 0.06;

    attributes.forEach((attribute, idx) => {
        const attrName = getAttributeDisplayName(attribute, idx);
        const y = startY - idx * gapY;

        // checkbox cube
        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(cbW, cbH, cbW),
            new THREE.MeshStandardMaterial({
                color: attrCfg.checkboxColor,
                metalness: attrCfg.metalness ?? 0.2,
                roughness: attrCfg.roughness ?? 0.5
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
            maxWorldWidth: options.attributeLabelMaxWidth ?? 2.25
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
    label.className = options.className ?? 'label class-label';
    label.setAttribute('data-class', name);
    label.setAttribute('data-hyperclass', options.isHyperclass ? 'true' : 'false');
    label.style.color = options.textColor ?? '#000000';
    label.style.font = options.legacyFont ?? 'bold 16px Arial';
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
        text: name
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
        label.style.fontWeight = '700';
        label.style.fontFamily = 'Arial, sans-serif';
        if (currentFontSize) label.style.fontSize = currentFontSize;
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
/**
 * NEW: Dynamically scales CSS2D labels based on camera distance.
 * @param {THREE.Camera} camera - The scene camera.
 */
const labels = []; // Store all labels for easy access
let lastSizingCamera = null;
let lastSizingRenderer = null;
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
            const verticalCap = Math.max(2.4, 0.24 * pixelsPerWorldUnit);
            const text = label.userData?.text || label.element.textContent || '';
            const fitSize = getFontSizeForTextWidth(text, availableWidthPx, label.element.classList.contains('hbds-icon-title') ? 1.25 : 0);
            const fontSize = THREE.MathUtils.clamp(Math.min(distanceSize, fitSize, verticalCap), 2.4, 19);
            applyTitleLabelSizing(label.element, availableWidthPx, fontSize);
        } else {
            const maxWorldWidth = label.userData?.maxWorldWidth ?? 1.75;
            const availableWidthPx = Math.max(34, maxWorldWidth * pixelsPerWorldUnit);
            const gapY = label.userData?.gapY ?? 0.17;
            const verticalCap = Math.max(1.6, gapY * pixelsPerWorldUnit * 0.5);
            const distanceSize = THREE.MathUtils.clamp(110 / Math.max(distance, 1e-6), 1.6, 11.2);
            const fontSize = THREE.MathUtils.clamp(Math.min(distanceSize, verticalCap), 1.6, 11.2);
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
