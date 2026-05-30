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
  deleteAttribute,
  createLink,
  updateLink,
  deleteLink,
  moveChildToHyperclass,
  refreshSceneFromData,
  saveScene,
  prepareSceneSnapshot,
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
  normalizeFontSettings,
  getFitQualityMetrics
} from './hbds_model.js?v=model-fit-quality-20260530b';
import { recalculateAllLinks } from './hbds_class_link.js?v=link-perf-20260530a';
import {
  applyServerModelOperations,
  checkServerConnection,
  clearServerDraft,
  configureClientDebug,
  getServerClientId,
  listServerDrafts,
  listServerModels,
  loadServerModel,
  publishServerDraft,
  recordClientUserAction,
  saveServerModel,
  saveScopedModel,
  subscribeServerEvents,
  trackClientFunction,
  isServerModelValue,
  modelFileNameFromValue,
  modelNameFromValue,
  serverModelValue
} from './hbds_server_api.js?v=server-api-20260530c';
import {
  collaborationWorkStatusDecision,
  coalesceDraftOperations,
  coalesceDraftPublishRequest,
  createBoundedChangeCollector,
  createCollaborationPerformanceTracker,
  draftPublishSignature,
  estimateDraftModelBytes,
  isMergeableDraftOperation,
  mergeDraftUpdate,
  shouldBuildDraftPreview,
  shouldKeepCollaborationStatusVisible,
  shouldIncludeDraftModel
} from './hbds_collaboration_drafts.js?v=collab-drafts-20260526b';
import { renderDraftDiagramSvg } from './hbds_collaboration_preview.js?v=collab-preview-20260524d';
import { bindFloatingPanel, clampFloatingPanel } from './hbds_floating_panel.js?v=floating-panel-20260524d';
import {
  buildSelectedSubgraph,
  cloneNodesForPaste,
  makeUniqueId,
  moveArrayItem,
  parseBulkAttributeNames,
  PRODUCTIVITY_ROUTE_PRESETS,
  routePresetFromRendering,
  routePresetPatch
} from './hbds_model_productivity.js?v=productivity-20260525a';

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
let copiedProductivityNodes = [];
let canvasTitleOverride = null;
let multiSelectionMode = false;
let editMode = 'full';
let linkPickActive = false;
let pointerStart = null;
let availableModels = [];
let serverConnected = false;
let serverEvents = null;
let remoteRefreshTimer = null;
let remoteRefreshInFlight = false;
const remoteDrafts = new Map();
const collaborationChangeHistory = new Map();
const collaborationDiffCache = new Map();
const collaborationPerformance = createCollaborationPerformanceTracker({ maxSamples: 80, slowThresholdMs: 120 });
let selectedRemoteClientId = '';
let modelLoadRequestId = 0;
let scheduledModelLoadTimer = null;
let draftPublishTimer = null;
let canvasLoadProgressTimer = null;
let canvasLoadProgressInterval = null;
let canvasLoadProgressToken = 0;
let scheduledDraftPublish = null;
let pendingDraftPublish = null;
let draftPublishInFlight = false;
let collaborationPanelRenderTimer = null;
let collaborationPerformanceDiagnosticsTimer = null;
let remoteDraftRefreshTimer = null;
let remoteDraftRefreshInFlight = false;
let deferredInterfaceRefreshTimer = null;
let collaborationPreviewRenderToken = 0;
let collaborationStatusTaskId = 0;
let collaborationStatusHideTimer = null;
let collaborationStatusVisibleAt = 0;
let collaborationCanvasInteractionUntil = 0;
const collaborationStatusTasks = new Map();
let localDraftModelName = '';
let localDraftDirty = false;
let savedSnapshotKey = '';
let lastCollaborationPreviewSnapshot = null;
let lastCollaborationPreviewSnapshotAt = 0;
let lastCollaborationDraftSnapshotAt = 0;
let lastCollaborationDraftSnapshotKey = '';
let lastCollaborationDraftSnapshotModelName = '';
let lastPublishedDraftSignature = '';
let localDraftOperations = [];
let localDraftDisplayOperations = [];
let localDraftOperationsOverflow = false;
let nextLocalDraftOperationId = 1;
let collaborationBaseModel = null;
let collaborationWarningVisible = false;
let collaborationPreviewZoom = 1;
const collaborationLivePreviewZoomByDraft = new Map();
const COLLABORATION_DIFF_DEFAULT_LIMIT = 80;
const COLLABORATION_PANEL_RENDER_DELAY_MS = 90;
const COLLABORATION_DEFERRED_RENDER_TIMEOUT_MS = 220;
const COLLABORATION_STATUS_SHOW_AFTER_MS = 900;
const COLLABORATION_STATUS_MIN_VISIBLE_MS = 450;
const COLLABORATION_CANVAS_INTERACTION_IDLE_MS = 360;
const COLLABORATION_REMOTE_DRAFT_REFRESH_INTERVAL_MS = 5000;
const COLLABORATION_REMOTE_DRAFT_ACTIVE_INTERVAL_MS = 3500;
const COLLABORATION_DRAFT_PUBLISH_DELAY_MS = 450;
const COLLABORATION_DRAFT_PUBLISH_BACKOFF_MS = 120;
const COLLABORATION_DRAFT_MAX_OPERATIONS = 80;
const COLLABORATION_DRAFT_MAX_DISPLAY_OPERATIONS = 16;
const COLLABORATION_PREVIEW_MAX_WIDTH = 1024;
const COLLABORATION_PREVIEW_MAX_HEIGHT = 1024;
const COLLABORATION_PREVIEW_MAX_DATA_URL_CHARS = 480000;
const COLLABORATION_PREVIEW_MIN_INTERVAL_MS = 2500;
const COLLABORATION_PREVIEW_JPEG_QUALITY = 0.74;
const CANVAS_LOAD_PROGRESS_SHOW_AFTER_MS = 700;
const CANVAS_LOAD_PROGRESS_LARGE_SHOW_AFTER_MS = 0;
const LARGE_MODEL_NAME_PATTERN = /satellite_world_complete_structure\.json$/i;
let nextClassNumber = 1;
let nextHyperclassNumber = 1;
let nextAttributeNumber = 1;
let nextLinkNumber = 1;
let toastTimer = null;
const activityLog = [];
let lastValidationIssueSummary = '';
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
let commandPaletteOpen = false;
let commandPaletteActiveIndex = 0;
let commandPaletteVisibleCommands = [];

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
const MODEL_TREE_COLLAPSED_STORAGE_KEY = 'hbds.dynamic.modelTreeCollapsed.v2';
const VALIDATION_STATUS_BASE_CLASS = 'status-chip validation-status';
const MODEL_SOURCE_CONFIG = getModelSourceConfig();
const TEST_MODEL_ROOT = MODEL_SOURCE_CONFIG.root;
const TEST_MODEL_MANIFEST = MODEL_SOURCE_CONFIG.manifest;
const TEST_MODEL_HIDDEN_VALUES = MODEL_SOURCE_CONFIG.hiddenValues;
const HIDE_SCENARIO_SUITE = TEST_MODEL_ROOT === 'models/';
const SERVER_MODELS_ENABLED = TEST_MODEL_ROOT === 'models/';
const COLLABORATION_DRAFT_SCOPE = TEST_MODEL_ROOT === 'test_models/' ? 'test_models' : '';
const COLLABORATION_ENABLED = SERVER_MODELS_ENABLED || Boolean(COLLABORATION_DRAFT_SCOPE);
const DEBUG_UI_NAME = TEST_MODEL_ROOT === 'models/' ? 'edit-ui' : 'tests-ui';
const DEBUG_STORAGE_KEY = `hbds.debug.enabled.${DEBUG_UI_NAME}`;
let debugModeEnabled = readStoredDebugMode();
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
  material: ['metallic', 'flat', 'matte', 'glossy', 'plastic', 'glass'],
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
  classMaterial: 'metallic',
  classMetalness: 0.46,
  classRoughness: 0.24,
  classEmissiveIntensity: 0.035,
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
const CLASS_MATERIAL_PRESETS = {
  metallic: { metalness: 0.46, roughness: 0.24, emissiveIntensity: 0.035 },
  flat: { metalness: 0, roughness: 1, emissiveIntensity: 0 },
  matte: { metalness: 0.02, roughness: 0.82, emissiveIntensity: 0.012 },
  glossy: { metalness: 0.08, roughness: 0.08, emissiveIntensity: 0.018 },
  plastic: { metalness: 0, roughness: 0.36, emissiveIntensity: 0.014 },
  glass: { metalness: 0, roughness: 0.02, emissiveIntensity: 0 }
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
    class: {
      color: color.fill,
      metallicColor: color.fill,
      material: CLASS_2D_DEFAULTS.classMaterial,
      borderColor: color.border,
      cornerRadius: 0.1,
      metalness: CLASS_2D_DEFAULTS.classMetalness,
      roughness: CLASS_2D_DEFAULTS.classRoughness,
      emissiveIntensity: CLASS_2D_DEFAULTS.classEmissiveIntensity
    },
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
    class: {
      color: color.fill,
      metallicColor: color.fill,
      material: CLASS_2D_DEFAULTS.classMaterial,
      borderColor: color.border,
      opacity: 0.2,
      cornerRadius: 0.22,
      metalness: CLASS_2D_DEFAULTS.classMetalness,
      roughness: CLASS_2D_DEFAULTS.classRoughness,
      emissiveIntensity: CLASS_2D_DEFAULTS.classEmissiveIntensity
    },
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

function resizeRenderersAfterLayoutChange() {
  resizeRenderers();
  requestAnimationFrame(() => {
    resizeRenderers();
    requestAnimationFrame(resizeRenderers);
  });
  window.setTimeout(resizeRenderers, 190);
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
  scheduleLocalDraftPublish(is3D ? 'Enabled 3-D view' : 'Enabled 2-D view');
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
  scheduleLocalDraftPublish('Updated scene settings');
}

function handleResetSceneSettings() {
  lightingState = normalizeSimplifiedSceneSettings(defaultLightingState);
  setSceneSettings(lightingState, { applyContext: false });
  applySceneSettings({ syncControls: true });
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
  addLog('Reset scene settings');
  scheduleLocalDraftPublish('Reset scene settings');
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
  scheduleLocalDraftPublish('Updated font settings');
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
  scheduleLocalDraftPublish('Reset font settings');
}

function applyModelFontSettings(settings) {
  fontState = normalizeFontSettings(settings || getFontSettings());
  syncFontSettingsControls();
}

function handleLayoutSettingChange() {
  setLayoutSettings({ ...getLayoutSettings(), algorithm: getLayoutAlgorithm() }, { applyContext: false });
  updateJsonPreviewFromData();
  scheduleLocalDraftPublish('Changed layout setting');
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

function readStoredDebugMode() {
  if (urlRequestsDebugMode()) return true;
  try {
    return window.localStorage?.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function urlRequestsDebugMode() {
  const params = new URLSearchParams(window.location.search);
  return ['debug', 'debugMode', 'debugLogging'].some(name => {
    const value = params.get(name);
    return value === '1' || String(value || '').toLowerCase() === 'true';
  });
}

function storeDebugMode(enabled) {
  try {
    window.localStorage?.setItem(DEBUG_STORAGE_KEY, enabled ? '1' : '0');
  } catch {}
}

function ensureDebugControls() {
  const section = document.querySelector('.control-group[data-section="settings"]');
  if (!section) return;
  const body = section.querySelector(':scope > .details-body') || section;
  let title = [...body.querySelectorAll(':scope > .settings-subtitle')]
    .find(element => element.textContent.trim().toLowerCase() === 'debug');
  if (!title) {
    title = document.createElement('div');
    title.className = 'settings-subtitle';
    title.textContent = 'Debug';
  }
  let input = $('debug-mode-toggle');
  let label = input?.closest('label') || null;
  if (!label) {
    label = document.createElement('label');
    label.className = 'checkbox-wrapper';
    label.setAttribute('for', 'debug-mode-toggle');
    input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'debug-mode-toggle';
    const text = document.createElement('span');
    text.textContent = 'Debug Logging';
    label.append(input, text);
  }
  let session = $('debug-session-id');
  if (!session) {
    session = document.createElement('div');
    session.id = 'debug-session-id';
    session.className = 'section-meta';
    session.setAttribute('aria-live', 'polite');
  }
  body.prepend(title, label, session);
}

function syncDebugControls() {
  ensureDebugControls();
  const input = $('debug-mode-toggle');
  const label = $('debug-session-id');
  if (input) input.checked = debugModeEnabled;
  if (label) label.textContent = `Session: ${getServerClientId()}`;
}

async function setDebugMode(enabled, options = {}) {
  const previousEnabled = debugModeEnabled;
  const requestedEnabled = Boolean(enabled);
  debugModeEnabled = requestedEnabled;
  storeDebugMode(debugModeEnabled);
  syncDebugControls();
  const result = await configureClientDebug(debugModeEnabled, {
    uiName: DEBUG_UI_NAME,
    timeoutMs: 2500
  });
  if (!result.ok) {
    debugModeEnabled = previousEnabled;
    storeDebugMode(debugModeEnabled);
    syncDebugControls();
    addLog(`Debug ${requestedEnabled ? 'enable' : 'disable'} failed: ${result.error?.message || 'server unavailable'}`);
    if (!options.silent) showToast(result.error?.message || 'Debug server request failed');
    return false;
  }
  if (!options.silent) {
    addLog(`Debug ${debugModeEnabled ? 'enabled' : 'disabled'} for ${DEBUG_UI_NAME}`);
    showToast(`Debug ${debugModeEnabled ? 'on' : 'off'}`);
  }
  return true;
}

function describeDebugTarget(target) {
  const element = target instanceof Element ? target : null;
  if (!element) return {};
  const label = element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.textContent?.trim()
    || element.value
    || '';
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || '',
    name: element.getAttribute('name') || '',
    inputType: element.getAttribute('type') || '',
    value: element.matches('input, select, textarea') ? String(element.value || '').slice(0, 160) : '',
    label: label.slice(0, 160)
  };
}

function installDebugUserActionTracking() {
  document.addEventListener('click', event => {
    recordClientUserAction('click', describeDebugTarget(event.target));
  }, true);
  document.addEventListener('change', event => {
    recordClientUserAction('change', describeDebugTarget(event.target));
  }, true);
  document.addEventListener('input', event => {
    const target = event.target;
    if (target?.matches?.('input[type="range"], input[type="color"], select, textarea')) {
      recordClientUserAction('input', describeDebugTarget(target));
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || ['Escape', 'Enter', 'Delete', 'Backspace'].includes(event.key)) {
      recordClientUserAction('keydown', {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        ...describeDebugTarget(event.target)
      });
    }
  }, true);
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
  updateStatBox('stat-hyperclass-count', 'stat-hyperclass-label', hyperclassCount, 'hyperclass', 'hyperclasses');
  updateStatBox('stat-node-count', 'stat-node-label', classCount, 'class', 'classes');
  updateStatBox('stat-attribute-count', 'stat-attribute-label', countAttributes(), 'attribute', 'attributes');
  updateStatBox('stat-link-count', 'stat-link-label', links().length, 'link', 'links');
  document.body.classList.toggle('has-model', allNodes.length > 0 || Boolean(canvasTitleOverride));
}

function updateStatBox(valueId, labelId, count, singular, plural) {
  const value = $(valueId);
  const label = $(labelId);
  if (value) value.textContent = String(count);
  if (label) label.textContent = count === 1 ? singular : plural;
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

function markCanvasInteraction() {
  collaborationCanvasInteractionUntil = collaborationPerfNow() + COLLABORATION_CANVAS_INTERACTION_IDLE_MS;
}

function isCanvasInteractionActive() {
  return collaborationPerfNow() < collaborationCanvasInteractionUntil;
}

function bindCanvasInteractionTracking() {
  const container = $('container');
  if (!container) return;
  container.addEventListener('pointerdown', markCanvasInteraction, { passive: true });
  container.addEventListener('pointermove', event => {
    if (event.buttons) markCanvasInteraction();
  }, { passive: true });
  container.addEventListener('wheel', markCanvasInteraction, { passive: true });
  window.addEventListener('pointerup', markCanvasInteraction, { passive: true });
}

function startCollaborationWorkStatus(kind = 'sync', options = {}) {
  const token = ++collaborationStatusTaskId;
  const startedAt = collaborationPerfNow();
  const showAfterMs = Number.isFinite(Number(options.showAfterMs))
    ? Number(options.showAfterMs)
    : COLLABORATION_STATUS_SHOW_AFTER_MS;
  const task = {
    token,
    kind,
    startedAt,
    showAfterMs,
    message: options.message || '',
    visible: false,
    timer: null
  };
  collaborationStatusTasks.set(token, task);
  window.clearTimeout(collaborationStatusHideTimer);
  task.timer = window.setTimeout(() => {
    const current = collaborationStatusTasks.get(token);
    if (!current) return;
    const decision = collaborationWorkStatusDecision({
      kind: current.kind,
      message: current.message,
      startedAt: current.startedAt,
      now: collaborationPerfNow(),
      showAfterMs: current.showAfterMs
    });
    if (!decision.show) return;
    current.visible = true;
    showCollaborationWorkStatus(decision.message, token);
    countCollaborationPerformance('status.shown');
  }, showAfterMs);
  return () => finishCollaborationWorkStatus(token);
}

function showCollaborationWorkStatus(message, token) {
  const status = $('canvas-collaboration-status');
  if (!status) return;
  const label = status.querySelector('[data-collaboration-status-text]') || status;
  label.textContent = message;
  status.dataset.token = String(token);
  status.hidden = false;
  collaborationStatusVisibleAt = collaborationPerfNow();
}

function finishCollaborationWorkStatus(token) {
  const task = collaborationStatusTasks.get(token);
  if (!task) return;
  window.clearTimeout(task.timer);
  collaborationStatusTasks.delete(token);
  const status = $('canvas-collaboration-status');
  if (collaborationStatusTasks.size > 0) {
    const latest = [...collaborationStatusTasks.values()].at(-1);
    if (status && !status.hidden && latest) {
      const decision = collaborationWorkStatusDecision({
        kind: latest.kind,
        message: latest.message,
        startedAt: latest.startedAt,
        now: collaborationPerfNow(),
        showAfterMs: latest.showAfterMs,
        force: true
      });
      latest.visible = true;
      showCollaborationWorkStatus(decision.message, latest.token);
    }
    return;
  }
  if (!status || status.hidden) return;
  const hide = () => {
    if (collaborationStatusTasks.size > 0) return;
    status.hidden = true;
    delete status.dataset.token;
  };
  window.clearTimeout(collaborationStatusHideTimer);
  if (shouldKeepCollaborationStatusVisible({
    visibleAt: collaborationStatusVisibleAt,
    now: collaborationPerfNow(),
    minVisibleMs: COLLABORATION_STATUS_MIN_VISIBLE_MS
  })) {
    const remaining = Math.max(0, COLLABORATION_STATUS_MIN_VISIBLE_MS - (collaborationPerfNow() - collaborationStatusVisibleAt));
    collaborationStatusHideTimer = window.setTimeout(hide, remaining);
    return;
  }
  hide();
}

async function withCollaborationWorkStatus(kind, action, options = {}) {
  const finish = startCollaborationWorkStatus(kind, options);
  try {
    return await action();
  } finally {
    finish();
  }
}

function startCanvasLoadProgress(message = 'Loading model...', options = {}) {
  const token = ++canvasLoadProgressToken;
  window.clearTimeout(canvasLoadProgressTimer);
  window.clearInterval(canvasLoadProgressInterval);
  canvasLoadProgressTimer = null;
  canvasLoadProgressInterval = null;
  const showAfterMs = Number.isFinite(Number(options.showAfterMs))
    ? Number(options.showAfterMs)
    : CANVAS_LOAD_PROGRESS_SHOW_AFTER_MS;
  const progress = {
    value: 8,
    message,
    visible: false
  };
  const show = () => {
    if (token !== canvasLoadProgressToken) return;
    progress.visible = true;
    updateCanvasLoadProgress(token, progress.value, progress.message);
    canvasLoadProgressInterval = window.setInterval(() => {
      if (token !== canvasLoadProgressToken) return;
      progress.value = Math.min(88, progress.value + Math.max(1.5, (90 - progress.value) * 0.08));
      updateCanvasLoadProgress(token, progress.value, progress.message);
    }, 420);
  };
  if (showAfterMs <= 0) show();
  else canvasLoadProgressTimer = window.setTimeout(show, showAfterMs);
  return {
    update(value, nextMessage = progress.message) {
      progress.value = Math.max(progress.value, Math.min(96, Number(value) || progress.value));
      progress.message = nextMessage || progress.message;
      if (progress.visible) updateCanvasLoadProgress(token, progress.value, progress.message);
    },
    finish() {
      finishCanvasLoadProgress(token, progress.visible);
    }
  };
}

function updateCanvasLoadProgress(token, value, message) {
  if (token !== canvasLoadProgressToken) return;
  const element = $('canvas-load-progress');
  if (!element) return;
  const label = element.querySelector('[data-load-progress-text]');
  const bar = element.querySelector('[data-load-progress-bar]');
  if (label) label.textContent = message || 'Loading model...';
  if (bar) bar.style.width = `${Math.max(8, Math.min(100, value))}%`;
  element.hidden = false;
}

function finishCanvasLoadProgress(token, wasVisible) {
  if (token !== canvasLoadProgressToken) return;
  window.clearTimeout(canvasLoadProgressTimer);
  window.clearInterval(canvasLoadProgressInterval);
  canvasLoadProgressTimer = null;
  canvasLoadProgressInterval = null;
  const element = $('canvas-load-progress');
  const bar = element?.querySelector('[data-load-progress-bar]');
  if (!element) return;
  if (wasVisible && bar) {
    bar.style.width = '100%';
    window.setTimeout(() => {
      if (token === canvasLoadProgressToken) element.hidden = true;
    }, 160);
    return;
  }
  element.hidden = true;
}

async function withCanvasLoadProgress(message, action, options = {}) {
  const progress = startCanvasLoadProgress(message, options);
  if ((options.showAfterMs ?? CANVAS_LOAD_PROGRESS_SHOW_AFTER_MS) <= 0) {
    await yieldToBrowser({ timeoutMs: 16 });
  }
  try {
    return await action(progress);
  } finally {
    progress.finish();
  }
}

function isLargeModelValue(value) {
  return LARGE_MODEL_NAME_PATTERN.test(modelFileNameFromValue(value, String(value || '')));
}

function getCollaborationStatusState() {
  const status = $('canvas-collaboration-status');
  if (!status) return { visible: false, text: '', pointerEvents: '' };
  const rect = status.getBoundingClientRect();
  return {
    visible: !status.hidden && rect.width > 0 && rect.height > 0 && getComputedStyle(status).display !== 'none',
    text: status.textContent.trim(),
    pointerEvents: getComputedStyle(status).pointerEvents
  };
}

async function triggerCollaborationStatusForTest(kind = 'sync', durationMs = 100, options = {}) {
  const finish = startCollaborationWorkStatus(kind, options);
  await new Promise(resolve => window.setTimeout(resolve, durationMs));
  const shown = getCollaborationStatusState();
  const centerX = Math.round(window.innerWidth / 2);
  const centerY = Math.round(window.innerHeight / 2);
  const centerElement = document.elementFromPoint(centerX, centerY);
  const status = $('canvas-collaboration-status');
  finish();
  await new Promise(resolve => window.setTimeout(resolve, COLLABORATION_STATUS_MIN_VISIBLE_MS + 80));
  return {
    shown,
    hiddenAfterFinish: !getCollaborationStatusState().visible,
    centerHitsStatus: Boolean(status && centerElement && status.contains(centerElement))
  };
}

function updateValidationStatus() {
  const status = $('validation-status');
  const nodeCount = nodes().length;
  const result = validateData(getData());
  if (!status) return;
  status.className = VALIDATION_STATUS_BASE_CLASS;
  status.hidden = true;
  status.textContent = '';

  if (!nodeCount) {
    lastValidationIssueSummary = '';
    return;
  }

  const errorCount = result.errors?.length || 0;
  const warningCount = result.warnings?.length || 0;
  if (!errorCount && !warningCount) {
    lastValidationIssueSummary = '';
    return;
  }

  const issueSummary = [
    errorCount ? `${errorCount} validation error${errorCount === 1 ? '' : 's'}` : '',
    warningCount ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : ''
  ].filter(Boolean).join(', ');
  const issueDetails = [
    ...(result.errors || []),
    ...(result.warnings || [])
  ].join('; ');
  const logSummary = issueDetails ? `${issueSummary}: ${issueDetails}` : issueSummary;

  status.hidden = false;
  if (!result.valid) {
    status.textContent = issueSummary;
    status.classList.add('error');
    if (logSummary !== lastValidationIssueSummary) {
      addLog(`Validation issue - ${logSummary}`);
      lastValidationIssueSummary = logSummary;
    }
    return;
  }

  status.textContent = issueSummary;
  status.classList.add('warn');
  if (logSummary !== lastValidationIssueSummary) {
    addLog(`Validation issue - ${logSummary}`);
    lastValidationIssueSummary = logSummary;
  }
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

function modelTreeQueryText() {
  return String($('model-tree-search-input')?.value || '').trim().toLowerCase();
}

function modelTreeNodeMatches(node, query) {
  if (!query) return true;
  const haystack = [
    node?.id,
    node?.name,
    node?.type === 'hyperclass' ? 'hyperclass' : 'class',
    ...(node?.attributes || []).map(attributeDisplayName)
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function modelTreeLinkMatches(link, query, nodeMap) {
  if (!query) return true;
  const source = nodeMap.get(String(link?.sourceClassId));
  const target = nodeMap.get(String(link?.targetClassId));
  const haystack = [
    link?.id,
    link?.name,
    link?.rendering?.labelText,
    link?.sourceClassId,
    link?.targetClassId,
    source?.name,
    target?.name,
    'link'
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function modelTreeVisibleNodeIds(query) {
  const visible = new Set();
  const allNodes = nodes();
  const childrenByParent = new Map();
  allNodes.forEach(node => {
    if (!node?.parentClassId) return;
    const key = String(node.parentClassId);
    const list = childrenByParent.get(key) || [];
    list.push(node);
    childrenByParent.set(key, list);
  });
  const includeAncestors = node => {
    let current = node;
    while (current) {
      visible.add(String(current.id));
      current = current.parentClassId ? nodeById(current.parentClassId) : null;
    }
  };
  allNodes.forEach(node => {
    if (modelTreeNodeMatches(node, query)) includeAncestors(node);
  });
  return { visible, childrenByParent };
}

function modelTreeItemHtml({ kind, id, label, meta, depth = 0, selected = false, ownerId = '', attributeKey = '' }) {
  return `
    <button class="model-tree-item${selected ? ' is-selected' : ''}" type="button" role="treeitem"
      style="--depth:${depth}"
      data-model-tree-kind="${escapeHtml(kind)}"
      data-model-tree-id="${escapeHtml(id)}"
      data-owner-id="${escapeHtml(ownerId)}"
      data-attribute-key="${escapeHtml(attributeKey)}">
      <span class="model-tree-kind">${escapeHtml(kind.slice(0, 1).toUpperCase())}</span>
      <span class="model-tree-name">${escapeHtml(label)}</span>
      <span class="model-tree-meta">${escapeHtml(meta)}</span>
    </button>
  `;
}

function renderModelTree() {
  const host = $('model-tree-list');
  if (!host) return;
  const allNodes = nodes();
  const allLinks = links();
  if (!allNodes.length && !allLinks.length) {
    host.innerHTML = '<div class="model-tree-empty">Empty workspace</div>';
    return;
  }

  const query = modelTreeQueryText();
  const nodeMap = new Map(allNodes.map(node => [String(node.id), node]));
  const { visible, childrenByParent } = modelTreeVisibleNodeIds(query);
  const roots = allNodes
    .filter(node => !node.parentClassId || !nodeMap.has(String(node.parentClassId)))
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

  const renderNode = (node, depth = 0) => {
    if (query && !visible.has(String(node.id))) return '';
    const attrs = Array.isArray(node.attributes) ? node.attributes : [];
    const children = (childrenByParent.get(String(node.id)) || [])
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    const nodeHtml = modelTreeItemHtml({
      kind: node.type === 'hyperclass' ? 'hyperclass' : 'class',
      id: node.id,
      label: node.name || node.id,
      meta: `${attrs.length} attr${attrs.length === 1 ? '' : 's'}`,
      depth,
      selected: selectedElementIds.has(String(node.id)) && !selectedAttributeKey && !selectedLinkId
    });
    const attributeHtml = attrs
      .map((attribute, index) => {
        const key = attributeKeyFor(attribute, index);
        const name = attributeDisplayName(attribute, index);
        if (query && !name.toLowerCase().includes(query) && !visible.has(String(node.id))) return '';
        return modelTreeItemHtml({
          kind: 'attribute',
          id: `${node.id}:${key}`,
          ownerId: node.id,
          attributeKey: key,
          label: name,
          meta: String(index + 1),
          depth: depth + 1,
          selected: sameId(selectedAttributeOwnerId, node.id) && sameId(selectedAttributeKey, key)
        });
      })
      .join('');
    return `${nodeHtml}${attributeHtml}${children.map(child => renderNode(child, depth + 1)).join('')}`;
  };

  const nodeHtml = roots.map(root => renderNode(root, 0)).join('');
  const linkHtml = allLinks
    .filter(link => modelTreeLinkMatches(link, query, nodeMap))
    .map(link => modelTreeItemHtml({
      kind: 'link',
      id: link.id,
      label: link.rendering?.labelText || link.name || link.id,
      meta: `${link.sourceClassId} -> ${link.targetClassId}`,
      depth: 0,
      selected: sameId(selectedLinkId, link.id)
    }))
    .join('');

  const sections = [
    nodeHtml ? `<div class="model-tree-section">Nodes</div><div class="model-tree-group">${nodeHtml}</div>` : '',
    linkHtml ? `<div class="model-tree-section">Links</div><div class="model-tree-group">${linkHtml}</div>` : ''
  ].filter(Boolean).join('');
  host.innerHTML = sections || '<div class="model-tree-empty">No matching items</div>';
}

function setModelTreeCollapsed(collapsed) {
  document.body.classList.toggle('model-tree-collapsed', Boolean(collapsed));
  const container = $('container');
  if (container) {
    container.style.left = collapsed ? '0px' : '';
  }
  const sidebar = $('model-tree-sidebar');
  if (sidebar) {
    sidebar.style.width = collapsed ? '0px' : '';
    sidebar.style.minWidth = collapsed ? '0px' : '';
  }
  const button = $('model-tree-toggle');
  if (button) {
    button.textContent = collapsed ? 'Show Tree' : 'Hide';
    button.title = collapsed ? 'Show model tree' : 'Hide model tree';
  }
  try {
    localStorage.setItem(MODEL_TREE_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Local persistence is optional.
  }
  resizeRenderersAfterLayoutChange();
}

function restoreModelTreeState() {
  let collapsed = true;
  try {
    const stored = localStorage.getItem(MODEL_TREE_COLLAPSED_STORAGE_KEY);
    collapsed = stored == null ? true : stored === '1';
  } catch {
    collapsed = true;
  }
  setModelTreeCollapsed(collapsed);
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

function setEditMode(nextMode = 'full') {
  const startedAt = collaborationPerfNow();
  editMode = ['full', 'structure', 'readonly'].includes(nextMode) ? nextMode : 'full';
  if (editMode !== 'full') linkPickActive = false;
  updateLinkBuilderStatus();
  updateModeControls();
  recordCollaborationPerformance('ui.edit_mode', startedAt, { mode: editMode });
}

function updateModeControls() {
  const isReadOnly = editMode === 'readonly';
  const structureOnly = editMode === 'structure';
  const selected = nodeById(selectedElementId);
  const owner = nodeById(selectedAttributeOwnerId) || selected;
  const attr = selectedAttributeEntry();
  const link = selectedLinkId ? links().find(item => sameId(item.id, selectedLinkId)) : null;
  const productivityNodes = selectedNodesForProductivity();

  const disable = (id, state) => {
    const element = $(id);
    if (element) element.disabled = Boolean(state);
  };
  const setText = (id, text) => {
    const element = $(id);
    if (element) element.textContent = text;
  };

  disable('add-hyperclass-button', isReadOnly);
  disable('add-class-button', isReadOnly);
  disable('add-attribute-button', isReadOnly || structureOnly || !owner);
  disable('add-link-button', isReadOnly || structureOnly || linkPickActive);
  disable('delete-selected-button', isReadOnly || Boolean(attr) || (!selected && !link));
  disable('delete-attribute-button', isReadOnly || structureOnly || !attr);
  disable('duplicate-node-button', isReadOnly || !productivityNodes.length);
  disable('copy-node-button', !productivityNodes.length);
  disable('paste-node-button', isReadOnly || copiedProductivityNodes.length === 0);
  disable('export-subgraph-button', productivityNodes.length === 0);
  disable('bulk-add-attributes-button', isReadOnly || structureOnly || !owner);
  disable('attribute-move-up-button', isReadOnly || structureOnly || !attr || attr.index <= 0);
  disable('attribute-move-down-button', isReadOnly || structureOnly || !attr || attr.index >= (attr.owner.attributes || []).length - 1);
  disable('swap-link-endpoints-button', isReadOnly || structureOnly || !link);
  disable('link-route-preset-select', isReadOnly || structureOnly || !link);
  disable('selected-color-input', isReadOnly || !selected);
  disable('selected-border-color-input', isReadOnly || !selected);
  disable('selected-opacity-input', isReadOnly || !selected);
  disable('selected-corner-radius-input', isReadOnly || !selected);
  disable('selected-text-color-input', isReadOnly || !selected);
  disable('selected-name-input', isReadOnly || !selected);
  disable('reset-model-button', isReadOnly);
  disable('apply-json-button', isReadOnly);
  disable('cancel-link-button', !linkPickActive);

  if (link) {
    setText('delete-selected-button', 'Delete selected link');
  } else if (attr) {
    setText('delete-selected-button', 'Delete selected class');
  } else if (selected?.type === 'hyperclass') {
    setText('delete-selected-button', 'Delete selected hyperclass');
  } else if (selected) {
    setText('delete-selected-button', 'Delete selected class');
  } else {
    setText('delete-selected-button', 'Delete selected');
  }
  setText('delete-attribute-button', attr ? 'Delete selected attribute' : 'Delete attribute');

  ['mode-full', 'mode-structure', 'mode-readonly'].forEach(id => $(id)?.classList.remove('active'));
  $(`mode-${editMode}`)?.classList.add('active');
  const editModeSelect = $('edit-mode-select');
  if (editModeSelect) editModeSelect.value = editMode;
  const routePresetSelect = $('link-route-preset-select');
  if (routePresetSelect) {
    routePresetSelect.value = link ? routePresetFromRendering(link.rendering || {}) : 'auto';
  }
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

function scheduleDeferredInterfaceRefresh(options = {}) {
  window.clearTimeout(deferredInterfaceRefreshTimer);
  deferredInterfaceRefreshTimer = window.setTimeout(() => {
    deferredInterfaceRefreshTimer = null;
    renderModelTree();
    renderPropertyPanel();
    if (options.json !== false) updateJsonPreviewFromData();
    updateRenderDiagnostics();
  }, Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 160);
}

function ensureModelSelectOption(value, label, summary = '') {
  const select = $('test-model-select');
  if (!select || [...select.options].some(option => option.value === value)) return;
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label || value;
  if (summary) option.dataset.summary = summary;
  select.appendChild(option);
}

function labelFromModelFileName(fileName) {
  return String(fileName || '')
    .replace(/\.json$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase()) || 'Saved Test Model';
}

function updateInterface(options = {}) {
  syncSelectionIds();
  const deferHeavyPanels = options.deferHeavyPanels === true;
  if (options.lightweight === true) {
    updateSelectedCard();
    updateLinkBuilderStatus();
    renderModelTree();
    updateModeControls();
    updateCanvasTitle();
    updateSaveStatus();
    return;
  }
  updateSmartMenusFromData();
  updateStats();
  updateValidationStatus();
  updateSelectedCard();
  updateLinkBuilderStatus();
  if (!deferHeavyPanels) {
    renderModelTree();
    renderPropertyPanel();
  }
  updateModeControls();
  repairAttributeLabels();
  enhanceIconTitleLabels();
  normalizeClassSurfaceMaterials();
  applySelectionHighlight();
  updateModelSummary();
  updateCanvasTitle();
  updateSharePanel();
  updateSaveStatus();
  if (options.json !== false && !deferHeavyPanels) updateJsonPreviewFromData();
  updateRenderDiagnostics();
  if (deferHeavyPanels) {
    scheduleDeferredInterfaceRefresh({ json: options.json });
  }
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
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function modelSnapshotKey(model = getData()) {
  try {
    return JSON.stringify({
      model,
      scene: getSceneSettings(),
      layout: getLayoutSettings(),
      font: getFontSettings()
    });
  } catch (error) {
    return String(Date.now());
  }
}

function updateSaveStatus(options = {}) {
  const chip = $('save-status');
  if (!chip) return;
  const dirty = Object.prototype.hasOwnProperty.call(options, 'dirty')
    ? Boolean(options.dirty)
    : Boolean(savedSnapshotKey && modelSnapshotKey() !== savedSnapshotKey);
  chip.className = 'status-chip save-status';
  chip.classList.add(dirty ? 'warn' : 'ok');
  chip.textContent = dirty ? 'Unsaved changes' : 'Saved';
  const saveButton = $('save-model-button');
  if (saveButton) {
    saveButton.textContent = dirty ? 'Save Changes' : 'Save';
    saveButton.title = dirty ? 'Save current model changes' : 'Current model matches the last saved or loaded state';
  }
}

function markSavedState() {
  savedSnapshotKey = modelSnapshotKey();
  localDraftDirty = false;
  clearLocalDraftOperations();
  updateSaveStatus();
}

function sanitizeDownloadStem(value) {
  return String(value || 'hbds_model')
    .replace(/\.json$/i, '')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'hbds_model';
}

function selectedModelFileName(fallback = 'hbds_model.json') {
  const value = $('test-model-select')?.value || '';
  return modelFileNameFromValue(value, fallback);
}

function selectedModelTitle() {
  const select = $('test-model-select');
  const option = select?.selectedOptions?.[0];
  return option?.textContent?.trim() || 'HBDS model';
}

function currentDownloadStem() {
  return sanitizeDownloadStem(selectedModelFileName('hbds_model.json') || selectedModelTitle());
}

function downloadTextFile(fileName, contents, mimeType) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadDataUrl(fileName, dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function diagramExportStyle() {
  return `
    .collaboration-diagram-bg { fill: #f8fafc; stroke: #d8e2ef; stroke-width: 1; }
    .collaboration-diagram-link { stroke-linecap: round; opacity: 0.86; }
    .collaboration-diagram-link.is-selected { stroke: #e11d48; stroke-width: 3.2; }
    .collaboration-diagram-node-body { stroke-width: 2; }
    .collaboration-diagram-node.is-selected .collaboration-diagram-node-body { stroke: #e11d48; stroke-width: 3; }
    .collaboration-diagram-title { font: 600 13px Arial, sans-serif; dominant-baseline: middle; }
    .collaboration-diagram-attribute-label,
    .collaboration-diagram-attribute-more { font: 11px Arial, sans-serif; fill: #475569; }
    .collaboration-diagram-attribute-count text { font: 600 10px Arial, sans-serif; fill: #ffffff; text-anchor: middle; }
  `;
}

function buildVectorDiagramSvgText(options = {}) {
  const html = renderDraftDiagramSvg(getData(), {
    selection: getDraftSelection(),
    width: options.width ?? 960,
    height: options.height ?? 640,
    zoom: options.zoom ?? 1.15,
    dense: options.dense
  });
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const svg = template.content.querySelector('svg');
  if (!svg) throw new Error('No diagram content to export');
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('role', 'img');
  clone.setAttribute('aria-label', selectedModelTitle());
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = selectedModelTitle();
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = diagramExportStyle();
  clone.insertBefore(style, clone.firstChild);
  clone.insertBefore(title, clone.firstChild);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function getLiveSnapshotMetrics() {
  const canvas = renderer?.domElement;
  if (!canvas) throw new Error('Renderer is not ready');
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width));
  const cssHeight = Math.max(1, Math.round(rect.height));
  const pixelWidth = Math.max(1, canvas.width || cssWidth);
  const pixelHeight = Math.max(1, canvas.height || cssHeight);
  return {
    cssWidth,
    cssHeight,
    pixelWidth,
    pixelHeight,
    scaleX: pixelWidth / cssWidth,
    scaleY: pixelHeight / cssHeight
  };
}

function liveCanvasDataUrl() {
  renderOnce();
  return renderer.domElement.toDataURL('image/png');
}

function copyComputedSnapshotStyles(source, target) {
  const computed = window.getComputedStyle(source);
  const properties = [
    'position',
    'display',
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'transform',
    'transform-origin',
    'opacity',
    'visibility',
    'box-sizing',
    'color',
    'background',
    'background-color',
    'border',
    'border-radius',
    'box-shadow',
    'outline',
    'outline-offset',
    'padding',
    'margin',
    'font',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-decoration',
    'text-transform',
    'white-space',
    'overflow',
    'overflow-wrap',
    'word-break',
    'max-width',
    'min-width',
    'pointer-events',
    'z-index'
  ];
  for (const property of properties) {
    const value = computed.getPropertyValue(property);
    if (value) target.style.setProperty(property, value);
  }
}

function inlineComputedSnapshotStyles(sourceRoot, cloneRoot) {
  copyComputedSnapshotStyles(sourceRoot, cloneRoot);
  const sources = sourceRoot.querySelectorAll('*');
  const clones = cloneRoot.querySelectorAll('*');
  sources.forEach((source, index) => {
    const clone = clones[index];
    if (clone) copyComputedSnapshotStyles(source, clone);
  });
}

function isSnapshotElementVisible(element, containerRect) {
  const computed = window.getComputedStyle(element);
  if (computed.display === 'none' || computed.visibility === 'hidden' || Number(computed.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.right >= containerRect.left &&
    rect.left <= containerRect.right &&
    rect.bottom >= containerRect.top &&
    rect.top <= containerRect.bottom;
}

function cloneLiveLabelLayerForSnapshot(metrics) {
  const container = $('container');
  const containerRect = container.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  layer.style.position = 'relative';
  layer.style.width = `${metrics.cssWidth}px`;
  layer.style.height = `${metrics.cssHeight}px`;
  layer.style.overflow = 'hidden';
  layer.style.pointerEvents = 'none';
  layer.style.margin = '0';
  layer.style.padding = '0';
  layer.style.fontFamily = window.getComputedStyle(container).fontFamily;

  const sourceLabels = [...(labelRenderer?.domElement?.children || [])]
    .filter(element => isSnapshotElementVisible(element, containerRect));
  for (const source of sourceLabels) {
    const clone = source.cloneNode(true);
    inlineComputedSnapshotStyles(source, clone);
    layer.appendChild(clone);
  }

  const canvasTitle = $('canvas-model-title');
  if (canvasTitle && isSnapshotElementVisible(canvasTitle, containerRect)) {
    const titleClone = canvasTitle.cloneNode(true);
    inlineComputedSnapshotStyles(canvasTitle, titleClone);
    titleClone.style.position = 'absolute';
    layer.appendChild(titleClone);
  }

  return layer;
}

function buildLiveSnapshotSvgText() {
  setSceneSettings(lightingState, { applyContext: false });
  const metrics = getLiveSnapshotMetrics();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(metrics.pixelWidth));
  svg.setAttribute('height', String(metrics.pixelHeight));
  svg.setAttribute('viewBox', `0 0 ${metrics.cssWidth} ${metrics.cssHeight}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${selectedModelTitle()} canvas snapshot`);

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = `${selectedModelTitle()} canvas snapshot`;
  svg.appendChild(title);

  const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  image.setAttribute('x', '0');
  image.setAttribute('y', '0');
  image.setAttribute('width', String(metrics.cssWidth));
  image.setAttribute('height', String(metrics.cssHeight));
  image.setAttribute('preserveAspectRatio', 'none');
  image.setAttribute('href', liveCanvasDataUrl());
  svg.appendChild(image);

  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('x', '0');
  foreignObject.setAttribute('y', '0');
  foreignObject.setAttribute('width', String(metrics.cssWidth));
  foreignObject.setAttribute('height', String(metrics.cssHeight));
  foreignObject.appendChild(cloneLiveLabelLayerForSnapshot(metrics));
  svg.appendChild(foreignObject);

  return {
    text: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`,
    metrics
  };
}

async function rasterizeSnapshotSvgToPng(svgText, metrics) {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not render live snapshot SVG'));
    });
    image.src = url;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = metrics.pixelWidth;
    canvas.height = metrics.pixelHeight;
    const canvasContext = canvas.getContext('2d');
    canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function parseCssPixelValue(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function cssColorHasPaint(value) {
  const color = String(value || '').trim().toLowerCase();
  return Boolean(color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)' && color !== 'rgba(0,0,0,0)');
}

function drawRoundedRectPath(canvasContext, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  canvasContext.beginPath();
  canvasContext.moveTo(x + r, y);
  canvasContext.lineTo(x + width - r, y);
  canvasContext.quadraticCurveTo(x + width, y, x + width, y + r);
  canvasContext.lineTo(x + width, y + height - r);
  canvasContext.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  canvasContext.lineTo(x + r, y + height);
  canvasContext.quadraticCurveTo(x, y + height, x, y + height - r);
  canvasContext.lineTo(x, y + r);
  canvasContext.quadraticCurveTo(x, y, x + r, y);
  canvasContext.closePath();
}

function drawSnapshotElement(canvasContext, element, containerRect) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const x = rect.left - containerRect.left;
  const y = rect.top - containerRect.top;
  const width = rect.width;
  const height = rect.height;
  const radius = parseCssPixelValue(style.borderTopLeftRadius);

  if (cssColorHasPaint(style.backgroundColor)) {
    canvasContext.fillStyle = style.backgroundColor;
    drawRoundedRectPath(canvasContext, x, y, width, height, radius);
    canvasContext.fill();
  }

  const borderWidth = parseCssPixelValue(style.borderTopWidth);
  if (borderWidth > 0 && cssColorHasPaint(style.borderTopColor)) {
    canvasContext.strokeStyle = style.borderTopColor;
    canvasContext.lineWidth = borderWidth;
    drawRoundedRectPath(canvasContext, x + borderWidth / 2, y + borderWidth / 2, width - borderWidth, height - borderWidth, radius);
    canvasContext.stroke();
  }

  const text = String(element.textContent || '').trim();
  if (!text) return;

  const paddingLeft = parseCssPixelValue(style.paddingLeft);
  const paddingRight = parseCssPixelValue(style.paddingRight);
  const fontSize = parseCssPixelValue(style.fontSize) || 12;
  const fontStyle = style.fontStyle || 'normal';
  const fontWeight = style.fontWeight || '400';
  const fontFamily = style.fontFamily || 'Arial, sans-serif';
  const textAlign = style.textAlign === 'center' ? 'center' : (style.textAlign === 'right' || style.textAlign === 'end' ? 'right' : 'left');
  const textX = textAlign === 'center'
    ? x + width / 2
    : (textAlign === 'right' ? x + width - paddingRight : x + paddingLeft);

  canvasContext.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  canvasContext.fillStyle = style.color || '#111827';
  canvasContext.textAlign = textAlign;
  canvasContext.textBaseline = 'middle';
  canvasContext.fillText(text, textX, y + height / 2);
}

function buildManualLiveSnapshotPngDataUrl(metrics) {
  renderOnce();
  const canvas = document.createElement('canvas');
  canvas.width = metrics.pixelWidth;
  canvas.height = metrics.pixelHeight;
  const canvasContext = canvas.getContext('2d');
  canvasContext.drawImage(renderer.domElement, 0, 0, metrics.pixelWidth, metrics.pixelHeight);

  const container = $('container');
  const containerRect = container.getBoundingClientRect();
  canvasContext.save();
  canvasContext.scale(metrics.scaleX, metrics.scaleY);
  const labels = [...(labelRenderer?.domElement?.children || [])]
    .filter(element => isSnapshotElementVisible(element, containerRect));
  labels.forEach(element => drawSnapshotElement(canvasContext, element, containerRect));
  const canvasTitle = $('canvas-model-title');
  if (canvasTitle && isSnapshotElementVisible(canvasTitle, containerRect)) {
    drawSnapshotElement(canvasContext, canvasTitle, containerRect);
  }
  canvasContext.restore();
  return canvas.toDataURL('image/png');
}

function renderLiveSnapshotToCanvas(targetWidth, targetHeight) {
  const metrics = getLiveSnapshotMetrics();
  renderOnce();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(targetHeight));
  const canvasContext = canvas.getContext('2d');
  canvasContext.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);

  const container = $('container');
  const containerRect = container.getBoundingClientRect();
  canvasContext.save();
  canvasContext.scale(canvas.width / metrics.cssWidth, canvas.height / metrics.cssHeight);
  const labels = [...(labelRenderer?.domElement?.children || [])]
    .filter(element => isSnapshotElementVisible(element, containerRect));
  labels.forEach(element => drawSnapshotElement(canvasContext, element, containerRect));
  const canvasTitle = $('canvas-model-title');
  if (canvasTitle && isSnapshotElementVisible(canvasTitle, containerRect)) {
    drawSnapshotElement(canvasContext, canvasTitle, containerRect);
  }
  canvasContext.restore();

  return { canvas, metrics };
}

function collaborationPreviewSize(metrics, scale = 1) {
  const baseRatio = Math.min(
    1,
    COLLABORATION_PREVIEW_MAX_WIDTH / metrics.pixelWidth,
    COLLABORATION_PREVIEW_MAX_HEIGHT / metrics.pixelHeight
  );
  const ratio = Math.max(0.12, baseRatio * scale);
  return {
    width: Math.max(1, Math.round(metrics.pixelWidth * ratio)),
    height: Math.max(1, Math.round(metrics.pixelHeight * ratio))
  };
}

function canvasToPreviewDataUrl(canvas, quality = COLLABORATION_PREVIEW_JPEG_QUALITY) {
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl && dataUrl !== 'data:,') return { dataUrl, mediaType: 'image/jpeg' };
  } catch (error) {
    addLog(`JPEG preview encode failed: ${error?.message || error}`);
  }
  return { dataUrl: canvas.toDataURL('image/png'), mediaType: 'image/png' };
}

function clearCollaborationPreviewSnapshotCache() {
  lastCollaborationPreviewSnapshot = null;
  lastCollaborationPreviewSnapshotAt = 0;
  clearCollaborationDraftSnapshotCache();
}

function clearCollaborationDraftSnapshotCache() {
  lastCollaborationDraftSnapshotAt = 0;
  lastCollaborationDraftSnapshotKey = '';
  lastCollaborationDraftSnapshotModelName = '';
  lastPublishedDraftSignature = '';
}

function clearLocalDraftOperations() {
  localDraftOperations = [];
  localDraftDisplayOperations = [];
  localDraftOperationsOverflow = false;
  nextLocalDraftOperationId = 1;
}

function invalidateLocalDraftOperations(reason = 'untracked') {
  if (!localDraftOperations.length && localDraftOperationsOverflow) return;
  localDraftOperations = [];
  localDraftOperationsOverflow = true;
  countCollaborationPerformance(`draft.operation.invalidated.${reason}`);
}

function recordLocalDraftOperation(operationOrType, targetId, patch) {
  if (localDraftOperationsOverflow) return false;
  const operation = isPlainObject(operationOrType)
    ? cloneValue(operationOrType)
    : { type: operationOrType, targetId, patch: cloneValue(patch) };
  if (!operation?.type) return false;
  if ((operation.type === 'updateClass' || operation.type === 'updateLink') && (operation.targetId == null || !isPlainObject(operation.patch))) {
    return false;
  }
  operation.opId = operation.opId || `draft-${nextLocalDraftOperationId++}`;
  operation.updatedAt = operation.updatedAt || new Date().toISOString();
  const result = coalesceDraftOperations(localDraftOperations, operation, {
    maxOperations: COLLABORATION_DRAFT_MAX_OPERATIONS
  });
  if (result.overflow) {
    localDraftOperations = [];
    localDraftOperationsOverflow = true;
    countCollaborationPerformance('draft.operation.overflow');
    return false;
  }
  localDraftOperations = result.operations;
  countCollaborationPerformance('draft.operation.recorded');
  return true;
}

function draftOperationsForPublish() {
  const mergeableOperations = localDraftOperationsOverflow ? [] : localDraftOperations;
  return cloneValue([...mergeableOperations, ...localDraftDisplayOperations]);
}

function recordLocalDraftDisplayOperation(type, patch = {}, options = {}) {
  const cleanType = String(type || 'updateModel').trim();
  if (!cleanType) return false;
  const targetId = options.targetId || 'model';
  const operation = {
    opId: `draft-display-${cleanType}-${targetId}`,
    type: cleanType,
    targetId,
    patch: cloneValue(patch),
    mergeable: false,
    updatedAt: new Date().toISOString()
  };
  const existingIndex = localDraftDisplayOperations.findIndex(item => item.opId === operation.opId);
  if (existingIndex >= 0) {
    localDraftDisplayOperations[existingIndex] = operation;
  } else {
    localDraftDisplayOperations.push(operation);
  }
  while (localDraftDisplayOperations.length > COLLABORATION_DRAFT_MAX_DISPLAY_OPERATIONS) {
    localDraftDisplayOperations.shift();
  }
  countCollaborationPerformance('draft.operation.display_recorded');
  return true;
}

function recordUntrackedDraftDisplayOperation(reason) {
  const cleanReason = String(reason || 'Updated model');
  if (/layout/i.test(cleanReason)) {
    return recordLocalDraftDisplayOperation('updateLayout', { layout: getLayoutSettings() });
  }
  if (/font/i.test(cleanReason)) {
    return recordLocalDraftDisplayOperation('updateFont', { font: getFontSettings() });
  }
  if (/scene|light|background/i.test(cleanReason)) {
    return recordLocalDraftDisplayOperation('updateScene', { sceneSettings: getSceneSettings() });
  }
  if (/fit|view|zoom|pan/i.test(cleanReason)) {
    return recordLocalDraftDisplayOperation('updateView', { viewport: getSerializableViewState() });
  }
  return recordLocalDraftDisplayOperation('updateModel', { status: cleanReason });
}

function draftPatchFromPath(path, value) {
  if (!Array.isArray(path) || !path.length) return {};
  return setDeepValue({}, path, cloneValue(value));
}

function classDraftPatchFromUpdatedEntity(path, value, entity) {
  const pathKey = path.join('.');
  if (pathKey === 'rendering.class.material' && entity?.rendering?.class) {
    return { rendering: { class: cloneValue(entity.rendering.class) } };
  }
  const patch = draftPatchFromPath(path, value);
  if (pathKey === 'rendering.class.color') {
    setDeepValue(patch, ['rendering', 'class', 'metallicColor'], value);
  }
  return patch;
}

function linkDraftPatchFromUpdatedEntity(path, value) {
  const pathKey = path.join('.');
  const patch = draftPatchFromPath(path, value);
  if (pathKey === 'rendering.labelText') patch.name = value;
  return patch;
}

function recordClassDraftUpdate(classId, patch) {
  return recordLocalDraftOperation('updateClass', classId, patch);
}

function recordClassDraftCreate(node) {
  if (!node?.id) return false;
  return recordLocalDraftOperation({
    type: 'createClass',
    targetId: node.id,
    class: cloneValue(node)
  });
}

function recordClassDraftDelete(classId) {
  if (classId == null) return false;
  return recordLocalDraftOperation({
    type: 'deleteClass',
    targetId: classId
  });
}

function recordLinkDraftUpdate(linkId, patch) {
  return recordLocalDraftOperation('updateLink', linkId, patch);
}

function recordLinkDraftCreate(link) {
  if (!link?.id) return false;
  return recordLocalDraftOperation({
    type: 'createLink',
    targetId: link.id,
    link: cloneValue(link)
  });
}

function recordLinkDraftDelete(linkId) {
  if (linkId == null) return false;
  return recordLocalDraftOperation({
    type: 'deleteLink',
    targetId: linkId
  });
}

function recordAttributeOwnerDraftUpdate(ownerId) {
  const owner = nodeById(ownerId);
  if (!owner) return false;
  return recordClassDraftUpdate(owner.id, { attributes: cloneValue(owner.attributes || []) });
}

function recordParentChildrenDraftUpdate(parentId) {
  const parent = nodeById(parentId);
  if (!parent || parent.type !== 'hyperclass') return true;
  return recordClassDraftUpdate(parent.id, { children: cloneValue(parent.children || []) });
}

function draftOperationTargetId(operation) {
  if (!operation || typeof operation !== 'object') return null;
  return operation.targetId
    ?? operation.classId
    ?? operation.linkId
    ?? operation.id
    ?? operation.class?.id
    ?? operation.node?.id
    ?? operation.link?.id
    ?? operation.value?.id
    ?? null;
}

function localDraftHasCreatedClassDependency(classIds) {
  const ids = new Set([...classIds].map(id => String(id)));
  return localDraftOperations.some(operation => {
    if (operation?.type === 'createClass' && ids.has(String(draftOperationTargetId(operation)))) return true;
    const link = operation?.type === 'createLink' ? (operation.link || operation.value) : null;
    return Boolean(link && (ids.has(String(link.sourceClassId)) || ids.has(String(link.targetClassId))));
  });
}

async function buildCollaborationPreviewSnapshot(options = {}) {
  if (!renderer || !labelRenderer || !nodes().length) return null;
  const startedAt = collaborationPerfNow();
  const now = Date.now();
  if (
    !options.force &&
    lastCollaborationPreviewSnapshot &&
    now - lastCollaborationPreviewSnapshotAt < COLLABORATION_PREVIEW_MIN_INTERVAL_MS
  ) {
    countCollaborationPerformance('preview.cache.hit');
    return lastCollaborationPreviewSnapshot;
  }

  const finishStatus = startCollaborationWorkStatus('preview');
  try {
    const metrics = getLiveSnapshotMetrics();
    let scale = 1;
    let size = collaborationPreviewSize(metrics, scale);
    let rendered = renderLiveSnapshotToCanvas(size.width, size.height);
    let encoded = canvasToPreviewDataUrl(rendered.canvas);

    while (encoded.dataUrl.length > COLLABORATION_PREVIEW_MAX_DATA_URL_CHARS && scale > 0.42) {
      scale *= 0.78;
      size = collaborationPreviewSize(metrics, scale);
      rendered = renderLiveSnapshotToCanvas(size.width, size.height);
      encoded = canvasToPreviewDataUrl(rendered.canvas, Math.max(0.56, COLLABORATION_PREVIEW_JPEG_QUALITY * scale));
    }

    if (encoded.dataUrl.length > COLLABORATION_PREVIEW_MAX_DATA_URL_CHARS) {
      addLog(`Skipped collaboration preview snapshot (${encoded.dataUrl.length} chars)`);
      countCollaborationPerformance('preview.skipped.too_large');
      recordCollaborationPerformance('preview.build', startedAt, { result: 'too-large', chars: encoded.dataUrl.length });
      return lastCollaborationPreviewSnapshot;
    }

    lastCollaborationPreviewSnapshot = {
      kind: 'live-canvas-snapshot',
      label: 'Live Preview Snapshot',
      mediaType: encoded.mediaType,
      dataUrl: encoded.dataUrl,
      width: size.width,
      height: size.height,
      sourceWidth: metrics.pixelWidth,
      sourceHeight: metrics.pixelHeight,
      capturedAt: new Date().toISOString(),
      viewport: getSerializableViewState(),
      selection: getDraftSelection()
    };
    lastCollaborationPreviewSnapshotAt = now;
    recordCollaborationPerformance('preview.build', startedAt, {
      width: size.width,
      height: size.height,
      chars: encoded.dataUrl.length
    });
    return lastCollaborationPreviewSnapshot;
  } catch (error) {
    addLog(`Collaboration preview snapshot failed: ${error?.message || error}`);
    countCollaborationPerformance('preview.failed');
    recordCollaborationPerformance('preview.build', startedAt, { result: 'failed' });
    return lastCollaborationPreviewSnapshot;
  } finally {
    finishStatus();
  }
}

async function handleExportPng() {
  const { text, metrics } = buildLiveSnapshotSvgText();
  let pngDataUrl;
  try {
    pngDataUrl = await rasterizeSnapshotSvgToPng(text, metrics);
  } catch (error) {
    addLog(`PNG snapshot fallback: ${error?.message || error}`);
    pngDataUrl = buildManualLiveSnapshotPngDataUrl(metrics);
  }
  downloadDataUrl(`${currentDownloadStem()}_snapshot.png`, pngDataUrl);
  addLog('Exported PNG snapshot');
  showToast('Exported PNG snapshot');
}

function handleExportSvg() {
  const { text } = buildLiveSnapshotSvgText();
  downloadTextFile(`${currentDownloadStem()}_snapshot.svg`, text, 'image/svg+xml;charset=utf-8');
  addLog('Exported SVG snapshot');
  showToast('Exported SVG snapshot');
}

function handleExportVectorSvg() {
  setSceneSettings(lightingState, { applyContext: false });
  downloadTextFile(`${currentDownloadStem()}_vector.svg`, buildVectorDiagramSvgText(), 'image/svg+xml;charset=utf-8');
  addLog('Exported SVG vector preview');
  showToast('Exported SVG vector preview');
}

function isLocalShareHost() {
  const host = window.location.hostname;
  return window.location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '';
}

function buildShareUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('runScenarioSuite');
  url.searchParams.delete('runSatelliteFontRegression');
  const selected = $('test-model-select')?.value || '';
  if (selected) {
    url.searchParams.set('sharedModel', selected);
  } else {
    url.searchParams.delete('sharedModel');
  }
  return url.toString();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function handleCopyShareLink() {
  const url = buildShareUrl();
  await copyTextToClipboard(url);
  addLog('Copied share link');
  showToast(isLocalShareHost() ? 'Copied local share link' : 'Copied share link');
}

async function handleNativeShare() {
  const shareData = {
    title: selectedModelTitle(),
    text: `HBDS model: ${selectedModelTitle()}`,
    url: buildShareUrl()
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      addLog('Opened native share');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      throw error;
    }
  }
  await handleCopyShareLink();
}

function openExternalShare(kind) {
  const url = encodeURIComponent(buildShareUrl());
  const title = encodeURIComponent(selectedModelTitle());
  const text = encodeURIComponent(`HBDS model: ${selectedModelTitle()}`);
  const targets = {
    email: `mailto:?subject=${title}&body=${text}%0A%0A${url}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`
  };
  const target = targets[kind];
  if (!target) return;
  window.open(target, '_blank', 'noopener,noreferrer,width=720,height=620');
  showToast(isLocalShareHost() ? 'Opened share target with a local link' : 'Opened share target');
}

function updateSharePanel() {
  const warning = $('share-local-warning');
  if (warning) {
    warning.classList.toggle('share-warning', isLocalShareHost());
    warning.textContent = isLocalShareHost()
      ? 'Local links only work on this machine. Host the app before sharing through social media.'
      : 'Share the current model link or export a portable image.';
  }
  const canExportDiagram = nodes().length > 0;
  ['export-png-button', 'export-svg-button', 'export-vector-svg-button'].forEach(id => {
    const button = $(id);
    if (button) button.disabled = !canExportDiagram;
  });
}

function selectSharedModelFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('sharedModel');
  const select = $('test-model-select');
  if (!requested || !select) return false;
  const options = [...select.options];
  const requestedFileName = modelFileNameFromValue(requested, requested);
  const match = options.find(option => (
    option.value === requested ||
    modelFileNameFromValue(option.value, option.value) === requestedFileName ||
    option.textContent?.trim() === requested
  ));
  if (!match) return false;
  select.value = match.value;
  return true;
}

function openControlSection(sectionKey) {
  const section = document.querySelector(`.control-group[data-section="${sectionKey}"]`);
  if (section?.tagName?.toLowerCase() === 'details') section.open = true;
  section?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

function commandPaletteCommands() {
  const canEdit = editMode !== 'readonly';
  return [
    { id: 'add-hyperclass', label: 'Add Hyperclass', keywords: 'builder parent group', enabled: () => canEdit, run: handleAddHyperclass },
    { id: 'add-class', label: 'Add Class', keywords: 'builder node', enabled: () => canEdit, run: handleAddClass },
    { id: 'add-attribute', label: 'Add Attribute', keywords: 'field property', enabled: () => canEdit && Boolean(selectedAttributeOwnerId || selectedElementId), run: handleAddAttribute },
    { id: 'add-link', label: 'Start Link', keywords: 'relationship edge connection', enabled: () => canEdit, run: startLinkCreation },
    { id: 'delete-selected', label: 'Delete Selected', keywords: 'remove node link', enabled: () => canEdit && Boolean(selectedElementId || selectedLinkId), run: handleDeleteSelected },
    { id: 'duplicate-node', label: 'Duplicate Selection', keywords: 'copy paste class hyperclass node', enabled: () => canEdit && selectedNodesForProductivity().length > 0, run: handleDuplicateSelectedNodes },
    { id: 'copy-node', label: 'Copy Selection', keywords: 'copy class hyperclass node', enabled: () => selectedNodesForProductivity().length > 0, run: handleCopySelectedNodes },
    { id: 'paste-node', label: 'Paste Nodes', keywords: 'paste duplicate node', enabled: () => canEdit && copiedProductivityNodes.length > 0, run: handlePasteCopiedNodes },
    { id: 'export-subgraph', label: 'Export Selected Subgraph', keywords: 'json selected nodes links', enabled: () => selectedNodesForProductivity().length > 0, run: handleExportSelectedSubgraph },
    { id: 'swap-link', label: 'Swap Link Ends', keywords: 'source target route', enabled: () => canEdit && Boolean(selectedLinkId), run: handleSwapSelectedLinkEndpoints },
    { id: 'save-model', label: 'Save Model', keywords: 'persist store', run: handleSaveModel },
    { id: 'fit-view', label: 'Fit View', keywords: 'zoom canvas camera', run: handleFitModel },
    { id: 'optimize-layout', label: 'Optimize Layout', keywords: 'arrange auto layout', run: handleOptimizeLayout },
    { id: 'toggle-3d', label: 'Toggle 3-D View', keywords: 'view mode perspective', run: () => { const toggle = $('view-toggle'); if (toggle) { toggle.checked = !toggle.checked; handleViewToggle(); } } },
    { id: 'copy-share-link', label: 'Copy Share Link', keywords: 'social url clipboard', run: handleCopyShareLink },
    { id: 'native-share', label: 'Share Model', keywords: 'system share', run: handleNativeShare },
    { id: 'export-png', label: 'Export PNG Snapshot', keywords: 'image exact canvas snapshot', enabled: () => nodes().length > 0, run: handleExportPng },
    { id: 'export-svg', label: 'Export SVG Snapshot', keywords: 'exact canvas snapshot raster', enabled: () => nodes().length > 0, run: handleExportSvg },
    { id: 'export-vector-svg', label: 'Export SVG Vector', keywords: 'editable approximate preview', enabled: () => nodes().length > 0, run: handleExportVectorSvg },
    { id: 'export-json', label: 'Export JSON', keywords: 'model data download', run: handleExportJson },
    { id: 'run-scenarios', label: 'Run Scenario Suite', keywords: 'test regression', enabled: () => !HIDE_SCENARIO_SUITE, run: runScenarioSuite },
    { id: 'open-builder', label: 'Open Model Builder', keywords: 'inspector properties edit', run: () => openControlSection('model-builder') },
    { id: 'open-productivity', label: 'Open Productivity', keywords: 'tree duplicate bulk attributes route subgraph', run: () => openControlSection('productivity') },
    { id: 'open-share', label: 'Open Share', keywords: 'social export link', run: () => openControlSection('share') },
    { id: 'open-json', label: 'Open JSON', keywords: 'raw model', run: () => openControlSection('json') }
  ];
}

function commandMatchesQuery(command, query) {
  if (!query) return true;
  const haystack = `${command.label} ${command.keywords || ''} ${command.id}`.toLowerCase();
  return query.split(/\s+/).every(part => haystack.includes(part));
}

function commandEnabled(command) {
  return command.enabled ? command.enabled() !== false : true;
}

function filteredCommandPaletteCommands() {
  const query = $('command-palette-input')?.value?.trim().toLowerCase() || '';
  return commandPaletteCommands().filter(command => commandMatchesQuery(command, query));
}

function renderCommandPalette() {
  const list = $('command-palette-list');
  if (!list) return;
  commandPaletteVisibleCommands = filteredCommandPaletteCommands();
  if (commandPaletteActiveIndex >= commandPaletteVisibleCommands.length) {
    commandPaletteActiveIndex = Math.max(0, commandPaletteVisibleCommands.length - 1);
  }
  list.innerHTML = '';
  if (!commandPaletteVisibleCommands.length) {
    const empty = document.createElement('div');
    empty.className = 'command-empty';
    empty.textContent = 'No matching commands';
    list.appendChild(empty);
    return;
  }
  commandPaletteVisibleCommands.forEach((command, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `command-item${index === commandPaletteActiveIndex ? ' is-active' : ''}`;
    button.dataset.commandIndex = String(index);
    button.disabled = !commandEnabled(command);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === commandPaletteActiveIndex ? 'true' : 'false');

    const label = document.createElement('span');
    label.className = 'command-label';
    label.textContent = command.label;
    const meta = document.createElement('span');
    meta.className = 'command-meta';
    meta.textContent = button.disabled ? 'Unavailable' : '';
    button.append(label, meta);
    list.appendChild(button);
  });
}

function openCommandPalette() {
  const palette = $('command-palette');
  const input = $('command-palette-input');
  if (!palette || !input) return;
  commandPaletteOpen = true;
  commandPaletteActiveIndex = 0;
  palette.hidden = false;
  input.value = '';
  renderCommandPalette();
  requestAnimationFrame(() => input.focus());
}

function closeCommandPalette() {
  const palette = $('command-palette');
  if (!palette) return;
  commandPaletteOpen = false;
  palette.hidden = true;
}

function executeCommandPaletteCommand(index = commandPaletteActiveIndex) {
  const command = commandPaletteVisibleCommands[index];
  if (!command) return;
  if (!commandEnabled(command)) {
    showToast('Command is not available');
    return;
  }
  closeCommandPalette();
  runAction(command.run, command.id || command.label || '');
}

function handleCommandPaletteKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openCommandPalette();
    return;
  }

  if (!commandPaletteOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCommandPalette();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    commandPaletteActiveIndex = Math.min(commandPaletteActiveIndex + 1, Math.max(0, commandPaletteVisibleCommands.length - 1));
    renderCommandPalette();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    commandPaletteActiveIndex = Math.max(0, commandPaletteActiveIndex - 1);
    renderCommandPalette();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    executeCommandPaletteCommand();
  }
}

function getCollaborationClientName() {
  const id = serverEvents?.clientId || '';
  return id ? `UI ${id.slice(-6)}` : 'HBDS UI';
}

function bindCollaborationControls() {
  const panel = $('collaboration-split');
  bindFloatingPanel(panel, panel?.querySelector('.collaboration-header'), {
    storageKey: 'hbds.dynamic.collaborationPanelPosition',
    sizeStorageKey: 'hbds.dynamic.collaborationPanelSize.v2',
    resizable: true,
    minWidth: 320,
    minHeight: 360
  });
  $('collaboration-client-select')?.addEventListener('change', event => {
    selectedRemoteClientId = event.target.value || '';
    updateCollaborationPanel();
  });
  $('collaboration-apply-left-button')?.addEventListener('click', () => runAction(() => handleSaveModel({ forceCollaborationSave: true }), 'collaboration.keepMine'));
  $('collaboration-apply-right-button')?.addEventListener('click', () => runAction(applySelectedRemoteDraft, 'collaboration.useTheirs'));
  $('collaboration-merge-button')?.addEventListener('click', () => runAction(mergeSelectedRemoteDraft, 'collaboration.mergeBoth'));
  $('collaboration-preview')?.addEventListener('click', event => {
    const liveButton = event.target.closest?.('[data-collaboration-live-preview-action]');
    if (liveButton) {
      const draft = selectedRemoteDraft();
      const action = liveButton.dataset.collaborationLivePreviewAction;
      const currentZoom = getCollaborationLivePreviewZoom(draft);
      if (action === 'zoom-in') setCollaborationLivePreviewZoom(draft, currentZoom + 0.25);
      if (action === 'zoom-out') setCollaborationLivePreviewZoom(draft, currentZoom - 0.25);
      if (action === 'fit') setCollaborationLivePreviewZoom(draft, 1);
      renderCollaborationPreview(draft);
      return;
    }
    const button = event.target.closest?.('[data-collaboration-preview-action]');
    if (!button) return;
    const action = button.dataset.collaborationPreviewAction;
    if (action === 'zoom-in') collaborationPreviewZoom = clampNumber(collaborationPreviewZoom + 0.2, 0.65, 2.25, 1);
    if (action === 'zoom-out') collaborationPreviewZoom = clampNumber(collaborationPreviewZoom - 0.2, 0.65, 2.25, 1);
    if (action === 'fit') collaborationPreviewZoom = 1;
    renderCollaborationPreview(selectedRemoteDraft());
  });
  window.addEventListener('beforeunload', () => {
    void clearLocalServerDraft();
  });
}

function getRemoteDraftList() {
  const currentName = getSelectedCollaborationModelName();
  return [...remoteDrafts.values()]
    .filter(draft => draft?.modelName === currentName && draft.clientId !== serverEvents?.clientId)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function storeRemoteDraft(draft) {
  if (!draft?.clientId) return;
  const existing = remoteDrafts.get(draft.clientId);
  remoteDrafts.set(draft.clientId, mergeDraftUpdate(existing, draft));
}

function removeMissingRemoteDrafts(modelName, seenClientIds) {
  if (!modelName) return;
  for (const [clientId, draft] of remoteDrafts.entries()) {
    if (draft?.modelName !== modelName || seenClientIds.has(clientId)) continue;
    clearCollaborationChangeHistory(clientId, modelName);
    clearCollaborationLivePreviewZoomForClient(clientId);
    remoteDrafts.delete(clientId);
  }
}

function scheduleRemoteDraftRefreshLoop() {
  window.clearTimeout(remoteDraftRefreshTimer);
  remoteDraftRefreshTimer = null;
  const scheduledModelName = getSelectedCollaborationModelName();
  if (!COLLABORATION_ENABLED || !serverConnected || !scheduledModelName) return;
  if (document.hidden) return;
  const refreshInterval = getRemoteDraftList().length > 0
    ? COLLABORATION_REMOTE_DRAFT_ACTIVE_INTERVAL_MS
    : COLLABORATION_REMOTE_DRAFT_REFRESH_INTERVAL_MS;
  remoteDraftRefreshTimer = window.setTimeout(async () => {
    remoteDraftRefreshTimer = null;
    if (getSelectedCollaborationModelName() !== scheduledModelName) return;
    await refreshRemoteDraftsForCurrentModel({ immediate: false, modelName: scheduledModelName });
    scheduleRemoteDraftRefreshLoop();
  }, refreshInterval);
}

function handleCollaborationVisibilityChange() {
  if (document.hidden) {
    window.clearTimeout(remoteDraftRefreshTimer);
    remoteDraftRefreshTimer = null;
    return;
  }
  if (!COLLABORATION_ENABLED || !serverConnected || !getSelectedCollaborationModelName()) return;
  void refreshRemoteDraftsForCurrentModel({ immediate: true });
  scheduleRemoteDraftRefreshLoop();
}

function scheduleCollaborationPanelUpdate(options = {}) {
  if (options.immediate === true) {
    window.clearTimeout(collaborationPanelRenderTimer);
    collaborationPanelRenderTimer = null;
    updateCollaborationPanel();
    return;
  }
  if (collaborationPanelRenderTimer) return;
  collaborationPanelRenderTimer = window.setTimeout(() => {
    collaborationPanelRenderTimer = null;
    requestAnimationFrame(updateCollaborationPanel);
  }, COLLABORATION_PANEL_RENDER_DELAY_MS);
}

function getBlockingRemoteDraftList() {
  return getRemoteDraftList().filter(isEditingRemoteDraft);
}

function isEditingRemoteDraft(draft) {
  if (!draft) return false;
  if (draft.mode === 'presence' || draft.dirty === false || draft.isDirty === false) return false;
  if (draft.mode === 'editing' || draft.dirty === true || draft.isDirty === true) return true;
  return Boolean(draft.model) || (Array.isArray(draft.operations) && draft.operations.length > 0);
}

function selectedRemoteDraft() {
  const drafts = getRemoteDraftList();
  return drafts.find(draft => draft.clientId === selectedRemoteClientId) || drafts[0] || null;
}

function updateCollaborationPanel() {
  const startedAt = collaborationPerfNow();
  const drafts = getRemoteDraftList();
  const panel = $('collaboration-split');
  const select = $('collaboration-client-select');
  const count = $('collaboration-count');
  if (!panel || !select || !count) {
    recordCollaborationPerformance('panel.render', startedAt, { result: 'missing-elements' });
    return;
  }

  const hasDrafts = drafts.length > 0;
  panel.hidden = !hasDrafts;
  document.body.classList.toggle('has-collaboration-split', hasDrafts);
  count.textContent = collaborationConnectionLabel(drafts.length);

  if (!hasDrafts) {
    selectedRemoteClientId = '';
    select.innerHTML = '';
    renderCollaborationPreview(null);
    setCollaborationWarning(false);
    recordCollaborationPerformance('panel.render', startedAt, { drafts: 0 });
    return;
  }

  if (!drafts.some(draft => draft.clientId === selectedRemoteClientId)) {
    selectedRemoteClientId = drafts[0].clientId;
  }

  select.innerHTML = '';
  drafts.forEach(draft => {
    const option = document.createElement('option');
    option.value = draft.clientId;
    option.textContent = draft.clientName || draft.clientId;
    select.appendChild(option);
  });
  select.value = selectedRemoteClientId;
  renderCollaborationPreview(selectedRemoteDraft());
  requestAnimationFrame(() => clampFloatingPanel(panel));
  recordCollaborationPerformance('panel.render', startedAt, { drafts: drafts.length });
}

function collaborationConnectionLabel(userCount) {
  const count = Number(userCount) || 0;
  const noun = count === 1 ? 'user' : 'users';
  const modelName = getSelectedCollaborationModelLabel();
  return `${count} ${noun} connected to ${modelName}`;
}

function getSelectedCollaborationModelLabel() {
  const select = $('test-model-select');
  const selectedOption = select?.options?.[select.selectedIndex];
  const optionLabel = selectedOption?.textContent?.trim();
  if (optionLabel) return optionLabel;
  const modelName = getSelectedCollaborationModelName();
  if (!modelName) return 'current model';
  return labelFromModelFileName(modelName.split('/').pop() || modelName);
}

function setCollaborationWarning(visible, message = '') {
  collaborationWarningVisible = Boolean(visible);
  const warning = $('collaboration-warning');
  if (!warning) return;
  warning.hidden = !collaborationWarningVisible;
  if (message) warning.textContent = message;
}

function collaborationPerfNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function recordCollaborationPerformance(name, startedAt, details = {}) {
  collaborationPerformance.record(name, collaborationPerfNow() - startedAt, details);
  scheduleCollaborationPerformanceDiagnosticsUpdate();
}

function countCollaborationPerformance(name, amount = 1) {
  collaborationPerformance.count(name, amount);
  scheduleCollaborationPerformanceDiagnosticsUpdate();
}

function scheduleCollaborationPerformanceDiagnosticsUpdate() {
  if (collaborationPerformanceDiagnosticsTimer) return;
  collaborationPerformanceDiagnosticsTimer = window.setTimeout(() => {
    collaborationPerformanceDiagnosticsTimer = null;
    updateCollaborationPerformanceDiagnostics();
  }, 120);
}

function updateCollaborationPerformanceDiagnostics() {
  let diagnostics = $('collaboration-performance-diagnostics');
  if (!diagnostics) {
    diagnostics = document.createElement('output');
    diagnostics.id = 'collaboration-performance-diagnostics';
    diagnostics.hidden = true;
    document.body.appendChild(diagnostics);
  }
  diagnostics.textContent = JSON.stringify(collaborationPerformance.summary());
}

function safePreviewImageSrc(value) {
  const text = String(value || '').trim();
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(text) ? text : '';
}

function draftPreviewPayload(draft) {
  const preview = draft?.preview;
  if (preview?.kind === 'live-canvas-snapshot' && preview?.dataUrl) return preview;
  return null;
}

function collaborationLivePreviewZoomKey(draft) {
  const clientId = draft?.clientId || '';
  if (!clientId) return '';
  return `${draft?.modelName || getSelectedCollaborationModelName() || ''}:${clientId}`;
}

function getCollaborationLivePreviewZoom(draft) {
  const key = collaborationLivePreviewZoomKey(draft);
  return key && collaborationLivePreviewZoomByDraft.has(key)
    ? collaborationLivePreviewZoomByDraft.get(key)
    : 1;
}

function setCollaborationLivePreviewZoom(draft, zoom) {
  const key = collaborationLivePreviewZoomKey(draft);
  if (!key) return;
  collaborationLivePreviewZoomByDraft.set(key, clampNumber(zoom, 0.35, 4, 1));
}

function clearCollaborationLivePreviewZoomForClient(clientId) {
  if (!clientId) return;
  const suffix = `:${clientId}`;
  [...collaborationLivePreviewZoomByDraft.keys()].forEach(key => {
    if (key.endsWith(suffix)) collaborationLivePreviewZoomByDraft.delete(key);
  });
}

function renderCollaborationVisualPreview(draft) {
  const livePreview = renderCollaborationLiveSnapshotPreview(draft);
  if (livePreview) return livePreview;
  if (draft?.modelOmitted && draft?.modelPreservedFromPreviousDraft) {
    return '<div class="collaboration-diagram-empty">Lightweight update received. Full preview refresh is pending.</div>';
  }
  return renderCollaborationModelPreview(draft);
}

function renderCollaborationLiveSnapshotPreview(draft) {
  const preview = draftPreviewPayload(draft);
  const src = safePreviewImageSrc(preview?.dataUrl);
  if (!src) return '';
  const capturedAt = preview.capturedAt || draft?.updatedAt || draft?.timestamp || '';
  const dimensions = preview.width && preview.height ? `${preview.width} x ${preview.height}` : '';
  const zoom = getCollaborationLivePreviewZoom(draft);
  const isFit = Math.abs(zoom - 1) < 0.01;
  const zoomPercent = Math.round(zoom * 100);
  const imageWidth = Math.max(1, Math.round((preview.width || COLLABORATION_PREVIEW_MAX_WIDTH) * zoom));
  const imageStyle = isFit
    ? 'width: 100%; max-width: 100%; height: auto;'
    : `width: ${imageWidth}px; max-width: none; height: auto;`;
  const note = [
    capturedAt ? `Captured ${capturedAt}` : '',
    dimensions
  ].filter(Boolean).join(' - ');
  return `
    <div class="collaboration-live-preview">
      <div class="collaboration-preview-mode">
        <span>Live Preview Snapshot</span>
        <div class="collaboration-preview-zoom" aria-label="Live preview zoom controls">
          <button type="button" data-collaboration-live-preview-action="zoom-out" title="Zoom out">-</button>
          <span>${zoomPercent}%</span>
          <button type="button" data-collaboration-live-preview-action="zoom-in" title="Zoom in">+</button>
          <button type="button" data-collaboration-live-preview-action="fit" title="Fit preview">Fit</button>
        </div>
      </div>
      <div class="collaboration-live-preview-scroll">
        <img class="${isFit ? 'is-fit' : 'is-zoomed'}" src="${escapeHtml(src)}" alt="Remote live canvas preview" style="${escapeHtml(imageStyle)}">
      </div>
      ${note ? `<div class="collaboration-preview-note">${escapeHtml(note)}</div>` : ''}
    </div>
  `;
}

function renderCollaborationModelPreview(draft) {
  if (!draft?.model) {
    return '<div class="collaboration-diagram-empty">No model preview available</div>';
  }
  const label = draft.modelPreservedFromPreviousDraft ? 'last full snapshot' : 'fallback';
  return `
    <div class="collaboration-model-preview">
      <div class="collaboration-preview-mode">
        <span>Model Preview</span>
        <span>${escapeHtml(label)}</span>
      </div>
      ${renderDraftDiagramSvg(draft.model, {
        selection: draft.selection,
        zoom: collaborationPreviewZoom
      })}
    </div>
  `;
}

function getCollaborationPreviewRenderPlan(draft, operations = [], options = {}) {
  const hasOperations = operations.length > 0;
  const hasLivePreview = Boolean(draftPreviewPayload(draft)?.dataUrl);
  const hasFullModelPreview = Boolean(draft?.model && draft.modelOmitted !== true && !hasLivePreview);
  const canDefer = options.deferExpensive !== false;
  return {
    deferVisual: canDefer && hasFullModelPreview,
    deferDiff: canDefer && !hasOperations && hasCurrentDraftModelSnapshot(draft)
  };
}

function renderCollaborationDeferredDetail(message, kind) {
  return `
    <div class="collaboration-deferred-detail" data-collaboration-deferred="${escapeHtml(kind)}">
      <span class="collaboration-deferred-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderCollaborationChangeSummaryPending() {
  return `
    <div class="collaboration-diff" data-collaboration-deferred="diff">
      <div class="collaboration-section-title">Remote changes vs mine</div>
      <ul class="collaboration-operation-list">
        <li class="change-none">Preparing remote differences...</li>
      </ul>
    </div>
  `;
}

function scheduleDeferredCollaborationPreviewDetails(draft, operations, renderToken, plan) {
  void renderDeferredCollaborationPreviewDetails(draft, operations, renderToken, plan);
}

async function renderDeferredCollaborationPreviewDetails(draft, operations, renderToken, plan) {
  const startedAt = collaborationPerfNow();
  const finishStatus = startCollaborationWorkStatus(plan.deferDiff ? 'render' : 'preview');
  try {
    await yieldToBrowser({ timeoutMs: isCanvasInteractionActive() ? COLLABORATION_CANVAS_INTERACTION_IDLE_MS : COLLABORATION_DEFERRED_RENDER_TIMEOUT_MS });
    const preview = $('collaboration-preview');
    if (!preview || preview.dataset.renderToken !== String(renderToken)) return;
    if (plan.deferVisual) {
      const visualStartedAt = collaborationPerfNow();
      const visual = renderCollaborationVisualPreview(draft);
      recordCollaborationPerformance('panel.visual.render', visualStartedAt, { deferred: true });
      const slot = preview.querySelector('[data-collaboration-deferred="visual"]');
      if (slot && preview.dataset.renderToken === String(renderToken)) slot.outerHTML = visual;
      await yieldToBrowser({ timeoutMs: 80 });
    }
    if (plan.deferDiff) {
      const diffStartedAt = collaborationPerfNow();
      const diff = renderCollaborationChangeSummary(draft, operations);
      recordCollaborationPerformance('panel.diff.render', diffStartedAt, { deferred: true });
      const slot = preview.querySelector('[data-collaboration-deferred="diff"]');
      if (slot && preview.dataset.renderToken === String(renderToken)) slot.outerHTML = diff;
    }
    recordCollaborationPerformance('panel.deferred.render', startedAt, {
      visual: plan.deferVisual,
      diff: plan.deferDiff
    });
  } finally {
    finishStatus();
  }
}

function renderCollaborationPreview(draft, options = {}) {
  const preview = $('collaboration-preview');
  const mergeButton = $('collaboration-merge-button');
  const applyRightButton = $('collaboration-apply-right-button');
  const applyLeftButton = $('collaboration-apply-left-button');
  if (!preview) return;
  const renderToken = ++collaborationPreviewRenderToken;
  preview.dataset.renderToken = String(renderToken);
  if (!draft) {
    preview.innerHTML = '<div class="collaboration-empty">No collaborator selected</div>';
    if (mergeButton) mergeButton.disabled = true;
    if (applyRightButton) applyRightButton.disabled = true;
    if (applyLeftButton) applyLeftButton.disabled = true;
    return;
  }

  const summary = draft.summary || summarizeModel(draft.model);
  const operations = Array.isArray(draft.operations) ? draft.operations : [];
  const hasCurrentModel = hasCurrentDraftModelSnapshot(draft);
  const plan = getCollaborationPreviewRenderPlan(draft, operations, options);
  preview.innerHTML = `
    <div class="collaboration-preview-title">
      <span>${escapeHtml(draft.status || draft.summaryText || 'Live draft update')} ${draft.updatedAt ? `- ${escapeHtml(draft.updatedAt)}` : ''}</span>
    </div>
    <div class="collaboration-stat-grid">
      ${renderCollaborationStat('Class', summary.classes ?? 0)}
      ${renderCollaborationStat('Hyper', summary.hyperclasses ?? 0)}
      ${renderCollaborationStat('Links', summary.links ?? 0)}
      ${renderCollaborationStat('Attrs', summary.attributes ?? 0)}
    </div>
    ${renderCollaborationSelectionDetails(draft)}
    ${plan.deferVisual ? renderCollaborationDeferredDetail('Preparing remote preview...', 'visual') : renderCollaborationVisualPreview(draft)}
    ${plan.deferDiff ? renderCollaborationChangeSummaryPending() : renderCollaborationChangeSummary(draft, operations)}
  `;
  if (mergeButton) mergeButton.disabled = !hasCurrentModel && !canMergeDraftOperations(operations);
  if (applyRightButton) applyRightButton.disabled = !hasCurrentModel;
  if (applyLeftButton) applyLeftButton.disabled = false;
  if (plan.deferVisual || plan.deferDiff) {
    scheduleDeferredCollaborationPreviewDetails(draft, operations, renderToken, plan);
  }
}

function hasCurrentDraftModelSnapshot(draft) {
  return Boolean(draft?.model && draft.modelPreservedFromPreviousDraft !== true && draft.modelOmitted !== true);
}

function mergeableDraftOperations(operations = []) {
  return (Array.isArray(operations) ? operations : []).filter(isMergeableDraftOperation);
}

function canMergeDraftOperations(operations = []) {
  const list = Array.isArray(operations) ? operations : [];
  return list.length > 0 && list.every(isMergeableDraftOperation);
}

function renderCollaborationStat(label, value) {
  return `<div class="collaboration-stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
}

function renderCollaborationSelectionDetails(draft) {
  const selectedText = describeDraftSelection(draft) || 'none';
  return `<div class="collaboration-selection-detail"><strong>Remote selection:</strong><span>${escapeHtml(selectedText)}</span></div>`;
}

function resolveDraftSelection(draft) {
  const selection = draft?.selection || {};
  const modelNodes = draft?.model?.hypergraph?.class || [];
  const modelLinks = draft?.model?.hypergraph?.link || [];
  if (!draft?.model || !selection) return null;
  if (selection.selectedAttributeOwnerId && selection.selectedAttributeKey != null) {
    const owner = modelNodes.find(node => sameId(node.id, selection.selectedAttributeOwnerId));
    const attrs = owner?.attributes || [];
    const index = attrs.findIndex((attribute, attrIndex) => sameId(attributeKeyFor(attribute, attrIndex), selection.selectedAttributeKey));
    if (owner && index >= 0) {
      return {
        type: 'attribute',
        owner,
        attribute: attrs[index],
        index
      };
    }
  }
  const linkId = selection.selectedLinkId || selection.linkId;
  if (linkId) {
    const link = modelLinks.find(item => sameId(item.id, linkId));
    if (link) {
      return {
        type: 'link',
        link,
        source: modelNodes.find(node => sameId(node.id, link.sourceClassId)),
        target: modelNodes.find(node => sameId(node.id, link.targetClassId))
      };
    }
    return { type: 'missing-link', linkId };
  }
  const id = selection.selectedElementId || selection.classId || (Array.isArray(selection.selectedElementIds) ? selection.selectedElementIds[0] : null);
  const node = modelNodes.find(item => sameId(item.id, id));
  return node ? { type: 'node', node } : null;
}

function summarizeModel(model) {
  const modelNodes = Array.isArray(model?.hypergraph?.class) ? model.hypergraph.class : [];
  const modelLinks = Array.isArray(model?.hypergraph?.link) ? model.hypergraph.link : [];
  return {
    nodes: modelNodes.length,
    classes: modelNodes.filter(node => node?.type !== 'hyperclass').length,
    hyperclasses: modelNodes.filter(node => node?.type === 'hyperclass').length,
    links: modelLinks.length,
    attributes: modelNodes.reduce((total, node) => total + (Array.isArray(node?.attributes) ? node.attributes.length : 0), 0)
  };
}

function describeDraftOperation(operation, draft = {}) {
  const type = String(operation?.type || 'operation');
  const target = draftOperationTargetId(operation) ?? '';
  const changedAt = operation?.updatedAt || operation?.timestamp || draft?.updatedAt || draft?.timestamp || '';
  const kind = type.toLowerCase().includes('delete') || type.toLowerCase().includes('remove')
    ? 'removed'
    : (type.toLowerCase().includes('create') || type.toLowerCase().includes('add') ? 'added' : 'updated');
  const patch = operation?.patch && typeof operation.patch === 'object' ? operation.patch : null;
  const payload = operation?.class || operation?.node || operation?.link || operation?.value || null;
  if (!patch && !payload) {
    return {
      kind,
      key: `operation:${operation?.opId || type}:${target}`,
      timestamp: changedAt,
      text: `${operationTypeLabel(type)}${target ? ` on ${valuePreview(target)}` : ''}`
    };
  }
  const fields = patch ? describeOperationPatchFields(operation, patch) : describeOperationPayloadFields(operation, payload);
  return {
    kind,
    key: `operation:${operation?.opId || type}:${target}:${fields.join('|')}`,
    timestamp: changedAt,
    text: `${operationTypeLabel(type)}${target ? ` on ${valuePreview(target)}` : ''}${fields.length ? ` (${fields.join(', ')})` : ''}`
  };
}

function describeOperationPayloadFields(operation, payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (operation?.type === 'createClass') {
    return [
      payload.name ? `name ${valuePreview(payload.name)}` : '',
      payload.type === 'hyperclass' ? 'hyperclass' : 'class',
      payload.parentClassId ? `parent hyperclass ${valuePreview(payload.parentClassId)}` : '',
      payload.position ? `position ${positionPreview(payload.position)}` : '',
      Array.isArray(payload.attributes) ? `${payload.attributes.length} attributes` : ''
    ].filter(Boolean);
  }
  if (operation?.type === 'createLink') {
    const label = payload.name || payload.rendering?.labelText || '';
    return [
      label ? `name ${valuePreview(label)}` : '',
      payload.sourceClassId ? `source ${valuePreview(payload.sourceClassId)}` : '',
      payload.targetClassId ? `target ${valuePreview(payload.targetClassId)}` : ''
    ].filter(Boolean);
  }
  return describeOperationPatchFields(operation, payload);
}

function describeOperationPatchFields(operation, patch) {
  if (!patch || typeof patch !== 'object') return [];
  const handledRoots = new Set();
  const fields = [];
  if (patch.position) {
    fields.push(`position ${positionPreview(patch.position)}`);
    handledRoots.add('position');
  }
  if (Array.isArray(patch.attributes)) {
    fields.push(`attributes ${patch.attributes.length}`);
    handledRoots.add('attributes');
  }
  if (Array.isArray(patch.children)) {
    fields.push(`children ${patch.children.length}`);
    handledRoots.add('children');
  }
  const leafFields = draftPatchLeafPaths(patch)
    .filter(path => !handledRoots.has(String(path).split('.')[0]))
    .sort(compareDiffPaths)
    .map(path => {
      const field = propertyPathLabel(path);
      const value = getPathValue(patch, path);
      if (value === undefined || value === null || typeof value === 'object') return field;
      return `${field} ${valuePreview(value)}`;
    });
  return [...fields, ...leafFields];
}

function draftPatchLeafPaths(value, prefix = '') {
  if (Array.isArray(value)) return prefix ? [prefix] : [];
  if (!isPlainObject(value)) return prefix ? [prefix] : [];
  const entries = Object.entries(value);
  if (!entries.length) return prefix ? [prefix] : [];
  return [...new Set(entries.flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child)) return draftPatchLeafPaths(child, path);
    return [path];
  }))];
}

function renderCollaborationChangeSummary(draft, operations = []) {
  const changedAt = draft?.updatedAt || draft?.timestamp || operations.find(operation => operation?.updatedAt || operation?.timestamp)?.updatedAt || operations.find(operation => operation?.updatedAt || operation?.timestamp)?.timestamp || '';
  const hasCurrentModel = hasCurrentDraftModelSnapshot(draft);
  const hasOperations = operations.length > 0;
  const currentChanges = (hasOperations
    ? operations.map(operation => describeDraftOperation(operation, draft))
    : (hasCurrentModel ? summarizeCollaborationDifferencesCached(draft) : []))
    .map(change => withChangeTimestamp(change, changedAt));
  const changes = applyCollaborationChangeHistory(draft, currentChanges, changedAt);
  const title = hasOperations ? 'Remote operations' : 'Remote changes vs mine';
  const empty = isEditingRemoteDraft(draft)
    ? (draft?.modelOmitted ? 'Waiting for the next operation or full draft snapshot.' : 'No diagram differences detected.')
    : 'No unsaved diagram changes.';
  return `
    <div class="collaboration-diff">
      <div class="collaboration-section-title">${escapeHtml(title)}</div>
      <ul class="collaboration-operation-list">
        ${changes.length
          ? changes.map(renderCollaborationChangeItem).join('')
          : `<li class="change-none">${escapeHtml(empty)}</li>`}
      </ul>
    </div>
  `;
}

function summarizeCollaborationDifferencesCached(draft) {
  const localKey = modelSnapshotKey();
  const draftKey = draft?.modelSnapshotKey || draft?.updatedAt || draft?.timestamp || '';
  const cacheKey = `${draft?.modelName || ''}::${draft?.clientId || ''}::${draftKey}::${localKey}`;
  if (collaborationDiffCache.has(cacheKey)) {
    countCollaborationPerformance('diff.cache.hit');
    return cloneValue(collaborationDiffCache.get(cacheKey));
  }
  const startedAt = collaborationPerfNow();
  const changes = summarizeCollaborationDifferences(getData(), draft.model, { limit: COLLABORATION_DIFF_DEFAULT_LIMIT });
  recordCollaborationPerformance('diff.compute', startedAt, {
    changes: changes.length,
    truncated: changes.some(change => change?.kind === 'more')
  });
  collaborationDiffCache.set(cacheKey, cloneValue(changes));
  while (collaborationDiffCache.size > 32) {
    const firstKey = collaborationDiffCache.keys().next().value;
    collaborationDiffCache.delete(firstKey);
  }
  return changes;
}

function applyCollaborationChangeHistory(draft, changes, fallbackTimestamp = '') {
  const historyKey = collaborationHistoryKey(draft);
  if (!historyKey) return changes.map(change => withChangeTimestamp(change, fallbackTimestamp));

  const history = collaborationChangeHistory.get(historyKey) || new Map();
  collaborationChangeHistory.set(historyKey, history);
  const seen = new Set();
  return changes.map(change => {
    const normalized = withChangeTimestamp(change, fallbackTimestamp);
    const key = collaborationChangeKey(normalized);
    if (seen.has(key)) return null;
    seen.add(key);
    const existing = history.get(key);
    if (existing) {
      const timestamp = existing.timestamp || normalized.timestamp || fallbackTimestamp || '';
      const preserved = {
        ...normalized,
        key,
        timestamp,
        firstSeenAt: existing.firstSeenAt || timestamp,
        lastSeenAt: fallbackTimestamp || normalized.timestamp || existing.lastSeenAt || timestamp,
        timeLabel: formatChangeTimestamp(timestamp)
      };
      history.set(key, preserved);
      return preserved;
    }
    const timestamp = normalized.timestamp || fallbackTimestamp || new Date().toISOString();
    const firstSeen = {
      ...normalized,
      key,
      timestamp,
      firstSeenAt: timestamp,
      lastSeenAt: fallbackTimestamp || timestamp,
      timeLabel: formatChangeTimestamp(timestamp)
    };
    history.set(key, firstSeen);
    return firstSeen;
  }).filter(Boolean);
}

function collaborationHistoryKey(draft) {
  const clientId = draft?.clientId || '';
  const modelName = draft?.modelName || getSelectedCollaborationModelName() || '';
  return clientId && modelName ? `${modelName}::${clientId}` : '';
}

function collaborationChangeKey(change) {
  return String(change?.key || `${change?.kind || 'updated'}::${change?.text || ''}`);
}

function clearCollaborationChangeHistory(draftOrClientId = null, modelName = '') {
  if (!draftOrClientId && !modelName) {
    collaborationChangeHistory.clear();
    collaborationDiffCache.clear();
    return;
  }
  const draft = typeof draftOrClientId === 'object'
    ? draftOrClientId
    : { clientId: draftOrClientId, modelName: modelName || getSelectedCollaborationModelName() };
  const key = collaborationHistoryKey(draft);
  if (key) collaborationChangeHistory.delete(key);
  if (key) {
    [...collaborationDiffCache.keys()].forEach(cacheKey => {
      if (cacheKey.startsWith(`${key}::`)) collaborationDiffCache.delete(cacheKey);
    });
  }
}

function renderCollaborationChangeItem(change) {
  const kind = escapeHtml(change.kind || 'updated');
  const text = escapeHtml(change.text || change);
  const timestamp = change.timestamp || '';
  const timeLabel = escapeHtml(change.timeLabel || formatChangeTimestamp(timestamp));
  const datetime = timestamp ? ` datetime="${escapeHtml(timestamp)}"` : '';
  return `<li class="change-${kind}"><time class="collaboration-change-time"${datetime}>${timeLabel}</time><span class="collaboration-change-text">${text}</span></li>`;
}

function withChangeTimestamp(change, fallbackTimestamp = '') {
  const normalized = typeof change === 'string' ? { kind: 'updated', text: change } : { ...change };
  const timestamp = normalized.timestamp || normalized.updatedAt || normalized.time || fallbackTimestamp || '';
  return {
    ...normalized,
    timestamp,
    timeLabel: normalized.timeLabel || formatChangeTimestamp(timestamp)
  };
}

function formatChangeTimestamp(value) {
  if (!value) return 'time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function operationTypeLabel(type) {
  return String(type || 'operation')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function describePatchFields(patch) {
  return [...changedPathsBetween({}, patch)]
    .sort(compareDiffPaths)
    .map(propertyPathLabel);
}

function summarizeCollaborationDifferences(localModel, remoteModel, options = {}) {
  const limit = typeof options === 'number'
    ? options
    : (Number.isFinite(Number(options?.limit)) ? Number(options.limit) : COLLABORATION_DIFF_DEFAULT_LIMIT);
  const collector = createBoundedChangeCollector(limit);
  compareModelMetadataDifferences(localModel, remoteModel, collector);
  if (collector.shouldContinue()) {
    compareClassDifferences(localModel, remoteModel, collector);
  }
  if (collector.shouldContinue()) {
    compareLinkDifferences(localModel, remoteModel, collector);
  }
  const changes = collector.toArray();
  if (collector.truncated) changes.push({ kind: 'more', text: 'More changes not shown' });
  return changes;
}

function compareModelMetadataDifferences(localModel, remoteModel, changes) {
  if (!changes.shouldContinue()) return;
  const localMetadata = comparableMetadataForDiff(localModel?.metadata);
  const remoteMetadata = comparableMetadataForDiff(remoteModel?.metadata);
  const paths = [...changedPathsBetween(localMetadata, remoteMetadata)].sort(compareDiffPaths);
  for (const path of paths) {
    if (!changes.shouldContinue()) return;
    if (!changes.push({
      kind: 'updated',
      text: `Changed model ${describePropertyDelta(localMetadata, remoteMetadata, path)}`
    })) return;
  }
}

function comparableMetadataForDiff(metadata = {}) {
  const source = metadata && typeof metadata === 'object' ? metadata : {};
  return {
    sceneSettings: source.sceneSettings || null,
    layout: source.layout || null,
    font: source.font || null,
    fit: source.fit || source.view || null
  };
}

function compareClassDifferences(localModel, remoteModel, changes) {
  const localById = mapClassItems(localModel);
  const remoteById = mapClassItems(remoteModel);
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  for (const id of ids) {
    if (!changes.shouldContinue()) return;
    const localNode = localById.get(id);
    const remoteNode = remoteById.get(id);
    if (!localNode && remoteNode) {
      if (!changes.push({ kind: 'added', text: `Added ${classKindLabel(remoteNode)} ${nodeDisplayName(remoteNode)}` })) return;
      compareAttributeDifferences(null, remoteNode, changes);
      continue;
    }
    if (localNode && !remoteNode) {
      if (!changes.push({ kind: 'removed', text: `Removed ${classKindLabel(localNode)} ${nodeDisplayName(localNode)}` })) return;
      continue;
    }
    if (!localNode || !remoteNode) continue;

    compareNodePropertyDifferences(localNode, remoteNode, changes);
    compareAttributeDifferences(localNode, remoteNode, changes);
  }
}

function compareNodePropertyDifferences(localNode, remoteNode, changes) {
  if (!changes.shouldContinue()) return;
  const localComparable = comparableNodeForDiff(localNode);
  const remoteComparable = comparableNodeForDiff(remoteNode);
  const paths = [...changedPathsBetween(localComparable, remoteComparable)].sort(compareDiffPaths);
  if (!paths.length) return;
  if (paths.some(isPositionPath)) {
    if (!changes.push({
      kind: 'moved',
      text: `Moved ${classKindLabel(remoteNode)} ${nodeDisplayName(remoteNode)} position: ${positionPreview(localNode.position)} -> ${positionPreview(remoteNode.position)}`
    })) return;
  }
  for (const path of paths) {
    if (isPositionPath(path)) continue;
    if (!changes.push({
      kind: 'updated',
      text: `Changed ${classKindLabel(remoteNode)} ${nodeDisplayName(remoteNode)} ${describePropertyDelta(localNode, remoteNode, path)}`
    })) return;
  }
}

function comparableNodeForDiff(node) {
  if (!node || typeof node !== 'object') return node;
  const comparable = { ...node };
  delete comparable.attributes;
  return comparable;
}

function compareAttributeDifferences(localNode, remoteNode, changes) {
  if (!changes.shouldContinue()) return;
  const localMap = mapAttributeItems(localNode);
  const remoteMap = mapAttributeItems(remoteNode);
  const keys = new Set([...localMap.keys(), ...remoteMap.keys()]);
  for (const key of keys) {
    if (!changes.shouldContinue()) return;
    const localAttr = localMap.get(key);
    const remoteAttr = remoteMap.get(key);
    if (!localAttr && remoteAttr) {
      if (!changes.push({
        kind: 'added',
        text: `Added attribute ${attributePath(remoteNode, remoteAttr)}`
      })) return;
      continue;
    }
    if (localAttr && !remoteAttr) {
      if (!changes.push({
        kind: 'removed',
        text: `Removed attribute ${attributePath(localNode, localAttr)}`
      })) return;
      continue;
    }
    if (!localAttr || !remoteAttr || valuesEqual(localAttr.attribute, remoteAttr.attribute)) continue;
    const deltas = describeAttributeDeltas(localAttr.attribute, remoteAttr.attribute);
    if (!deltas.length) {
      if (!changes.push({
        kind: 'updated',
        text: `Changed attribute ${attributePath(remoteNode, remoteAttr)}`
      })) return;
      continue;
    }
    for (const delta of deltas) {
      if (!changes.push({
        kind: 'updated',
        text: `Changed attribute ${attributePath(remoteNode, remoteAttr)} ${delta}`
      })) return;
    }
  }
}

function compareLinkDifferences(localModel, remoteModel, changes) {
  if (!changes.shouldContinue()) return;
  const localById = mapLinkItems(localModel);
  const remoteById = mapLinkItems(remoteModel);
  const localNodeMap = mapClassItems(localModel);
  const remoteNodeMap = mapClassItems(remoteModel);
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  for (const id of ids) {
    if (!changes.shouldContinue()) return;
    const localLink = localById.get(id);
    const remoteLink = remoteById.get(id);
    if (!localLink && remoteLink) {
      if (!changes.push({ kind: 'added', text: `Added link ${linkDisplayName(remoteLink, remoteNodeMap)}` })) return;
      continue;
    }
    if (localLink && !remoteLink) {
      if (!changes.push({ kind: 'removed', text: `Removed link ${linkDisplayName(localLink, localNodeMap)}` })) return;
      continue;
    }
    if (localLink && remoteLink && !valuesEqual(localLink, remoteLink)) {
      const deltas = describePathDeltas(localLink, remoteLink, {
        localNodeMap,
        remoteNodeMap
      });
      if (!deltas.length) {
        if (!changes.push({ kind: 'updated', text: `Changed link ${linkDisplayName(remoteLink, remoteNodeMap)}` })) return;
        continue;
      }
      for (const delta of deltas) {
        if (!changes.push({
          kind: 'updated',
          text: `Changed link ${linkDisplayName(remoteLink, remoteNodeMap)} ${delta}`
        })) return;
      }
    }
  }
}

function mapClassItems(model) {
  return new Map((model?.hypergraph?.class || [])
    .filter(item => item?.id != null)
    .map(item => [String(item.id), item]));
}

function mapLinkItems(model) {
  return new Map((model?.hypergraph?.link || [])
    .map((item, index) => [linkDiffKey(item, index), item]));
}

function mapAttributeItems(node) {
  return new Map((node?.attributes || [])
    .map((attribute, index) => [attributeDiffKey(attribute, index), { attribute, index }]));
}

function attributeDiffKey(attribute, index) {
  if (attribute && typeof attribute === 'object' && attribute.id != null) return `id:${attribute.id}`;
  return `idx:${index}`;
}

function linkDiffKey(link, index) {
  if (link?.id != null) return `id:${link.id}`;
  return `route:${link?.sourceClassId || ''}->${link?.targetClassId || ''}:${link?.name || link?.rendering?.labelText || index}`;
}

function classKindLabel(node) {
  return node?.type === 'hyperclass' ? 'hyperclass' : 'class';
}

function nodeDisplayName(node) {
  return valuePreview(node?.name || node?.label || node?.title || node?.id || 'unnamed');
}

function attributePath(owner, entry) {
  return `${classKindLabel(owner)} ${nodeDisplayName(owner)}.${valuePreview(attributeDisplayName(entry.attribute, entry.index))}`;
}

function linkDisplayName(link, nodeMap = null) {
  const label = valuePreview(link?.rendering?.labelText || link?.name || link?.id || `${link?.sourceClassId || '?'} -> ${link?.targetClassId || '?'}`);
  const source = linkEndpointLabel(link?.sourceClassId, nodeMap);
  const target = linkEndpointLabel(link?.targetClassId, nodeMap);
  return source || target ? `${label} (${source || '?'} -> ${target || '?'})` : label;
}

function describeValueDelta(localValue, remoteValue) {
  const fields = changedValueFields(localValue, remoteValue);
  if (!fields.length) return '';
  if (fields.length === 1 && fields[0] === 'value') {
    return ` (${valuePreview(localValue)} -> ${valuePreview(remoteValue)})`;
  }
  return ` (${fields.slice(0, 3).join(', ')}${fields.length > 3 ? ', ...' : ''})`;
}

function describeAttributeDeltas(localValue, remoteValue) {
  return describePathDeltas(localValue, remoteValue);
}

function describePathDeltas(localValue, remoteValue, context = {}) {
  const paths = [...changedPathsBetween(localValue, remoteValue)].sort(compareDiffPaths);
  return paths.map(path => describePropertyDelta(localValue, remoteValue, path, context));
}

function describePropertyDelta(localValue, remoteValue, path, context = {}) {
  const label = propertyPathLabel(path);
  return `${label}: ${formatDiffValue(getPathValue(localValue, path), path, context, 'local')} -> ${formatDiffValue(getPathValue(remoteValue, path), path, context, 'remote')}`;
}

function propertyPathLabel(path) {
  const labels = {
    '$': 'value',
    'sourceClassId': 'source',
    'targetClassId': 'target',
    'rendering.labelText': 'label text',
    'rendering.lineColor': 'line color',
    'rendering.lineWidth': 'line width',
    'rendering.lineStyle': 'line style',
    'rendering.routePoints': 'route points',
    'rendering.orthogonalStyle': 'orthogonal routing',
    'rendering.orthogonalClearance': 'orthogonal clearance',
    'rendering.parallelRouteGap': 'parallel route gap',
    'rendering.globalRouteGap': 'global route gap',
    'rendering.obstacleRouteGap': 'obstacle route gap',
    'rendering.arrowheadVisibility': 'arrowhead visibility',
    'rendering.arrowheadType': 'arrowhead type',
    'rendering.arrowheadSize': 'arrowhead size',
    'rendering.arrowheadScale': 'arrowhead scale',
    'rendering.maxArrowheadSize': 'max arrowhead size',
    'rendering.sourcePortSide': 'source port side',
    'rendering.targetPortSide': 'target port side',
    'rendering.class.color': 'class fill color',
    'rendering.class.metallicColor': 'class metallic color',
    'rendering.class.material': 'class material',
    'rendering.class.metalness': 'class metalness',
    'rendering.class.roughness': 'class roughness',
    'rendering.class.emissiveIntensity': 'class glow',
    'rendering.class.borderColor': 'class border color',
    'rendering.class.borderWidth': 'class border width',
    'rendering.class.cornerRadius': 'class corner radius',
    'rendering.class.opacity': 'class opacity',
    'rendering.class.bodyType': 'class body type',
    'rendering.class.shapeType': 'class shape',
    'rendering.attributes.checkboxColor': 'attribute checkbox color',
    'rendering.attributes.checkboxMaterial': 'attribute checkbox material',
    'rendering.attributes.shape': 'attribute shape',
    'rendering.attributes.size.width': 'attribute width',
    'rendering.attributes.size.height': 'attribute height',
    'rendering.connections.lineColor': 'attribute connection color',
    'rendering.connections.lineWidth': 'attribute connection width',
    'rendering.textColor': 'text color',
    'rendering.font.size': 'font size',
    'rendering.font.family': 'font family',
    'rendering.font.bold': 'font bold',
    'rendering.font.italic': 'font italic',
    'rendering.font.underline': 'font underline',
    'parentClassId': 'parent hyperclass'
  };
  if (labels[path]) return labels[path];
  return String(path || 'value')
    .replace(/\./g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatDiffValue(value, path, context = {}, side = 'remote') {
  if (path === 'sourceClassId' || path === 'targetClassId' || path === 'parentClassId') {
    const nodeMap = side === 'local' ? context.localNodeMap : context.remoteNodeMap;
    return linkEndpointLabel(value, nodeMap) || valuePreview(value);
  }
  if (isPositionPath(path) || path === 'position') return positionPreview(value);
  return valuePreview(value);
}

function linkEndpointLabel(id, nodeMap = null) {
  if (id == null || id === '') return '';
  const node = nodeMap?.get(String(id));
  return node ? `${nodeDisplayName(node)} [${valuePreview(id)}]` : valuePreview(id);
}

function isPositionPath(path) {
  return path === 'position' || String(path || '').startsWith('position.');
}

function positionPreview(position) {
  if (!position || typeof position !== 'object') return valuePreview(position);
  const parts = ['x', 'y', 'z']
    .filter(axis => position[axis] != null)
    .map(axis => `${axis}=${formatDiffNumber(position[axis])}`);
  return parts.length ? `(${parts.join(', ')})` : valuePreview(position);
}

function formatDiffNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return valuePreview(value);
  return String(Number(number.toFixed(4)));
}

function compareDiffPaths(left, right) {
  const priority = path => {
    if (isPositionPath(path)) return 0;
    if (path === 'name') return 1;
    if (path === 'sourceClassId' || path === 'targetClassId') return 2;
    if (String(path).startsWith('rendering.')) return 3;
    return 4;
  };
  const leftPriority = priority(left);
  const rightPriority = priority(right);
  return leftPriority - rightPriority || String(left).localeCompare(String(right));
}

function changedValueFields(localValue, remoteValue) {
  if (isPlainObject(localValue) && isPlainObject(remoteValue)) {
    return [...new Set([...Object.keys(localValue), ...Object.keys(remoteValue)])]
      .filter(key => !valuesEqual(localValue[key], remoteValue[key]));
  }
  return valuesEqual(localValue, remoteValue) ? [] : ['value'];
}

function valuePreview(value) {
  if (value == null || value === '') return '(blank)';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

function describeDraftSelection(draft) {
  const selection = draft?.selection || {};
  if (!selection || !draft?.model) return selection.selectedElementId || selection.classId || selection.linkId || '';
  const modelNodes = draft.model?.hypergraph?.class || [];
  const modelLinks = draft.model?.hypergraph?.link || [];
  if (selection.selectedAttributeOwnerId && selection.selectedAttributeKey != null) {
    const owner = modelNodes.find(node => sameId(node.id, selection.selectedAttributeOwnerId));
    const attrs = owner?.attributes || [];
    const attrIndex = attrs.findIndex((attribute, index) => sameId(attributeKeyFor(attribute, index), selection.selectedAttributeKey));
    if (owner && attrIndex >= 0) return `attribute ${attributePath(owner, { attribute: attrs[attrIndex], index: attrIndex })}`;
  }
  if (selection.selectedLinkId || selection.linkId) {
    const selectedLinkId = selection.selectedLinkId || selection.linkId;
    const link = modelLinks.find(item => sameId(item.id, selectedLinkId));
    if (link) return `link ${linkDisplayName(link)}`;
    return `link ${valuePreview(selectedLinkId)} (deleted)`;
  }
  const id = selection.selectedElementId || selection.classId;
  const node = modelNodes.find(item => sameId(item.id, id));
  return node ? `${classKindLabel(node)} ${nodeDisplayName(node)}` : (id || '');
}

function scheduleLocalDraftPublish(reason = 'Updated draft', options = {}) {
  localDraftDirty = Boolean(savedSnapshotKey);
  updateSaveStatus({ dirty: localDraftDirty });
  if (options.operationsTracked !== true) {
    invalidateLocalDraftOperations('untracked');
    recordUntrackedDraftDisplayOperation(reason);
  }
  const modelName = getSelectedCollaborationModelName();
  if (!COLLABORATION_ENABLED || !serverConnected || !serverEvents || !modelName) return;
  if (scheduledDraftPublish) countCollaborationPerformance('draft.coalesced.scheduled');
  scheduledDraftPublish = coalesceDraftPublishRequest(scheduledDraftPublish, { reason, options: {} });
  window.clearTimeout(draftPublishTimer);
  draftPublishTimer = window.setTimeout(() => {
    const request = scheduledDraftPublish || { reason, options: {} };
    scheduledDraftPublish = null;
    void publishLocalDraft(request.reason, request.options);
  }, COLLABORATION_DRAFT_PUBLISH_DELAY_MS);
}

async function publishLocalDraft(reason = 'Updated draft', options = {}) {
  const modelName = getSelectedCollaborationModelName();
  if (!COLLABORATION_ENABLED || !serverConnected || !serverEvents || !modelName) return;
  if (draftPublishInFlight) {
    countCollaborationPerformance('draft.coalesced.inflight');
    pendingDraftPublish = coalesceDraftPublishRequest(pendingDraftPublish, { reason, options });
    return;
  }
  draftPublishInFlight = true;
  const startedAt = collaborationPerfNow();
  let draftMode = 'unknown';
  try {
    const isDirty = options.dirty !== false;
    draftMode = isDirty ? 'editing' : 'presence';
    const draftBuild = isDirty || options.forceSnapshot === true || options.forcePreview === true
      ? await buildDirtyDraftPayload(modelName, reason, options)
      : buildPresenceDraftPayload(reason);
    if (!draftBuild) return;
    const { payload: draftPayload, modelDecision } = draftBuild;
    if (getSelectedCollaborationModelName() !== modelName) {
      countCollaborationPerformance('draft.skipped.stale_model');
      return;
    }
    const signature = draftPublishSignature(modelName, draftPayload);
    if (!options.forcePublish && signature === lastPublishedDraftSignature) {
      countCollaborationPerformance('draft.skipped.duplicate');
      return;
    }
    const networkStartedAt = collaborationPerfNow();
    const result = await withCollaborationWorkStatus('sync', () => publishServerDraft(modelName, draftPayload, {
      clientId: serverEvents.clientId,
      clientName: getCollaborationClientName(),
      draftScope: COLLABORATION_DRAFT_SCOPE,
      timeoutMs: 2500
    }), { showAfterMs: 1200 });
    recordCollaborationPerformance('draft.network', networkStartedAt, { mode: draftMode });
    if (!result.ok) {
      throw new Error(result.error?.message || 'Server rejected draft update');
    }
    if (modelDecision.include) {
      lastCollaborationDraftSnapshotAt = Date.now();
      lastCollaborationDraftSnapshotKey = draftPayload.modelSnapshotKey;
      lastCollaborationDraftSnapshotModelName = modelName;
    }
    lastPublishedDraftSignature = signature;
    localDraftModelName = modelName;
  } catch (error) {
    countCollaborationPerformance('draft.failed');
    addLog(`Draft publish failed: ${error?.message || String(error)}`);
  } finally {
    recordCollaborationPerformance('draft.publish', startedAt, { mode: draftMode });
    draftPublishInFlight = false;
    if (pendingDraftPublish) {
      const request = pendingDraftPublish;
      pendingDraftPublish = null;
      window.clearTimeout(draftPublishTimer);
      draftPublishTimer = window.setTimeout(() => {
        void publishLocalDraft(request.reason, request.options);
      }, COLLABORATION_DRAFT_PUBLISH_BACKOFF_MS);
    }
  }
}

async function buildDirtyDraftPayload(modelName, reason, options = {}) {
  const startedAt = collaborationPerfNow();
  await yieldToBrowser();
  const snapshot = cloneValue(prepareSceneSnapshot(ctx(), { updateFitMetadata: false }));
  if (getSelectedCollaborationModelName() !== modelName) {
    countCollaborationPerformance('draft.skipped.stale_model');
    recordCollaborationPerformance('draft.build.dirty', startedAt, { result: 'stale-model' });
    return null;
  }
  const snapshotKey = modelSnapshotKey(snapshot);
  const modelBytes = estimateDraftModelBytes(snapshot);
  const modelDecision = shouldIncludeDraftModel({
    dirty: true,
    force: options.forceSnapshot === true,
    model: snapshot,
    modelBytes,
    modelName,
    snapshotKey,
    lastSnapshotAt: lastCollaborationDraftSnapshotAt,
    lastSnapshotKey: lastCollaborationDraftSnapshotKey,
    lastModelName: lastCollaborationDraftSnapshotModelName
  });
  const previewDecision = shouldBuildDraftPreview({
    dirty: true,
    force: options.forcePreview === true,
    hasCachedPreview: Boolean(lastCollaborationPreviewSnapshot),
    lastPreviewAt: lastCollaborationPreviewSnapshotAt
  });
  await yieldToBrowser();
  if (getSelectedCollaborationModelName() !== modelName) {
    countCollaborationPerformance('draft.skipped.stale_model');
    recordCollaborationPerformance('draft.build.dirty', startedAt, { result: 'stale-model' });
    return null;
  }
  const preview = previewDecision.include
    ? await buildCollaborationPreviewSnapshot({ force: options.forcePreview === true })
    : null;
  const result = {
    modelDecision,
    payload: {
      clientName: getCollaborationClientName(),
      baseModelRevision: snapshot?.metadata?.revision || snapshot?.metadata?.contentHash || '',
      mode: 'editing',
      dirty: true,
      isDirty: true,
      model: modelDecision.include ? snapshot : undefined,
      modelOmitted: !modelDecision.include,
      modelOmittedReason: modelDecision.include ? '' : modelDecision.reason,
      modelPayloadBytes: modelDecision.modelBytes,
      modelSnapshotKey: snapshotKey,
      previewOmitted: !previewDecision.include,
      previewOmittedReason: previewDecision.include ? '' : previewDecision.reason,
      operations: draftOperationsForPublish(),
      selection: getDraftSelection(),
      viewport: getSerializableViewState(),
      preview: preview || { kind: 'model-preview', label: 'Model Preview' },
      summary: summarizeModel(snapshot),
      status: reason || 'Editing'
    }
  };
  recordCollaborationPerformance('draft.build.dirty', startedAt, {
    modelIncluded: modelDecision.include,
    previewIncluded: previewDecision.include,
    modelBytes: modelDecision.modelBytes,
    operations: result.payload.operations.length
  });
  return result;
}

function buildPresenceDraftPayload(reason = 'Viewing model') {
  const startedAt = collaborationPerfNow();
  const model = getData();
  const modelRevision = model?.metadata?.revision || model?.metadata?.contentHash || '';
  const result = {
    modelDecision: { include: false, reason: 'presence', modelBytes: 0 },
    payload: {
      clientName: getCollaborationClientName(),
      baseModelRevision: modelRevision,
      mode: 'presence',
      dirty: false,
      isDirty: false,
      model: undefined,
      modelOmitted: true,
      modelOmittedReason: 'presence',
      modelPayloadBytes: 0,
      modelSnapshotKey: modelRevision || savedSnapshotKey || '',
      previewOmitted: true,
      previewOmittedReason: 'presence',
      operations: [],
      selection: getDraftSelection(),
      viewport: getSerializableViewState(),
      preview: { kind: 'model-preview', label: 'Model Preview' },
      summary: summarizeModel(model),
      status: reason || 'Viewing model'
    }
  };
  recordCollaborationPerformance('draft.build.presence', startedAt);
  return result;
}

async function publishLocalPresenceDraft(reason = 'Viewing model') {
  await publishLocalDraft(reason, { dirty: false });
}

function yieldToBrowser(options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 80;
  return new Promise(resolve => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: timeoutMs });
      return;
    }
    requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function getDraftSelection() {
  return {
    selectedElementId,
    selectedElementIds: [...selectedElementIds],
    selectedAttributeOwnerId,
    selectedAttributeKey,
    selectedLinkId,
    selectedLinkSourceId,
    selectedLinkTargetId
  };
}

function getSerializableViewState() {
  if (!camera || !orbitControls) return null;
  return {
    position: vectorToPlain(camera.position),
    target: vectorToPlain(orbitControls.target),
    zoom: camera.zoom
  };
}

function vectorToPlain(vector) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4))
  };
}

function resetLocalDraftPublishState() {
  window.clearTimeout(draftPublishTimer);
  draftPublishTimer = null;
  scheduledDraftPublish = null;
  pendingDraftPublish = null;
  lastPublishedDraftSignature = '';
  clearLocalDraftOperations();
}

async function clearLocalServerDraft(modelName = localDraftModelName || getSelectedCollaborationModelName()) {
  resetLocalDraftPublishState();
  if (!COLLABORATION_ENABLED || !serverConnected || !modelName || !serverEvents) return;
  try {
    await clearServerDraft(modelName, {
      clientId: serverEvents.clientId,
      draftScope: COLLABORATION_DRAFT_SCOPE,
      timeoutMs: 1500
    });
    if (localDraftModelName === modelName) localDraftModelName = '';
  } catch {
    // The draft is in-memory server state; failed cleanup is non-blocking.
  }
}

async function loadRemoteDraftsForCurrentModel(options = {}) {
  const modelName = options.modelName || getSelectedCollaborationModelName();
  remoteDrafts.clear();
  collaborationLivePreviewZoomByDraft.clear();
  clearCollaborationChangeHistory();
  selectedRemoteClientId = '';
  if (!COLLABORATION_ENABLED || !serverConnected || !modelName) {
    updateCollaborationPanel();
    scheduleRemoteDraftRefreshLoop();
    return;
  }
  await refreshRemoteDraftsForCurrentModel({ immediate: true, modelName });
  scheduleRemoteDraftRefreshLoop();
}

async function refreshRemoteDraftsForCurrentModel(options = {}) {
  const modelName = options.modelName || getSelectedCollaborationModelName();
  if (!COLLABORATION_ENABLED || !serverConnected || !modelName || remoteDraftRefreshInFlight) return;
  remoteDraftRefreshInFlight = true;
  const startedAt = collaborationPerfNow();
  const finishStatus = startCollaborationWorkStatus('sync', {
    showAfterMs: options.immediate === true ? COLLABORATION_STATUS_SHOW_AFTER_MS : 1400
  });
  try {
    const result = await listServerDrafts(modelName, {
      draftScope: COLLABORATION_DRAFT_SCOPE,
      compact: options.immediate !== true,
      excludeClientId: serverEvents?.clientId || '',
      timeoutMs: 2500
    });
    if (getSelectedCollaborationModelName() !== modelName) {
      countCollaborationPerformance('draft.remote_refresh.stale_model');
      return;
    }
    if (result.ok) {
      const seenClientIds = new Set();
      (result.data?.drafts || [])
        .filter(draft => draft.clientId && draft.clientId !== serverEvents?.clientId)
        .forEach(draft => {
          seenClientIds.add(draft.clientId);
          storeRemoteDraft(draft);
        });
      removeMissingRemoteDrafts(modelName, seenClientIds);
      scheduleCollaborationPanelUpdate({ immediate: options.immediate === true });
    } else {
      countCollaborationPerformance('draft.remote_refresh.failed');
    }
  } finally {
    recordCollaborationPerformance('draft.remote_refresh', startedAt, { immediate: options.immediate === true });
    remoteDraftRefreshInFlight = false;
    finishStatus();
  }
}

function handleServerDraftUpdated(event) {
  if (!event?.clientId || event.clientId === serverEvents?.clientId) return;
  const currentName = getSelectedCollaborationModelName();
  if (!currentName || event.modelName !== currentName) return;
  storeRemoteDraft(event);
  scheduleCollaborationPanelUpdate();
}

function handleServerDraftCleared(event) {
  if (!event?.clientId || event.clientId === serverEvents?.clientId) return;
  clearCollaborationChangeHistory(event.clientId, event.modelName);
  clearCollaborationLivePreviewZoomForClient(event.clientId);
  remoteDrafts.delete(event.clientId);
  scheduleCollaborationPanelUpdate();
}

function handleServerClientLeft(event) {
  if (!event?.clientId || event.clientId === serverEvents?.clientId) return;
  clearCollaborationChangeHistory(event.clientId);
  clearCollaborationLivePreviewZoomForClient(event.clientId);
  remoteDrafts.delete(event.clientId);
  scheduleCollaborationPanelUpdate();
}

async function captureRemoteSavedModel(event) {
  const currentName = getSelectedServerModelName();
  if (!currentName || event.modelName !== currentName) return;
  const result = await withCollaborationWorkStatus('sync', () => loadServerModel(currentName, { timeoutMs: 6000 }));
  if (!result.ok) return;
  const clientId = event.clientId || `server-${event.sequence || Date.now()}`;
  storeRemoteDraft({
    clientId,
    clientName: event.clientId ? `Saved by ${event.clientId}` : 'Server update',
    modelName: currentName,
    model: result.data.model,
    baseModelRevision: event.revision || event.modelRevision || '',
    mode: 'editing',
    dirty: true,
    isDirty: true,
    operations: event.operations || [],
    summary: summarizeModel(result.data.model),
    status: 'Saved server version',
    updatedAt: event.timestamp || new Date().toISOString()
  });
  setCollaborationWarning(true, 'A remote save is available. Choose Merge Both, Use Theirs, or Keep Mine before saving.');
  updateCollaborationPanel();
}

async function applySelectedRemoteDraft() {
  const draft = selectedRemoteDraft();
  if (!hasCurrentDraftModelSnapshot(draft)) {
    showToast('Selected user has no current draft snapshot');
    return;
  }
  await withCollaborationWorkStatus('apply', async () => {
    await yieldToBrowser();
    await setData(draft.model, { context: ctx(), refresh: true });
    selectedElementId = draft.selection?.selectedElementId || null;
    selectedAttributeOwnerId = draft.selection?.selectedAttributeOwnerId || selectedElementId;
    selectedAttributeKey = draft.selection?.selectedAttributeKey || null;
    selectedLinkId = draft.selection?.selectedLinkId || null;
    selectedLinkSourceId = draft.selection?.selectedLinkSourceId || null;
    selectedLinkTargetId = draft.selection?.selectedLinkTargetId || null;
    syncCountersFromData();
    setCollaborationWarning(false);
    collaborationBaseModel = cloneValue(draft.model);
    clearCollaborationChangeHistory(draft);
    remoteDrafts.delete(draft.clientId);
    updateCollaborationPanel();
    await refreshWorkspace(`Applied ${draft.clientName || draft.clientId}`, {
      refresh: false,
      optimize: false,
      fit: false
    });
  });
}

async function mergeSelectedRemoteDraft() {
  const draft = selectedRemoteDraft();
  const currentName = getSelectedServerModelName();
  if (!draft) return;

  const allOperations = Array.isArray(draft.operations) ? draft.operations : [];
  const operations = mergeableDraftOperations(allOperations);
  if (operations.length > 0 && operations.length === allOperations.length && draft.baseModelRevision) {
    if (!currentName) {
      showToast('Operation merge is available only for server models');
      return;
    }
    const result = await withCollaborationWorkStatus('merge', () => applyServerModelOperations(currentName, operations, {
      baseModelRevision: draft.baseModelRevision,
      timeoutMs: 8000
    }));
    if (result.ok) {
      await withCollaborationWorkStatus('apply', async () => {
        const loaded = await loadServerModel(currentName, { timeoutMs: 6000 });
        if (loaded.ok) await setData(loaded.data.model, { context: ctx(), refresh: true });
        localDraftDirty = false;
        clearCollaborationChangeHistory(draft);
        remoteDrafts.delete(draft.clientId);
        updateCollaborationPanel();
        await refreshWorkspace(`Merged ${draft.clientName || draft.clientId}`, {
          refresh: false,
          optimize: false,
          fit: false,
          publishDraft: false
        });
      });
      return;
    }
    addLog(`Operation merge failed: ${result.error?.message || 'request failed'}`);
  }

  if (!hasCurrentDraftModelSnapshot(draft)) {
    showToast('Selected user has no current mergeable draft');
    return;
  }
  let baseModel = collaborationBaseModel ? cloneValue(collaborationBaseModel) : cloneValue(getData());
  if (currentName) {
    const baseResult = await withCollaborationWorkStatus('sync', () => loadServerModel(currentName, { timeoutMs: 6000 }));
    if (!baseResult.ok) throw new Error(baseResult.error?.message || 'Unable to load merge base');
    baseModel = baseResult.data.model;
  }
  const merge = await withCollaborationWorkStatus('merge', async () => {
    await yieldToBrowser();
    return mergeModelSnapshots(baseModel, cloneValue(getData()), draft.model);
  });
  if (merge.conflicts.length) {
    setCollaborationWarning(true, `Merge needs manual resolution: ${merge.conflicts.slice(0, 2).join('; ')}`);
    showToast('Merge conflict');
    return;
  }
  await withCollaborationWorkStatus('apply', async () => {
    await setData(merge.model, { context: ctx(), refresh: true });
    setCollaborationWarning(false);
    clearCollaborationChangeHistory(draft);
    remoteDrafts.delete(draft.clientId);
    updateCollaborationPanel();
    await refreshWorkspace(`Merged ${draft.clientName || draft.clientId}`, {
      refresh: false,
      optimize: false,
      fit: false
    });
  });
}

function mergeModelSnapshots(baseModel, leftModel, rightModel) {
  const conflicts = [];
  const merged = cloneValue(leftModel);
  merged.hypergraph = merged.hypergraph || {};
  merged.hypergraph.class = mergeElementArray(
    baseModel?.hypergraph?.class || [],
    leftModel?.hypergraph?.class || [],
    rightModel?.hypergraph?.class || [],
    conflicts,
    'class'
  );
  merged.hypergraph.link = mergeElementArray(
    baseModel?.hypergraph?.link || [],
    leftModel?.hypergraph?.link || [],
    rightModel?.hypergraph?.link || [],
    conflicts,
    'link'
  );
  return { model: merged, conflicts };
}

function mergeElementArray(baseItems, leftItems, rightItems, conflicts, label) {
  const baseById = mapByElementId(baseItems);
  const leftById = mapByElementId(leftItems);
  const rightById = mapByElementId(rightItems);
  const ids = new Set([...baseById.keys(), ...leftById.keys(), ...rightById.keys()]);
  const merged = [];

  ids.forEach(id => {
    const base = baseById.get(id);
    const left = leftById.get(id);
    const right = rightById.get(id);
    const mergedItem = mergeElement(base, left, right, `${label} ${id}`, conflicts);
    if (mergedItem) merged.push(mergedItem);
  });
  return merged;
}

function mapByElementId(items) {
  return new Map((items || []).filter(item => item?.id != null).map(item => [String(item.id), item]));
}

function mergeElement(base, left, right, label, conflicts) {
  if (!base) {
    if (left && right && !valuesEqual(left, right)) {
      conflicts.push(`${label} was created differently`);
      return left;
    }
    return cloneValue(left || right || null);
  }
  if (!left && !right) return null;
  if (!right) {
    if (valuesEqual(left, base)) return null;
    conflicts.push(`${label} was deleted remotely and edited locally`);
    return left;
  }
  if (!left) {
    if (valuesEqual(right, base)) return null;
    conflicts.push(`${label} was deleted locally and edited remotely`);
    return null;
  }

  const leftChanged = changedPathsBetween(base, left);
  const rightChanged = changedPathsBetween(base, right);
  const merged = cloneValue(left);
  for (const path of rightChanged) {
    if (leftChanged.has(path) && !valuesEqual(getPathValue(left, path), getPathValue(right, path))) {
      conflicts.push(`${label} changed ${path} on both sides`);
      continue;
    }
    setPathValue(merged, path, cloneValue(getPathValue(right, path)));
  }
  return merged;
}

function changedPathsBetween(base, value, prefix = '') {
  if (Array.isArray(base) || Array.isArray(value)) {
    return valuesEqual(base, value) ? new Set() : new Set([prefix || '$']);
  }
  if (isPlainObject(base) && isPlainObject(value)) {
    const paths = new Set();
    new Set([...Object.keys(base), ...Object.keys(value)]).forEach(key => {
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      changedPathsBetween(base[key], value[key], childPrefix).forEach(path => paths.add(path));
    });
    return paths;
  }
  return valuesEqual(base, value) ? new Set() : new Set([prefix || '$']);
}

function getPathValue(source, path) {
  if (path === '$') return source;
  return path.split('.').reduce((current, key) => current?.[key], source);
}

function setPathValue(target, path, value) {
  const keys = path.split('.');
  let current = target;
  keys.slice(0, -1).forEach(key => {
    if (!isPlainObject(current[key])) current[key] = {};
    current = current[key];
  });
  current[keys[keys.length - 1]] = value;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  appendSelectControl(appearance.body, {
    label: 'Material',
    path: ['rendering', 'class', 'material'],
    value: renderingClass.material || CLASS_2D_DEFAULTS.classMaterial,
    options: KNOWN_ENUMS.material,
    defaultValue: CLASS_2D_DEFAULTS.classMaterial
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
  appendSliderNumberControl(appearance.body, {
    label: 'Metalness',
    path: ['rendering', 'class', 'metalness'],
    value: renderingClass.metalness ?? CLASS_2D_DEFAULTS.classMetalness,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.classMetalness
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Roughness',
    path: ['rendering', 'class', 'roughness'],
    value: renderingClass.roughness ?? CLASS_2D_DEFAULTS.classRoughness,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.classRoughness
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Glow',
    path: ['rendering', 'class', 'emissiveIntensity'],
    value: renderingClass.emissiveIntensity ?? CLASS_2D_DEFAULTS.classEmissiveIntensity,
    min: 0,
    max: 1,
    step: 0.005,
    defaultValue: CLASS_2D_DEFAULTS.classEmissiveIntensity
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
  appendSelectControl(appearance.body, {
    label: 'Material',
    path: ['rendering', 'class', 'material'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'material'], renderingClass.material || CLASS_2D_DEFAULTS.classMaterial),
    options: KNOWN_ENUMS.material,
    defaultValue: CLASS_2D_DEFAULTS.classMaterial
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
  appendSliderNumberControl(appearance.body, {
    label: 'Metalness',
    path: ['rendering', 'class', 'metalness'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'metalness'], renderingClass.metalness ?? CLASS_2D_DEFAULTS.classMetalness),
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.classMetalness
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Roughness',
    path: ['rendering', 'class', 'roughness'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'roughness'], renderingClass.roughness ?? CLASS_2D_DEFAULTS.classRoughness),
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLASS_2D_DEFAULTS.classRoughness
  });
  appendSliderNumberControl(appearance.body, {
    label: 'Glow',
    path: ['rendering', 'class', 'emissiveIntensity'],
    value: getCommonPropertyValue(selectedNodes, ['rendering', 'class', 'emissiveIntensity'], renderingClass.emissiveIntensity ?? CLASS_2D_DEFAULTS.classEmissiveIntensity),
    min: 0,
    max: 1,
    step: 0.005,
    defaultValue: CLASS_2D_DEFAULTS.classEmissiveIntensity
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

function normalizeInspectorClassMaterial(value) {
  const clean = String(value || CLASS_2D_DEFAULTS.classMaterial).trim().toLowerCase();
  if (clean === 'basic') return 'flat';
  if (clean === 'mat') return 'matte';
  if (clean === 'shine' || clean === 'shiny') return 'glossy';
  if (clean === 'transparent') return 'glass';
  return CLASS_MATERIAL_PRESETS[clean] ? clean : CLASS_2D_DEFAULTS.classMaterial;
}

function applyClassMaterialPreset(node, value) {
  const material = normalizeInspectorClassMaterial(value);
  const preset = CLASS_MATERIAL_PRESETS[material];
  if (!node || !preset) return;
  node.rendering = node.rendering || {};
  node.rendering.class = node.rendering.class || {};
  Object.assign(node.rendering.class, { material }, preset);
  if (material === 'glass') {
    const opacity = Number(node.rendering.class.opacity);
    if (!Number.isFinite(opacity) || opacity >= 0.85) node.rendering.class.opacity = 0.42;
  }
}

async function updateSelectedProperty(path, value, options = {}) {
  const target = getSelectedPropertyTarget();
  if (!target) return;

  const before = options.history === false ? null : cloneValue(getData());
  if (target.kind === 'multi-class') {
    let operationsTracked = true;
    for (const node of target.nodes || []) {
      const nextNode = setDeepValue(cloneValue(node), path, value);
      if (path.join('.') === 'rendering.class.color') {
        nextNode.rendering = nextNode.rendering || {};
        nextNode.rendering.class = nextNode.rendering.class || {};
        nextNode.rendering.class.metallicColor = value;
      }
      if (path.join('.') === 'rendering.class.material') applyClassMaterialPreset(nextNode, value);
      const updater = nextNode.type === 'hyperclass' ? updateHyperclass : updateClass;
      await updater(node.id, nextNode, { context: ctx(), refresh: false, saveHistory: false });
      operationsTracked = recordClassDraftUpdate(node.id, classDraftPatchFromUpdatedEntity(path, value, nextNode)) && operationsTracked;
    }
    const after = options.history === false ? null : cloneValue(getData());
    if (before && after) recordPropertyHistory(before, after);
    if (options.live) {
      refreshSceneFromData(ctx());
      updateOverview();
      updateJsonPreviewFromData();
      updateStats();
      updateValidationStatus();
      updateSharePanel();
      applySelectionHighlight();
      scheduleLocalDraftPublish('Editing properties', { operationsTracked });
      return;
    }
    await refreshWorkspace(null, { refresh: true, fit: false, operationTracked: operationsTracked });
    return;
  }

  const next = setDeepValue(cloneValue(target.value), path, value);
  if ((target.kind === 'class' || target.kind === 'hyperclass') && path.join('.') === 'rendering.class.color') {
    next.rendering = next.rendering || {};
    next.rendering.class = next.rendering.class || {};
    next.rendering.class.metallicColor = value;
  }
  if ((target.kind === 'class' || target.kind === 'hyperclass') && path.join('.') === 'rendering.class.material') {
    applyClassMaterialPreset(next, value);
  }
  if (target.kind === 'link' && path.join('.') === 'rendering.labelText') {
    next.name = value;
  }

  let operationsTracked = false;
  if (target.kind === 'class' || target.kind === 'hyperclass') {
    const updater = target.kind === 'hyperclass' ? updateHyperclass : updateClass;
    await updater(target.node.id, next, { context: ctx(), refresh: false });
    operationsTracked = recordClassDraftUpdate(target.node.id, classDraftPatchFromUpdatedEntity(path, value, next));
  } else if (target.kind === 'link') {
    await updateLink(target.value.id, next, { context: ctx(), refresh: false });
    operationsTracked = recordLinkDraftUpdate(target.value.id, linkDraftPatchFromUpdatedEntity(path, value));
  } else if (target.kind === 'attribute') {
    await updateAttribute(target.owner.id, target.key, next, { context: ctx(), refresh: false });
    operationsTracked = recordAttributeOwnerDraftUpdate(target.owner.id);
  }

  const after = options.history === false ? null : cloneValue(getData());
  if (before && after) recordPropertyHistory(before, after);

  if (options.live) {
    refreshSceneFromData(ctx());
    updateOverview();
    updateJsonPreviewFromData();
    updateStats();
    updateValidationStatus();
    updateSharePanel();
    applySelectionHighlight();
    scheduleLocalDraftPublish('Editing properties', { operationsTracked });
    return;
  }

  await refreshWorkspace(null, { refresh: true, fit: false, operationTracked: operationsTracked });
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
  const operationsTracked = recordClassDraftUpdate(selected.id, { rendering: nextRendering });
  await refreshWorkspace(`Updated rendering for ${selected.name || selected.id}`, {
    refresh: true,
    fit: false,
    operationTracked: operationsTracked
  });
}

function syncLinkEditControls() {
  const selectedLink = links().find(link => sameId(link.id, selectedLinkId));
  const disabled = editMode === 'readonly' || !selectedLink;
  const nameInput = $('selected-link-name-input');
  const colorInput = $('selected-link-color-input');
  const widthInput = $('selected-link-width-input');
  const routePresetSelect = $('link-route-preset-select');
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
  if (routePresetSelect) {
    routePresetSelect.disabled = disabled || editMode === 'structure';
    routePresetSelect.value = selectedLink ? routePresetFromRendering(selectedLink.rendering || {}) : 'auto';
  }
}

async function handleSelectedNameChange() {
  const selected = nodeById(selectedElementId);
  if (!selected) return;
  const nextName = String($('selected-name-input')?.value || '').trim();
  if (!nextName || nextName === selected.name) return;
  const updater = selected.type === 'hyperclass' ? updateHyperclass : updateClass;
  await updater(selected.id, { name: nextName }, { context: ctx(), refresh: false });
  const operationsTracked = recordClassDraftUpdate(selected.id, { name: nextName });
  await refreshWorkspace(`Renamed ${selected.id} to ${nextName}`, {
    refresh: true,
    fit: false,
    operationTracked: operationsTracked
  });
}

async function handleSelectedAttributeRename() {
  const owner = nodeById(selectedAttributeOwnerId) || nodeById(selectedElementId);
  if (!owner || selectedAttributeKey == null) return;
  const value = String($('selected-attribute-name-input')?.value || '').trim();
  if (!value) return;
  const key = String(selectedAttributeKey).startsWith('idx-') ? Number(String(selectedAttributeKey).slice(4)) : selectedAttributeKey;
  await updateAttribute(owner.id, key, { name: value }, { context: ctx(), refresh: false });
  const operationsTracked = recordAttributeOwnerDraftUpdate(owner.id);
  await refreshWorkspace(`Renamed attribute on ${owner.name || owner.id}`, {
    refresh: true,
    fit: false,
    operationTracked: operationsTracked
  });
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
  const operationsTracked = recordLinkDraftUpdate(selectedLinkId, {
    name,
    rendering: { labelText: name, lineColor: color, lineWidth: Number.isFinite(lineWidth) ? lineWidth : LINK_2D_DEFAULTS.lineWidth }
  });
  await refreshWorkspace('Updated link style', { refresh: true, fit: false, operationTracked: operationsTracked });
}

function normalizeClassSurfaceMaterials() {
  if (!diagramGroup) return;
  let changed = false;
  diagramGroup.traverse(object => {
    if (!object.isMesh || !object.userData?.isClassLike || object.name === 'class-hub') return;
    if (object.userData?.isHyperClass) return;
    if (object.material?.userData?.hbdsClassPanel) return;
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
  if (!gl || !canvas?.width || !canvas?.height) return null;
  const maxSamples = 180;
  const effectiveStep = Math.max(
    step,
    Math.ceil(Math.sqrt((canvas.width * canvas.height) / maxSamples))
  );
  const pixel = new Uint8Array(4);
  const background = { r: 238, g: 242, b: 246 };
  let sampled = 0;
  let nonBackground = 0;
  let colored = 0;
  let luminanceTotal = 0;

  for (let y = effectiveStep; y < canvas.height; y += effectiveStep) {
    for (let x = effectiveStep; x < canvas.width; x += effectiveStep) {
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
    step: effectiveStep,
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
      serverConnected,
      serverClientId: serverEvents?.clientId || null,
      saved: Boolean(savedSnapshotKey && modelSnapshotKey() === savedSnapshotKey),
      dirty: Boolean(savedSnapshotKey && modelSnapshotKey() !== savedSnapshotKey),
      localDraftDirty,
      collaborationModelName: getSelectedCollaborationModelName(),
      collaborationStatus: getCollaborationStatusState(),
      canvasInteractionActive: isCanvasInteractionActive(),
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
    setEditMode: mode => {
      setEditMode(mode);
      return editMode;
    },
    triggerCollaborationStatusForTest,
    getLinkHubMetrics: collectLinkHubMetrics,
    getLabelMetrics: collectLabelMetrics,
    getFitQuality: () => getFitQualityMetrics(ctx()),
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

  if (fit) fitModelToCanvas(ctx(), { padding: 1.08, updateOverview: true });
  updateOverview();
  updateInterface({ json: options.json, deferHeavyPanels: options.deferHeavyPanels === true });

  if (message) {
    addLog(message);
    showToast(message);
  }
  if (options.publishDraft !== false) {
    scheduleLocalDraftPublish(message || 'Editing', { operationsTracked: options.operationTracked === true });
  }
}

async function runAction(action, label = '') {
  const functionName = label || action?.debugName || action?.name || 'uiAction';
  return trackClientFunction(`dynamic.${functionName}`, async () => {
    try {
      await action();
    } catch (error) {
      const message = error?.message || String(error);
      addLog(`Error: ${message}`);
      showToast(message);
      updateInterface({ json: false });
    }
  });
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

function selectAttribute(ownerId, attributeKey, options = {}) {
  const owner = nodeById(ownerId);
  if (!owner) return;
  setPrimarySelection(owner.id);
  selectedAttributeOwnerId = owner.id;
  selectedParentHyperclassId = owner.parentClassId ?? null;
  selectedAttributeKey = attributeKey;
  selectedLinkId = null;
  updateInterface({ json: false });
  revealModelBuilderProperties({ instant: options.instant === true });
  if (options.log !== false) addLog(`Selected attribute ${attributeKey}`);
}

function selectLink(linkId, options = {}) {
  const link = links().find(item => sameId(item.id, linkId));
  if (!link) return;
  setPrimarySelection(link.sourceClassId);
  selectedAttributeOwnerId = link.sourceClassId;
  selectedParentHyperclassId = nodeById(link.sourceClassId)?.parentClassId ?? null;
  selectedAttributeKey = null;
  selectedLinkId = link.id;
  selectedLinkSourceId = link.sourceClassId;
  selectedLinkTargetId = link.targetClassId;
  updateInterface({ json: false });
  revealModelBuilderProperties({ instant: options.instant === true });
  if (options.log !== false) addLog(`Selected link ${link.rendering?.labelText || link.name || link.id}`);
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
  let operationsTracked = recordClassDraftCreate(created);
  if (parentId) operationsTracked = recordParentChildrenDraftUpdate(parentId) && operationsTracked;
  await refreshWorkspace(`Added ${created.name}`, { refresh: true, operationTracked: operationsTracked });
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
  let operationsTracked = recordClassDraftCreate(created);
  if (parentId) operationsTracked = recordParentChildrenDraftUpdate(parentId) && operationsTracked;
  await refreshWorkspace(`Added ${created.name}`, { refresh: true, operationTracked: operationsTracked });
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
  const operationsTracked = recordAttributeOwnerDraftUpdate(owner.id);
  await refreshWorkspace(`Added attribute to ${owner.name || owner.id}`, {
    refresh: true,
    operationTracked: operationsTracked
  });
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
  const operationsTracked = recordLinkDraftCreate(created);
  await refreshWorkspace(`Linked ${source.name || source.id} to ${target.name || target.id}`, {
    refresh: true,
    operationTracked: operationsTracked
  });
}

async function handleDeleteSelected() {
  const link = selectedLinkId ? links().find(item => sameId(item.id, selectedLinkId)) : null;
  if (link) {
    const label = link.rendering?.labelText || link.name || link.id;
    await trackClientFunction('dynamic.deleteSelected.deleteLink', () => deleteLink(link.id, { context: ctx(), refresh: false }), {
      linkId: link.id
    });
    selectedLinkId = null;
    selectedLinkSourceId = null;
    selectedLinkTargetId = null;
    const operationsTracked = await trackClientFunction('dynamic.deleteSelected.recordLinkDraftDelete', () => recordLinkDraftDelete(link.id), {
      linkId: link.id
    });
    await trackClientFunction('dynamic.deleteSelected.refreshWorkspace', () => refreshWorkspace(`Deleted link ${label}`, {
      refresh: true,
      operationTracked: operationsTracked
    }), {
      targetType: 'link',
      linkId: link.id
    });
    return;
  }

  const attr = selectedAttributeEntry();
  if (attr) {
    showToast('Use Delete Attribute to remove the selected attribute');
    return;
  }

  const selected = nodeById(selectedElementId);
  if (!selected) return;
  const deletedIds = new Set([String(selected.id), ...getDescendantIds(selected.id)]);

  if (selected.type === 'hyperclass') {
    await trackClientFunction('dynamic.deleteSelected.deleteHyperclass', () => deleteHyperclass(selected.id, {
      context: ctx(),
      refresh: false,
      cascade: true
    }), {
      classId: selected.id,
      deletedCount: deletedIds.size
    });
  } else {
    await trackClientFunction('dynamic.deleteSelected.deleteClass', () => deleteClass(selected.id, {
      context: ctx(),
      refresh: false
    }), {
      classId: selected.id,
      deletedCount: deletedIds.size
    });
  }

  selectedElementId = null;
  selectedAttributeOwnerId = null;
  if (sameId(selectedParentHyperclassId, selected.id)) selectedParentHyperclassId = null;
  if (sameId(selectedLinkSourceId, selected.id)) selectedLinkSourceId = null;
  if (sameId(selectedLinkTargetId, selected.id)) selectedLinkTargetId = null;

  let operationsTracked = true;
  if (localDraftHasCreatedClassDependency(deletedIds)) {
    invalidateLocalDraftOperations('delete_created_class_dependency');
    operationsTracked = false;
  } else {
    operationsTracked = await trackClientFunction('dynamic.deleteSelected.recordClassDraftDeletes', () => {
      let tracked = true;
      deletedIds.forEach(id => {
        tracked = recordClassDraftDelete(id) && tracked;
      });
      return tracked;
    }, {
      classId: selected.id,
      deletedCount: deletedIds.size
    });
  }
  await trackClientFunction('dynamic.deleteSelected.refreshWorkspace', () => refreshWorkspace(`Deleted ${selected.name || selected.id}`, {
    refresh: true,
    operationTracked: operationsTracked
  }), {
    targetType: selected.type === 'hyperclass' ? 'hyperclass' : 'class',
    classId: selected.id,
    deletedCount: deletedIds.size
  });
}

async function handleDeleteAttribute() {
  const attr = selectedAttributeEntry();
  if (!attr) return;
  const label = attributeDisplayName(attr.attribute, attr.index);
  await deleteAttribute(attr.owner.id, attr.key, { context: ctx(), refresh: false });
  selectedElementId = attr.owner.id;
  selectedAttributeOwnerId = attr.owner.id;
  selectedAttributeKey = null;
  const operationsTracked = recordAttributeOwnerDraftUpdate(attr.owner.id);
  await refreshWorkspace(`Deleted attribute ${label}`, { refresh: true, operationTracked: operationsTracked });
}

function selectedNodesForProductivity() {
  if (selectedAttributeKey || selectedLinkId) return [];
  const selected = selectedClassNodes();
  if (selected.length) return selected;
  const node = nodeById(selectedElementId);
  return node ? [node] : [];
}

function selectMultipleNodes(ids) {
  selectedElementIds.clear();
  ids.forEach(id => selectedElementIds.add(String(id)));
  multiSelectionMode = selectedElementIds.size > 1;
  selectedElementId = ids[0] || null;
  selectedAttributeOwnerId = selectedElementId;
  selectedParentHyperclassId = nodeById(selectedElementId)?.parentClassId ?? null;
  selectedAttributeKey = null;
  selectedLinkId = null;
}

function repairHyperclassChildren() {
  const modelNodes = nodes();
  const byId = new Map(modelNodes.map(node => [String(node.id), node]));
  modelNodes
    .filter(node => node.type === 'hyperclass')
    .forEach(node => {
      const uniqueChildren = new Set((node.children || []).filter(childId => byId.has(String(childId))).map(String));
      node.children = [...uniqueChildren];
    });
  modelNodes.forEach(node => {
    if (!node.parentClassId) return;
    const parent = byId.get(String(node.parentClassId));
    if (!parent || parent.type !== 'hyperclass') {
      node.parentClassId = null;
      return;
    }
    parent.children = Array.isArray(parent.children) ? parent.children : [];
    if (!parent.children.some(childId => sameId(childId, node.id))) parent.children.push(node.id);
  });
}

function copySelectedNodesToProductivityBuffer() {
  const selected = selectedNodesForProductivity();
  if (!selected.length) {
    showToast('Select a class or hyperclass to copy');
    return false;
  }
  copiedProductivityNodes = selected.map(cloneValue);
  updateModeControls();
  addLog(`Copied ${selected.length} node${selected.length === 1 ? '' : 's'}`);
  showToast(`Copied ${selected.length} node${selected.length === 1 ? '' : 's'}`);
  return true;
}

async function pasteProductivityNodes(sourceNodes = copiedProductivityNodes, message = 'Pasted nodes') {
  const source = (sourceNodes || []).map(cloneValue).filter(Boolean);
  if (!source.length) {
    showToast('Copy or select nodes first');
    return;
  }
  const existingIds = new Set(nodes().map(node => String(node.id)));
  const cloned = cloneNodesForPaste(source, existingIds);
  if (!cloned.nodes.length) return;
  const model = getData();
  model.hypergraph = model.hypergraph || {};
  model.hypergraph.class = Array.isArray(model.hypergraph.class) ? model.hypergraph.class : [];
  model.hypergraph.class.push(...cloned.nodes);
  repairHyperclassChildren();
  selectMultipleNodes(cloned.nodes.map(node => node.id));
  syncCountersFromData();
  await refreshWorkspace(`${message}: ${cloned.nodes.length}`, { refresh: true, fit: false });
}

async function handleDuplicateSelectedNodes() {
  const selected = selectedNodesForProductivity();
  if (!selected.length) {
    showToast('Select a class or hyperclass to duplicate');
    return;
  }
  await pasteProductivityNodes(selected, 'Duplicated nodes');
}

function handleCopySelectedNodes() {
  copySelectedNodesToProductivityBuffer();
}

async function handlePasteCopiedNodes() {
  await pasteProductivityNodes();
}

async function handleBulkAddAttributes() {
  const owner = nodeById(selectedAttributeOwnerId || selectedElementId);
  if (!owner) {
    showToast('Select a class or hyperclass first');
    return;
  }
  const input = $('bulk-attribute-input');
  const parsed = parseBulkAttributeNames(input?.value || '', owner.attributes || []);
  if (parsed.duplicates.length) {
    showToast(`Duplicate attributes: ${parsed.duplicates.slice(0, 3).join(', ')}`);
    return;
  }
  if (!parsed.names.length) {
    showToast('Enter one attribute per line');
    return;
  }
  const attrs = Array.isArray(owner.attributes) ? owner.attributes : [];
  const useStringAttributes = attrs.length > 0 && attrs.every(attribute => typeof attribute === 'string');
  const existingAttributeIds = new Set(attrs.filter(attribute => attribute && typeof attribute === 'object' && attribute.id != null).map(attribute => String(attribute.id)));
  parsed.names.forEach(name => {
    attrs.push(useStringAttributes
      ? name
      : { id: makeUniqueId(`att_${name}`, existingAttributeIds, 'att'), name });
  });
  owner.attributes = attrs;
  selectedElementId = owner.id;
  selectedAttributeOwnerId = owner.id;
  const lastIndex = owner.attributes.length - 1;
  selectedAttributeKey = attributeKeyFor(owner.attributes[lastIndex], lastIndex);
  selectedLinkId = null;
  if (input) input.value = '';
  const operationsTracked = recordAttributeOwnerDraftUpdate(owner.id);
  await refreshWorkspace(`Added ${parsed.names.length} attributes to ${owner.name || owner.id}`, {
    refresh: true,
    fit: false,
    operationTracked: operationsTracked
  });
}

async function handleMoveSelectedAttribute(delta) {
  const attr = selectedAttributeEntry();
  if (!attr) {
    showToast('Select an attribute first');
    return;
  }
  const result = moveArrayItem(attr.owner.attributes || [], attr.index, delta);
  if (!result.moved) return;
  attr.owner.attributes = result.items;
  selectedAttributeKey = attributeKeyFor(attr.owner.attributes[result.toIndex], result.toIndex);
  const operationsTracked = recordAttributeOwnerDraftUpdate(attr.owner.id);
  await refreshWorkspace(`Moved attribute ${attributeDisplayName(attr.owner.attributes[result.toIndex], result.toIndex)}`, {
    refresh: true,
    fit: false,
    operationTracked: operationsTracked
  });
}

async function handleSwapSelectedLinkEndpoints() {
  const link = selectedLinkId ? links().find(item => sameId(item.id, selectedLinkId)) : null;
  if (!link) {
    showToast('Select a link first');
    return;
  }
  await updateLink(link.id, {
    sourceClassId: link.targetClassId,
    targetClassId: link.sourceClassId
  }, { context: ctx(), refresh: false });
  selectedLinkSourceId = link.targetClassId;
  selectedLinkTargetId = link.sourceClassId;
  const operationsTracked = recordLinkDraftUpdate(link.id, {
    sourceClassId: link.targetClassId,
    targetClassId: link.sourceClassId
  });
  await refreshWorkspace(`Swapped link ${link.rendering?.labelText || link.name || link.id}`, {
    refresh: true,
    fit: false,
    operationTracked: operationsTracked
  });
}

async function handleLinkRoutePresetChange() {
  const link = selectedLinkId ? links().find(item => sameId(item.id, selectedLinkId)) : null;
  if (!link) return;
  const preset = $('link-route-preset-select')?.value || 'auto';
  if (!PRODUCTIVITY_ROUTE_PRESETS.includes(preset)) return;
  await updateLink(link.id, {
    rendering: routePresetPatch(preset)
  }, { context: ctx(), refresh: false });
  const operationsTracked = recordLinkDraftUpdate(link.id, { rendering: routePresetPatch(preset) });
  await refreshWorkspace(`Applied ${preset} route to ${link.rendering?.labelText || link.name || link.id}`, {
    refresh: true,
    fit: false,
    operationTracked: operationsTracked
  });
}

function handleExportSelectedSubgraph() {
  const selectedIds = new Set(selectedNodesForProductivity().map(node => String(node.id)));
  if (!selectedIds.size) {
    showToast('Select a class or hyperclass to export');
    return;
  }
  const subgraph = buildSelectedSubgraph(getData(), selectedIds);
  const fileName = `${currentDownloadStem()}_selected_subgraph.json`;
  downloadTextFile(fileName, JSON.stringify(subgraph, null, 2), 'application/json;charset=utf-8');
  addLog(`Exported selected subgraph (${subgraph.hypergraph.class.length} nodes, ${subgraph.hypergraph.link.length} links)`);
  showToast('Exported selected subgraph');
}

async function handleOptimizeLayout() {
  await refreshWorkspace(`Optimized ${getLayoutAlgorithm()} layout`, {
    optimize: true,
    refresh: false,
    fit: true
  });
}

function handleFitModel() {
  fitModelToCanvas(ctx(), { padding: 1.08, updateOverview: true });
  updateOverview();
  renderOnce();
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
  addLog('Fit model to view');
  showToast('Fit model to view');
  scheduleLocalDraftPublish('Fit view');
}

async function handleResetModel(options = {}) {
  if (options.invalidateLoad !== false) {
    clearScheduledModelLoad();
    beginModelLoadRequest();
  }
  const previousCollaborationModel = options.draftModelName || getSelectedCollaborationModelName();
  clearCollaborationPreviewSnapshotCache();
  await resetData({ context: ctx(), refresh: false });
  const select = $('test-model-select');
  if (select) select.value = '';
  applyModelLayoutSettings({ algorithm: 'grid' });
  setLayoutSettings({ ...getLayoutSettings(), algorithm: 'grid' }, { applyContext: false });
  selectedElementId = null;
  selectedParentHyperclassId = null;
  selectedAttributeOwnerId = null;
  selectedAttributeKey = null;
  selectedLinkSourceId = null;
  selectedLinkTargetId = null;
  selectedLinkId = null;
  linkPickActive = false;
  if (options.clearDraft === false) {
    resetLocalDraftPublishState();
  } else {
    const clearDraft = clearLocalServerDraft(previousCollaborationModel);
    if (options.awaitDraftClear === false) {
      void clearDraft;
    } else {
      await clearDraft;
    }
  }
  remoteDrafts.clear();
  collaborationLivePreviewZoomByDraft.clear();
  clearCollaborationChangeHistory();
  selectedRemoteClientId = '';
  updateCollaborationPanel();
  syncCountersFromData();
  await refreshWorkspace('Reset workspace', { refresh: true, optimize: false, fit: false });
  updateModelSummary();
  collaborationBaseModel = cloneValue(getData());
}

async function handleApplyJson() {
  const parsed = JSON.parse($('json-preview').value);
  await setData(parsed, { context: ctx(), refresh: false });
  selectedElementId = null;
  selectedParentHyperclassId = null;
  selectedAttributeOwnerId = null;
  selectedAttributeKey = null;
  selectedLinkSourceId = null;
  selectedLinkTargetId = null;
  selectedLinkId = null;
  syncCountersFromData();
  await refreshWorkspace('Applied JSON', { refresh: true, optimize: false, fit: !hasFitMetadata(parsed) });
  collaborationBaseModel = cloneValue(getData());
}

async function handleSaveModel(options = {}) {
  setSceneSettings(lightingState, { applyContext: false });
  const selectedValue = $('test-model-select')?.value || '';
  const fileName = modelFileNameFromValue(selectedValue, 'dynamic_hbds_test_model.json');
  if (COLLABORATION_ENABLED && !serverConnected) await refreshServerConnection();
  if (COLLABORATION_ENABLED && serverConnected && getBlockingRemoteDraftList().length > 0 && !options.forceCollaborationSave) {
    setCollaborationWarning(true, 'Another user is editing this model. Choose Merge Both, Use Theirs, or Keep Mine before saving.');
    updateCollaborationPanel();
    showToast('Resolve collaboration choice before saving');
    return;
  }
  if (SERVER_MODELS_ENABLED && serverConnected) {
    const snapshot = prepareSceneSnapshot(ctx());
    const result = await saveServerModel(fileName, snapshot, { timeoutMs: 8000 });
    if (!result.ok) {
      const message = result.error?.message || 'Server save failed';
      if (result.status !== 409) serverConnected = false;
      addLog(`${result.status === 409 ? 'Save conflict' : 'Server save failed'}: ${message}`);
      showToast(message);
      return;
    }
    await populateModelSelect();
    const savedValue = serverModelValue(result.data.saved);
    if ([...$('test-model-select').options].some(option => option.value === savedValue)) {
      $('test-model-select').value = savedValue;
    }
    updateModelSummary();
    updateCanvasTitle();
    updateJsonPreviewFromData();
    localDraftDirty = false;
    collaborationBaseModel = cloneValue(getData());
    markSavedState();
    await clearLocalServerDraft(result.data.saved);
    await publishLocalPresenceDraft('Viewing saved model');
    addLog(`Saved ${result.data.saved} to server`);
    showToast(`Saved ${result.data.saved} to server`);
    return;
  }

  if (COLLABORATION_DRAFT_SCOPE && serverConnected) {
    const snapshot = prepareSceneSnapshot(ctx());
    const result = await saveScopedModel(fileName, snapshot, {
      modelScope: COLLABORATION_DRAFT_SCOPE,
      timeoutMs: 8000
    });
    if (!result.ok) {
      const message = result.error?.message || 'Server save failed';
      serverConnected = false;
      addLog(`Test model save failed: ${message}`);
      showToast(message);
      return;
    }
    const savedName = result.data.saved || fileName;
    const savedValue = `${TEST_MODEL_ROOT}${savedName}`;
    ensureModelSelectOption(savedValue, labelFromModelFileName(savedName), `Saved test model: ${savedName}`);
    $('test-model-select').value = savedValue;
    updateModelSummary();
    updateCanvasTitle();
    updateJsonPreviewFromData();
    localDraftDirty = false;
    collaborationBaseModel = cloneValue(getData());
    markSavedState();
    await clearLocalServerDraft(result.data.modelName || savedValue);
    await publishLocalPresenceDraft('Viewing saved test model');
    addLog(`Saved ${savedName} to ${TEST_MODEL_ROOT}`);
    showToast(`Saved ${savedName} to ${TEST_MODEL_ROOT}`);
    return;
  }

  saveScene(ctx(), { fileName });
  updateJsonPreviewFromData();
  if (COLLABORATION_ENABLED && serverConnected) {
    localDraftDirty = false;
    collaborationBaseModel = cloneValue(getData());
    await clearLocalServerDraft();
    await publishLocalPresenceDraft('Viewing saved model');
  }
  markSavedState();
  addLog(`Saved model JSON (${fileName})`);
  showToast(`Saved model JSON (${fileName})`);
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
  const selectedValue = select.value;
  if (SERVER_MODELS_ENABLED && serverConnected) {
    const serverResult = await listServerModels({ timeoutMs: 2500 });
    if (serverResult.ok && serverResult.models.length) {
      availableModels = serverResult.models;
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

      if ([...select.options].some(option => option.value === selectedValue)) {
        select.value = selectedValue;
      }
      updateModelSummary();
      setStatus('Server model library connected', 'ok');
      return;
    }
    if (!serverResult.ok) {
      serverConnected = false;
      addLog(`Server model list failed: ${serverResult.error?.message || 'request failed'}`);
    }
  }

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

async function refreshServerConnection() {
  if (!COLLABORATION_ENABLED) {
    serverConnected = false;
    return false;
  }
  const result = await checkServerConnection({ timeoutMs: 1200 });
  serverConnected = Boolean(result.ok);
  if (serverConnected) startServerEventSubscription();
  return serverConnected;
}

function startServerEventSubscription() {
  if (!COLLABORATION_ENABLED || serverEvents) return;
  serverEvents = subscribeServerEvents({
    'model.updated': handleServerModelUpdated,
    'draft.updated': handleServerDraftUpdated,
    'draft.cleared': handleServerDraftCleared,
    'client.left': handleServerClientLeft,
    onError: () => {
      // Browser EventSource reconnects automatically; keep the visible status focused on user actions.
    }
  }, {
    clientName: getCollaborationClientName()
  });
}

function getSelectedServerModelName() {
  const value = $('test-model-select')?.value || '';
  return isServerModelValue(value) ? modelFileNameFromValue(value) : null;
}

function getSelectedCollaborationModelName() {
  const value = $('test-model-select')?.value || '';
  if (isServerModelValue(value)) return modelFileNameFromValue(value);
  if (!COLLABORATION_DRAFT_SCOPE || !value) return null;
  return `${COLLABORATION_DRAFT_SCOPE}/${modelFileNameFromValue(value)}`;
}

function beginModelLoadRequest() {
  modelLoadRequestId += 1;
  return modelLoadRequestId;
}

function isCurrentModelLoad(requestId, value) {
  return requestId === modelLoadRequestId && (($('test-model-select')?.value || '') === String(value || ''));
}

function scheduleSelectedModelLoad(value = $('test-model-select')?.value || '') {
  const requestValue = String(value || '');
  const requestId = beginModelLoadRequest();
  window.clearTimeout(scheduledModelLoadTimer);
  scheduledModelLoadTimer = window.setTimeout(() => {
    scheduledModelLoadTimer = null;
    if (!isCurrentModelLoad(requestId, requestValue)) return;
    runAction(() => handleLoadModel({ value: requestValue, requestId }), 'model.loadSelected');
  }, 0);
}

function clearScheduledModelLoad() {
  window.clearTimeout(scheduledModelLoadTimer);
  scheduledModelLoadTimer = null;
}

function runBackgroundTask(label, task) {
  Promise.resolve()
    .then(task)
    .catch(error => addLog(`${label} failed: ${error?.message || String(error)}`));
}

function handleServerModelUpdated(event) {
  if (event.clientId && event.clientId === serverEvents?.clientId) return;
  const currentName = getSelectedServerModelName();
  if (!currentName || event.modelName !== currentName) return;
  if (localDraftDirty) {
    void captureRemoteSavedModel(event);
    return;
  }
  window.clearTimeout(remoteRefreshTimer);
  const delay = isCanvasInteractionActive() ? COLLABORATION_CANVAS_INTERACTION_IDLE_MS : 200;
  remoteRefreshTimer = window.setTimeout(() => runAction(() => refreshCurrentServerModelFromEvent(event), 'model.refreshFromServerEvent'), delay);
}

async function refreshCurrentServerModelFromEvent(event) {
  if (remoteRefreshInFlight) {
    handleServerModelUpdated(event);
    return;
  }
  const currentName = getSelectedServerModelName();
  if (!currentName || event.modelName !== currentName) return;
  remoteRefreshInFlight = true;
  const finishStatus = startCollaborationWorkStatus('sync');
  try {
    const viewState = captureViewState();
    const result = await loadServerModel(currentName, { timeoutMs: 6000 });
    if (!result.ok) throw new Error(result.error?.message || 'Server refresh failed');
    await yieldToBrowser();
    setData(result.data.model, { context: ctx(), refresh: true });
    restoreViewState(viewState);
    syncCountersFromData();
    await refreshWorkspace(`Refreshed ${currentName} from server`, {
      refresh: false,
      optimize: false,
      fit: false,
      publishDraft: false
    });
    localDraftDirty = false;
    markSavedState();
    await publishLocalPresenceDraft('Viewing updated model');
  } finally {
    remoteRefreshInFlight = false;
    finishStatus();
  }
}

function captureViewState() {
  if (!camera || !orbitControls) return null;
  return {
    position: camera.position.clone(),
    target: orbitControls.target.clone(),
    zoom: camera.zoom
  };
}

function restoreViewState(state) {
  if (!state || !camera || !orbitControls) return;
  camera.position.copy(state.position);
  orbitControls.target.copy(state.target);
  camera.zoom = state.zoom;
  camera.updateProjectionMatrix();
  orbitControls.update();
}

async function handleLoadModel(options = {}) {
  const select = $('test-model-select');
  const value = String(options.value ?? select?.value ?? '');
  const requestId = Number.isFinite(Number(options.requestId)) ? Number(options.requestId) : beginModelLoadRequest();
  if (!isCurrentModelLoad(requestId, value)) return;
  const previousCollaborationModel = localDraftModelName || getSelectedCollaborationModelName();
  clearScheduledModelLoad();
  clearCollaborationPreviewSnapshotCache();
  window.clearTimeout(remoteDraftRefreshTimer);
  remoteDraftRefreshTimer = null;
  window.clearTimeout(collaborationPanelRenderTimer);
  collaborationPanelRenderTimer = null;
  collaborationPreviewRenderToken += 1;
  void clearLocalServerDraft(previousCollaborationModel);
  remoteDrafts.clear();
  collaborationLivePreviewZoomByDraft.clear();
  clearCollaborationChangeHistory();
  selectedRemoteClientId = '';
  updateCollaborationPanel();
  await yieldToBrowser({ timeoutMs: 16 });
  if (!isCurrentModelLoad(requestId, value)) return;
  if (!value) {
    await handleResetModel({
      awaitDraftClear: false,
      draftModelName: previousCollaborationModel,
      clearDraft: false,
      invalidateLoad: false
    });
    if (!isCurrentModelLoad(requestId, value)) return;
    localDraftDirty = false;
    collaborationBaseModel = cloneValue(getData());
    markSavedState();
    return;
  }

  const selectedLabel = select?.selectedOptions?.[0]?.textContent || value;
  const largeModelLoad = isLargeModelValue(value);
  const loadedModel = await withCanvasLoadProgress(`Loading ${selectedLabel}`, async progress => {
    let model;
    progress.update(18, `Fetching ${selectedLabel}`);
    if (isServerModelValue(value)) {
      const result = await loadServerModel(modelNameFromValue(value), { timeoutMs: 6000 });
      if (!isCurrentModelLoad(requestId, value)) return null;
      if (!result.ok) throw new Error(result.error?.message || 'Server load failed');
      progress.update(48, `Rendering ${selectedLabel}`);
      await yieldToBrowser({ timeoutMs: 16 });
      model = setData(result.data.model, { context: ctx(), refresh: true });
    } else {
      model = await loadAndRenderScene(value, ctx(), {
        allowedBasePath: TEST_MODEL_ROOT,
        defaultBasePath: TEST_MODEL_ROOT,
        isCurrent: () => isCurrentModelLoad(requestId, value)
      });
      if (!model || !isCurrentModelLoad(requestId, value)) return null;
    }
    progress.update(72, `Preparing ${selectedLabel}`);
    const preserveLayout = Boolean(model?.metadata?.preserveLayout || model?.hypergraph?.metadata?.preserveLayout);
    const hasSavedFit = hasFitMetadata(model);
    const optimize = !preserveLayout && !hasSavedFit && shouldOptimizeAfterCrud();
    selectedElementId = null;
    selectedParentHyperclassId = null;
    selectedAttributeOwnerId = null;
    selectedAttributeKey = null;
    selectedLinkSourceId = null;
    selectedLinkTargetId = null;
    selectedLinkId = null;
    linkPickActive = false;
    syncCountersFromData();
    collaborationBaseModel = cloneValue(model || getData());
    await refreshWorkspace(`Loaded ${selectedLabel}${isServerModelValue(value) ? ' from server' : ''}`, {
      refresh: false,
      optimize,
      fit: optimize || !hasSavedFit,
      publishDraft: false,
      deferHeavyPanels: largeModelLoad
    });
    progress.update(94, `Finishing ${selectedLabel}`);
    return model;
  }, {
    showAfterMs: largeModelLoad ? CANVAS_LOAD_PROGRESS_LARGE_SHOW_AFTER_MS : CANVAS_LOAD_PROGRESS_SHOW_AFTER_MS
  });
  if (!loadedModel || !isCurrentModelLoad(requestId, value)) return;
  localDraftDirty = false;
  markSavedState();
  runBackgroundTask('Collaboration model refresh', async () => {
    if (!isCurrentModelLoad(requestId, value)) return;
    const modelName = getSelectedCollaborationModelName();
    await loadRemoteDraftsForCurrentModel({ modelName });
    if (isCurrentModelLoad(requestId, value) && getSelectedCollaborationModelName()) {
      await publishLocalPresenceDraft('Viewing model');
    }
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
        if (!hasSavedFit) fitModelToCanvas(ctx(), { padding: 1.08, updateOverview: true });
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
  fitModelToCanvas(ctx(), { padding: 1.08, updateOverview: true });
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
      const previousParentId = selected.parentClassId ?? null;
      await moveChildToHyperclass(selected.id, resolved || null, { context: ctx(), refresh: false });
      selectedParentHyperclassId = resolved || null;
      let operationsTracked = recordClassDraftUpdate(selected.id, { parentClassId: resolved || null });
      if (previousParentId) operationsTracked = recordParentChildrenDraftUpdate(previousParentId) && operationsTracked;
      if (resolved) operationsTracked = recordParentChildrenDraftUpdate(resolved) && operationsTracked;
      await refreshWorkspace(null, { refresh: true, fit: false, operationTracked: operationsTracked });
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
    runAction(handleAddLink, 'link.finishCreate');
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
      const operationsTracked = moved ? recordClassDraftUpdate(moved.id, { position: cloneValue(moved.position || {}) }) : false;
      if (moved) addLog(`Moved ${moved.name || moved.id}`);
      scheduleLocalDraftPublish('Moved element', { operationsTracked });
    }
  });

  updateModeControls();
}

function handleModelTreeClick(event) {
  const item = event.target.closest?.('[data-model-tree-kind]');
  if (!item) return;
  const kind = item.dataset.modelTreeKind;
  if (kind === 'attribute') {
    selectAttribute(item.dataset.ownerId, item.dataset.attributeKey);
    return;
  }
  if (kind === 'link') {
    selectLink(item.dataset.modelTreeId);
    return;
  }
  if (event.shiftKey) {
    toggleMultiSelection(item.dataset.modelTreeId);
    updateInterface({ json: false });
    addLog(`Selected ${selectedElementIds.size} item${selectedElementIds.size === 1 ? '' : 's'}`);
    return;
  }
  selectElement(item.dataset.modelTreeId);
}

function bindUi() {
  bindCanvasInteractionTracking();
  bindCollaborationControls();
  ensureDebugControls();
  installDebugUserActionTracking();
  document.addEventListener('visibilitychange', handleCollaborationVisibilityChange);
  restoreModelTreeState();
  $('model-tree-toggle')?.addEventListener('click', () => {
    setModelTreeCollapsed(!document.body.classList.contains('model-tree-collapsed'));
  });
  $('model-tree-search-input')?.addEventListener('input', renderModelTree);
  $('model-tree-list')?.addEventListener('click', handleModelTreeClick);
  $('add-class-button').addEventListener('click', () => runAction(handleAddClass, 'class.add'));
  $('add-hyperclass-button').addEventListener('click', () => runAction(handleAddHyperclass, 'hyperclass.add'));
  $('add-attribute-button').addEventListener('click', () => runAction(handleAddAttribute, 'attribute.add'));
  $('add-link-button').addEventListener('click', startLinkCreation);
  $('delete-selected-button').addEventListener('click', () => runAction(handleDeleteSelected, 'selection.delete'));
  $('delete-attribute-button')?.addEventListener('click', () => runAction(handleDeleteAttribute, 'attribute.delete'));
  $('duplicate-node-button')?.addEventListener('click', () => runAction(handleDuplicateSelectedNodes, 'selection.duplicate'));
  $('copy-node-button')?.addEventListener('click', handleCopySelectedNodes);
  $('paste-node-button')?.addEventListener('click', () => runAction(handlePasteCopiedNodes, 'selection.paste'));
  $('export-subgraph-button')?.addEventListener('click', handleExportSelectedSubgraph);
  $('bulk-add-attributes-button')?.addEventListener('click', () => runAction(handleBulkAddAttributes, 'attributes.bulkAdd'));
  $('attribute-move-up-button')?.addEventListener('click', () => runAction(() => handleMoveSelectedAttribute(-1), 'attribute.moveUp'));
  $('attribute-move-down-button')?.addEventListener('click', () => runAction(() => handleMoveSelectedAttribute(1), 'attribute.moveDown'));
  $('swap-link-endpoints-button')?.addEventListener('click', () => runAction(handleSwapSelectedLinkEndpoints, 'link.swapEndpoints'));
  $('link-route-preset-select')?.addEventListener('change', () => runAction(handleLinkRoutePresetChange, 'link.routePreset'));
  $('optimize-layout-button').addEventListener('click', () => runAction(handleOptimizeLayout, 'layout.optimize'));
  $('fit-model-button').addEventListener('click', handleFitModel);
  $('save-model-button').addEventListener('click', () => runAction(handleSaveModel, 'model.save'));
  $('export-json-button').addEventListener('click', handleExportJson);
  $('export-png-button')?.addEventListener('click', () => runAction(handleExportPng, 'export.png'));
  $('export-svg-button')?.addEventListener('click', () => runAction(handleExportSvg, 'export.svg'));
  $('export-vector-svg-button')?.addEventListener('click', () => runAction(handleExportVectorSvg, 'export.vectorSvg'));
  $('copy-share-link-button')?.addEventListener('click', () => runAction(handleCopyShareLink, 'share.copyLink'));
  $('share-native-button')?.addEventListener('click', () => runAction(handleNativeShare, 'share.native'));
  $('share-email-button')?.addEventListener('click', () => openExternalShare('email'));
  $('share-linkedin-button')?.addEventListener('click', () => openExternalShare('linkedin'));
  $('share-facebook-button')?.addEventListener('click', () => openExternalShare('facebook'));
  $('share-x-button')?.addEventListener('click', () => openExternalShare('x'));
  $('apply-json-button').addEventListener('click', () => runAction(handleApplyJson, 'json.apply'));
  $('reset-model-button').addEventListener('click', () => runAction(handleResetModel, 'model.reset'));
  $('run-scenario-suite-button')?.addEventListener('click', () => runAction(runScenarioSuite, 'scenarioSuite.run'));
  $('cancel-link-button').addEventListener('click', cancelLinkCreation);
  $('command-palette-input')?.addEventListener('input', () => {
    commandPaletteActiveIndex = 0;
    renderCommandPalette();
  });
  $('command-palette-list')?.addEventListener('click', event => {
    const target = event.target.closest?.('[data-command-index]');
    if (!target) return;
    executeCommandPaletteCommand(Number(target.dataset.commandIndex));
  });
  $('command-palette')?.addEventListener('pointerdown', event => {
    if (event.target === $('command-palette')) closeCommandPalette();
  });
  document.addEventListener('keydown', handleCommandPaletteKeydown);
  ['selected-color-input', 'selected-border-color-input', 'selected-opacity-input', 'selected-corner-radius-input', 'selected-text-color-input']
    .forEach(id => $(id)?.addEventListener('input', () => runAction(handleSelectedRenderingChange, 'selection.renderingChange')));
  $('selected-name-input')?.addEventListener('change', () => runAction(handleSelectedNameChange, 'selection.nameChange'));
  $('selected-name-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.target.blur();
    }
  });
  $('selected-attribute-name-input')?.addEventListener('change', () => runAction(handleSelectedAttributeRename, 'attribute.rename'));
  $('selected-link-name-input')?.addEventListener('change', () => runAction(handleSelectedLinkUpdate, 'link.nameUpdate'));
  $('selected-link-color-input')?.addEventListener('input', () => runAction(handleSelectedLinkUpdate, 'link.colorUpdate'));
  $('selected-link-width-input')?.addEventListener('input', () => runAction(handleSelectedLinkUpdate, 'link.widthUpdate'));
  $('property-panel')?.addEventListener('pointerdown', event => {
    const input = event.target.closest?.('[data-property-path]');
    if (input) beginLivePropertyEdit(input);
  });
  $('property-panel')?.addEventListener('focusin', event => {
    const input = event.target.closest?.('[data-property-path]');
    if (input) beginLivePropertyEdit(input);
  });
  $('property-panel')?.addEventListener('click', event => {
    runAction(() => handlePropertyPanelAction(event), 'propertyPanel.action');
  });
  $('property-panel')?.addEventListener('input', event => {
    if (event.target?.dataset?.live === 'true') runAction(() => handlePropertyPanelChange(event, { history: false }), 'propertyPanel.liveInput');
  });
  $('property-panel')?.addEventListener('change', event => {
    if (event.target?.dataset?.live === 'true') {
      runAction(async () => {
        await handlePropertyPanelChange(event, { history: false });
        commitLivePropertyEdit();
      }, 'propertyPanel.liveCommit');
    } else {
      runAction(() => handlePropertyPanelChange(event), 'propertyPanel.change');
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
  $('debug-mode-toggle')?.addEventListener('change', event => {
    runAction(() => setDebugMode(event.target.checked), 'debug.toggle');
  });

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
    scheduleSelectedModelLoad($('test-model-select')?.value || '');
  });

  $('edit-mode-select')?.addEventListener('change', event => {
    setEditMode(event.target.value || 'full');
  });

  $('mode-full')?.addEventListener('click', () => {
    setEditMode('full');
  });
  $('mode-structure')?.addEventListener('click', () => {
    setEditMode('structure');
  });
  $('mode-readonly')?.addEventListener('click', () => {
    setEditMode('readonly');
  });

  ['selected-element-select', 'parent-hyperclass-select', 'selected-attribute-select', 'selected-link-select'].forEach(id => {
    $(id)?.addEventListener('change', event => runAction(() => handleSelectChange(id, event.target.value), `selection.change.${id}`));
  });
}

async function init() {
  const container = $('container');
  const size = getCanvasSize();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(lightingState.background);
  camera = new THREE.PerspectiveCamera(52, size.width / size.height, 0.1, 2000);
  camera.position.set(0, 0, 12);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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
  ensureDebugControls();
  bindUi();
  syncDebugControls();
  if (debugModeEnabled) {
    await setDebugMode(true, { silent: true });
  }
  bindDiagramPicking();
  installDebugHooks();
  window.addEventListener('resize', resizeRenderers);

  applyModelLayoutSettings({ algorithm: 'grid' });
  setLayoutSettings({ ...getLayoutSettings(), algorithm: 'grid' }, { applyContext: false });
  await resetData({ context: ctx(), refresh: true });
  collaborationBaseModel = cloneValue(getData());
  initModelOverview(ctx());
  clearOverview();
  await refreshServerConnection();
  await populateModelSelect();
  if (selectSharedModelFromUrl()) {
    await handleLoadModel();
  } else {
    updateInterface();
    markSavedState();
  }
  addLog('Ready');
  const params = new URLSearchParams(window.location.search);
  if (!HIDE_SCENARIO_SUITE && params.has('runScenarioSuite')) {
    setTimeout(() => runAction(runScenarioSuite), 0);
  }
  if (params.has('runSatelliteFontRegression')) {
    setTimeout(() => runAction(runSatelliteFontZoomRegression), 0);
  }

  if (!params.has('sharedModel')) {
    requestAnimationFrame(animate);
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (orbitControls?.update?.()) {
    renderOnce();
  }
}

init().catch(error => {
  addLog(`Error: ${error?.message || error}`);
  showToast(error?.message || String(error));
});
