import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  getData,
  setData,
  resetData,
  validateData,
  createClass,
  updateClass,
  deleteClass,
  createHyperclass,
  updateHyperclass,
  deleteHyperclass,
  createAttribute,
  updateAttribute,
  createLink,
  updateLink,
  moveChildToHyperclass,
  refreshSceneFromData,
  saveScene,
  optimizeAndRefreshLayout,
  fitModelToCanvas,
  updateSceneLabelScales,
  listAvailableModels,
  loadAndRenderScene,
  initModelOverview,
  updateModelOverview,
  getSceneSettings,
  setSceneSettings,
  normalizeSceneSettings,
  getLayoutSettings,
  setLayoutSettings,
  getFontSettings,
  setFontSettings,
  normalizeFontSettings
} from './hbds_model.js?v=font-zoom-20260523a';
import { recalculateAllLinks } from './hbds_class_link.js?v=font-zoom-20260523a';

let scene, camera, renderer, labelRenderer, orbitControls, dragControls, diagramGroup;
const draggableObjects = [];

let selectedElementId = null;
let selectedParentHyperclassId = null;
let selectedAttributeOwnerId = null;
let selectedLinkSourceId = null;
let selectedLinkTargetId = null;
let selectedAttributeKey = null;
let selectedLinkId = null;
const selectedElementIds = new Set();
let canvasTitleOverride = null;
let multiSelectionMode = false;
let editMode = 'full';
let linkPickActive = false;
let pointerStart = null;
let availableModels = [];
let nextClassNumber = 1;
let nextHyperclassNumber = 1;
let nextAttributeNumber = 1;
let nextLinkNumber = 1;
let toastTimer = null;
const activityLog = [];
const LIGHT_CIRCLE_RADIUS = 16;
const LIGHT_CIRCLE_ELEVATION = 7;
const DEFAULT_HORIZONTAL_LIGHT_INTENSITY = 1;
const DEFAULT_VERTICAL_LIGHT_INTENSITY = 0.6;
const DEFAULT_VERTICAL_LIGHT_ANGLE = 45;
let lightingState = normalizeSimplifiedSceneSettings();
const defaultLightingState = normalizeSimplifiedSceneSettings();
let fontState = normalizeFontSettings();
const defaultFontState = normalizeFontSettings();
let sceneLights = {};
let propertyPanelTargetKey = null;
let propertyPanelOpenSection = null;
let nextInspectorListId = 1;

const CLASS_COLORS = [
  { fill: '#ffd166', border: '#7a4f00' },
  { fill: '#8ecae6', border: '#1b5f7a' },
  { fill: '#b7e4c7', border: '#087443' },
  { fill: '#f4a261', border: '#874a17' },
  { fill: '#cdb4db', border: '#694b7d' },
  { fill: '#ffafcc', border: '#8a3a57' }
];

const HYPER_COLORS = [
  { fill: '#dbeafe', border: '#1769e0' },
  { fill: '#dcfce7', border: '#087443' },
  { fill: '#fef3c7', border: '#a15c07' },
  { fill: '#fce7f3', border: '#9d174d' }
];

const ATTRIBUTE_NAMES = ['status', 'owner', 'priority', 'version', 'region', 'createdAt', 'score', 'policy'];
const LINK_NAMES = ['depends on', 'feeds', 'validates', 'routes to', 'owns', 'syncs'];
const DEFAULT_EMPTY_ICON_PATH = './icons/empty.png';
const ICON_MANIFEST_PATH = './icons/generated_icons_manifest.json';
let iconManifestLookupPromise = null;
const DEFAULT_TEST_MODEL_ROOT = 'test_models/';
const DEFAULT_TEST_MODEL_HIDDEN_VALUES = [
  'test_models/models.json',
  'test_models/transportation_links.json'
];
const MODEL_SOURCE_CONFIG = getModelSourceConfig();
const TEST_MODEL_ROOT = MODEL_SOURCE_CONFIG.root;
const TEST_MODEL_MANIFEST = MODEL_SOURCE_CONFIG.manifest;
const TEST_MODEL_HIDDEN_VALUES = MODEL_SOURCE_CONFIG.hiddenValues;
const HIDE_SCENARIO_SUITE = TEST_MODEL_ROOT === 'models/';
const EMBEDDED_SHELL_MENU = new URLSearchParams(window.location.search).get('embeddedShell') === '1';
if (EMBEDDED_SHELL_MENU) document.body.classList.add('embedded-shell-menu');
const STRUCTURAL_PROPERTY_KEYS = new Set([
  'id',
  'classId',
  'sourceClassId',
  'targetClassId',
  'parentClassId',
  'children',
  'attributes',
  'type'
]);
const KNOWN_ENUMS = {
  orthogonalStyle: ['auto', 'horizontal', 'vertical'],
  lineStyle: ['solid', 'dashed', 'dotted'],
  routeSide: ['top', 'right', 'bottom', 'left'],
  sourcePortSide: ['top', 'right', 'bottom', 'left'],
  targetPortSide: ['top', 'right', 'bottom', 'left'],
  sourcePort: ['top', 'right', 'bottom', 'left'],
  targetPort: ['top', 'right', 'bottom', 'left'],
  labelRotationBehavior: ['fixed', 'follow'],
  labelPlacement: ['best-segment', 'path'],
  labelStrategy: ['best-segment', 'path'],
  arrowheadType: ['triangle', 'cone', 'diamond', 'none'],
  bodyType: ['rectangle', 'image', 'shape'],
  imageFit: ['contain', 'cover'],
  classShapeType: [
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
  ],
  shapeType: [
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
  ],
  checkboxMaterial: ['metallic', 'flat'],
  shape: ['square', 'circle', 'diamond', 'triangle']
};

function getModelSourceConfig() {
  const params = new URLSearchParams(window.location.search);
  const root = normalizeRelativeModelPath(
    params.get('modelsPath') || params.get('modelRoot') || params.get('modelsRoot'),
    DEFAULT_TEST_MODEL_ROOT,
    { directory: true }
  );
  const defaultManifest = root === 'models/' ? `${root}models_manifest.json` : `${root}test_models_manifest.json`;
  const manifest = normalizeRelativeModelPath(
    params.get('manifestPath') || params.get('modelManifest'),
    defaultManifest
  );
  return {
    root,
    manifest,
    hiddenValues: parseHiddenModelValues(params.get('hiddenValues'), root)
  };
}

function normalizeRelativeModelPath(value, fallback, options = {}) {
  let clean = String(value ?? '').trim();
  if (!clean) clean = fallback;
  clean = clean.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (options.directory && !clean.endsWith('/')) clean += '/';
  return clean;
}

function parseHiddenModelValues(value, root) {
  if (value === null) return root === DEFAULT_TEST_MODEL_ROOT ? [...DEFAULT_TEST_MODEL_HIDDEN_VALUES] : [];
  const clean = String(value).trim();
  if (!clean) return [];
  return clean
    .split(',')
    .map(item => normalizeRelativeModelPath(item, ''))
    .filter(Boolean);
}

const KNOWN_CLASS_IMAGE_SOURCES = [
  './images/class_car.png',
  './images/class_satellite.png',
  './images/class_vehicle.png',
  './images/class_voiture.png',
  './images/class_human.png',
  './images/class_user.png',
  './images/class_man.png',
  './images/class_supplier.png'
];
const DEFAULT_OPEN_CONTROL_SECTIONS = new Set(['model', 'session']);
const INSPECTOR_HISTORY_LIMIT = 40;
const CLASS_2D_DEFAULTS = {
  width: 1.2,
  height: 1.6,
  hyperWidth: 4,
  hyperHeight: 3.2,
  fillColor: '#ffd166',
  borderColor: '#7a4f00',
  borderWidth: 1,
  cornerRadius: 0.1,
  opacity: 1,
  textColor: '#111827',
  bodyType: 'rectangle',
  imageSrc: '',
  imageFit: 'contain',
  shapeType: 'roundedRectangle',
  attributeCheckboxColor: '#A9A9A9',
  attributeCheckboxMaterial: 'metallic',
  attributeShape: 'square',
  attributeWidth: 0.1,
  attributeHeight: 0.1,
  attributeMetalness: 0.2,
  attributeRoughness: 0.5,
  lineColor: '#334155',
  lineWidth: 0.01,
  visible: true,
  locked: false
};
const LINK_2D_DEFAULTS = {
  labelText: '',
  lineColor: '#334155',
  lineWidth: 2,
  lineStyle: 'solid',
  zIndex: 5,
  renderingVisible: true,
  arrowheadVisibility: true,
  arrowheadType: 'triangle',
  arrowheadSize: 0.1,
  arrowheadScale: 0.6,
  maxArrowheadSize: 0.12,
  labelFontSize: 12,
  labelColor: '#111111',
  textColor: '#111111',
  labelBackgroundColor: 'rgba(255,255,255,0.9)',
  labelPositionAlongPath: 0.5,
  labelOffsetFromPath: 0.1,
  labelRotationBehavior: 'fixed',
  labelPlacement: 'best-segment',
  labelStrategy: 'best-segment',
  labelCollisionWidth: 0.85,
  labelCollisionHeight: 0.42,
  labelCollisionMargin: 0.06,
  orthogonalStyle: 'auto',
  orthogonalClearance: 0.55,
  parallelRouteGap: 0.28,
  globalRouteGap: 0.28,
  obstacleRouteGap: 0.28,
  routeSide: '',
  curveOffset: 0,
  curveRadius: 0.16,
  cornerRadius: 0.16,
  relationshipCornerRadius: 0.16,
  routePoints: [],
  sourcePortSide: '',
  targetPortSide: '',
  sourcePort: '',
  targetPort: '',
  relationshipPortRadius: 0.065,
  relationshipPortStub: 0.24,
  relationshipPortFill: '#ffffff',
  relationshipPortStroke: '#475569',
  relationshipPortOpacity: 0.98,
  visible: true
};

const $ = id => document.getElementById(id);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const nodes = () => getData()?.hypergraph?.class || [];
const links = () => getData()?.hypergraph?.link || [];
const propertyUndoStack = [];
const propertyRedoStack = [];
const recentInspectorColors = [];
let pendingLivePropertyEdit = null;

const ctx = () => ({
  scene,
  camera,
  renderer,
  css2DRenderer: labelRenderer,
  orbitControls,
  dragControls,
  diagramGroup,
  draggableObjects,
  setDiagramGroup: group => { diagramGroup = group; },
  setDragControls: controls => { dragControls = controls; },
  setupDragControls: setupDrag,
  setCamera2D,
  applyModelSceneSettings,
  applyModelLayoutSettings,
  applyModelFontSettings,
  renderOnce
});

function nodeById(id) {
  return nodes().find(node => sameId(node.id, id)) || null;
}

function resolveNodeId(value) {
  if (value == null || value === '') return null;
  return nodeById(value)?.id ?? value;
}

function nodeLabel(node) {
  if (!node) return 'Unknown';
  return `${node.name || 'Untitled'} (${node.id})`;
}

function classRendering(index) {
  const color = CLASS_COLORS[index % CLASS_COLORS.length];
  return {
    class: { color: color.fill, borderColor: color.border, cornerRadius: 0.1 },
    attributes: {
      checkboxColor: color.border,
      checkboxMaterial: CLASS_2D_DEFAULTS.attributeCheckboxMaterial,
      shape: CLASS_2D_DEFAULTS.attributeShape,
      metalness: CLASS_2D_DEFAULTS.attributeMetalness,
      roughness: CLASS_2D_DEFAULTS.attributeRoughness,
      size: { width: CLASS_2D_DEFAULTS.attributeWidth, height: CLASS_2D_DEFAULTS.attributeHeight }
    },
    connections: { lineColor: color.border, lineWidth: 0.01 },
    textColor: '#111827'
  };
}

function hyperclassRendering(index) {
  const color = HYPER_COLORS[index % HYPER_COLORS.length];
  return {
    class: { color: color.fill, borderColor: color.border, opacity: 0.2, cornerRadius: 0.22 },
    attributes: {
      checkboxColor: color.border,
      checkboxMaterial: CLASS_2D_DEFAULTS.attributeCheckboxMaterial,
      shape: CLASS_2D_DEFAULTS.attributeShape,
      metalness: CLASS_2D_DEFAULTS.attributeMetalness,
      roughness: CLASS_2D_DEFAULTS.attributeRoughness,
      size: { width: CLASS_2D_DEFAULTS.attributeWidth, height: CLASS_2D_DEFAULTS.attributeHeight }
    },
    connections: { lineColor: color.border, lineWidth: 0.01 },
    textColor: '#111827'
  };
}

function getLayoutAlgorithm() {
  return $('layout-algorithm-select')?.value || 'none';
}

function shouldOptimizeAfterCrud() {
  return $('auto-optimize-toggle')?.checked === true && getLayoutAlgorithm() !== 'none';
}

function shouldFitAfterCrud() {
  return $('auto-fit-toggle')?.checked === true;
}

function hasFitMetadata(model) {
  const fit = model?.metadata?.layout?.fit;
  return Boolean(fit && (fit.distance > 0 || fit.fitHeightDistance > 0 || fit.fitWidthDistance > 0));
}

function renderOnce() {
  if (!renderer || !scene || !camera || !labelRenderer) return;
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function getCanvasSize() {
  const rect = $('container').getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height))
  };
}

function resizeRenderers() {
  if (!renderer || !camera || !labelRenderer) return;
  const size = getCanvasSize();
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  renderer.setSize(size.width, size.height);
  labelRenderer.setSize(size.width, size.height);
  renderOnce();
  updateOverview();
}

function is3DViewEnabled() {
  return $('view-toggle')?.checked === true;
}

function updateDragControlsEnabled() {
  const isReadOnly = editMode === 'readonly';
  if (dragControls) dragControls.enabled = !isReadOnly && !is3DViewEnabled();
}

function handleViewToggle(event) {
  const is3D = event?.target?.checked === true;
  if (orbitControls) {
    orbitControls.enableRotate = is3D;
    orbitControls.enabled = true;
  }
  updateDragControlsEnabled();
  if (!is3D) setCamera2D();
  updateOverview();
  renderOnce();
}

function setCamera2D() {
  if (!camera || !orbitControls) return;
  const sphere = diagramGroup?.userData?.boundingSphere;
  if (!sphere || sphere.radius === 0) {
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    orbitControls.target.set(0, 0, 0);
    orbitControls.update();
    renderOnce();
    return;
  }

  const fovR = camera.fov * Math.PI / 180;
  const distance = Math.max(1, Math.abs(sphere.radius / Math.sin(fovR / 2)) * 1.2);
  camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + distance);
  camera.lookAt(sphere.center);
  orbitControls.target.copy(sphere.center);
  camera.updateProjectionMatrix();
  orbitControls.update();
  renderOnce();
}

function normalizeSimplifiedSceneSettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const hasExplicitSettings = Object.keys(source).length > 0;
  const normalized = normalizeSceneSettings(source);
  const horizontalSource = normalized.sources?.[0] || {};
  const verticalSource = normalized.sources?.[1] || {};
  const legacyLayeredLighting = normalized.ambient > 0 || normalized.front > 0;
  const horizontalAngle = horizontalLightAngleFromDirection(horizontalSource.direction);
  const verticalAngle = hasExplicitSettings && !legacyLayeredLighting
    ? verticalLightAngleFromDirection(verticalSource.direction)
    : DEFAULT_VERTICAL_LIGHT_ANGLE;
  const horizontalIntensity = normalizeLightIntensity(
    horizontalSource.intensity,
    DEFAULT_HORIZONTAL_LIGHT_INTENSITY,
    hasExplicitSettings,
    legacyLayeredLighting
  );
  const verticalIntensity = normalizeLightIntensity(
    verticalSource.intensity,
    DEFAULT_VERTICAL_LIGHT_INTENSITY,
    hasExplicitSettings,
    legacyLayeredLighting
  );
  return {
    ...normalized,
    ambient: 0,
    front: 0,
    sources: [
      {
        intensity: horizontalIntensity,
        direction: horizontalLightDirectionFromAngle(horizontalAngle)
      },
      {
        intensity: verticalIntensity,
        direction: verticalLightDirectionFromAngle(verticalAngle)
      }
    ]
  };
}

function normalizeLightIntensity(value, defaultValue, hasExplicitSettings, legacyLayeredLighting) {
  const intensity = clampNumber(value, 0, 2, defaultValue);
  if (!hasExplicitSettings) return defaultValue;
  return legacyLayeredLighting && intensity <= 0.25 ? defaultValue : intensity;
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeLightAngle(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number === 360) return 360;
  return ((number % 360) + 360) % 360;
}

function horizontalLightDirectionFromAngle(angle) {
  const radians = normalizeLightAngle(angle) * Math.PI / 180;
  return {
    x: Number((Math.sin(radians) * LIGHT_CIRCLE_RADIUS).toFixed(3)),
    y: LIGHT_CIRCLE_ELEVATION,
    z: Number((Math.cos(radians) * LIGHT_CIRCLE_RADIUS).toFixed(3))
  };
}

function verticalLightDirectionFromAngle(angle) {
  const radians = normalizeLightAngle(angle) * Math.PI / 180;
  return {
    x: 0,
    y: Number((Math.sin(radians) * LIGHT_CIRCLE_RADIUS).toFixed(3)),
    z: Number((Math.cos(radians) * LIGHT_CIRCLE_RADIUS).toFixed(3))
  };
}

function horizontalLightAngleFromDirection(direction = {}) {
  const x = Number(direction.x ?? 0);
  const z = Number(direction.z ?? LIGHT_CIRCLE_RADIUS);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  return normalizeLightAngle(Math.round(Math.atan2(x, z) * 180 / Math.PI));
}

function verticalLightAngleFromDirection(direction = {}) {
  const y = Number(direction.y ?? 0);
  const z = Number(direction.z ?? LIGHT_CIRCLE_RADIUS);
  if (!Number.isFinite(y) || !Number.isFinite(z)) return DEFAULT_VERTICAL_LIGHT_ANGLE;
  return normalizeLightAngle(Math.round(Math.atan2(y, z) * 180 / Math.PI));
}

function horizontalLightSource() {
  return lightingState.sources?.[0] || {
    intensity: DEFAULT_HORIZONTAL_LIGHT_INTENSITY,
    direction: horizontalLightDirectionFromAngle(0)
  };
}

function verticalLightSource() {
  return lightingState.sources?.[1] || {
    intensity: DEFAULT_VERTICAL_LIGHT_INTENSITY,
    direction: verticalLightDirectionFromAngle(DEFAULT_VERTICAL_LIGHT_ANGLE)
  };
}

function effectiveLightIntensity(source, fallback) {
  return source.direction?.z < 0 ? 0 : clampNumber(source.intensity, 0, 2, fallback);
}

function ensureLighting() {
  const ambient = new THREE.AmbientLight(0xffffff, lightingState.ambient);
  ambient.name = 'hbds-ambient-light';
  scene.add(ambient);

  const front = new THREE.DirectionalLight(0xffffff, lightingState.front);
  front.name = 'hbds-front-light';
  front.position.set(-3, 2, 16);
  scene.add(front);

  const sourceOne = new THREE.DirectionalLight(
    0xffffff,
    effectiveLightIntensity(horizontalLightSource(), DEFAULT_HORIZONTAL_LIGHT_INTENSITY)
  );
  sourceOne.name = 'hbds-source-one-light';
  sourceOne.position.copy(directionToVector(horizontalLightSource().direction));
  scene.add(sourceOne);

  const sourceTwo = new THREE.DirectionalLight(
    0xffffff,
    effectiveLightIntensity(verticalLightSource(), DEFAULT_VERTICAL_LIGHT_INTENSITY)
  );
  sourceTwo.name = 'hbds-source-two-light';
  sourceTwo.position.copy(directionToVector(verticalLightSource().direction));
  scene.add(sourceTwo);

  sceneLights = { ambient, front, sourceOne, sourceTwo };
}

function applySceneSettings(options = {}) {
  if (scene) scene.background = new THREE.Color(lightingState.background);
  if (sceneLights.ambient) sceneLights.ambient.intensity = lightingState.ambient;
  if (sceneLights.front) sceneLights.front.intensity = lightingState.front;
  if (sceneLights.sourceOne) {
    sceneLights.sourceOne.intensity = effectiveLightIntensity(horizontalLightSource(), DEFAULT_HORIZONTAL_LIGHT_INTENSITY);
    sceneLights.sourceOne.visible = sceneLights.sourceOne.intensity > 0;
    sceneLights.sourceOne.position.copy(directionToVector(horizontalLightSource().direction));
  }
  if (sceneLights.sourceTwo) {
    sceneLights.sourceTwo.intensity = effectiveLightIntensity(verticalLightSource(), DEFAULT_VERTICAL_LIGHT_INTENSITY);
    sceneLights.sourceTwo.visible = sceneLights.sourceTwo.intensity > 0;
    sceneLights.sourceTwo.position.copy(directionToVector(verticalLightSource().direction));
  }
  if (options.syncControls) syncSceneSettingsControls();
  renderOnce();
}

function directionToVector(direction = {}) {
  return new THREE.Vector3(direction.x ?? 0, direction.y ?? 0, direction.z ?? 1);
}

function syncSceneSettingsControls() {
  const bind = (id, value) => {
    const input = $(id);
    if (input) input.value = String(value);
  };
  const horizontal = horizontalLightSource();
  const vertical = verticalLightSource();
  bind('scene-background-input', lightingState.background);
  bind('horizontal-light-intensity-input', horizontal.intensity);
  bind('horizontal-light-angle-input', horizontalLightAngleFromDirection(horizontal.direction));
  bind('vertical-light-intensity-input', vertical.intensity);
  bind('vertical-light-angle-input', verticalLightAngleFromDirection(vertical.direction));
  updateHorizontalLightAngleValue();
  updateVerticalLightAngleValue();
}

function updateHorizontalLightAngleValue(angle = horizontalLightAngleFromDirection(horizontalLightSource().direction)) {
  const output = $('horizontal-light-angle-value');
  if (!output) return;
  const label = `${Math.round(normalizeLightAngle(angle))}deg`;
  output.value = label;
  output.textContent = label;
}

function updateVerticalLightAngleValue(angle = verticalLightAngleFromDirection(verticalLightSource().direction)) {
  const output = $('vertical-light-angle-value');
  if (!output) return;
  const label = `${Math.round(normalizeLightAngle(angle))}deg`;
  output.value = label;
  output.textContent = label;
}

function readSceneSettingsControls() {
  const numberValue = (id, fallback) => {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  const currentHorizontal = horizontalLightSource();
  const currentVertical = verticalLightSource();
  const horizontalAngle = normalizeLightAngle(numberValue(
    'horizontal-light-angle-input',
    horizontalLightAngleFromDirection(currentHorizontal.direction)
  ));
  const verticalAngle = normalizeLightAngle(numberValue(
    'vertical-light-angle-input',
    verticalLightAngleFromDirection(currentVertical.direction)
  ));
  const horizontalIntensity = clampNumber(
    numberValue('horizontal-light-intensity-input', currentHorizontal.intensity),
    0,
    2,
    DEFAULT_HORIZONTAL_LIGHT_INTENSITY
  );
  const verticalIntensity = clampNumber(
    numberValue('vertical-light-intensity-input', currentVertical.intensity),
    0,
    2,
    DEFAULT_VERTICAL_LIGHT_INTENSITY
  );
  lightingState = normalizeSimplifiedSceneSettings({
    background: normalizeHexColor($('scene-background-input')?.value || lightingState.background),
    ambient: 0,
    front: 0,
    sources: [
      { intensity: horizontalIntensity, direction: horizontalLightDirectionFromAngle(horizontalAngle) },
      { intensity: verticalIntensity, direction: verticalLightDirectionFromAngle(verticalAngle) }
    ]
  });
  updateHorizontalLightAngleValue(horizontalAngle);
  updateVerticalLightAngleValue(verticalAngle);
}

function handleSceneSettingInput() {
  readSceneSettingsControls();
  setSceneSettings(lightingState, { applyContext: false });
  applySceneSettings();
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
}

function handleResetSceneSettings() {
  lightingState = normalizeSimplifiedSceneSettings(defaultLightingState);
  setSceneSettings(lightingState, { applyContext: false });
  applySceneSettings({ syncControls: true });
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
  addLog('Reset scene settings');
}

function applyModelSceneSettings(settings) {
  lightingState = normalizeSimplifiedSceneSettings(settings || getSceneSettings());
  applySceneSettings({ syncControls: true });
}

function applyModelLayoutSettings(settings) {
  const select = $('layout-algorithm-select');
  const algorithm = settings?.algorithm || getLayoutSettings().algorithm || 'none';
  if (select) select.value = [...select.options].some(option => option.value === algorithm) ? algorithm : 'none';
}

function syncFontSettingsControls() {
  const bind = (id, value) => {
    const input = $(id);
    if (!input) return;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = String(value);
  };
  bind('model-font-size-input', fontState.size);
  bind('model-font-family-input', fontState.family);
  bind('model-font-bold-input', fontState.bold);
  bind('model-font-italic-input', fontState.italic);
  bind('model-font-underline-input', fontState.underline);
  updateFontSizeValue();
}

function readFontSettingsControls() {
  const numberValue = (id, fallback) => {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  fontState = normalizeFontSettings({
    size: numberValue('model-font-size-input', fontState.size),
    family: $('model-font-family-input')?.value || fontState.family,
    bold: $('model-font-bold-input')?.checked === true,
    italic: $('model-font-italic-input')?.checked === true,
    underline: $('model-font-underline-input')?.checked === true
  });
  updateFontSizeValue();
}

function updateFontSizeValue() {
  const output = $('model-font-size-value');
  if (!output) return;
  const label = `${Math.round(fontState.size)}px`;
  output.value = label;
  output.textContent = label;
}

function handleFontSettingInput() {
  readFontSettingsControls();
  setFontSettings(fontState, { context: ctx(), applyContext: false, refresh: true });
  updateOverview();
  renderPropertyPanel();
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
}

function handleResetFontSettings() {
  fontState = normalizeFontSettings(defaultFontState);
  setFontSettings(fontState, { context: ctx(), applyContext: false, refresh: true });
  syncFontSettingsControls();
  updateOverview();
  renderPropertyPanel();
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
  addLog('Reset model font settings');
}

function applyModelFontSettings(settings) {
  fontState = normalizeFontSettings(settings || getFontSettings());
  syncFontSettingsControls();
}

function handleLayoutSettingChange() {
  setLayoutSettings({ ...getLayoutSettings(), algorithm: getLayoutAlgorithm() }, { applyContext: false });
  updateJsonPreviewFromData();
}

function compactControlSections() {
  document.querySelectorAll('section.control-group').forEach(section => {
    const title = section.querySelector(':scope > .section-title');
    if (!title) return;
    const sectionTitle = getSectionTitleText(title);
    const sectionKey = section.dataset.section || sectionKeyFromTitle(sectionTitle);
    const details = document.createElement('details');
    details.className = section.className;
    details.dataset.section = sectionKey;
    if (section.dataset.defaultOpen === 'true' || DEFAULT_OPEN_CONTROL_SECTIONS.has(sectionKey)) {
      details.open = true;
    }
    const summary = document.createElement('summary');
    summary.appendChild(title);
    const body = document.createElement('div');
    body.className = 'details-body';
    while (section.firstChild) {
      if (section.firstChild !== title) body.appendChild(section.firstChild);
      else section.removeChild(section.firstChild);
    }
    details.append(summary, body);
    section.replaceWith(details);
  });
}

function revealModelBuilderProperties(options = {}) {
  const builder = document.querySelector('.control-group[data-section="model-builder"]');
  if (builder?.tagName?.toLowerCase() === 'details') builder.open = true;
  if (options.scroll === false) return;

  requestAnimationFrame(() => {
    const target = $('property-panel') || builder;
    target?.scrollIntoView?.({
      block: 'nearest',
      behavior: options.instant ? 'auto' : 'smooth'
    });
  });
}

function getSectionTitleText(title) {
  const text = [...title.childNodes]
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent)
    .join(' ')
    .trim();
  return text || title.textContent.trim();
}

function sectionKeyFromTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addLog(message) {
  if (!message) return;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  activityLog.unshift(`${time} - ${message}`);
  activityLog.splice(10);
  updateActivityLog();
}

function updateActivityLog() {
  const status = $('layout-status');
  if (!status) return;
  status.textContent = activityLog.length ? activityLog.join('\n') : 'Ready.';
}

function showToast(message) {
  const toast = $('toast');
  if (!toast || !message) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function countAttributes() {
  return nodes().reduce((total, node) => total + (Array.isArray(node.attributes) ? node.attributes.length : 0), 0);
}

function updateStats() {
  const allNodes = nodes();
  const classCount = allNodes.filter(node => node.type !== 'hyperclass').length;
  const hyperclassCount = allNodes.filter(node => node.type === 'hyperclass').length;
  $('stat-node-count').textContent = String(classCount);
  $('stat-link-count').textContent = String(links().length);
  $('stat-attribute-count').textContent = String(countAttributes());
  $('stat-hyperclass-count').textContent = String(hyperclassCount);
  document.body.classList.toggle('has-model', allNodes.length > 0 || Boolean(canvasTitleOverride));
}

function updateCanvasTitle() {
  const title = $('canvas-model-title');
  if (!title) return;
  if (canvasTitleOverride) {
    title.textContent = canvasTitleOverride;
    document.body.classList.add('has-model');
    return;
  }
  const selectedOption = $('test-model-select')?.selectedOptions?.[0];
  const selectedText = selectedOption?.textContent?.trim();
  if (nodes().length <= 0) {
    title.textContent = '';
    return;
  }
  title.textContent = selectedText && selectedText !== 'Blank workspace' ? selectedText : 'Untitled Model';
}

function setCanvasTitleOverride(text) {
  canvasTitleOverride = text ? String(text) : null;
  updateCanvasTitle();
}

function getCurrentStats() {
  const allNodes = nodes();
  return {
    nodes: allNodes.length,
    classes: allNodes.filter(node => node.type !== 'hyperclass').length,
    hyperclasses: allNodes.filter(node => node.type === 'hyperclass').length,
    links: links().length,
    attributes: countAttributes()
  };
}

function setStatus(message, tone = 'ok') {
  const status = $('scenario-status');
  if (!status) return;
  status.className = 'status-chip';
  if (tone === 'ok' || tone === 'warn' || tone === 'error') {
    status.classList.add(tone);
  }
  status.textContent = message;
}

function updateValidationStatus() {
  const status = $('validation-status');
  const nodeCount = nodes().length;
  const result = validateData(getData());
  status.className = 'status-chip';

  if (!nodeCount) {
    status.textContent = 'No model loaded';
    return;
  }

  if (!result.valid) {
    status.textContent = `${result.errors.length} validation error${result.errors.length === 1 ? '' : 's'}`;
    status.classList.add('error');
    return;
  }

  if (result.warnings?.length) {
    status.textContent = `Valid with ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`;
    status.classList.add('warn');
    return;
  }

  status.textContent = 'Valid model';
  status.classList.add('ok');
}

function setSelectOptions(id, items, selectedId, placeholder) {
  const select = $(id);
  if (!select) return;
  select.innerHTML = '';

  if (placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.appendChild(option);
  }

  items.forEach(item => {
    const option = document.createElement('option');
    option.value = String(item.id);
    option.textContent = nodeLabel(item);
    select.appendChild(option);
  });

  select.value = selectedId != null ? String(selectedId) : '';
}

function syncSelectionIds() {
  const hasId = id => id == null || nodes().some(node => sameId(node.id, id));
  if (!hasId(selectedElementId)) selectedElementId = null;
  if (!multiSelectionMode) {
    selectedElementIds.clear();
    if (selectedElementId) selectedElementIds.add(String(selectedElementId));
  }
  [...selectedElementIds].forEach(id => {
    if (!hasId(id)) selectedElementIds.delete(id);
  });
  if (selectedElementIds.size <= 1) multiSelectionMode = false;
  if (selectedElementId && selectedElementIds.size === 0) selectedElementIds.add(String(selectedElementId));
  if (!selectedElementId && selectedElementIds.size > 0) selectedElementId = [...selectedElementIds][0];
  if (!hasId(selectedParentHyperclassId)) selectedParentHyperclassId = null;
  if (!hasId(selectedAttributeOwnerId)) selectedAttributeOwnerId = null;
  if (!hasId(selectedLinkSourceId)) selectedLinkSourceId = null;
  if (!hasId(selectedLinkTargetId)) selectedLinkTargetId = null;
  if (!links().some(link => sameId(link.id, selectedLinkId))) selectedLinkId = null;
}

function setPrimarySelection(id) {
  selectedElementIds.clear();
  multiSelectionMode = false;
  if (id != null) selectedElementIds.add(String(id));
  selectedElementId = id ?? null;
}

function toggleMultiSelection(id) {
  if (id == null) return;
  const key = String(id);
  if (selectedElementIds.has(key) && selectedElementIds.size > 1) selectedElementIds.delete(key);
  else selectedElementIds.add(key);
  multiSelectionMode = selectedElementIds.size > 1;
  selectedElementId = key;
  selectedAttributeOwnerId = key;
  selectedParentHyperclassId = nodeById(key)?.parentClassId ?? null;
  selectedAttributeKey = null;
  selectedLinkId = null;
}

function selectedClassNodes() {
  return nodes().filter(node => selectedElementIds.has(String(node.id)));
}

function updateSmartMenusFromData() {
  const allNodes = nodes().filter(Boolean);
  const selected = nodeById(selectedElementId);
  const hyperclasses = getValidParentOptions(selected);
  setSelectOptions('selected-element-select', allNodes, selectedElementId, 'Select element');
  setSelectOptions('parent-hyperclass-select', hyperclasses, selected?.parentClassId ?? null, 'No parent');
  const parentSelect = $('parent-hyperclass-select');
  if (parentSelect) parentSelect.disabled = editMode === 'readonly' || !selected || hyperclasses.length === 0;
  syncAttributeAndLinkMenus();
}

function getValidParentOptions(selected) {
  if (!selected) return [];
  const descendants = getDescendantIds(selected.id);
  return nodes().filter(node => (
    node.type === 'hyperclass'
    && !sameId(node.id, selected.id)
    && !descendants.has(String(node.id))
  ));
}

function getDescendantIds(id) {
  const descendants = new Set();
  const visit = parentId => {
    nodes().forEach(node => {
      if (!sameId(node.parentClassId, parentId) || descendants.has(String(node.id))) return;
      descendants.add(String(node.id));
      visit(node.id);
    });
  };
  visit(id);
  return descendants;
}

function attributeKeyFor(attribute, index) {
  if (attribute && typeof attribute === 'object' && attribute.id != null) return String(attribute.id);
  return `idx-${index}`;
}

function selectedAttributeOwner() {
  return nodeById(selectedElementId);
}

function selectedAttributeEntry() {
  const owner = selectedAttributeOwner();
  if (!owner || selectedAttributeKey == null) return null;
  const attrs = owner.attributes || [];
  const index = attrs.findIndex((attribute, idx) => sameId(attributeKeyFor(attribute, idx), selectedAttributeKey));
  if (index < 0) return null;
  return {
    owner,
    attribute: attrs[index],
    index,
    key: String(selectedAttributeKey).startsWith('idx-') ? index : selectedAttributeKey
  };
}

function linksForSelectedElement() {
  if (!selectedElementId) return [];
  return links().filter(link => sameId(link.sourceClassId, selectedElementId) || sameId(link.targetClassId, selectedElementId));
}

function syncAttributeAndLinkMenus() {
  const owner = selectedAttributeOwner();
  const attrs = owner?.attributes || [];
  const attrItems = attrs.map((attribute, index) => {
    const id = attributeKeyFor(attribute, index);
    return { id: String(id), name: attributeDisplayName(attribute, index), attribute, index };
  });
  const attrSelect = $('selected-attribute-select');
  if (attrSelect) {
    attrSelect.innerHTML = '<option value="">Select attribute</option>';
    attrItems.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      attrSelect.appendChild(option);
    });
    if (!attrItems.some(item => sameId(item.id, selectedAttributeKey))) selectedAttributeKey = null;
    attrSelect.value = selectedAttributeKey ? String(selectedAttributeKey) : '';
  }
  const selectedAttr = attrItems.find(item => sameId(item.id, selectedAttributeKey)) || null;
  const attrNameInput = $('selected-attribute-name-input');
  if (attrNameInput) {
    attrNameInput.disabled = editMode === 'readonly' || !selectedAttr || !owner;
    attrNameInput.value = selectedAttr ? selectedAttr.name : '';
  }

  const linkSelect = $('selected-link-select');
  if (linkSelect) {
    const availableLinks = linksForSelectedElement().map(link => ({
      id: link.id,
      name: `${link.rendering?.labelText || link.name || link.id} (${link.sourceClassId} -> ${link.targetClassId})`,
      link
    }));
    linkSelect.innerHTML = '<option value="">Select link</option>';
    availableLinks.forEach(item => {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = item.name;
      linkSelect.appendChild(option);
    });
    if (!availableLinks.some(item => sameId(item.id, selectedLinkId))) selectedLinkId = null;
    linkSelect.value = selectedLinkId ? String(selectedLinkId) : '';
  }
  syncLinkEditControls();
}

function updateSelectedCard() {
  const card = $('selected-card');
  const multiNodes = selectedClassNodes();
  if (card && multiNodes.length > 1 && !selectedAttributeKey && !selectedLinkId) {
    card.innerHTML = `<span class="selected-name">${multiNodes.length} selected</span><span class="selected-meta">Multi-editing 2D class properties</span>`;
    syncSelectedColorControl(nodeById(selectedElementId));
    return;
  }
  const selected = nodeById(selectedElementId);
  if (!card || !selected) {
    card.innerHTML = '<span class="selected-name">No selection</span><span class="selected-meta">Select a class or hyperclass</span>';
    syncSelectedColorControl(null);
    return;
  }

  const type = selected.type === 'hyperclass' ? 'Hyperclass' : 'Class';
  const attrs = Array.isArray(selected.attributes) ? selected.attributes.length : 0;
  const attr = selectedAttributeEntry();
  const link = selectedLinkId ? links().find(item => sameId(item.id, selectedLinkId)) : null;
  let activeLabel = `${type} - ${attrs} attr${attrs === 1 ? '' : 's'} - ${escapeHtml(String(selected.id))}`;
  if (attr) activeLabel = `Attribute - ${escapeHtml(attributeDisplayName(attr.attribute, attr.index))} - ${escapeHtml(selected.name || selected.id)}`;
  if (link) activeLabel = `Link - ${escapeHtml(link.rendering?.labelText || link.name || link.id)} - ${escapeHtml(String(link.sourceClassId))} -> ${escapeHtml(String(link.targetClassId))}`;
  card.innerHTML = `<span class="selected-name">${escapeHtml(selected.name || 'Untitled')}</span><span class="selected-meta">${activeLabel}</span>`;
  syncSelectedColorControl(selected);
}

function updateLinkBuilderStatus() {
  const status = $('link-builder-status');
  const source = nodeById(selectedLinkSourceId);
  const actions = $('link-builder-actions');
  actions?.classList.toggle('is-active', linkPickActive);

  if (linkPickActive && !source) {
    status.textContent = 'Select source';
    return;
  }

  if (linkPickActive && source) {
    status.textContent = 'Select target or cancel';
    return;
  }

  status.textContent = 'Ready';
}

function updateModeControls() {
  const isReadOnly = editMode === 'readonly';
  const structureOnly = editMode === 'structure';
  const selected = nodeById(selectedElementId);
  const owner = nodeById(selectedAttributeOwnerId) || selected;

  const disable = (id, state) => {
    const element = $(id);
    if (element) element.disabled = Boolean(state);
  };

  disable('add-hyperclass-button', isReadOnly);
  disable('add-class-button', isReadOnly);
  disable('add-attribute-button', isReadOnly || structureOnly || !owner);
  disable('add-link-button', isReadOnly || structureOnly || linkPickActive);
  disable('delete-selected-button', isReadOnly || !selected);
  disable('selected-color-input', isReadOnly || !selected);
  disable('selected-border-color-input', isReadOnly || !selected);
  disable('selected-opacity-input', isReadOnly || !selected);
  disable('selected-corner-radius-input', isReadOnly || !selected);
  disable('selected-text-color-input', isReadOnly || !selected);
  disable('selected-name-input', isReadOnly || !selected);
  disable('reset-model-button', isReadOnly);
  disable('apply-json-button', isReadOnly);
  disable('cancel-link-button', !linkPickActive);

  ['mode-full', 'mode-structure', 'mode-readonly'].forEach(id => $(id)?.classList.remove('active'));
  $(`mode-${editMode}`)?.classList.add('active');
  const editModeSelect = $('edit-mode-select');
  if (editModeSelect) editModeSelect.value = editMode;
  updateDragControlsEnabled();
}

function updateJsonPreviewFromData() {
  $('json-preview').value = JSON.stringify(getData(), null, 2);
}

function updateModelSummary() {
  const select = $('test-model-select');
  const option = select.options[select.selectedIndex];
  $('model-summary').textContent = option?.dataset?.summary || 'Blank workspace';
}

function updateInterface(options = {}) {
  syncSelectionIds();
  if (options.lightweight === true) {
    updateSelectedCard();
    updateLinkBuilderStatus();
    updateModeControls();
    updateCanvasTitle();
    return;
  }
  updateSmartMenusFromData();
  updateStats();
  updateValidationStatus();
  updateSelectedCard();
  updateLinkBuilderStatus();
  renderPropertyPanel();
  updateModeControls();
  repairAttributeLabels();
  enhanceIconTitleLabels();
  normalizeClassSurfaceMaterials();
  applySelectionHighlight();
  updateModelSummary();
  updateCanvasTitle();
  if (options.json !== false) updateJsonPreviewFromData();
  updateRenderDiagnostics();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function cloneValue(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getSelectedPropertyTarget() {
  const link = selectedLinkId ? links().find(item => sameId(item.id, selectedLinkId)) : null;
  if (link) {
    return {
      kind: 'link',
      title: `Link: ${link.rendering?.labelText || link.name || link.id}`,
      value: cloneValue(link)
    };
  }

  const attr = selectedAttributeEntry();
  if (attr) {
    const value = isPlainObject(attr.attribute) ? cloneValue(attr.attribute) : { name: attributeDisplayName(attr.attribute, attr.index) };
    return {
      kind: 'attribute',
      title: `Attribute: ${attributeDisplayName(attr.attribute, attr.index)}`,
      value,
      owner: attr.owner,
      key: attr.key
    };
  }

  const multiNodes = selectedClassNodes();
  if (multiNodes.length > 1) {
    return {
      kind: 'multi-class',
      title: `${multiNodes.length} Classes Selected`,
      nodes: multiNodes
    };
  }

  const selected = nodeById(selectedElementId);
  if (!selected) return null;
  return {
    kind: selected.type === 'hyperclass' ? 'hyperclass' : 'class',
    title: `${selected.type === 'hyperclass' ? 'Hyperclass' : 'Class'}: ${selected.name || selected.id}`,
    value: cloneValue(selected),
    node: selected
  };
}

function renderPropertyPanel() {
  const panel = $('property-panel');
  if (!panel) return;
  const target = getSelectedPropertyTarget();
  const targetKey = getPropertyPanelTargetKey(target);
  if (targetKey !== propertyPanelTargetKey) {
    propertyPanelTargetKey = targetKey;
    propertyPanelOpenSection = null;
  }
  panel.innerHTML = '';

  if (!target) {
    panel.innerHTML = '<div class="property-empty">Select an item to edit its properties.</div>';
    return;
  }

  if (target.kind === 'class' || target.kind === 'hyperclass') {
    renderClass2DInspector(panel, target);
    applyClassInspectorAccordion(panel, targetKey);
    return;
  }

  if (target.kind === 'multi-class') {
    renderMultiClass2DInspector(panel, target);
    applyClassInspectorAccordion(panel, targetKey);
    return;
  }

  if (target.kind === 'link') {
    renderLink2DInspector(panel, target);
    return;
  }

  if (target.kind === 'attribute') {
    renderAttribute2DInspector(panel, target);
    return;
  }

  renderInspectorHeader(panel, target.title);
  renderPropertyObject(panel, target.value, []);
}

function getPropertyPanelTargetKey(target) {
  if (!target) return '';
  if (target.kind === 'class' || target.kind === 'hyperclass') return `${target.kind}:${target.node?.id ?? ''}`;
  if (target.kind === 'multi-class') return `multi-class:${(target.nodes || []).map(node => node.id).sort().join('|')}`;
  if (target.kind === 'link') return `link:${target.value?.id ?? ''}`;
  if (target.kind === 'attribute') return `attribute:${target.owner?.id ?? ''}:${target.key ?? ''}`;
  return target.kind || '';
}

function applyClassInspectorAccordion(panel, targetKey) {
  const sections = [...panel.querySelectorAll('details.inspector-section')];
  if (!sections.length) return;
  sections.forEach(section => {
    section.dataset.inspectorSection = getInspectorSectionTitle(section);
  });
  const requested = propertyPanelOpenSection && sections.find(section => section.dataset.inspectorSection === propertyPanelOpenSection);
  const defaultOpen = sections.find(section => section.open) || sections[0];
  const active = requested || defaultOpen;
  sections.forEach(section => {
    section.open = section === active;
  });
  propertyPanelOpenSection = active?.dataset.inspectorSection || null;
  sections.forEach(section => {
    section.addEventListener('toggle', () => {
      if (propertyPanelTargetKey !== targetKey) return;
      if (!section.open) {
        if (propertyPanelOpenSection === section.dataset.inspectorSection) propertyPanelOpenSection = null;
        return;
      }
      propertyPanelOpenSection = section.dataset.inspectorSection;
      sections.forEach(peer => {
        if (peer !== section) peer.open = false;
      });
    });
  });
}

function removeEditOnlySections() {
  if (!HIDE_SCENARIO_SUITE) return;
  document.querySelector('[data-section="scenario-suite"]')?.remove();
}

function getInspectorSectionTitle(section) {
  return section.querySelector(':scope > summary')?.textContent?.trim() || '';
}

function renderInspectorHeader(panel, title, subtitle = '2D properties') {
  const header = document.createElement('div');
  header.className = 'inspector-header';

  const titleWrap = document.createElement('div');
  const heading = document.createElement('div');
  heading.className = 'property-panel-title';
  heading.textContent = title;
  const sub = document.createElement('div');
  sub.className = 'inspector-subtitle';
  sub.textContent = subtitle;
  titleWrap.append(heading, sub);

  const actions = document.createElement('div');
  actions.className = 'inspector-actions';
  actions.append(
    createInspectorActionButton('Undo', 'undo', propertyUndoStack.length === 0),
    createInspectorActionButton('Redo', 'redo', propertyRedoStack.length === 0)
  );
  header.append(titleWrap, actions);
  panel.appendChild(header);
}

function createInspectorActionButton(label, action, disabled) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quiet inspector-icon-button';
  button.textContent = label;
  button.dataset.inspectorAction = action;
  button.disabled = disabled || editMode === 'readonly';
  return button;
}

function renderClass2DInspector(panel, target) {
  const node = target.value;
  const isHyperclass = target.kind === 'hyperclass';
  const sizeDefaults = {
    width: isHyperclass ? CLASS_2D_DEFAULTS.hyperWidth : CLASS_2D_DEFAULTS.width,
    height: isHyperclass ? CLASS_2D_DEFAULTS.hyperHeight : CLASS_2D_DEFAULTS.height
  };
  const renderingClass = node.rendering?.class || {};
  const attributesRendering = node.rendering?.attributes || {};
  const connections = node.rendering?.connections || {};

  renderInspectorHeader(panel, 'Class Properties', isHyperclass ? 'Hyperclass 2D inspector' : 'Class 2D inspector');

  const layout = createInspectorSection('Layout', true);
  appendTextControl(layout.body, {
    label: 'Name',
    path: ['name'],
    value: node.name || '',
    placeholder: 'Class name'
  });
  appendNumberControl(layout.body, {
    label: 'Width',
    path: ['size', 'width'],
    value: node.size?.width ?? sizeDefaults.width,
    min: 0.4,
    max: 12,
    step: 0.05,
    defaultValue: sizeDefaults.width
  });
  appendNumberControl(layout.body, {
    label: 'Height',
    path: ['size', 'height'],
    value: node.size?.height ?? sizeDefaults.height,
    min: 0.4,
    max: 12,
    step: 0.05,
    defaultValue: sizeDefaults.height
  });
  panel.appendChild(layout.section);

  const appearance = createInspectorSection('Appearance', true);
  appendColorControl(appearance.body, {
    label: 'Fill',
    path: ['rendering', 'class', 'color'],
    value: renderingClass.color || renderingClass.metallicColor || CLASS_2D_DEFAULTS.fillColor,
    defaultValue: CLASS_2D_DEFAULTS.fillColor
  });
  appendColorControl(appearance.body, {
    label: 'Border',
    path: ['rendering', 'class', 'borderColor'],
    value: renderingClass.borderColor || CLASS_2D_DEFAULTS.borderColor,
    defaultValue: CLASS_2D_DEFAULTS.borderColor
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Border Width',
    path: ['rendering', 'class', 'borderWidth'],
    value: renderingClass.borderWidth ?? CLASS_2D_DEFAULTS.borderWidth,
    min: 0,
    max: 8,
    step: 0.25,
    defaultValue: CLASS_2D_DEFAULTS.borderWidth
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Corner Radius',
    path: ['rendering', 'class', 'cornerRadius'],
    value: renderingClass.cornerRadius ?? CLASS_2D_DEFAULTS.cornerRadius,
    min: 0,
    max: 0.8,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.cornerRadius
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Opacity',
    path: ['rendering', 'class', 'opacity'],
    value: renderingClass.opacity ?? CLASS_2D_DEFAULTS.opacity,
    min: 0.1,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.opacity
  });
  appendFontControls(appearance.body, {
    labelPrefix: 'Name ',
    path: ['rendering', 'font'],
    font: node.rendering?.font,
    fallback: getFontSettings()
  });
  appendCheckboxControl(appearance.body, {
    label: 'Visible',
    path: ['visible'],
    value: node.visible !== false,
    defaultValue: CLASS_2D_DEFAULTS.visible
  });
  appendCheckboxControl(appearance.body, {
    label: 'Lock Editing',
    path: ['locked'],
    value: node.locked === true,
    defaultValue: CLASS_2D_DEFAULTS.locked
  });
  panel.appendChild(appearance.section);

  if (!isHyperclass) {
    appendClassImagesInspectorSection(panel, renderingClass);
    appendClassShapesInspectorSection(panel, renderingClass);
  }

  const text = createInspectorSection('Text', false);
  appendColorControl(text.body, {
    label: 'Text Color',
    path: ['rendering', 'textColor'],
    value: node.rendering?.textColor || CLASS_2D_DEFAULTS.textColor,
    defaultValue: CLASS_2D_DEFAULTS.textColor
  });
  panel.appendChild(text.section);

  const attributesSection = createInspectorSection('Attributes', false);
  appendColorControl(attributesSection.body, {
    label: 'Checkbox Color',
    path: ['rendering', 'attributes', 'checkboxColor'],
    value: attributesRendering.checkboxColor || CLASS_2D_DEFAULTS.attributeCheckboxColor,
    defaultValue: CLASS_2D_DEFAULTS.attributeCheckboxColor
  });
  appendSelectControl(attributesSection.body, {
    label: 'Checkbox Material',
    path: ['rendering', 'attributes', 'checkboxMaterial'],
    value: attributesRendering.checkboxMaterial || attributesRendering.material || CLASS_2D_DEFAULTS.attributeCheckboxMaterial,
    options: KNOWN_ENUMS.checkboxMaterial,
    defaultValue: CLASS_2D_DEFAULTS.attributeCheckboxMaterial
  });
  appendSelectControl(attributesSection.body, {
    label: 'Shape',
    path: ['rendering', 'attributes', 'shape'],
    value: attributesRendering.shape || CLASS_2D_DEFAULTS.attributeShape,
    options: KNOWN_ENUMS.shape,
    defaultValue: CLASS_2D_DEFAULTS.attributeShape
  });
  appendSliderNumberControl(attributesSection.body, {
    label: 'Width',
    path: ['rendering', 'attributes', 'size', 'width'],
    value: attributesRendering.size?.width ?? CLASS_2D_DEFAULTS.attributeWidth,
    min: 0.02,
    max: 0.6,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.attributeWidth
  });
  appendSliderNumberControl(attributesSection.body, {
    label: 'Height',
    path: ['rendering', 'attributes', 'size', 'height'],
    value: attributesRendering.size?.height ?? attributesRendering.size?.width ?? CLASS_2D_DEFAULTS.attributeHeight,
    min: 0.02,
    max: 0.6,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.attributeHeight
  });
  appendSliderNumberControl(attributesSection.body, {
    label: 'Metalness',
    path: ['rendering', 'attributes', 'metalness'],
    value: attributesRendering.metalness ?? CLASS_2D_DEFAULTS.attributeMetalness,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.attributeMetalness
  });
  appendSliderNumberControl(attributesSection.body, {
    label: 'Roughness',
    path: ['rendering', 'attributes', 'roughness'],
    value: attributesRendering.roughness ?? CLASS_2D_DEFAULTS.attributeRoughness,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.attributeRoughness
  });
  panel.appendChild(attributesSection.section);

  const connectionsSection = createInspectorSection('Connections', false);
  appendColorControl(connectionsSection.body, {
    label: 'Line Color',
    path: ['rendering', 'connections', 'lineColor'],
    value: connections.lineColor || CLASS_2D_DEFAULTS.lineColor,
    defaultValue: CLASS_2D_DEFAULTS.lineColor
  });
  appendSliderNumberControl(connectionsSection.body, {
    label: 'Line Width',
    path: ['rendering', 'connections', 'lineWidth'],
    value: connections.lineWidth ?? CLASS_2D_DEFAULTS.lineWidth,
    min: 0.001,
    max: 0.08,
    step: 0.001,
    defaultValue: CLASS_2D_DEFAULTS.lineWidth
  });
  panel.appendChild(connectionsSection.section);
}

function appendClassImagesInspectorSection(panel, renderingClass = {}, selectedNodes = null) {
  const getValue = (path, fallback) => {
    if (!selectedNodes) return getDeepValue({ rendering: { class: renderingClass } }, path, fallback);
    return getCommonPropertyValue(selectedNodes, path, fallback);
  };
  const images = createInspectorSection('Images', false);
  appendSelectControl(images.body, {
    label: 'Body Type',
    path: ['rendering', 'class', 'bodyType'],
    value: getValue(['rendering', 'class', 'bodyType'], CLASS_2D_DEFAULTS.bodyType),
    options: ['rectangle', 'image'],
    defaultValue: CLASS_2D_DEFAULTS.bodyType
  });
  appendTextControl(images.body, {
    label: 'Image Source',
    path: ['rendering', 'class', 'imageSrc'],
    value: getValue(['rendering', 'class', 'imageSrc'], CLASS_2D_DEFAULTS.imageSrc),
    placeholder: './images/class.png or https://...',
    suggestions: KNOWN_CLASS_IMAGE_SOURCES,
    defaultValue: CLASS_2D_DEFAULTS.imageSrc
  });
  appendSelectControl(images.body, {
    label: 'Image Fit',
    path: ['rendering', 'class', 'imageFit'],
    value: getValue(['rendering', 'class', 'imageFit'], CLASS_2D_DEFAULTS.imageFit),
    options: KNOWN_ENUMS.imageFit,
    defaultValue: CLASS_2D_DEFAULTS.imageFit
  });
  panel.appendChild(images.section);
}

function appendClassShapesInspectorSection(panel, renderingClass = {}, selectedNodes = null) {
  const getValue = (path, fallback) => {
    if (!selectedNodes) return getDeepValue({ rendering: { class: renderingClass } }, path, fallback);
    return getCommonPropertyValue(selectedNodes, path, fallback);
  };
  const shapes = createInspectorSection('Shapes', false);
  appendSelectControl(shapes.body, {
    label: 'Body Type',
    path: ['rendering', 'class', 'bodyType'],
    value: getValue(['rendering', 'class', 'bodyType'], CLASS_2D_DEFAULTS.bodyType),
    options: ['rectangle', 'shape'],
    defaultValue: CLASS_2D_DEFAULTS.bodyType
  });
  appendSelectControl(shapes.body, {
    label: 'Shape',
    path: ['rendering', 'class', 'shapeType'],
    value: getValue(['rendering', 'class', 'shapeType'], CLASS_2D_DEFAULTS.shapeType),
    options: KNOWN_ENUMS.classShapeType,
    defaultValue: CLASS_2D_DEFAULTS.shapeType
  });
  panel.appendChild(shapes.section);
}

function appendFontControls(container, config) {
  const font = normalizeFontSettings(config.font, config.fallback || getFontSettings());
  const path = config.path || ['rendering', 'font'];
  const prefix = config.labelPrefix || '';
  appendSliderNumberControl(container, {
    label: `${prefix}Font Size`,
    path: [...path, 'size'],
    value: font.size,
    min: 6,
    max: 48,
    step: 1,
    defaultValue: null
  });
  appendTextControl(container, {
    label: `${prefix}Font Family`,
    path: [...path, 'family'],
    value: font.family,
    placeholder: 'Arial, sans-serif',
    defaultValue: null
  });
  appendCheckboxControl(container, {
    label: `${prefix}Bold`,
    path: [...path, 'bold'],
    value: font.bold,
    defaultValue: null
  });
  appendCheckboxControl(container, {
    label: `${prefix}Italic`,
    path: [...path, 'italic'],
    value: font.italic,
    defaultValue: null
  });
  appendCheckboxControl(container, {
    label: `${prefix}Underline`,
    path: [...path, 'underline'],
    value: font.underline,
    defaultValue: null
  });
}

function getCommonFontValue(items, path) {
  const font = {};
  for (const key of ['size', 'family', 'bold', 'italic', 'underline']) {
    font[key] = getCommonPropertyValue(items, [...path, key], null);
  }
  return font;
}

function renderMultiClass2DInspector(panel, target) {
  const selectedNodes = target.nodes || [];
  const first = selectedNodes[0] || {};
  const renderingClass = first.rendering?.class || {};
  const attributesRendering = first.rendering?.attributes || {};
  const connections = first.rendering?.connections || {};
  renderInspectorHeader(panel, 'Class Properties', `${selectedNodes.length} selected 2D objects`);

  const layout = createInspectorSection('Layout', true);
  appendNumberControl(layout.body, {
    label: 'Width',
    path: ['size', 'width'],
    value: getCommonPropertyValue(selectedNodes, ['size', 'width'], first.size?.width ?? CLASS_2D_DEFAULTS.width),
    min: 0.4,
    max: 12,
    step: 0.05,
    defaultValue: CLASS_2D_DEFAULTS.width
  });
  appendNumberControl(layout.body, {
    label: 'Height',
    path: ['size', 'height'],
    value: getCommonPropertyValue(selectedNodes, ['size', 'height'], first.size?.height ?? CLASS_2D_DEFAULTS.height),
    min: 0.4,
    max: 12,
    step: 0.05,
    defaultValue: CLASS_2D_DEFAULTS.height
  });
  panel.appendChild(layout.section);

  const appearance = createInspectorSection('Appearance', true);
  appendColorControl(appearance.body, {
    label: 'Fill',
    path: ['rendering', 'class', 'color'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'color'], renderingClass.color || renderingClass.metallicColor || CLASS_2D_DEFAULTS.fillColor),
    defaultValue: CLASS_2D_DEFAULTS.fillColor
  });
  appendColorControl(appearance.body, {
    label: 'Border',
    path: ['rendering', 'class', 'borderColor'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'borderColor'], renderingClass.borderColor || CLASS_2D_DEFAULTS.borderColor),
    defaultValue: CLASS_2D_DEFAULTS.borderColor
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Border Width',
    path: ['rendering', 'class', 'borderWidth'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'borderWidth'], renderingClass.borderWidth ?? CLASS_2D_DEFAULTS.borderWidth),
    min: 0,
    max: 8,
    step: 0.25,
    defaultValue: CLASS_2D_DEFAULTS.borderWidth
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Corner Radius',
    path: ['rendering', 'class', 'cornerRadius'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'cornerRadius'], renderingClass.cornerRadius ?? CLASS_2D_DEFAULTS.cornerRadius),
    min: 0,
    max: 0.8,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.cornerRadius
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Opacity',
    path: ['rendering', 'class', 'opacity'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'opacity'], renderingClass.opacity ?? CLASS_2D_DEFAULTS.opacity),
    min: 0.1,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.opacity
  });
  appendFontControls(appearance.body, {
    labelPrefix: 'Name ',
    path: ['rendering', 'font'],
    font: getCommonFontValue(selectedNodes, ['rendering', 'font']),
    fallback: getFontSettings()
  });
  appendCheckboxControl(appearance.body, {
    label: 'Visible',
    path: ['visible'],
    value: selectedNodes.every(node => node.visible !== false),
    defaultValue: CLASS_2D_DEFAULTS.visible
  });
  appendCheckboxControl(appearance.body, {
    label: 'Lock Editing',
    path: ['locked'],
    value: selectedNodes.every(node => node.locked === true),
    defaultValue: CLASS_2D_DEFAULTS.locked
  });
  panel.appendChild(appearance.section);

  if (selectedNodes.every(node => node.type !== 'hyperclass')) {
    appendClassImagesInspectorSection(panel, renderingClass, selectedNodes);
    appendClassShapesInspectorSection(panel, renderingClass, selectedNodes);
  }

  const text = createInspectorSection('Text', false);
  appendColorControl(text.body, {
    label: 'Text Color',
    path: ['rendering', 'textColor'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'textColor'], first.rendering?.textColor || CLASS_2D_DEFAULTS.textColor),
    defaultValue: CLASS_2D_DEFAULTS.textColor
  });
  panel.appendChild(text.section);

  const attributesSection = createInspectorSection('Attributes', false);
  appendColorControl(attributesSection.body, {
    label: 'Checkbox Color',
    path: ['rendering', 'attributes', 'checkboxColor'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'attributes', 'checkboxColor'], attributesRendering.checkboxColor || CLASS_2D_DEFAULTS.attributeCheckboxColor),
    defaultValue: CLASS_2D_DEFAULTS.attributeCheckboxColor
  });
  appendSelectControl(attributesSection.body, {
    label: 'Checkbox Material',
    path: ['rendering', 'attributes', 'checkboxMaterial'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'attributes', 'checkboxMaterial'], attributesRendering.checkboxMaterial || attributesRendering.material || CLASS_2D_DEFAULTS.attributeCheckboxMaterial),
    options: KNOWN_ENUMS.checkboxMaterial,
    defaultValue: CLASS_2D_DEFAULTS.attributeCheckboxMaterial
  });
  appendSelectControl(attributesSection.body, {
    label: 'Shape',
    path: ['rendering', 'attributes', 'shape'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'attributes', 'shape'], attributesRendering.shape || CLASS_2D_DEFAULTS.attributeShape),
    options: KNOWN_ENUMS.shape,
    defaultValue: CLASS_2D_DEFAULTS.attributeShape
  });
  appendSliderNumberControl(attributesSection.body, {
    label: 'Width',
    path: ['rendering', 'attributes', 'size', 'width'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'attributes', 'size', 'width'], attributesRendering.size?.width ?? CLASS_2D_DEFAULTS.attributeWidth),
    min: 0.02,
    max: 0.6,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.attributeWidth
  });
  appendSliderNumberControl(attributesSection.body, {
    label: 'Height',
    path: ['rendering', 'attributes', 'size', 'height'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'attributes', 'size', 'height'], attributesRendering.size?.height ?? attributesRendering.size?.width ?? CLASS_2D_DEFAULTS.attributeHeight),
    min: 0.02,
    max: 0.6,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.attributeHeight
  });
  appendSliderNumberControl(attributesSection.body, {
    label: 'Metalness',
    path: ['rendering', 'attributes', 'metalness'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'attributes', 'metalness'], attributesRendering.metalness ?? CLASS_2D_DEFAULTS.attributeMetalness),
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.attributeMetalness
  });
  appendSliderNumberControl(attributesSection.body, {
    label: 'Roughness',
    path: ['rendering', 'attributes', 'roughness'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'attributes', 'roughness'], attributesRendering.roughness ?? CLASS_2D_DEFAULTS.attributeRoughness),
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.attributeRoughness
  });
  panel.appendChild(attributesSection.section);

  const connectionsSection = createInspectorSection('Connections', false);
  appendColorControl(connectionsSection.body, {
    label: 'Line Color',
    path: ['rendering', 'connections', 'lineColor'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'connections', 'lineColor'], connections.lineColor || CLASS_2D_DEFAULTS.lineColor),
    defaultValue: CLASS_2D_DEFAULTS.lineColor
  });
  appendSliderNumberControl(connectionsSection.body, {
    label: 'Line Width',
    path: ['rendering', 'connections', 'lineWidth'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'connections', 'lineWidth'], connections.lineWidth ?? CLASS_2D_DEFAULTS.lineWidth),
    min: 0.001,
    max: 0.08,
    step: 0.001,
    defaultValue: CLASS_2D_DEFAULTS.lineWidth
  });
  panel.appendChild(connectionsSection.section);
}

function getCommonPropertyValue(items, path, fallback) {
  if (!items.length) return fallback;
  const first = getDeepValue(items[0], path, fallback);
  return items.every(item => Object.is(getDeepValue(item, path, fallback), first)) ? first : fallback;
}

function getDeepValue(source, path, fallback = undefined) {
  let current = source;
  for (const key of path) {
    if (!isPlainObject(current) && (typeof current !== 'object' || current == null)) return fallback;
    current = current[key];
    if (current === undefined) return fallback;
  }
  return current;
}

function renderLink2DInspector(panel, target) {
  const link = target.value;
  const rendering = link.rendering || {};
  renderInspectorHeader(panel, 'Connection Properties', '2D link inspector');

  const connection = createInspectorSection('Connection', true);
  appendTextControl(connection.body, {
    label: 'Label',
    path: ['rendering', 'labelText'],
    value: rendering.labelText || link.name || '',
    placeholder: 'Link label',
    defaultValue: LINK_2D_DEFAULTS.labelText
  });
  appendColorControl(connection.body, {
    label: 'Line Color',
    path: ['rendering', 'lineColor'],
    value: rendering.lineColor || LINK_2D_DEFAULTS.lineColor,
    defaultValue: LINK_2D_DEFAULTS.lineColor
  });
  appendSliderNumberControl(connection.body, {
    label: 'Line Width',
    path: ['rendering', 'lineWidth'],
    value: rendering.lineWidth ?? LINK_2D_DEFAULTS.lineWidth,
    min: 0.1,
    max: 8,
    step: 0.1,
    defaultValue: LINK_2D_DEFAULTS.lineWidth
  });
  appendSelectControl(connection.body, {
    label: 'Line Style',
    path: ['rendering', 'lineStyle'],
    value: rendering.lineStyle || LINK_2D_DEFAULTS.lineStyle,
    options: KNOWN_ENUMS.lineStyle,
    defaultValue: LINK_2D_DEFAULTS.lineStyle
  });
  appendCheckboxControl(connection.body, {
    label: 'Visible',
    path: ['visible'],
    value: link.visible !== false,
    defaultValue: LINK_2D_DEFAULTS.visible
  });
  appendCheckboxControl(connection.body, {
    label: 'Rendering Visible',
    path: ['rendering', 'visible'],
    value: rendering.visible !== false,
    defaultValue: LINK_2D_DEFAULTS.renderingVisible
  });
  appendNumberControl(connection.body, {
    label: 'Z Index',
    path: ['rendering', 'zIndex'],
    value: rendering.zIndex ?? LINK_2D_DEFAULTS.zIndex,
    min: 0,
    max: 100,
    step: 1,
    defaultValue: LINK_2D_DEFAULTS.zIndex
  });
  panel.appendChild(connection.section);

  const arrowhead = createInspectorSection('Arrowhead', false);
  appendCheckboxControl(arrowhead.body, {
    label: 'Visible',
    path: ['rendering', 'arrowheadVisibility'],
    value: rendering.arrowheadVisibility !== false,
    defaultValue: LINK_2D_DEFAULTS.arrowheadVisibility
  });
  appendSelectControl(arrowhead.body, {
    label: 'Type',
    path: ['rendering', 'arrowheadType'],
    value: rendering.arrowheadType || LINK_2D_DEFAULTS.arrowheadType,
    options: KNOWN_ENUMS.arrowheadType,
    defaultValue: LINK_2D_DEFAULTS.arrowheadType
  });
  appendSliderNumberControl(arrowhead.body, {
    label: 'Size',
    path: ['rendering', 'arrowheadSize'],
    value: rendering.arrowheadSize ?? LINK_2D_DEFAULTS.arrowheadSize,
    min: 0.02,
    max: 0.5,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.arrowheadSize
  });
  appendSliderNumberControl(arrowhead.body, {
    label: 'Scale',
    path: ['rendering', 'arrowheadScale'],
    value: rendering.arrowheadScale ?? LINK_2D_DEFAULTS.arrowheadScale,
    min: 0.1,
    max: 2,
    step: 0.05,
    defaultValue: LINK_2D_DEFAULTS.arrowheadScale
  });
  appendSliderNumberControl(arrowhead.body, {
    label: 'Max Size',
    path: ['rendering', 'maxArrowheadSize'],
    value: rendering.maxArrowheadSize ?? LINK_2D_DEFAULTS.maxArrowheadSize,
    min: 0.02,
    max: 0.5,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.maxArrowheadSize
  });
  panel.appendChild(arrowhead.section);

  const label = createInspectorSection('Label', true);
  appendSliderNumberControl(label.body, {
    label: 'Font Size',
    path: ['rendering', 'labelFontSize'],
    value: rendering.labelFontSize ?? LINK_2D_DEFAULTS.labelFontSize,
    min: 6,
    max: 24,
    step: 1,
    defaultValue: LINK_2D_DEFAULTS.labelFontSize
  });
  appendColorControl(label.body, {
    label: 'Label Color',
    path: ['rendering', 'labelColor'],
    value: rendering.labelColor || rendering.textColor || LINK_2D_DEFAULTS.labelColor,
    defaultValue: LINK_2D_DEFAULTS.labelColor
  });
  appendColorControl(label.body, {
    label: 'Text Color',
    path: ['rendering', 'textColor'],
    value: rendering.textColor || rendering.labelColor || LINK_2D_DEFAULTS.textColor,
    defaultValue: LINK_2D_DEFAULTS.textColor
  });
  appendTextControl(label.body, {
    label: 'Background',
    path: ['rendering', 'labelBackgroundColor'],
    value: rendering.labelBackgroundColor || LINK_2D_DEFAULTS.labelBackgroundColor,
    placeholder: 'CSS color',
    defaultValue: LINK_2D_DEFAULTS.labelBackgroundColor
  });
  appendSliderNumberControl(label.body, {
    label: 'Position',
    path: ['rendering', 'labelPositionAlongPath'],
    value: rendering.labelPositionAlongPath ?? LINK_2D_DEFAULTS.labelPositionAlongPath,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.labelPositionAlongPath
  });
  appendSliderNumberControl(label.body, {
    label: 'Offset',
    path: ['rendering', 'labelOffsetFromPath'],
    value: rendering.labelOffsetFromPath ?? LINK_2D_DEFAULTS.labelOffsetFromPath,
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.labelOffsetFromPath
  });
  appendSelectControl(label.body, {
    label: 'Rotation',
    path: ['rendering', 'labelRotationBehavior'],
    value: rendering.labelRotationBehavior || LINK_2D_DEFAULTS.labelRotationBehavior,
    options: KNOWN_ENUMS.labelRotationBehavior,
    defaultValue: LINK_2D_DEFAULTS.labelRotationBehavior
  });
  appendSelectControl(label.body, {
    label: 'Placement',
    path: ['rendering', 'labelPlacement'],
    value: rendering.labelPlacement || LINK_2D_DEFAULTS.labelPlacement,
    options: KNOWN_ENUMS.labelPlacement,
    defaultValue: LINK_2D_DEFAULTS.labelPlacement
  });
  appendSelectControl(label.body, {
    label: 'Strategy',
    path: ['rendering', 'labelStrategy'],
    value: rendering.labelStrategy || LINK_2D_DEFAULTS.labelStrategy,
    options: KNOWN_ENUMS.labelStrategy,
    defaultValue: LINK_2D_DEFAULTS.labelStrategy
  });
  panel.appendChild(label.section);

  const routing = createInspectorSection('Routing', false);
  appendSelectControl(routing.body, {
    label: 'Orthogonal Style',
    path: ['rendering', 'orthogonalStyle'],
    value: rendering.orthogonalStyle || LINK_2D_DEFAULTS.orthogonalStyle,
    options: KNOWN_ENUMS.orthogonalStyle,
    defaultValue: LINK_2D_DEFAULTS.orthogonalStyle
  });
  appendSliderNumberControl(routing.body, {
    label: 'Clearance',
    path: ['rendering', 'orthogonalClearance'],
    value: rendering.orthogonalClearance ?? LINK_2D_DEFAULTS.orthogonalClearance,
    min: 0,
    max: 2.5,
    step: 0.05,
    defaultValue: LINK_2D_DEFAULTS.orthogonalClearance
  });
  appendSliderNumberControl(routing.body, {
    label: 'Parallel Gap',
    path: ['rendering', 'parallelRouteGap'],
    value: rendering.parallelRouteGap ?? LINK_2D_DEFAULTS.parallelRouteGap,
    min: 0.05,
    max: 1.5,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.parallelRouteGap
  });
  appendSliderNumberControl(routing.body, {
    label: 'Global Gap',
    path: ['rendering', 'globalRouteGap'],
    value: rendering.globalRouteGap ?? LINK_2D_DEFAULTS.globalRouteGap,
    min: 0.05,
    max: 1.5,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.globalRouteGap
  });
  appendSliderNumberControl(routing.body, {
    label: 'Obstacle Gap',
    path: ['rendering', 'obstacleRouteGap'],
    value: rendering.obstacleRouteGap ?? LINK_2D_DEFAULTS.obstacleRouteGap,
    min: 0.05,
    max: 1.5,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.obstacleRouteGap
  });
  appendSelectControl(routing.body, {
    label: 'Route Side',
    path: ['rendering', 'routeSide'],
    value: rendering.routeSide ?? LINK_2D_DEFAULTS.routeSide,
    options: ['', ...KNOWN_ENUMS.routeSide],
    optionLabels: { '': 'auto' },
    defaultValue: LINK_2D_DEFAULTS.routeSide
  });
  appendSliderNumberControl(routing.body, {
    label: 'Curve Offset',
    path: ['rendering', 'curveOffset'],
    value: rendering.curveOffset ?? LINK_2D_DEFAULTS.curveOffset,
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.curveOffset
  });
  appendSliderNumberControl(routing.body, {
    label: 'Curve Radius',
    path: ['rendering', 'curveRadius'],
    value: rendering.curveRadius ?? LINK_2D_DEFAULTS.curveRadius,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.curveRadius
  });
  appendSliderNumberControl(routing.body, {
    label: 'Corner Radius',
    path: ['rendering', 'cornerRadius'],
    value: rendering.cornerRadius ?? LINK_2D_DEFAULTS.cornerRadius,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.cornerRadius
  });
  appendSliderNumberControl(routing.body, {
    label: 'Relationship Radius',
    path: ['rendering', 'relationshipCornerRadius'],
    value: rendering.relationshipCornerRadius ?? LINK_2D_DEFAULTS.relationshipCornerRadius,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.relationshipCornerRadius
  });
  appendJsonControl(routing.body, {
    label: 'Route Points',
    path: ['rendering', 'routePoints'],
    value: rendering.routePoints ?? LINK_2D_DEFAULTS.routePoints,
    defaultValue: LINK_2D_DEFAULTS.routePoints,
    valueShape: 'array'
  });
  panel.appendChild(routing.section);

  const ports = createInspectorSection('Ports', false);
  appendSelectControl(ports.body, {
    label: 'Source Side',
    path: ['rendering', 'sourcePortSide'],
    value: rendering.sourcePortSide ?? LINK_2D_DEFAULTS.sourcePortSide,
    options: ['', ...KNOWN_ENUMS.sourcePortSide],
    optionLabels: { '': 'auto' },
    defaultValue: LINK_2D_DEFAULTS.sourcePortSide
  });
  appendSelectControl(ports.body, {
    label: 'Target Side',
    path: ['rendering', 'targetPortSide'],
    value: rendering.targetPortSide ?? LINK_2D_DEFAULTS.targetPortSide,
    options: ['', ...KNOWN_ENUMS.targetPortSide],
    optionLabels: { '': 'auto' },
    defaultValue: LINK_2D_DEFAULTS.targetPortSide
  });
  appendSelectControl(ports.body, {
    label: 'Source Port',
    path: ['rendering', 'sourcePort'],
    value: rendering.sourcePort ?? LINK_2D_DEFAULTS.sourcePort,
    options: ['', ...KNOWN_ENUMS.sourcePort],
    optionLabels: { '': 'auto' },
    defaultValue: LINK_2D_DEFAULTS.sourcePort
  });
  appendSelectControl(ports.body, {
    label: 'Target Port',
    path: ['rendering', 'targetPort'],
    value: rendering.targetPort ?? LINK_2D_DEFAULTS.targetPort,
    options: ['', ...KNOWN_ENUMS.targetPort],
    optionLabels: { '': 'auto' },
    defaultValue: LINK_2D_DEFAULTS.targetPort
  });
  appendSliderNumberControl(ports.body, {
    label: 'Port Radius',
    path: ['rendering', 'relationshipPortRadius'],
    value: rendering.relationshipPortRadius ?? LINK_2D_DEFAULTS.relationshipPortRadius,
    min: 0.01,
    max: 0.3,
    step: 0.005,
    defaultValue: LINK_2D_DEFAULTS.relationshipPortRadius
  });
  appendSliderNumberControl(ports.body, {
    label: 'Port Stub',
    path: ['rendering', 'relationshipPortStub'],
    value: rendering.relationshipPortStub ?? LINK_2D_DEFAULTS.relationshipPortStub,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.relationshipPortStub
  });
  appendColorControl(ports.body, {
    label: 'Port Fill',
    path: ['rendering', 'relationshipPortFill'],
    value: rendering.relationshipPortFill || LINK_2D_DEFAULTS.relationshipPortFill,
    defaultValue: LINK_2D_DEFAULTS.relationshipPortFill
  });
  appendColorControl(ports.body, {
    label: 'Port Stroke',
    path: ['rendering', 'relationshipPortStroke'],
    value: rendering.relationshipPortStroke || LINK_2D_DEFAULTS.relationshipPortStroke,
    defaultValue: LINK_2D_DEFAULTS.relationshipPortStroke
  });
  appendSliderNumberControl(ports.body, {
    label: 'Port Opacity',
    path: ['rendering', 'relationshipPortOpacity'],
    value: rendering.relationshipPortOpacity ?? LINK_2D_DEFAULTS.relationshipPortOpacity,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.relationshipPortOpacity
  });
  panel.appendChild(ports.section);

  const collisions = createInspectorSection('Label Collision', false);
  appendSliderNumberControl(collisions.body, {
    label: 'Width',
    path: ['rendering', 'labelCollisionWidth'],
    value: rendering.labelCollisionWidth ?? LINK_2D_DEFAULTS.labelCollisionWidth,
    min: 0.2,
    max: 4,
    step: 0.05,
    defaultValue: LINK_2D_DEFAULTS.labelCollisionWidth
  });
  appendSliderNumberControl(collisions.body, {
    label: 'Height',
    path: ['rendering', 'labelCollisionHeight'],
    value: rendering.labelCollisionHeight ?? LINK_2D_DEFAULTS.labelCollisionHeight,
    min: 0.1,
    max: 2,
    step: 0.05,
    defaultValue: LINK_2D_DEFAULTS.labelCollisionHeight
  });
  appendSliderNumberControl(collisions.body, {
    label: 'Margin',
    path: ['rendering', 'labelCollisionMargin'],
    value: rendering.labelCollisionMargin ?? LINK_2D_DEFAULTS.labelCollisionMargin,
    min: 0,
    max: 0.6,
    step: 0.01,
    defaultValue: LINK_2D_DEFAULTS.labelCollisionMargin
  });
  panel.appendChild(collisions.section);
}

function renderAttribute2DInspector(panel, target) {
  renderInspectorHeader(panel, 'Attribute Properties', '2D attribute inspector');
  const content = createInspectorSection('Text', true);
  appendTextControl(content.body, {
    label: 'Name',
    path: ['name'],
    value: target.value.name || '',
    placeholder: 'Attribute name'
  });
  panel.appendChild(content.section);

  const appearance = createInspectorSection('Appearance', true);
  appendFontControls(appearance.body, {
    path: ['font'],
    font: target.value.font,
    fallback: getFontSettings()
  });
  panel.appendChild(appearance.section);
}

function createInspectorSection(title, open = false) {
  const section = document.createElement('details');
  section.className = 'inspector-section';
  section.open = open;
  const summary = document.createElement('summary');
  summary.textContent = title;
  const body = document.createElement('div');
  body.className = 'inspector-section-body';
  section.append(summary, body);
  return { section, body };
}

function appendTextControl(container, config) {
  const row = createInspectorRow(config.label);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = String(config.value ?? '');
  input.placeholder = config.placeholder || '';
  if (config.suggestions?.length) {
    const list = document.createElement('datalist');
    list.id = `inspector-list-${nextInspectorListId++}`;
    [...new Set(config.suggestions.map(String).filter(Boolean))].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      list.appendChild(option);
    });
    input.setAttribute('list', list.id);
    row.control.appendChild(list);
  }
  applyInspectorDataset(input, config.path, 'string', false, config.defaultValue);
  row.control.appendChild(input);
  appendResetButton(row.control, config);
  container.appendChild(row.element);
}

function appendNumberControl(container, config) {
  const row = createInspectorRow(config.label);
  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.min = String(config.min ?? '');
  input.max = String(config.max ?? '');
  input.step = String(config.step ?? 'any');
  input.value = String(Number(config.value ?? config.defaultValue ?? 0));
  applyInspectorDataset(input, config.path, 'number', true, config.defaultValue);
  row.control.appendChild(input);
  appendResetButton(row.control, config);
  container.appendChild(row.element);
}

function appendSliderNumberControl(container, config) {
  const row = createInspectorRow(config.label);
  const wrapper = document.createElement('div');
  wrapper.className = 'slider-number-control';
  const key = JSON.stringify(config.path);
  const value = Number(config.value ?? config.defaultValue ?? 0);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(config.min);
  slider.max = String(config.max);
  slider.step = String(config.step);
  slider.value = String(value);
  slider.dataset.inspectorKey = key;
  applyInspectorDataset(slider, config.path, 'number', true, config.defaultValue);

  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.min = String(config.min);
  input.max = String(config.max);
  input.step = String(config.step);
  input.value = String(value);
  input.dataset.inspectorKey = key;
  applyInspectorDataset(input, config.path, 'number', true, config.defaultValue);

  wrapper.append(slider, input);
  row.control.appendChild(wrapper);
  appendResetButton(row.control, config);
  container.appendChild(row.element);
}

function appendColorControl(container, config) {
  const row = createInspectorRow(config.label);
  const wrapper = document.createElement('div');
  wrapper.className = 'color-control';
  const key = JSON.stringify(config.path);
  const value = normalizeColorInput(config.value, config.defaultValue || '#000000');

  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = value;
  picker.dataset.inspectorKey = key;
  applyInspectorDataset(picker, config.path, 'color', true, config.defaultValue);

  const text = document.createElement('input');
  text.type = 'text';
  text.value = value;
  text.placeholder = '#RRGGBB or rgb()';
  text.dataset.inspectorKey = key;
  applyInspectorDataset(text, config.path, 'color', false, config.defaultValue);

  wrapper.append(picker, text);
  const palette = createRecentColorPalette(config.path);
  row.control.append(wrapper, palette);
  appendResetButton(row.control, config);
  container.appendChild(row.element);
}

function appendCheckboxControl(container, config) {
  const row = createInspectorRow(config.label);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(config.value);
  applyInspectorDataset(input, config.path, 'boolean', false, config.defaultValue);
  row.control.appendChild(input);
  appendResetButton(row.control, config);
  container.appendChild(row.element);
}

function appendSelectControl(container, config) {
  const row = createInspectorRow(config.label);
  const input = document.createElement('select');
  const options = [...new Set([...(config.options || []), String(config.value ?? '')])];
  options.forEach(optionValue => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = config.optionLabels?.[optionValue] ?? optionValue;
    input.appendChild(option);
  });
  input.value = String(config.value ?? '');
  applyInspectorDataset(input, config.path, 'string', false, config.defaultValue);
  row.control.appendChild(input);
  appendResetButton(row.control, config);
  container.appendChild(row.element);
}

function appendJsonControl(container, config) {
  const row = createInspectorRow(config.label);
  const input = document.createElement('textarea');
  input.rows = config.rows ?? 4;
  input.spellcheck = false;
  input.value = JSON.stringify(config.value ?? config.defaultValue ?? null, null, 2);
  applyInspectorDataset(input, config.path, 'json', false, config.defaultValue);
  if (config.valueShape) input.dataset.valueShape = config.valueShape;
  row.control.appendChild(input);
  appendResetButton(row.control, config);
  container.appendChild(row.element);
}

function createInspectorRow(labelText) {
  const element = document.createElement('label');
  element.className = 'inspector-row';
  const label = document.createElement('span');
  label.textContent = labelText;
  const control = document.createElement('div');
  control.className = 'inspector-control';
  element.append(label, control);
  return { element, control };
}

function applyInspectorDataset(input, path, valueType, live = false, defaultValue = undefined) {
  input.dataset.propertyPath = JSON.stringify(path);
  input.dataset.valueType = valueType;
  input.dataset.live = live ? 'true' : 'false';
  input.disabled = editMode === 'readonly';
  if (defaultValue !== undefined) input.dataset.resetValue = JSON.stringify(defaultValue);
}

function appendResetButton(container, config) {
  if (config.defaultValue === undefined) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quiet inspector-reset-button';
  button.textContent = 'Reset';
  button.dataset.resetProperty = JSON.stringify(config.path);
  button.dataset.resetValue = JSON.stringify(config.defaultValue);
  button.dataset.valueType = typeof config.defaultValue === 'boolean' ? 'boolean' : typeof config.defaultValue === 'number' ? 'number' : (isColorProperty(config.path, config.path.at(-1), config.defaultValue) ? 'color' : 'string');
  button.disabled = editMode === 'readonly';
  container.appendChild(button);
}

function createRecentColorPalette(path) {
  const palette = document.createElement('div');
  palette.className = 'recent-colors';
  palette.setAttribute('aria-label', 'Recent colors');
  recentInspectorColors.slice(0, 8).forEach(color => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.title = color;
    swatch.dataset.colorValue = color;
    swatch.dataset.propertyPath = JSON.stringify(path);
    swatch.disabled = editMode === 'readonly';
    palette.appendChild(swatch);
  });
  return palette;
}

function renderPropertyObject(container, value, basePath) {
  const entries = Object.entries(value || {}).filter(([key, entryValue]) => isEditableProperty(key, entryValue, basePath));
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'property-empty';
    empty.textContent = 'No editable properties for this selection.';
    container.appendChild(empty);
    return;
  }

  entries.forEach(([key, entryValue]) => {
    const path = [...basePath, key];
    if (isPlainObject(entryValue)) {
      const group = document.createElement('fieldset');
      group.className = 'property-group';
      const legend = document.createElement('legend');
      legend.textContent = humanizePropertyName(key);
      group.appendChild(legend);
      renderPropertyObject(group, entryValue, path);
      container.appendChild(group);
      return;
    }

    const row = document.createElement('label');
    row.className = 'property-row';
    const caption = document.createElement('span');
    caption.textContent = humanizePropertyName(key);
    row.appendChild(caption);
    row.appendChild(createPropertyInput(path, key, entryValue));
    container.appendChild(row);
  });
}

function isEditableProperty(key, value, basePath) {
  if (STRUCTURAL_PROPERTY_KEYS.has(key)) return false;
  if (Array.isArray(value)) return false;
  if (typeof value === 'function' || value === undefined) return false;
  return basePath.length <= 6;
}

function createPropertyInput(path, key, value) {
  const enumOptions = getEnumOptions(path, key, value);
  let input;

  if (isColorProperty(path, key, value)) {
    input = document.createElement('input');
    input.type = 'color';
    input.value = normalizeHexColor(value);
    input.dataset.valueType = 'string';
    input.dataset.live = 'true';
  } else if (enumOptions.length) {
    input = document.createElement('select');
    enumOptions.forEach(optionValue => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue;
      input.appendChild(option);
    });
    input.value = String(value ?? '');
  } else if (typeof value === 'boolean') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.dataset.valueType = 'boolean';
  } else if (typeof value === 'number') {
    input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.value = String(value);
    input.dataset.valueType = 'number';
    input.dataset.live = 'true';
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = String(value ?? '');
    input.dataset.valueType = 'string';
  }

  input.dataset.propertyPath = JSON.stringify(path);
  input.disabled = editMode === 'readonly';
  return input;
}

function getEnumOptions(path, key, value) {
  const known = KNOWN_ENUMS[key] || [];
  return [...new Set([...(known || []), String(value ?? '')].filter(Boolean))];
}

function isHexColorValue(value) {
  return typeof value === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value.trim());
}

function isColorProperty(path, key, value) {
  if (isHexColorValue(value)) return true;
  return typeof value === 'string' && /color$/i.test(String(key)) && path.length > 0;
}

function normalizeColorInput(value, fallback = '#000000') {
  const clean = String(value ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(clean)) {
    return `#${clean.slice(1).split('').map(char => char + char).join('')}`.toLowerCase();
  }
  const rgb = clean.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgb) {
    const channel = value => Math.max(0, Math.min(255, Math.round(Number(value) || 0))).toString(16).padStart(2, '0');
    return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
  }
  return normalizeHexColor(fallback);
}

function humanizePropertyName(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function setDeepValue(target, path, value) {
  let current = target;
  path.slice(0, -1).forEach(key => {
    if (!isPlainObject(current[key])) current[key] = {};
    current = current[key];
  });
  current[path[path.length - 1]] = value;
  return target;
}

function readPropertyInputValue(input) {
  if (input.dataset.valueType === 'boolean') return input.checked;
  if (input.dataset.valueType === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : null;
  }
  if (input.dataset.valueType === 'json') {
    try {
      const raw = input.value.trim();
      const parsed = raw ? JSON.parse(raw) : (input.dataset.valueShape === 'array' ? [] : null);
      if (input.dataset.valueShape === 'array' && !Array.isArray(parsed)) {
        throw new Error('Expected a JSON array');
      }
      input.setCustomValidity?.('');
      return parsed;
    } catch (error) {
      input.setCustomValidity?.(error?.message || 'Invalid JSON');
      input.reportValidity?.();
      return null;
    }
  }
  if (input.dataset.valueType === 'color') {
    return normalizeColorInput(input.value, input.dataset.resetValue ? JSON.parse(input.dataset.resetValue) : '#000000');
  }
  return input.value;
}

function syncInspectorControlGroup(input, value = input.value) {
  const key = input.dataset.inspectorKey;
  if (!key) return;
  $('property-panel')?.querySelectorAll(`[data-inspector-key]`).forEach(peer => {
    if (peer === input || peer.dataset.inspectorKey !== key) return;
    if (peer.type === 'checkbox') peer.checked = Boolean(value);
    else peer.value = String(value);
  });
}

function rememberRecentInspectorColor(color) {
  const normalized = normalizeColorInput(color, null);
  if (!normalized) return;
  const existing = recentInspectorColors.indexOf(normalized);
  if (existing >= 0) recentInspectorColors.splice(existing, 1);
  recentInspectorColors.unshift(normalized);
  recentInspectorColors.splice(8);
}

function beginLivePropertyEdit(input) {
  if (input?.dataset?.live !== 'true' || pendingLivePropertyEdit) return;
  pendingLivePropertyEdit = {
    before: cloneValue(getData()),
    path: input.dataset.propertyPath || ''
  };
}

function commitLivePropertyEdit() {
  if (!pendingLivePropertyEdit) return;
  const before = pendingLivePropertyEdit.before;
  const after = cloneValue(getData());
  pendingLivePropertyEdit = null;
  recordPropertyHistory(before, after);
  renderPropertyPanel();
}

function recordPropertyHistory(before, after) {
  if (!before || JSON.stringify(before) === JSON.stringify(after)) return;
  propertyUndoStack.push({ before, after });
  if (propertyUndoStack.length > INSPECTOR_HISTORY_LIMIT) propertyUndoStack.shift();
  propertyRedoStack.length = 0;
}

async function restorePropertySnapshot(snapshot) {
  await setData(snapshot, { context: ctx(), refresh: true });
  updateOverview();
  updateInterface({ json: true });
}

async function undoPropertyEdit() {
  const entry = propertyUndoStack.pop();
  if (!entry) return;
  propertyRedoStack.push({ before: cloneValue(getData()), after: entry.after });
  await restorePropertySnapshot(entry.before);
}

async function redoPropertyEdit() {
  const entry = propertyRedoStack.pop();
  if (!entry) return;
  const current = cloneValue(getData());
  propertyUndoStack.push({ before: current, after: entry.after });
  await restorePropertySnapshot(entry.after);
}

async function handlePropertyPanelAction(event) {
  const action = event.target.closest?.('[data-inspector-action]')?.dataset?.inspectorAction;
  if (action === 'undo') {
    await undoPropertyEdit();
    return;
  }
  if (action === 'redo') {
    await redoPropertyEdit();
    return;
  }

  const swatch = event.target.closest?.('[data-color-value]');
  if (swatch) {
    const path = JSON.parse(swatch.dataset.propertyPath || '[]');
    await updateSelectedProperty(path, swatch.dataset.colorValue, { live: false, history: true });
    return;
  }

  const reset = event.target.closest?.('[data-reset-property]');
  if (reset) {
    const path = JSON.parse(reset.dataset.resetProperty || '[]');
    const value = JSON.parse(reset.dataset.resetValue || 'null');
    await updateSelectedProperty(path, value, { live: false, history: true });
  }
}

async function handlePropertyPanelChange(event, options = {}) {
  const input = event.target.closest?.('[data-property-path]');
  if (!input || input.disabled || editMode === 'readonly') return;
  const path = JSON.parse(input.dataset.propertyPath || '[]');
  if (!path.length) return;
  const value = readPropertyInputValue(input);
  if (value === null) return;
  if (input.dataset.valueType === 'color') {
    rememberRecentInspectorColor(value);
    syncInspectorControlGroup(input, value);
  } else {
    syncInspectorControlGroup(input);
  }
  await updateSelectedProperty(path, value, {
    live: input.dataset.live === 'true',
    history: options.history !== false && input.dataset.live !== 'true'
  });
}

async function updateSelectedProperty(path, value, options = {}) {
  const target = getSelectedPropertyTarget();
  if (!target) return;

  const before = options.history === false ? null : cloneValue(getData());
  if (target.kind === 'multi-class') {
    for (const node of target.nodes || []) {
      const nextNode = setDeepValue(cloneValue(node), path, value);
      if (path.join('.') === 'rendering.class.color') {
        nextNode.rendering = nextNode.rendering || {};
        nextNode.rendering.class = nextNode.rendering.class || {};
        nextNode.rendering.class.metallicColor = value;
      }
      const updater = nextNode.type === 'hyperclass' ? updateHyperclass : updateClass;
      await updater(node.id, nextNode, { context: ctx(), refresh: false, saveHistory: false });
    }
    const after = options.history === false ? null : cloneValue(getData());
    if (before && after) recordPropertyHistory(before, after);
    if (options.live) {
      refreshSceneFromData(ctx());
      updateOverview();
      updateJsonPreviewFromData();
      updateStats();
      updateValidationStatus();
      applySelectionHighlight();
      return;
    }
    await refreshWorkspace(null, { refresh: true, fit: false });
    return;
  }

  const next = setDeepValue(cloneValue(target.value), path, value);
  if ((target.kind === 'class' || target.kind === 'hyperclass') && path.join('.') === 'rendering.class.color') {
    next.rendering = next.rendering || {};
    next.rendering.class = next.rendering.class || {};
    next.rendering.class.metallicColor = value;
  }
  if (target.kind === 'link' && path.join('.') === 'rendering.labelText') {
    next.name = value;
  }

  if (target.kind === 'class' || target.kind === 'hyperclass') {
    const updater = target.kind === 'hyperclass' ? updateHyperclass : updateClass;
    await updater(target.node.id, next, { context: ctx(), refresh: false });
  } else if (target.kind === 'link') {
    await updateLink(target.value.id, next, { context: ctx(), refresh: false });
  } else if (target.kind === 'attribute') {
    await updateAttribute(target.owner.id, target.key, next, { context: ctx(), refresh: false });
  }

  const after = options.history === false ? null : cloneValue(getData());
  if (before && after) recordPropertyHistory(before, after);

  if (options.live) {
    refreshSceneFromData(ctx());
    updateOverview();
    updateJsonPreviewFromData();
    updateStats();
    updateValidationStatus();
    applySelectionHighlight();
    return;
  }

  await refreshWorkspace(null, { refresh: true, fit: false });
}

function attributeDisplayName(attribute, index) {
  if (typeof attribute === 'string') return attribute;
  if (typeof attribute === 'number' || typeof attribute === 'boolean') return String(attribute);
  if (!attribute || typeof attribute !== 'object') return `attribute${index + 1}`;
  return String(attribute.name ?? attribute.label ?? attribute.title ?? attribute.id ?? `attribute${index + 1}`);
}

function repairAttributeLabels() {
  const names = nodes().flatMap(node => (node.attributes || []).map(attributeDisplayName));
  document.querySelectorAll('.attribute-label').forEach((label, index) => {
    if (names[index]) label.textContent = names[index];
  });
}

function getNodeSurfaceColor(node) {
  return normalizeHexColor(node?.rendering?.class?.color || node?.rendering?.class?.metallicColor || '#ffd166');
}

function normalizeHexColor(value) {
  const clean = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  if (/^#[0-9a-f]{3}$/i.test(clean)) {
    return `#${clean.slice(1).split('').map(char => char + char).join('')}`;
  }
  return '#ffd166';
}

function syncSelectedColorControl(selected) {
  const readOnly = !selected || editMode === 'readonly';
  const fill = $('selected-color-input');
  const border = $('selected-border-color-input');
  const opacity = $('selected-opacity-input');
  const corner = $('selected-corner-radius-input');
  const textColor = $('selected-text-color-input');
  const nameInput = $('selected-name-input');
  const renderingClass = selected?.rendering?.class || {};
  if (fill) {
    fill.disabled = readOnly;
    fill.value = selected ? getNodeSurfaceColor(selected) : '#ffd166';
  }
  if (border) {
    border.disabled = readOnly;
    border.value = normalizeHexColor(renderingClass.borderColor || '#7a4f00');
  }
  if (opacity) {
    opacity.disabled = readOnly;
    opacity.value = String(Number(renderingClass.opacity ?? 1));
  }
  if (corner) {
    corner.disabled = readOnly;
    corner.value = String(Number(renderingClass.cornerRadius ?? 0.1));
  }
  if (textColor) {
    textColor.disabled = readOnly;
    textColor.value = normalizeHexColor(selected?.rendering?.textColor || '#111827');
  }
  if (nameInput) {
    nameInput.disabled = readOnly;
    nameInput.value = selected?.name || '';
  }
}

async function handleSelectedRenderingChange() {
  const selected = nodeById(selectedElementId);
  if (!selected) return;
  const color = normalizeHexColor($('selected-color-input')?.value);
  const borderColor = normalizeHexColor($('selected-border-color-input')?.value);
  const opacity = Number($('selected-opacity-input')?.value ?? 1);
  const cornerRadius = Number($('selected-corner-radius-input')?.value ?? 0.1);
  const textColor = normalizeHexColor($('selected-text-color-input')?.value);
  const currentRendering = selected.rendering || {};
  const nextRendering = {
    ...currentRendering,
    class: {
      ...(currentRendering.class || {}),
      color,
      metallicColor: color,
      borderColor,
      opacity: Number.isFinite(opacity) ? opacity : 1,
      cornerRadius: Number.isFinite(cornerRadius) ? cornerRadius : 0.1
    },
    textColor
  };
  const updater = selected.type === 'hyperclass' ? updateHyperclass : updateClass;
  await updater(selected.id, { rendering: nextRendering }, { context: ctx(), refresh: false });
  await refreshWorkspace(`Updated rendering for ${selected.name || selected.id}`, { refresh: true, fit: false });
}

function syncLinkEditControls() {
  const selectedLink = links().find(link => sameId(link.id, selectedLinkId));
  const disabled = editMode === 'readonly' || !selectedLink;
  const nameInput = $('selected-link-name-input');
  const colorInput = $('selected-link-color-input');
  const widthInput = $('selected-link-width-input');
  if (nameInput) {
    nameInput.disabled = disabled;
    nameInput.value = selectedLink ? (selectedLink.rendering?.labelText || selectedLink.name || '') : '';
  }
  if (colorInput) {
    colorInput.disabled = disabled;
    colorInput.value = normalizeHexColor(selectedLink?.rendering?.lineColor || '#334155');
  }
  if (widthInput) {
    widthInput.disabled = disabled;
    widthInput.value = String(Number(selectedLink?.rendering?.lineWidth ?? LINK_2D_DEFAULTS.lineWidth));
  }
}

async function handleSelectedNameChange() {
  const selected = nodeById(selectedElementId);
  if (!selected) return;
  const nextName = String($('selected-name-input')?.value || '').trim();
  if (!nextName || nextName === selected.name) return;
  const updater = selected.type === 'hyperclass' ? updateHyperclass : updateClass;
  await updater(selected.id, { name: nextName }, { context: ctx(), refresh: false });
  await refreshWorkspace(`Renamed ${selected.id} to ${nextName}`, { refresh: true, fit: false });
}

async function handleSelectedAttributeRename() {
  const owner = nodeById(selectedAttributeOwnerId) || nodeById(selectedElementId);
  if (!owner || selectedAttributeKey == null) return;
  const value = String($('selected-attribute-name-input')?.value || '').trim();
  if (!value) return;
  const key = String(selectedAttributeKey).startsWith('idx-') ? Number(String(selectedAttributeKey).slice(4)) : selectedAttributeKey;
  await updateAttribute(owner.id, key, { name: value }, { context: ctx(), refresh: false });
  await refreshWorkspace(`Renamed attribute on ${owner.name || owner.id}`, { refresh: true, fit: false });
}

async function handleSelectedLinkUpdate() {
  if (!selectedLinkId) return;
  const name = String($('selected-link-name-input')?.value || '').trim();
  const color = normalizeHexColor($('selected-link-color-input')?.value || '#334155');
  const lineWidth = Number($('selected-link-width-input')?.value ?? LINK_2D_DEFAULTS.lineWidth);
  await updateLink(selectedLinkId, {
    name,
    rendering: { labelText: name, lineColor: color, lineWidth: Number.isFinite(lineWidth) ? lineWidth : LINK_2D_DEFAULTS.lineWidth }
  }, { context: ctx(), refresh: false });
  await refreshWorkspace('Updated link style', { refresh: true, fit: false });
}

function normalizeClassSurfaceMaterials() {
  if (!diagramGroup) return;
  let changed = false;
  diagramGroup.traverse(object => {
    if (!object.isMesh || !object.userData?.isClassLike || object.name === 'class-hub') return;
    if (object.userData?.isHyperClass) return;
    if (object.material?.userData?.hbdsMetallicPanel) return;
    if (object.material?.userData?.hbdsFlatPanel) return;
    const source = object.material;
    const material = new THREE.MeshBasicMaterial({
      color: source?.color?.clone?.() ?? new THREE.Color('#FFD700'),
      transparent: Boolean(source?.transparent),
      opacity: source?.opacity ?? 1
    });
    material.userData.hbdsFlatPanel = true;
    source?.dispose?.();
    object.material = material;
    changed = true;
  });
  if (changed) renderOnce();
}

function enhanceIconTitleLabels() {
  if (!diagramGroup) return;
  diagramGroup.traverse(object => {
    if (!object.userData?.isClassLike) return;
    const model = object.userData.modelData || nodeById(object.userData.hbdsId);
    if (!model?.name) return;
    const labelObject = findTitleLabelObject(object);
    const label = labelObject?.element;
    if (!label || label.classList.contains('hbds-icon-title') || label.dataset.iconState === 'missing' || label.dataset.iconState === 'loading') return;
    installIconOnLabel(label, labelObject, model);
  });
}

function findTitleLabelObject(object) {
  let title = null;
  object.traverse(child => {
    if (!title && child.element?.classList?.contains('class-label')) title = child;
  });
  return title;
}

function installIconOnLabel(label, labelObject, model) {
  label.dataset.iconState = 'loading';
  const image = new Image();

  image.onload = () => {
    const icon = image.cloneNode(false);
    const title = document.createElement('span');
    const row = document.createElement('span');
    title.textContent = model.rendering?.iconTitleText ?? model.name;
    row.append(icon, title);
    label.replaceChildren(row);
    label.classList.add('hbds-icon-title');
    label.dataset.iconSrc = image.src;
    label.dataset.iconState = 'loaded';
    label.style.padding = '0';
    label.style.background = 'transparent';
    label.style.boxShadow = 'none';
    const currentFontSize = label.style.fontSize || getComputedStyle(label).fontSize;
    const fontSettings = labelObject.userData?.fontSettings;
    if (fontSettings) {
      label.style.fontWeight = fontSettings.bold ? '700' : '400';
      label.style.fontFamily = fontSettings.family || 'Arial, sans-serif';
      label.style.fontStyle = fontSettings.italic ? 'italic' : 'normal';
      label.style.textDecoration = fontSettings.underline ? 'underline' : 'none';
      label.style.fontSize = `${fontSettings.size}px`;
    } else {
      label.style.fontWeight = '700';
      label.style.fontFamily = 'Arial, sans-serif';
      if (currentFontSize) label.style.fontSize = currentFontSize;
    }
    label.style.lineHeight = '1';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'visible';
    label.style.maxWidth = `${Math.max(130, Math.min(460, (model.size?.width ?? 1.2) * 126), String(model.name || '').length * 14 + 42)}px`;
    label.style.overflowWrap = 'normal';

    row.className = 'hbds-icon-title-row';
    row.style.display = 'inline-flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '0.34em';
    row.style.width = '100%';
    row.style.maxWidth = '100%';
    row.style.background = 'transparent';
    row.style.lineHeight = '1';
    row.style.verticalAlign = 'middle';
    row.style.whiteSpace = 'nowrap';

    title.style.display = 'inline-block';
    title.style.lineHeight = '1.12';
    title.style.verticalAlign = 'middle';
    title.style.maxWidth = 'none';
    title.style.whiteSpace = 'nowrap';
    title.style.overflowWrap = 'normal';

    icon.alt = '';
    icon.decoding = 'async';
    icon.draggable = false;
    icon.src = transparentPngSource(image) ?? image.src;
    icon.style.width = `${model.rendering?.class?.iconSize ?? 0.95}em`;
    icon.style.height = `${model.rendering?.class?.iconSize ?? 0.95}em`;
    icon.style.objectFit = 'contain';
    icon.style.flex = '0 0 auto';
    icon.style.background = 'transparent';
    icon.style.mixBlendMode = model.rendering?.iconBlendMode ?? 'multiply';
    icon.style.display = 'block';

    const size = model.size || (model.type === 'hyperclass' ? { width: 4, height: 3.2 } : { width: 1.2, height: 1.6 });
    labelObject.position.set(0, size.height / 2 - (model.type === 'hyperclass' ? 0.4 : 0.54), model.type === 'hyperclass' ? 0.08 : 0.06);
    updateSceneLabelScales(ctx());
    renderOnce();
  };
  image.onerror = () => {
    if (image.dataset.fallbackAttempted === 'true') {
      label.dataset.iconState = 'missing';
      return;
    }
    image.dataset.fallbackAttempted = 'true';
    if (isSameIconPath(image.src, DEFAULT_EMPTY_ICON_PATH)) {
      label.dataset.iconState = 'missing';
      return;
    }
    image.src = DEFAULT_EMPTY_ICON_PATH;
  };
  resolveIconPathForModel(model).then((resolvedPath) => {
    image.src = resolvedPath ?? DEFAULT_EMPTY_ICON_PATH;
  });
}

function transparentPngSource(image) {
  if (!isPngIconSource(image.src)) return null;
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

function isPngIconSource(src) {
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

async function resolveIconPathForModel(model) {
  const explicit = explicitIconPath(model);
  const manifestLookup = await iconManifestLookup();

  if (explicit) {
    const manifestPath = manifestIconPath(manifestLookup, explicit);
    if (manifestPath) return manifestPath;

    const directPath = directExplicitIconPath(explicit);
    if (directPath) return directPath;
  }

  if (model?.name) {
    const manifestPath = manifestIconPath(manifestLookup, String(model.name));
    if (manifestPath) return manifestPath;
  }

  return DEFAULT_EMPTY_ICON_PATH;
}

function explicitIconPath(model) {
  return model?.icon
    ?? model?.iconPath
    ?? model?.rendering?.icon
    ?? model?.rendering?.iconPath
    ?? model?.rendering?.class?.icon
    ?? model?.rendering?.class?.iconPath
    ?? null;
}

function iconManifestLookup() {
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
    const iconPath = iconPathFromManifestEntry(entry);
    if (!iconPath) return;
    addIconLookupAlias(lookup, entry.name, iconPath);
    addIconLookupAlias(lookup, entry.icon, iconPath);
  });

  return lookup;
}

function iconPathFromManifestEntry(entry) {
  const icon = String(entry?.icon ?? '').trim();
  if (!icon) return null;
  if (isPathLike(icon)) return icon;
  return `./icons/${encodeURIComponent(icon)}`;
}

function addIconLookupAlias(lookup, value, iconPath) {
  for (const key of iconLookupKeys(value)) {
    if (!lookup.has(key)) lookup.set(key, iconPath);
  }
}

function manifestIconPath(lookup, value) {
  for (const key of iconLookupKeys(value)) {
    const iconPath = lookup?.get(key);
    if (iconPath) return iconPath;
  }
  return null;
}

function iconLookupKeys(value) {
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
    ...iconNameVariants(decoded),
    ...iconNameVariants(leaf),
    ...iconNameVariants(leafWithoutExtension)
  ];

  const keys = new Set();
  aliases.forEach((alias) => {
    const key = iconLookupKey(alias);
    if (key) keys.add(key);
  });
  return [...keys];
}

function iconLookupKey(value) {
  const clean = String(value ?? '').trim();
  if (!clean) return '';
  const decoded = safeDecodeURIComponent(clean);
  const leaf = decoded.split(/[?#]/)[0].split(/[\\/]/).pop() ?? decoded;
  return safeIconFilename(leaf.replace(/\.[a-z0-9]+$/i, ''));
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function directExplicitIconPath(value) {
  const clean = String(value ?? '').trim();
  if (!clean) return null;
  const hasExtension = /\.[a-z0-9]+(?:[?#].*)?$/i.test(clean);
  if (isPathLike(clean)) return clean;
  if (hasExtension) return `./icons/${encodeURIComponent(clean)}`;
  return null;
}

function iconNameVariants(name) {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const spaced = trimmed.replace(/\s+/g, ' ');
  const underscored = spaced.replace(/\s+/g, '_');
  const hyphenated = spaced.replace(/\s+/g, '-');
  const compact = spaced.replace(/\s+/g, '');
  const safe = safeIconFilename(spaced);
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

function safeIconFilename(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function isPathLike(value) {
  return /^(?:\.{0,2}\/|\/|https?:|data:)/i.test(value) || String(value).includes('/');
}

function applySelectionHighlight() {
  if (!diagramGroup) return;
  const selectedAttr = selectedAttributeEntry();
  diagramGroup.traverse(object => {
    if (!object.userData?.isClassLike) return;
    const selected = sameId(object.userData.hbdsId, selectedElementId) || selectedElementIds.has(String(object.userData.hbdsId));

    [object, ...object.children.filter(child => child.userData?.isClassBodyVisual)].forEach(target => {
      if (!target.material?.emissive) return;
      target.material.emissive.set(selected ? 0x1769e0 : 0x000000);
      target.material.emissiveIntensity = selected ? 0.24 : 0;
      target.material.needsUpdate = true;
    });

    object.renderOrder = selected ? 20 : 1;
    object.traverse(child => {
      if (child.isCSS2DObject && child.element) {
        let labelSelected = selected && child.element.classList.contains('class-label');
        if (child.userData?.labelKind === 'attribute' && selectedAttr) {
          const labels = getAttributeLabelObjects(object);
          const index = labels.indexOf(child);
          labelSelected = sameId(object.userData.hbdsId, selectedAttr.owner.id)
            && index >= 0
            && sameId(attributeKeyFor(selectedAttr.owner.attributes[index], index), selectedAttributeKey);
        }
        child.element.classList.toggle('is-selected', labelSelected);
      }
    });
  });
  diagramGroup.traverse(object => {
    if (!object.isCSS2DObject || !object.element?.classList?.contains('link-label')) return;
    const linkId = object.parent?.userData?.linkData?.id ?? object.userData?.linkId;
    object.element.classList.toggle('is-selected', sameId(linkId, selectedLinkId));
  });
  renderOnce();
}

function clearOverview() {
  const canvas = $('model-overview-canvas');
  const viewport = $('model-overview-viewport');
  if (!canvas) return;
  canvas.width = Math.max(1, canvas.clientWidth || 224);
  canvas.height = Math.max(1, canvas.clientHeight || 150);
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#fbfcfe';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (viewport) viewport.style.display = 'none';
}

function updateOverview() {
  if (!nodes().length) {
    clearOverview();
    return;
  }
  const viewport = $('model-overview-viewport');
  if (viewport) viewport.style.display = 'block';
  updateModelOverview(ctx());
}

function sampleRendererPixels(step = 28) {
  if (!renderer) return null;
  renderOnce();
  const gl = renderer.getContext();
  const canvas = renderer.domElement;
  const pixel = new Uint8Array(4);
  const background = { r: 238, g: 242, b: 246 };
  let sampled = 0;
  let nonBackground = 0;
  let colored = 0;
  let luminanceTotal = 0;

  for (let y = step; y < canvas.height; y += step) {
    for (let x = step; x < canvas.width; x += step) {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      sampled += 1;
      const [r, g, b, a] = pixel;
      const nearBackground =
        Math.abs(r - background.r) < 7 &&
        Math.abs(g - background.g) < 7 &&
        Math.abs(b - background.b) < 7;
      if (!nearBackground && a > 0) {
        nonBackground += 1;
        luminanceTotal += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      if (Math.max(r, g, b) - Math.min(r, g, b) > 28 && a > 0) colored += 1;
    }
  }

  return {
    width: canvas.width,
    height: canvas.height,
    sampled,
    nonBackground,
    colored,
    averageNonBackgroundLuminance: nonBackground ? Math.round(luminanceTotal / nonBackground) : 0
  };
}

function installDebugHooks() {
  window.__hbdsDynamicTest = {
    getData: () => JSON.parse(JSON.stringify(getData())),
    getState: () => ({
      counts: {
        nodes: nodes().length,
        links: links().length,
        attributes: countAttributes(),
        hyperclasses: nodes().filter(node => node.type === 'hyperclass').length
      },
      selectedElementId,
      selectedLinkSourceId,
      selectedLinkTargetId,
      editMode,
      validation: validateData(getData()),
      canvas: renderer ? {
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        clientWidth: renderer.domElement.clientWidth,
        clientHeight: renderer.domElement.clientHeight
      } : null,
      camera: camera ? {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: orbitControls ? { x: orbitControls.target.x, y: orbitControls.target.y, z: orbitControls.target.z } : null,
        fov: camera.fov,
        aspect: camera.aspect
      } : null,
      layout: getLayoutSettings()
    }),
    getLinkHubMetrics: collectLinkHubMetrics,
    getLabelMetrics: collectLabelMetrics,
    sampleRendererPixels
  };
}

function getHubWorldRadius(hub) {
  const radius = Number(hub?.userData?.hubRadius ?? hub?.geometry?.parameters?.radius ?? 0);
  if (!radius || !hub?.getWorldScale) return 0;
  const scale = hub.getWorldScale(new THREE.Vector3());
  return radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
}

function collectLinkHubMetrics() {
  if (!diagramGroup) return [];
  const metrics = [];
  diagramGroup.traverse(object => {
    if (!object.userData?.isHBDSLink) return;
    const linkData = object.userData.linkData || {};
    const targetId = object.userData.targetClassId ?? linkData.targetClassId;
    const sourceId = object.userData.sourceClassId ?? linkData.sourceClassId;
    const sourcePort = object.getObjectByName?.('relationship-port-source') || null;
    const targetPort = object.getObjectByName?.('relationship-port-target') || null;
    let arrow = object.getObjectByName?.('link-arrowhead') || null;
    object.traverse(child => {
      if (!arrow && child.isMesh && child.geometry?.type === 'ConeGeometry') arrow = child;
    });

    if (!sourcePort || !targetPort || !arrow) {
      metrics.push({
        id: linkData.id || object.uuid,
        sourceClassId: sourceId ?? null,
        targetClassId: targetId ?? null,
        valid: false,
        reason: !sourcePort ? 'missing source relationship port' : !targetPort ? 'missing target relationship port' : 'missing arrowhead'
      });
      return;
    }

    const sourceWorld = sourcePort.getWorldPosition(new THREE.Vector3());
    const portWorld = targetPort.getWorldPosition(new THREE.Vector3());
    const arrowWorld = arrow.getWorldPosition(new THREE.Vector3());
    const portRadius = getHubWorldRadius(targetPort);
    const distance = portWorld.distanceTo(arrowWorld);
    metrics.push({
      id: linkData.id || object.uuid,
      sourceClassId: sourceId,
      targetClassId: targetId,
      valid: true,
      sourcePortSide: sourcePort.userData?.side || null,
      targetPortSide: targetPort.userData?.side || null,
      sourceTargetDistance: Number(sourceWorld.distanceTo(portWorld).toFixed(5)),
      distance: Number(distance.toFixed(5)),
      hubRadius: Number(portRadius.toFixed(5)),
      delta: Number(distance.toFixed(5)),
      touchesBoundary: distance <= Math.max(0.012, portRadius * 0.4),
      coversHub: false,
      usesRedAttributeHub: false
    });
  });
  return metrics;
}

function collectLabelMetrics() {
  return [...document.querySelectorAll('.class-label, .attribute-label, .link-label')].map(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      text: element.textContent || '',
      classes: [...element.classList],
      left: Number(rect.left.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textDecorationLine: style.textDecorationLine,
      visible: rect.width > 0 && rect.height > 0
    };
  });
}

function validateRenderedFontMetrics() {
  const metrics = collectLabelMetrics().filter(metric => (
    metric.classes.includes('class-label') || metric.classes.includes('attribute-label') || metric.classes.includes('link-label')
  ));
  const errors = [];
  metrics.forEach((metric, index) => {
    const size = Number.parseFloat(metric.fontSize);
    if (!Number.isFinite(size) || size <= 0) errors.push(`label ${index + 1} has invalid font size`);
    if (!String(metric.fontFamily || '').trim()) errors.push(`label ${index + 1} has no font family`);
  });
  return errors;
}

function getLabelOverlapSummary(metrics, ratioThreshold = 0.55) {
  const labels = metrics.filter(metric => metric.visible && metric.width > 1 && metric.height > 1);
  let severe = 0;
  let maxRatio = 0;
  const examples = [];
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const a = labels[i];
      const b = labels[j];
      const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const area = overlapWidth * overlapHeight;
      if (!area) continue;
      const ratio = area / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
      maxRatio = Math.max(maxRatio, ratio);
      if (ratio > ratioThreshold) {
        severe += 1;
        if (examples.length < 4) examples.push(`${a.text || a.classes.join('.')} / ${b.text || b.classes.join('.')}`);
      }
    }
  }
  return { severe, maxRatio: Number(maxRatio.toFixed(3)), examples };
}

function summarizeFontZoomSamples(samples) {
  return samples.map(sample => (
    `${sample.label}: class ${sample.classLabel.min.toFixed(1)}-${sample.classLabel.max.toFixed(1)}, `
    + `attr ${sample.attributeLabel.min.toFixed(1)}-${sample.attributeLabel.max.toFixed(1)}, `
    + `link ${sample.linkLabel.min.toFixed(1)}-${sample.linkLabel.max.toFixed(1)}, `
    + `overlap ${sample.overlap.severe}/${sample.overlap.maxRatio.toFixed(2)}`
  )).join(' | ');
}

function collectLayoutMetrics() {
  if (!diagramGroup) return { classLike: 0, overlapPairs: 0, overlapDetails: [], linkObstacleIntersections: 0, linkObstacleDetails: [] };
  const nodesById = new Map();
  const boxes = [];

  diagramGroup.traverse(object => {
    if (!object.userData?.isClassLike) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    if (object.userData?.hbdsId != null) nodesById.set(String(object.userData.hbdsId), object);
    boxes.push({ object, id: String(object.userData?.hbdsId ?? object.uuid), box });
  });

  let overlapPairs = 0;
  const overlapDetails = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (areRelatedObjects(boxes[i].object, boxes[j].object)) continue;
      if (boxesOverlap(boxes[i].box, boxes[j].box, 0.035)) {
        overlapPairs += 1;
        if (overlapDetails.length < 10) overlapDetails.push([boxes[i].id, boxes[j].id]);
      }
    }
  }

  let linkObstacleIntersections = 0;
  const linkObstacleDetails = [];
  diagramGroup.traverse(object => {
    if (!object.userData?.isHBDSLink) return;
    const line = object.getObjectByName?.('link-route');
    const points = getLineWorldPoints(line);
    if (points.length < 2) return;
    const source = nodesById.get(String(object.userData.sourceClassId));
    const target = nodesById.get(String(object.userData.targetClassId));
    const obstacles = boxes.filter(entry => !areRelatedObjects(entry.object, source) && !areRelatedObjects(entry.object, target));

    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      for (const obstacle of obstacles) {
        if (segmentIntersectsWorldBox(start, end, obstacle.box)) {
          linkObstacleIntersections += 1;
          if (linkObstacleDetails.length < 16) {
            linkObstacleDetails.push({
              linkId: object.userData?.linkData?.id || object.uuid,
              obstacleId: obstacle.id,
              segmentIndex: index
            });
          }
        }
      }
    }
  });

  return {
    classLike: boxes.length,
    overlapPairs,
    overlapDetails,
    linkObstacleIntersections,
    linkObstacleDetails
  };
}

function getLineWorldPoints(line) {
  if (Array.isArray(line?.userData?.baseRoutePoints) && line.userData.baseRoutePoints.length) {
    return line.userData.baseRoutePoints.map(point => point.clone().applyMatrix4(line.matrixWorld));
  }
  const position = line?.geometry?.attributes?.position;
  if (!position) return [];
  const points = [];
  for (let index = 0; index < position.count; index += 1) {
    points.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(line.matrixWorld));
  }
  return points;
}

function areRelatedObjects(a, b) {
  if (!a || !b) return false;
  return a === b || isAncestorObject(a, b) || isAncestorObject(b, a);
}

function isAncestorObject(ancestor, object) {
  let current = object;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function boxesOverlap(a, b, margin = 0) {
  return Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > margin &&
    Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > margin;
}

function segmentIntersectsWorldBox(start, end, box) {
  const horizontal = Math.abs(start.y - end.y) < 1e-5;
  const vertical = Math.abs(start.x - end.x) < 1e-5;
  if (!horizontal && !vertical) return false;

  if (horizontal) {
    if (start.y <= box.min.y || start.y >= box.max.y) return false;
    return Math.min(start.x, end.x) < box.max.x && Math.max(start.x, end.x) > box.min.x;
  }

  if (start.x <= box.min.x || start.x >= box.max.x) return false;
  return Math.min(start.y, end.y) < box.max.y && Math.max(start.y, end.y) > box.min.y;
}

function updateRenderDiagnostics() {
  let diagnostics = $('render-diagnostics');
  if (!diagnostics) {
    diagnostics = document.createElement('output');
    diagnostics.id = 'render-diagnostics';
    diagnostics.hidden = true;
    document.body.appendChild(diagnostics);
  }

  const hubMetrics = collectLinkHubMetrics();
  const layoutMetrics = collectLayoutMetrics();
  diagnostics.textContent = JSON.stringify({
    counts: {
      nodes: nodes().length,
      links: links().length,
      attributes: countAttributes(),
      hyperclasses: nodes().filter(node => node.type === 'hyperclass').length
    },
    selectedElementId,
    validation: validateData(getData()),
    hubConnections: {
      total: hubMetrics.length,
      valid: hubMetrics.filter(metric => metric.valid).length,
      maxDelta: hubMetrics.reduce((max, metric) => Math.max(max, metric.delta || 0), 0),
      coveringHub: hubMetrics.filter(metric => metric.coversHub).length
    },
    layout: layoutMetrics,
    camera: camera ? {
      position: {
        x: Number(camera.position.x.toFixed(4)),
        y: Number(camera.position.y.toFixed(4)),
        z: Number(camera.position.z.toFixed(4))
      },
      target: orbitControls ? {
        x: Number(orbitControls.target.x.toFixed(4)),
        y: Number(orbitControls.target.y.toFixed(4)),
        z: Number(orbitControls.target.z.toFixed(4))
      } : null,
      fov: Number(camera.fov.toFixed(4)),
      aspect: Number(camera.aspect.toFixed(4))
    } : null,
    pixels: sampleRendererPixels(32)
  });
}

async function refreshWorkspace(message, options = {}) {
  const optimize = options.optimize ?? shouldOptimizeAfterCrud();
  const refresh = options.refresh ?? true;
  const fit = options.fit ?? shouldFitAfterCrud();

  if (optimize) {
    await optimizeAndRefreshLayout(ctx(), { algorithm: getLayoutAlgorithm() });
  } else if (refresh) {
    refreshSceneFromData(ctx());
  }

  if (fit) fitModelToCanvas(ctx(), { padding: 1.18, updateOverview: true });
  updateOverview();
  updateInterface({ json: options.json });

  if (message) {
    addLog(message);
    showToast(message);
  }
}

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    const message = error?.message || String(error);
    addLog(`Error: ${message}`);
    showToast(message);
    updateInterface({ json: false });
  }
}

function selectElement(id, options = {}) {
  const actualId = resolveNodeId(id);
  const selected = nodeById(actualId);
  if (!selected) return;

  setPrimarySelection(selected.id);
  selectedAttributeOwnerId = selected.id;
  selectedParentHyperclassId = selected.parentClassId ?? null;
  selectedAttributeKey = null;
  selectedLinkId = null;

  updateInterface({ json: false });
  revealModelBuilderProperties({ instant: options.instant === true });
  if (options.log !== false) addLog(`Selected ${selected.name || selected.id}`);
}

function syncCountersFromData() {
  const allNodes = nodes();
  nextClassNumber = Math.max(1, allNodes.filter(node => node.type !== 'hyperclass').length + 1);
  nextHyperclassNumber = Math.max(1, allNodes.filter(node => node.type === 'hyperclass').length + 1);
  nextAttributeNumber = Math.max(1, countAttributes() + 1);
  nextLinkNumber = Math.max(1, links().length + 1);
}

async function handleAddClass() {
  const classIndex = nextClassNumber++;
  const parentId = getCreationParentId();
  const created = await createClass({
    name: `Class ${classIndex}`,
    attributes: [],
    parentClassId: parentId,
    rendering: classRendering(classIndex - 1)
  }, { context: ctx(), refresh: false });

  selectedElementId = created.id;
  selectedAttributeOwnerId = created.id;
  await refreshWorkspace(`Added ${created.name}`, { refresh: true });
}

async function handleAddHyperclass() {
  const hyperIndex = nextHyperclassNumber++;
  const parentId = getCreationParentId();
  const created = await createHyperclass({
    name: `Hyperclass ${hyperIndex}`,
    attributes: [],
    children: [],
    parentClassId: parentId,
    rendering: hyperclassRendering(hyperIndex - 1)
  }, { context: ctx(), refresh: false });

  selectedElementId = created.id;
  selectedParentHyperclassId = created.parentClassId ?? null;
  selectedAttributeOwnerId = created.id;
  await refreshWorkspace(`Added ${created.name}`, { refresh: true });
}

function getCreationParentId() {
  const selected = nodeById(selectedElementId);
  if (selected?.type === 'hyperclass') return selected.id;
  return selected?.parentClassId ?? selectedParentHyperclassId ?? null;
}

async function handleAddAttribute() {
  const ownerId = selectedAttributeOwnerId || selectedElementId;
  const owner = nodeById(ownerId);
  if (!owner) {
    showToast('Select an attribute owner first');
    return;
  }

  const attributeName = ATTRIBUTE_NAMES[(nextAttributeNumber - 1) % ATTRIBUTE_NAMES.length];
  const number = nextAttributeNumber++;
  await createAttribute(owner.id, { name: `${attributeName}${number}` }, { context: ctx(), refresh: false });
  selectedElementId = owner.id;
  selectedAttributeOwnerId = owner.id;
  const updatedOwner = nodeById(owner.id);
  const lastIndex = (updatedOwner?.attributes?.length ?? 0) - 1;
  if (lastIndex >= 0) selectedAttributeKey = attributeKeyFor(updatedOwner.attributes[lastIndex], lastIndex);
  selectedLinkId = null;
  await refreshWorkspace(`Added attribute to ${owner.name || owner.id}`, { refresh: true });
}

async function handleAddLink() {
  const source = nodeById(selectedLinkSourceId);
  const target = nodeById(selectedLinkTargetId);
  if (!source || !target) {
    showToast('Choose a source and target');
    return;
  }

  const number = nextLinkNumber++;
  const label = LINK_NAMES[(number - 1) % LINK_NAMES.length];
  const created = await createLink({
    id: `link${number}`,
    sourceClassId: source.id,
    targetClassId: target.id,
    name: label,
    rendering: { labelText: label }
  }, { context: ctx(), refresh: false });

  selectedElementId = target.id;
  selectedLinkId = created?.id ?? `link${number}`;
  selectedAttributeKey = null;
  selectedLinkSourceId = target.id;
  selectedLinkTargetId = null;
  linkPickActive = false;
  await refreshWorkspace(`Linked ${source.name || source.id} to ${target.name || target.id}`, { refresh: true });
}

async function handleDeleteSelected() {
  const selected = nodeById(selectedElementId);
  if (!selected) return;

  if (selected.type === 'hyperclass') {
    await deleteHyperclass(selected.id, { context: ctx(), refresh: false, cascade: true });
  } else {
    await deleteClass(selected.id, { context: ctx(), refresh: false });
  }

  selectedElementId = null;
  selectedAttributeOwnerId = null;
  if (sameId(selectedParentHyperclassId, selected.id)) selectedParentHyperclassId = null;
  if (sameId(selectedLinkSourceId, selected.id)) selectedLinkSourceId = null;
  if (sameId(selectedLinkTargetId, selected.id)) selectedLinkTargetId = null;

  await refreshWorkspace(`Deleted ${selected.name || selected.id}`, { refresh: true });
}

async function handleOptimizeLayout() {
  await refreshWorkspace(`Optimized ${getLayoutAlgorithm()} layout`, {
    optimize: true,
    refresh: false,
    fit: true
  });
}

function handleFitModel() {
  fitModelToCanvas(ctx(), { padding: 1.18, updateOverview: true });
  updateOverview();
  renderOnce();
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
  addLog('Fit model to view');
  showToast('Fit model to view');
}

async function handleResetModel() {
  await resetData({ context: ctx(), refresh: false });
  applyModelLayoutSettings({ algorithm: 'grid' });
  setLayoutSettings({ ...getLayoutSettings(), algorithm: 'grid' }, { applyContext: false });
  selectedElementId = null;
  selectedParentHyperclassId = null;
  selectedAttributeOwnerId = null;
  selectedLinkSourceId = null;
  selectedLinkTargetId = null;
  linkPickActive = false;
  syncCountersFromData();
  await refreshWorkspace('Reset workspace', { refresh: true, optimize: false, fit: false });
}

async function handleApplyJson() {
  const parsed = JSON.parse($('json-preview').value);
  await setData(parsed, { context: ctx(), refresh: false });
  selectedElementId = null;
  selectedParentHyperclassId = null;
  selectedAttributeOwnerId = null;
  selectedLinkSourceId = null;
  selectedLinkTargetId = null;
  syncCountersFromData();
  await refreshWorkspace('Applied JSON', { refresh: true, optimize: false, fit: !hasFitMetadata(parsed) });
}

function handleSaveModel() {
  setSceneSettings(lightingState, { applyContext: false });
  saveScene(ctx(), { fileName: 'dynamic_hbds_test_model.json' });
  updateJsonPreviewFromData();
  addLog('Saved model JSON');
  showToast('Saved model JSON');
}

function handleExportJson() {
  setSceneSettings(lightingState, { applyContext: false });
  saveScene(ctx(), { fileName: 'dynamic_hbds_export.json' });
  updateJsonPreviewFromData();
  addLog('Exported JSON');
  showToast('Exported JSON');
}

function getSeedModel() {
  return {
    hypergraph: {
      class: [
        {
          id: 'system_domain',
          name: 'System Domain',
          type: 'hyperclass',
          attributes: [{ id: 'domain_scope', name: 'scope' }, { id: 'domain_state', name: 'state' }],
          children: ['customer', 'order', 'invoice'],
          position: { x: -2.5, y: 0.4, z: 0 },
          size: { width: 6.2, height: 4.2 },
          rendering: hyperclassRendering(0)
        },
        {
          id: 'operations',
          name: 'Operations',
          type: 'hyperclass',
          attributes: [{ id: 'ops_region', name: 'region' }],
          children: ['route', 'vehicle'],
          position: { x: 4.4, y: 0.2, z: 0 },
          size: { width: 4.8, height: 3.6 },
          rendering: hyperclassRendering(1)
        },
        {
          id: 'customer',
          name: 'Customer',
          attributes: [{ id: 'customer_name', name: 'name' }, { id: 'customer_tier', name: 'tier' }],
          parentClassId: 'system_domain',
          position: { x: -4.0, y: 1.0, z: 0 },
          rendering: classRendering(0)
        },
        {
          id: 'order',
          name: 'Order',
          attributes: [{ id: 'order_status', name: 'status' }, { id: 'order_total', name: 'total' }],
          parentClassId: 'system_domain',
          position: { x: -2.2, y: 1.0, z: 0 },
          rendering: classRendering(1)
        },
        {
          id: 'invoice',
          name: 'Invoice',
          attributes: [{ id: 'invoice_due', name: 'dueDate' }],
          parentClassId: 'system_domain',
          position: { x: -3.1, y: -1.3, z: 0 },
          rendering: classRendering(2)
        },
        {
          id: 'route',
          name: 'Route',
          attributes: [{ id: 'route_eta', name: 'eta' }],
          parentClassId: 'operations',
          position: { x: 3.6, y: 0.7, z: 0 },
          rendering: classRendering(3)
        },
        {
          id: 'vehicle',
          name: 'Vehicle',
          attributes: [{ id: 'vehicle_capacity', name: 'capacity' }],
          parentClassId: 'operations',
          position: { x: 5.1, y: -0.8, z: 0 },
          rendering: classRendering(4)
        }
      ],
      link: [
        { id: 'link_customer_order', sourceClassId: 'customer', targetClassId: 'order', rendering: { labelText: 'places' } },
        { id: 'link_order_invoice', sourceClassId: 'order', targetClassId: 'invoice', rendering: { labelText: 'bills' } },
        { id: 'link_order_route', sourceClassId: 'order', targetClassId: 'route', rendering: { labelText: 'dispatches' } },
        { id: 'link_route_vehicle', sourceClassId: 'route', targetClassId: 'vehicle', rendering: { labelText: 'uses' } }
      ]
    }
  };
}

async function handleSeedDemo() {
  await setData(getSeedModel(), { context: ctx(), refresh: false });
  selectedElementId = 'system_domain';
  selectedParentHyperclassId = 'system_domain';
  selectedAttributeOwnerId = 'system_domain';
  selectedLinkSourceId = 'customer';
  selectedLinkTargetId = 'order';
  syncCountersFromData();
  await refreshWorkspace('Seeded sample model', { refresh: true, optimize: true, fit: true });
}

async function populateModelSelect() {
  const select = $('test-model-select');
  availableModels = await listAvailableModels({
    manifestPath: TEST_MODEL_MANIFEST,
    modelsPath: TEST_MODEL_ROOT,
    hiddenValues: TEST_MODEL_HIDDEN_VALUES
  });
  select.innerHTML = '';

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Blank workspace';
  blank.dataset.summary = 'Blank workspace';
  select.appendChild(blank);

  availableModels.forEach(item => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label || item.value;
    const tags = item.tags?.length ? ` - ${item.tags.join(', ')}` : '';
    option.dataset.summary = `${item.description || item.label || item.value}${tags}`;
    select.appendChild(option);
  });

  updateModelSummary();
}

async function handleLoadModel() {
  const value = $('test-model-select').value;
  if (!value) {
    await handleResetModel();
    return;
  }

  const selectedLabel = $('test-model-select').selectedOptions[0]?.textContent || value;
  const loadedModel = await loadAndRenderScene(value, ctx(), {
    allowedBasePath: TEST_MODEL_ROOT,
    defaultBasePath: TEST_MODEL_ROOT
  });
  const preserveLayout = Boolean(loadedModel?.metadata?.preserveLayout || loadedModel?.hypergraph?.metadata?.preserveLayout);
  const hasSavedFit = hasFitMetadata(loadedModel);
  const optimize = !preserveLayout && !hasSavedFit && shouldOptimizeAfterCrud();
  selectedElementId = null;
  selectedParentHyperclassId = null;
  selectedAttributeOwnerId = null;
  selectedLinkSourceId = null;
  selectedLinkTargetId = null;
  linkPickActive = false;
  syncCountersFromData();
  await refreshWorkspace(`Loaded ${selectedLabel}`, {
    refresh: false,
    optimize,
    fit: optimize || !hasSavedFit
  });
}

async function runScenarioSuite() {
  if (!availableModels.length) {
    setStatus('No test models available', 'warn');
    return;
  }
  const suiteButton = $('run-scenario-suite-button');
  const modelSelect = $('test-model-select');
  if (suiteButton) suiteButton.disabled = true;
  if (modelSelect) modelSelect.disabled = true;
  const previousValue = modelSelect?.value || '';
  const failures = [];
  let passed = 0;
  const startedAt = performance.now();
  addLog(`Scenario suite started (${availableModels.length} models)`);
  setStatus(`Running suite: 0/${availableModels.length}`, 'warn');
  setCanvasTitleOverride('Scenario Suite');

  try {
    for (const item of availableModels) {
      const label = item.label || item.value;
      setCanvasTitleOverride(`Scenario: ${label}`);
      setStatus(`Running suite: ${passed}/${availableModels.length} - ${label}`, 'warn');
      try {
        const loadedModel = await loadAndRenderScene(item.value, ctx(), {
          allowedBasePath: TEST_MODEL_ROOT,
          defaultBasePath: TEST_MODEL_ROOT
        });
        const stats = getCurrentStats();
        const validation = validateData(getData());
        if (!validation.valid) {
          failures.push(`${label}: ${validation.errors.join('; ')}`);
          continue;
        }
        if (stats.classes + stats.hyperclasses <= 0) {
          failures.push(`${label}: rendered no class-like elements`);
          continue;
        }
        const algorithm = getLayoutAlgorithm();
        const hasSavedFit = hasFitMetadata(loadedModel);
        if (algorithm !== 'none' && !hasSavedFit) {
          await optimizeAndRefreshLayout(ctx(), { algorithm });
        }
        if (!hasSavedFit) fitModelToCanvas(ctx(), { padding: 1.15, updateOverview: true });
        const fontErrors = validateRenderedFontMetrics();
        if (fontErrors.length) {
          failures.push(`${label}: ${fontErrors.join('; ')}`);
          continue;
        }
        passed += 1;
        setStatus(`Running suite: ${passed}/${availableModels.length} - ${label}`, 'warn');
      } catch (error) {
        failures.push(`${label}: ${error?.message || String(error)}`);
      }
    }
  } finally {
    if (modelSelect) {
      const hasPreviousOption = [...modelSelect.options].some(option => option.value === previousValue);
      modelSelect.value = hasPreviousOption ? previousValue : '';
      modelSelect.disabled = false;
    }
    updateModelSummary();
    try {
      await handleLoadModel();
    } finally {
      setCanvasTitleOverride(null);
    }
    if (suiteButton) suiteButton.disabled = false;
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  if (failures.length) {
    addLog(`Scenario suite failed (${passed}/${availableModels.length} passed in ${elapsedMs}ms)`);
    setStatus(`Scenario suite: ${passed}/${availableModels.length} passed`, 'warn');
    failures.forEach(failure => addLog(`Scenario failure: ${failure}`));
  } else {
    addLog(`Scenario suite passed (${passed}/${availableModels.length} in ${elapsedMs}ms)`);
    setStatus(`Scenario suite: ${passed}/${availableModels.length} passed`, 'ok');
  }
}

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function getFontMetricExtremes(metrics, className) {
  const sizes = metrics
    .filter(metric => metric.classes.includes(className) && metric.visible)
    .map(metric => Number.parseFloat(metric.fontSize))
    .filter(Number.isFinite);
  return {
    count: sizes.length,
    min: sizes.length ? Math.min(...sizes) : 0,
    max: sizes.length ? Math.max(...sizes) : 0
  };
}

async function sampleSatelliteFontZoomState(label, distanceFactor, baseDistance, target) {
  const direction = camera.position.clone().sub(target).normalize();
  camera.position.copy(target.clone().add(direction.multiplyScalar(baseDistance * distanceFactor)));
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  orbitControls?.target.copy(target);
  orbitControls?.update?.();
  updateSceneLabelScales(ctx());
  renderOnce();
  await nextAnimationFrame();
  const metrics = collectLabelMetrics();
  return {
    label,
    distanceFactor,
    classLabel: getFontMetricExtremes(metrics, 'class-label'),
    attributeLabel: getFontMetricExtremes(metrics, 'attribute-label'),
    linkLabel: getFontMetricExtremes(metrics, 'link-label'),
    overlap: getLabelOverlapSummary(metrics),
    metrics
  };
}

async function runSatelliteFontZoomRegression() {
  const errors = [];
  const loadedModel = await loadAndRenderScene('models/satellite_world_simple_structure.json', ctx(), {
    allowedBasePath: 'models/',
    defaultBasePath: 'models/'
  });
  fitModelToCanvas(ctx(), { padding: 1.15, updateOverview: true });
  const target = orbitControls?.target?.clone?.() || new THREE.Vector3();
  const baseDistance = Math.max(1, camera.position.distanceTo(target));
  const samples = [
    await sampleSatelliteFontZoomState('near', 0.55, baseDistance, target),
    await sampleSatelliteFontZoomState('default', 1, baseDistance, target),
    await sampleSatelliteFontZoomState('far', 1.75, baseDistance, target)
  ];

  const near = samples[0];
  const far = samples[2];
  if (near.classLabel.count <= 0) errors.push('missing class/hyperclass labels');
  if (near.attributeLabel.count <= 0) errors.push('missing attribute labels');
  if (near.linkLabel.count <= 0) errors.push('missing link labels');
  if (near.classLabel.max > 14.15) errors.push(`class label font exceeded global 14px cap (${near.classLabel.max.toFixed(1)}px)`);
  if (near.attributeLabel.max > 11.15) errors.push(`attribute font exceeded individual 11px cap (${near.attributeLabel.max.toFixed(1)}px)`);
  if (near.linkLabel.max > 14.15) errors.push(`link label font exceeded 14px cap (${near.linkLabel.max.toFixed(1)}px)`);
  if (far.classLabel.max >= near.classLabel.max - 0.25) errors.push('class labels did not shrink when zooming out');
  if (far.attributeLabel.max >= near.attributeLabel.max - 0.25) errors.push('attribute labels did not shrink when zooming out');
  if (far.linkLabel.max >= near.linkLabel.max - 0.25) errors.push('link labels did not shrink when zooming out');
  samples.forEach(sample => {
    if (sample.linkLabel.max > 0 && sample.attributeLabel.max < sample.linkLabel.max * 0.5) {
      errors.push(`${sample.label} zoom attribute labels are too small relative to link labels (${sample.attributeLabel.max.toFixed(1)}px vs ${sample.linkLabel.max.toFixed(1)}px)`);
    }
  });
  samples.forEach(sample => {
    if (sample.overlap.severe > 0) {
      errors.push(`${sample.label} zoom has severe label overlaps (${sample.overlap.severe}; ${sample.overlap.examples.join(', ')})`);
    }
  });

  const validation = validateData(loadedModel);
  if (!validation.valid) errors.push(`satellite model invalid: ${validation.errors.join('; ')}`);
  if (errors.length) {
    addLog(`Font zoom sample summary: ${summarizeFontZoomSamples(samples)}`);
    errors.forEach(error => addLog(`Font zoom failure: ${error}`));
    setStatus(`Satellite font zoom regression failed: ${errors.length}`, 'warn');
  } else {
    const summary = summarizeFontZoomSamples(samples);
    addLog(`Satellite font zoom regression passed (${summary})`);
    setStatus('Satellite font zoom regression passed', 'ok');
  }
  updateRenderDiagnostics();
  return { valid: errors.length === 0, errors, samples };
}

function clearLinkBuilder() {
  selectedLinkSourceId = null;
  selectedLinkTargetId = null;
  linkPickActive = false;
  updateInterface({ json: false });
}

function startLinkCreation() {
  selectedLinkSourceId = null;
  selectedLinkTargetId = null;
  selectedLinkId = null;
  selectedAttributeKey = null;
  linkPickActive = true;
  updateInterface({ json: false });
  showToast('Select source');
}

function cancelLinkCreation() {
  clearLinkBuilder();
  showToast('Link creation canceled');
}

async function handleSelectChange(id, value) {
  if (id === 'selected-attribute-select') {
    selectedAttributeKey = value || null;
    selectedLinkId = null;
    updateInterface({ json: false });
    revealModelBuilderProperties();
    return;
  }
  if (id === 'selected-link-select') {
    selectedLinkId = value || null;
    selectedAttributeKey = null;
    const link = links().find(item => sameId(item.id, selectedLinkId));
    if (link && !sameId(selectedElementId, link.sourceClassId) && !sameId(selectedElementId, link.targetClassId)) {
      selectedElementId = link.sourceClassId;
      selectedAttributeOwnerId = link.sourceClassId;
    }
    updateInterface({ json: false });
    revealModelBuilderProperties();
    return;
  }
  const resolved = resolveNodeId(value);
  if (id === 'selected-element-select') {
    if (resolved) selectElement(resolved, { log: false });
    else {
      selectedElementId = null;
      selectedAttributeOwnerId = null;
      selectedAttributeKey = null;
      selectedLinkId = null;
    }
  }
  if (id === 'parent-hyperclass-select') {
    const selected = nodeById(selectedElementId);
    if (selected) {
      await moveChildToHyperclass(selected.id, resolved || null, { context: ctx(), refresh: false });
      selectedParentHyperclassId = resolved || null;
      await refreshWorkspace(null, { refresh: true, fit: false });
      return;
    }
  }
  updateInterface({ json: false });
}

function handleDiagramObjectClick(object, event = null) {
  const id = object?.userData?.hbdsId;
  if (id == null) return;
  const clicked = nodeById(id);
  if (!clicked) return;

  if (event?.shiftKey && !linkPickActive) {
    toggleMultiSelection(clicked.id);
    updateInterface({ json: false });
    addLog(`Selected ${selectedElementIds.size} item${selectedElementIds.size === 1 ? '' : 's'}`);
    return;
  }

  if (linkPickActive && editMode === 'full') {
    if (!selectedLinkSourceId) {
      selectedLinkSourceId = clicked.id;
      selectedElementId = clicked.id;
      addLog(`Link source: ${clicked.name || clicked.id}`);
      updateInterface({ json: false });
      showToast('Select target or cancel');
      return;
    }

    selectedLinkTargetId = clicked.id;
    selectedElementId = clicked.id;
    updateInterface({ json: false });
    runAction(handleAddLink);
    return;
  }

  selectElement(clicked.id);
}

function findClassLikeObject(object) {
  let current = object;
  while (current) {
    if (current.userData?.isClassLike && current.userData?.hbdsId != null) return current;
    if (current === diagramGroup) return null;
    current = current.parent;
  }
  return null;
}

function pickClassLikeFromEvent(event) {
  if (!camera || !renderer || !diagramGroup) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(diagramGroup.children, true);
  for (const hit of hits) {
    const picked = findClassLikeObject(hit.object);
    if (picked) return picked;
  }
  return null;
}

function getAttributeLabelObjects(ownerObject) {
  return ownerObject?.children?.filter(child => child.isCSS2DObject && child.userData?.labelKind === 'attribute') || [];
}

function findCssLabelObject(element) {
  let found = null;
  if (!element || !diagramGroup) return null;
  diagramGroup.traverse(object => {
    if (!found && object.isCSS2DObject && object.element === element) found = object;
  });
  return found;
}

function handleLabelClick(event) {
  const labelElement = event.target.closest?.('.label');
  if (!labelElement) return;
  const labelObject = findCssLabelObject(labelElement);
  if (!labelObject) return;

  event.preventDefault();
  event.stopPropagation();

  if (labelElement.classList.contains('link-label')) {
    if (linkPickActive) {
      showToast('Select a class or hyperclass for link creation');
      return;
    }
    const link = labelObject.parent?.userData?.linkData || links().find(item => item.rendering?.labelText === labelElement.textContent);
    if (!link) return;
    selectedLinkId = link.id;
    selectedAttributeKey = null;
    selectedElementId = link.sourceClassId;
    selectedAttributeOwnerId = link.sourceClassId;
    updateInterface({ json: false });
    revealModelBuilderProperties();
    addLog(`Selected link ${link.rendering?.labelText || link.name || link.id}`);
    return;
  }

  const ownerObject = findClassLikeObject(labelObject.parent);
  if (!ownerObject) return;

  if (labelObject.userData?.labelKind === 'attribute' || labelElement.classList.contains('attribute-label')) {
    if (linkPickActive) {
      showToast('Select a class or hyperclass for link creation');
      return;
    }
    const owner = nodeById(ownerObject.userData?.hbdsId);
    if (!owner) return;
    const labels = getAttributeLabelObjects(ownerObject);
    const index = labels.indexOf(labelObject);
    if (index < 0 || !owner.attributes?.[index]) return;
    selectedElementId = owner.id;
    selectedAttributeOwnerId = owner.id;
    selectedAttributeKey = attributeKeyFor(owner.attributes[index], index);
    selectedLinkId = null;
    updateInterface({ json: false });
    revealModelBuilderProperties();
    addLog(`Selected attribute ${attributeDisplayName(owner.attributes[index], index)}`);
    return;
  }

  handleDiagramObjectClick(ownerObject, event);
}

function bindDiagramPicking() {
  labelRenderer.domElement.addEventListener('pointerup', handleLabelClick);

  renderer.domElement.addEventListener('pointerdown', event => {
    pointerStart = { x: event.clientX, y: event.clientY };
  });

  renderer.domElement.addEventListener('pointerup', event => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.hypot(dx, dy) > 5) return;
    const picked = pickClassLikeFromEvent(event);
    if (picked) handleDiagramObjectClick(picked, event);
  });
}

function updateNodePositionsFromObject(object) {
  const worldPosition = new THREE.Vector3();
  object.traverse(child => {
    const id = child.userData?.hbdsId;
    if (id == null) return;
    const node = nodeById(id);
    if (!node) return;
    child.getWorldPosition(worldPosition);
    node.position = {
      x: Number(worldPosition.x.toFixed(4)),
      y: Number(worldPosition.y.toFixed(4)),
      z: Number(worldPosition.z.toFixed(4))
    };
  });
}

function setupDrag() {
  if (dragControls) dragControls.dispose();
  dragControls = new DragControls(draggableObjects, camera, renderer.domElement);
  dragControls.transformGroup = false;
  dragControls.recursive = false;
  let dragObjectsBackup = null;
  let dragStartZ = 0;
  let dragFramePending = false;

  const scheduleDragFrame = () => {
    if (dragFramePending) return;
    dragFramePending = true;
    requestAnimationFrame(() => {
      dragFramePending = false;
      recalculateAllLinks();
      renderOnce();
      updateOverview();
    });
  };

  dragControls.addEventListener('dragstart', event => {
    dragObjectsBackup = dragControls.objects.slice();
    dragControls.objects = [event.object];
    dragStartZ = event.object?.position?.z || 0;
    orbitControls.enabled = false;
    if (event.object?.userData?.hbdsId != null) {
      setPrimarySelection(event.object.userData.hbdsId);
      selectedAttributeOwnerId = selectedElementId;
      selectedParentHyperclassId = nodeById(selectedElementId)?.parentClassId ?? null;
      selectedAttributeKey = null;
      selectedLinkId = null;
      updateInterface({ json: false, lightweight: true });
    }
  });

  dragControls.addEventListener('drag', event => {
    if (event.object) event.object.position.z = dragStartZ;
    scheduleDragFrame();
  });

  dragControls.addEventListener('dragend', event => {
    if (dragObjectsBackup) dragControls.objects = dragObjectsBackup;
    orbitControls.enabled = true;
    if (event.object) {
      updateNodePositionsFromObject(event.object);
      recalculateAllLinks();
      updateJsonPreviewFromData();
      updateOverview();
      updateInterface({ json: false });
      const moved = nodeById(event.object.userData?.hbdsId);
      if (moved) addLog(`Moved ${moved.name || moved.id}`);
    }
  });

  updateModeControls();
}

function bindUi() {
  $('add-class-button').addEventListener('click', () => runAction(handleAddClass));
  $('add-hyperclass-button').addEventListener('click', () => runAction(handleAddHyperclass));
  $('add-attribute-button').addEventListener('click', () => runAction(handleAddAttribute));
  $('add-link-button').addEventListener('click', startLinkCreation);
  $('delete-selected-button').addEventListener('click', () => runAction(handleDeleteSelected));
  $('optimize-layout-button').addEventListener('click', () => runAction(handleOptimizeLayout));
  $('fit-model-button').addEventListener('click', handleFitModel);
  $('save-model-button').addEventListener('click', handleSaveModel);
  $('export-json-button').addEventListener('click', handleExportJson);
  $('apply-json-button').addEventListener('click', () => runAction(handleApplyJson));
  $('reset-model-button').addEventListener('click', () => runAction(handleResetModel));
  $('run-scenario-suite-button')?.addEventListener('click', () => runAction(runScenarioSuite));
  $('cancel-link-button').addEventListener('click', cancelLinkCreation);
  ['selected-color-input', 'selected-border-color-input', 'selected-opacity-input', 'selected-corner-radius-input', 'selected-text-color-input']
    .forEach(id => $(id)?.addEventListener('input', () => runAction(handleSelectedRenderingChange)));
  $('selected-name-input')?.addEventListener('change', () => runAction(handleSelectedNameChange));
  $('selected-name-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.target.blur();
    }
  });
  $('selected-attribute-name-input')?.addEventListener('change', () => runAction(handleSelectedAttributeRename));
  $('selected-link-name-input')?.addEventListener('change', () => runAction(handleSelectedLinkUpdate));
  $('selected-link-color-input')?.addEventListener('input', () => runAction(handleSelectedLinkUpdate));
  $('selected-link-width-input')?.addEventListener('input', () => runAction(handleSelectedLinkUpdate));
  $('property-panel')?.addEventListener('pointerdown', event => {
    const input = event.target.closest?.('[data-property-path]');
    if (input) beginLivePropertyEdit(input);
  });
  $('property-panel')?.addEventListener('focusin', event => {
    const input = event.target.closest?.('[data-property-path]');
    if (input) beginLivePropertyEdit(input);
  });
  $('property-panel')?.addEventListener('click', event => {
    runAction(() => handlePropertyPanelAction(event));
  });
  $('property-panel')?.addEventListener('input', event => {
    if (event.target?.dataset?.live === 'true') runAction(() => handlePropertyPanelChange(event, { history: false }));
  });
  $('property-panel')?.addEventListener('change', event => {
    if (event.target?.dataset?.live === 'true') {
      runAction(async () => {
        await handlePropertyPanelChange(event, { history: false });
        commitLivePropertyEdit();
      });
    } else {
      runAction(() => handlePropertyPanelChange(event));
    }
  });
  $('property-panel')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target?.matches?.('input[type="text"]')) {
      event.preventDefault();
      event.target.blur();
    }
  });
  $('reset-scene-settings-button')?.addEventListener('click', handleResetSceneSettings);
  $('reset-model-font-settings-button')?.addEventListener('click', handleResetFontSettings);

  [
    'scene-background-input',
    'horizontal-light-intensity-input',
    'horizontal-light-angle-input',
    'vertical-light-intensity-input',
    'vertical-light-angle-input'
  ].forEach(id => $(id)?.addEventListener('input', handleSceneSettingInput));

  [
    'model-font-size-input',
    'model-font-family-input',
    'model-font-bold-input',
    'model-font-italic-input',
    'model-font-underline-input'
  ].forEach(id => $(id)?.addEventListener('input', handleFontSettingInput));

  $('layout-algorithm-select')?.addEventListener('change', handleLayoutSettingChange);
  $('view-toggle')?.addEventListener('change', handleViewToggle);

  $('test-model-select').addEventListener('change', () => {
    updateModelSummary();
    runAction(handleLoadModel);
  });

  $('edit-mode-select')?.addEventListener('change', event => {
    editMode = event.target.value || 'full';
    if (editMode !== 'full') linkPickActive = false;
    updateInterface({ json: false });
  });

  $('mode-full')?.addEventListener('click', () => {
    editMode = 'full';
    updateInterface({ json: false });
  });
  $('mode-structure')?.addEventListener('click', () => {
    editMode = 'structure';
    linkPickActive = false;
    updateInterface({ json: false });
  });
  $('mode-readonly')?.addEventListener('click', () => {
    editMode = 'readonly';
    linkPickActive = false;
    updateInterface({ json: false });
  });

  ['selected-element-select', 'parent-hyperclass-select', 'selected-attribute-select', 'selected-link-select'].forEach(id => {
    $(id)?.addEventListener('change', event => runAction(() => handleSelectChange(id, event.target.value)));
  });
}

async function init() {
  const container = $('container');
  const size = getCanvasSize();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(lightingState.background);
  camera = new THREE.PerspectiveCamera(52, size.width / size.height, 0.1, 2000);
  camera.position.set(0, 0, 12);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size.width, size.height);
  container.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(size.width, size.height);
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableRotate = false;
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.addEventListener('change', () => {
    updateSceneLabelScales(ctx());
    updateOverview();
  });
  $('view-toggle').checked = false;

  ensureLighting();
  applySceneSettings({ syncControls: true });
  syncFontSettingsControls();
  removeEditOnlySections();
  compactControlSections();
  bindUi();
  bindDiagramPicking();
  installDebugHooks();
  window.addEventListener('resize', resizeRenderers);

  applyModelLayoutSettings({ algorithm: 'grid' });
  setLayoutSettings({ ...getLayoutSettings(), algorithm: 'grid' }, { applyContext: false });
  await resetData({ context: ctx(), refresh: true });
  initModelOverview(ctx());
  clearOverview();
  await populateModelSelect();
  updateInterface();
  addLog('Ready');
  const params = new URLSearchParams(window.location.search);
  if (!HIDE_SCENARIO_SUITE && params.has('runScenarioSuite')) {
    setTimeout(() => runAction(runScenarioSuite), 0);
  }
  if (params.has('runSatelliteFontRegression')) {
    setTimeout(() => runAction(runSatelliteFontZoomRegression), 0);
  }

  requestAnimationFrame(animate);
}

function animate() {
  requestAnimationFrame(animate);
  orbitControls?.update();
  renderOnce();
}

init().catch(error => {
  addLog(`Error: ${error?.message || error}`);
  showToast(error?.message || String(error));
});
