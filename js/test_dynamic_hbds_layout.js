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
  createLink,
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
  setLayoutSettings
} from './hbds_model.js?v=fit-font-20260517i';
import { recalculateAllLinks } from './hbds_class_link.js?v=fit-font-20260517i';

let scene, camera, renderer, labelRenderer, orbitControls, dragControls, diagramGroup;
const draggableObjects = [];

let selectedElementId = null;
let selectedParentHyperclassId = null;
let selectedAttributeOwnerId = null;
let selectedLinkSourceId = null;
let selectedLinkTargetId = null;
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
let lightingState = normalizeSceneSettings();
const defaultLightingState = normalizeSceneSettings();
let sceneLights = {};

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
const ICON_EXTENSIONS = ['png', 'svg', 'jpg', 'jpeg', 'webp', 'gif'];
const DEFAULT_EMPTY_ICON_PATH = './icons/empty.png';
const TEST_MODEL_ROOT = 'test_models/';
const TEST_MODEL_MANIFEST = 'test_models/test_models_manifest.json';
const TEST_MODEL_HIDDEN_VALUES = [
  'test_models/models.json',
  'test_models/transportation_links.json'
];

const $ = id => document.getElementById(id);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const nodes = () => getData()?.hypergraph?.class || [];
const links = () => getData()?.hypergraph?.link || [];

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
  applyModelSceneSettings,
  applyModelLayoutSettings,
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
    attributes: { checkboxColor: color.border, size: { width: 0.1, height: 0.1 } },
    connections: { lineColor: color.border, lineWidth: 0.01 },
    textColor: '#111827'
  };
}

function hyperclassRendering(index) {
  const color = HYPER_COLORS[index % HYPER_COLORS.length];
  return {
    class: { color: color.fill, borderColor: color.border, opacity: 0.2, cornerRadius: 0.22 },
    attributes: { checkboxColor: color.border, size: { width: 0.1, height: 0.1 } },
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

function ensureLighting() {
  const ambient = new THREE.AmbientLight(0xffffff, lightingState.ambient);
  ambient.name = 'hbds-ambient-light';
  scene.add(ambient);

  const front = new THREE.DirectionalLight(0xffffff, lightingState.front);
  front.name = 'hbds-front-light';
  front.position.set(-3, 2, 16);
  scene.add(front);

  const sourceOne = new THREE.DirectionalLight(0xffffff, lightingState.sources[0].intensity);
  sourceOne.name = 'hbds-source-one-light';
  sourceOne.position.copy(directionToVector(lightingState.sources[0].direction));
  scene.add(sourceOne);

  const sourceTwo = new THREE.DirectionalLight(0xffffff, lightingState.sources[1].intensity);
  sourceTwo.name = 'hbds-source-two-light';
  sourceTwo.position.copy(directionToVector(lightingState.sources[1].direction));
  scene.add(sourceTwo);
  sceneLights = { ambient, front, sourceOne, sourceTwo };
}

function applySceneSettings(options = {}) {
  if (scene) scene.background = new THREE.Color(lightingState.background);
  if (sceneLights.ambient) sceneLights.ambient.intensity = lightingState.ambient;
  if (sceneLights.front) sceneLights.front.intensity = lightingState.front;
  if (sceneLights.sourceOne) {
    sceneLights.sourceOne.intensity = lightingState.sources[0].intensity;
    sceneLights.sourceOne.position.copy(directionToVector(lightingState.sources[0].direction));
  }
  if (sceneLights.sourceTwo) {
    sceneLights.sourceTwo.intensity = lightingState.sources[1].intensity;
    sceneLights.sourceTwo.position.copy(directionToVector(lightingState.sources[1].direction));
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
  bind('scene-background-input', lightingState.background);
  bind('ambient-light-input', lightingState.ambient);
  bind('front-light-input', lightingState.front);
  bind('source-one-intensity-input', lightingState.sources[0].intensity);
  bind('source-one-x-input', lightingState.sources[0].direction.x);
  bind('source-one-y-input', lightingState.sources[0].direction.y);
  bind('source-one-z-input', lightingState.sources[0].direction.z);
  bind('source-two-intensity-input', lightingState.sources[1].intensity);
  bind('source-two-x-input', lightingState.sources[1].direction.x);
  bind('source-two-y-input', lightingState.sources[1].direction.y);
  bind('source-two-z-input', lightingState.sources[1].direction.z);
}

function readSceneSettingsControls() {
  const numberValue = (id, fallback) => {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  lightingState.background = normalizeHexColor($('scene-background-input')?.value || lightingState.background);
  lightingState.ambient = numberValue('ambient-light-input', lightingState.ambient);
  lightingState.front = numberValue('front-light-input', lightingState.front);
  lightingState.sources[0].intensity = numberValue('source-one-intensity-input', lightingState.sources[0].intensity);
  lightingState.sources[0].direction.x = numberValue('source-one-x-input', lightingState.sources[0].direction.x);
  lightingState.sources[0].direction.y = numberValue('source-one-y-input', lightingState.sources[0].direction.y);
  lightingState.sources[0].direction.z = numberValue('source-one-z-input', lightingState.sources[0].direction.z);
  lightingState.sources[1].intensity = numberValue('source-two-intensity-input', lightingState.sources[1].intensity);
  lightingState.sources[1].direction.x = numberValue('source-two-x-input', lightingState.sources[1].direction.x);
  lightingState.sources[1].direction.y = numberValue('source-two-y-input', lightingState.sources[1].direction.y);
  lightingState.sources[1].direction.z = numberValue('source-two-z-input', lightingState.sources[1].direction.z);
  lightingState = normalizeSceneSettings(lightingState);
}

function handleSceneSettingInput() {
  readSceneSettingsControls();
  setSceneSettings(lightingState, { applyContext: false });
  applySceneSettings();
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
}

function handleResetSceneSettings() {
  lightingState = normalizeSceneSettings(defaultLightingState);
  setSceneSettings(lightingState, { applyContext: false });
  applySceneSettings({ syncControls: true });
  updateJsonPreviewFromData();
  updateRenderDiagnostics();
  addLog('Reset scene settings');
}

function applyModelSceneSettings(settings) {
  lightingState = normalizeSceneSettings(settings || getSceneSettings());
  applySceneSettings({ syncControls: true });
}

function applyModelLayoutSettings(settings) {
  const select = $('layout-algorithm-select');
  const algorithm = settings?.algorithm || getLayoutSettings().algorithm || 'none';
  if (select) select.value = [...select.options].some(option => option.value === algorithm) ? algorithm : 'none';
}

function handleLayoutSettingChange() {
  setLayoutSettings({ ...getLayoutSettings(), algorithm: getLayoutAlgorithm() }, { applyContext: false });
  updateJsonPreviewFromData();
}

function compactControlSections() {
  document.querySelectorAll('section.control-group').forEach(section => {
    const title = section.querySelector(':scope > .section-title');
    if (!title) return;
    const details = document.createElement('details');
    details.className = section.className;
    if (section.dataset.defaultOpen === 'true' || ['Model', 'Selection'].some(label => title.textContent.includes(label))) {
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
  const nodeCount = nodes().length;
  $('stat-node-count').textContent = String(nodeCount);
  $('stat-link-count').textContent = String(links().length);
  $('stat-attribute-count').textContent = String(countAttributes());
  $('stat-hyperclass-count').textContent = String(nodes().filter(node => node.type === 'hyperclass').length);
  document.body.classList.toggle('has-model', nodeCount > 0);
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
  const status = $('validation-status');
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
  if (!hasId(selectedParentHyperclassId)) selectedParentHyperclassId = null;
  if (!hasId(selectedAttributeOwnerId)) selectedAttributeOwnerId = null;
  if (!hasId(selectedLinkSourceId)) selectedLinkSourceId = null;
  if (!hasId(selectedLinkTargetId)) selectedLinkTargetId = null;
}

function updateSmartMenusFromData() {
  const allNodes = nodes().filter(Boolean);
  const hyperclasses = allNodes.filter(node => node.type === 'hyperclass');
  setSelectOptions('selected-element-select', allNodes, selectedElementId, 'Select element');
  setSelectOptions('parent-hyperclass-select', hyperclasses, selectedParentHyperclassId, 'No parent');
  setSelectOptions('attribute-owner-select', allNodes, selectedAttributeOwnerId, 'Select owner');
  setSelectOptions('link-source-select', allNodes, selectedLinkSourceId, 'Select source');
  setSelectOptions('link-target-select', allNodes, selectedLinkTargetId, 'Select target');
}

function updateSelectedCard() {
  const card = $('selected-card');
  const selected = nodeById(selectedElementId);
  if (!card || !selected) {
    card.innerHTML = '<span class="selected-name">No selection</span><span class="selected-meta">Select a class or hyperclass</span>';
    syncSelectedColorControl(null);
    return;
  }

  const type = selected.type === 'hyperclass' ? 'Hyperclass' : 'Class';
  const attrs = Array.isArray(selected.attributes) ? selected.attributes.length : 0;
  card.innerHTML = `<span class="selected-name">${escapeHtml(selected.name || 'Untitled')}</span><span class="selected-meta">${type} - ${attrs} attr${attrs === 1 ? '' : 's'} - ${escapeHtml(String(selected.id))}</span>`;
  syncSelectedColorControl(selected);
}

function updateLinkBuilderStatus() {
  const status = $('link-builder-status');
  const button = $('link-pick-button');
  const source = nodeById(selectedLinkSourceId);
  const target = nodeById(selectedLinkTargetId);

  if (linkPickActive && !source) {
    status.textContent = 'Pick source';
    button.textContent = 'Picking Source';
    return;
  }

  if (linkPickActive && source && !target) {
    status.textContent = 'Pick target';
    button.textContent = 'Picking Target';
    return;
  }

  if (source && target) {
    status.textContent = 'Ready';
    button.textContent = 'Pick Source';
    return;
  }

  if (source) {
    status.textContent = 'Source set';
    button.textContent = 'Pick Target';
    return;
  }

  status.textContent = 'Ready';
  button.textContent = 'Pick Source';
}

function updateModeControls() {
  const isReadOnly = editMode === 'readonly';
  const structureOnly = editMode === 'structure';
  const selected = nodeById(selectedElementId);
  const owner = nodeById(selectedAttributeOwnerId) || selected;
  const canCreateLink = nodeById(selectedLinkSourceId) && nodeById(selectedLinkTargetId);

  const disable = (id, state) => {
    const element = $(id);
    if (element) element.disabled = Boolean(state);
  };

  disable('add-hyperclass-button', isReadOnly);
  disable('empty-add-hyperclass-button', isReadOnly);
  disable('add-class-button', isReadOnly);
  disable('add-attribute-button', isReadOnly || structureOnly || !owner);
  disable('add-link-button', isReadOnly || structureOnly || !canCreateLink);
  disable('delete-selected-button', isReadOnly || !selected);
  disable('selected-color-input', isReadOnly || !selected);
  disable('seed-demo-button', isReadOnly);
  disable('empty-seed-demo-button', isReadOnly);
  disable('reset-model-button', isReadOnly);
  disable('apply-json-button', isReadOnly);
  disable('link-pick-button', isReadOnly || structureOnly);
  disable('clear-link-button', !selectedLinkSourceId && !selectedLinkTargetId && !linkPickActive);

  ['mode-full', 'mode-structure', 'mode-readonly'].forEach(id => $(id)?.classList.remove('active'));
  $(`mode-${editMode}`)?.classList.add('active');
  $('edit-mode-select').value = editMode;
  if (dragControls) dragControls.enabled = !isReadOnly;
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
  updateSmartMenusFromData();
  updateStats();
  updateValidationStatus();
  updateSelectedCard();
  updateLinkBuilderStatus();
  updateModeControls();
  repairAttributeLabels();
  enhanceIconTitleLabels();
  normalizeClassSurfaceMaterials();
  applySelectionHighlight();
  updateModelSummary();
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
  const input = $('selected-color-input');
  if (!input) return;
  input.disabled = !selected || editMode === 'readonly';
  input.value = selected ? getNodeSurfaceColor(selected) : '#ffd166';
}

async function handleSelectedColorChange(event) {
  const selected = nodeById(selectedElementId);
  if (!selected) return;
  const color = normalizeHexColor(event.target.value);
  const currentRendering = selected.rendering || {};
  const nextRendering = {
    ...currentRendering,
    class: {
      ...(currentRendering.class || {}),
      color,
      metallicColor: color
    }
  };
  const updater = selected.type === 'hyperclass' ? updateHyperclass : updateClass;
  await updater(selected.id, { rendering: nextRendering }, { context: ctx(), refresh: false });
  await refreshWorkspace(`Updated ${selected.name || selected.id} color`, { refresh: true, fit: false });
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
  const candidates = iconCandidatePaths(model);
  if (!candidates.length) return;

  label.dataset.iconState = 'loading';
  const image = new Image();
  let index = 0;
  const tryNext = () => {
    if (index >= candidates.length) {
      label.dataset.iconState = 'missing';
      return;
    }
    image.src = candidates[index++];
  };

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
    label.style.fontWeight = '700';
    label.style.fontFamily = 'Arial, sans-serif';
    if (currentFontSize) label.style.fontSize = currentFontSize;
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
  image.onerror = tryNext;
  tryNext();
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

function iconCandidatePaths(model) {
  const explicit = model.icon ?? model.iconPath ?? model.rendering?.icon ?? model.rendering?.iconPath ?? model.rendering?.class?.icon ?? model.rendering?.class?.iconPath;
  const names = [];
  if (explicit) names.push(String(explicit));
  if (model.name) names.push(...iconNameVariants(String(model.name)));

  const seen = new Set();
  const paths = [];
  for (const name of names) {
    for (const path of expandIconPath(name)) {
      if (seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
  }
  if (!seen.has(DEFAULT_EMPTY_ICON_PATH)) paths.push(DEFAULT_EMPTY_ICON_PATH);
  return paths;
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

function expandIconPath(value) {
  const clean = String(value || '').trim();
  if (!clean) return [];
  const hasExtension = /\.[a-z0-9]+$/i.test(clean);
  if (/^(?:\.{0,2}\/|\/|https?:|data:)/i.test(clean) || clean.includes('/')) {
    return hasExtension ? [clean] : ICON_EXTENSIONS.map(ext => `${clean}.${ext}`);
  }
  if (hasExtension) return [`./icons/${encodeURIComponent(clean)}`];
  return ICON_EXTENSIONS.map(ext => `./icons/${encodeURIComponent(clean)}.${ext}`);
}

function applySelectionHighlight() {
  if (!diagramGroup) return;
  diagramGroup.traverse(object => {
    if (!object.userData?.isClassLike) return;
    const selected = sameId(object.userData.hbdsId, selectedElementId);

    if (object.material?.emissive) {
      object.material.emissive.set(selected ? 0x1769e0 : 0x000000);
      object.material.emissiveIntensity = selected ? 0.24 : 0;
      object.material.needsUpdate = true;
    }

    object.renderOrder = selected ? 20 : 1;
    object.traverse(child => {
      if (child.isCSS2DObject && child.element) {
        child.element.classList.toggle('is-selected', selected);
      }
    });
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
    return {
      text: element.textContent || '',
      classes: [...element.classList],
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
      visible: rect.width > 0 && rect.height > 0
    };
  });
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

  selectedElementId = selected.id;
  selectedAttributeOwnerId = selected.id;

  if (selected.type === 'hyperclass') {
    selectedParentHyperclassId = selected.id;
  } else if (selected.parentClassId) {
    selectedParentHyperclassId = selected.parentClassId;
  }

  updateInterface({ json: false });
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
  const created = await createClass({
    name: `Class ${classIndex}`,
    attributes: [],
    parentClassId: selectedParentHyperclassId || null,
    rendering: classRendering(classIndex - 1)
  }, { context: ctx(), refresh: false });

  selectedElementId = created.id;
  selectedAttributeOwnerId = created.id;
  await refreshWorkspace(`Added ${created.name}`, { refresh: true });
}

async function handleAddHyperclass() {
  const hyperIndex = nextHyperclassNumber++;
  const created = await createHyperclass({
    name: `Hyperclass ${hyperIndex}`,
    attributes: [],
    children: [],
    parentClassId: selectedParentHyperclassId || null,
    rendering: hyperclassRendering(hyperIndex - 1)
  }, { context: ctx(), refresh: false });

  selectedElementId = created.id;
  selectedParentHyperclassId = created.id;
  selectedAttributeOwnerId = created.id;
  await refreshWorkspace(`Added ${created.name}`, { refresh: true });
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
  await createLink({
    id: `link${number}`,
    sourceClassId: source.id,
    targetClassId: target.id,
    name: label,
    rendering: { labelText: label }
  }, { context: ctx(), refresh: false });

  selectedElementId = target.id;
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
  saveScene(ctx(), { fileName: 'dynamic_hbds_test_model.json' });
  updateJsonPreviewFromData();
  addLog('Saved model JSON');
  showToast('Saved model JSON');
}

function handleExportJson() {
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
  const optimize = !preserveLayout && shouldOptimizeAfterCrud();
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
    fit: optimize || !hasFitMetadata(loadedModel)
  });
}

async function runScenarioSuite() {
  if (!availableModels.length) {
    setStatus('No test models available', 'warn');
    return;
  }
  const suiteButton = $('run-scenario-suite-button');
  if (suiteButton) suiteButton.disabled = true;
  const previousValue = $('test-model-select').value;
  const failures = [];
  let passed = 0;
  addLog(`Scenario suite started (${availableModels.length} models)`);

  for (const item of availableModels) {
    try {
      const loadedModel = await loadAndRenderScene(item.value, ctx(), {
        allowedBasePath: TEST_MODEL_ROOT,
        defaultBasePath: TEST_MODEL_ROOT
      });
      const stats = getCurrentStats();
      const validation = validateData(getData());
      if (!validation.valid) {
        failures.push(`${item.label || item.value}: ${validation.errors.join('; ')}`);
        continue;
      }
      if (stats.classes + stats.hyperclasses <= 0) {
        failures.push(`${item.label || item.value}: rendered no class-like elements`);
        continue;
      }
      const algorithm = getLayoutAlgorithm();
      if (algorithm !== 'none') {
        await optimizeAndRefreshLayout(ctx(), { algorithm });
      }
      if (!hasFitMetadata(loadedModel)) fitModelToCanvas(ctx(), { padding: 1.15, updateOverview: true });
      passed += 1;
    } catch (error) {
      failures.push(`${item.label || item.value}: ${error?.message || String(error)}`);
    }
  }

  $('test-model-select').value = previousValue;
  updateModelSummary();
  if (previousValue) await handleLoadModel();
  if (suiteButton) suiteButton.disabled = false;

  if (failures.length) {
    addLog(`Scenario suite failed (${passed}/${availableModels.length} passed)`);
    setStatus(`Scenario suite: ${passed}/${availableModels.length} passed`, 'warn');
    failures.forEach(failure => addLog(`Scenario failure: ${failure}`));
  } else {
    addLog(`Scenario suite passed (${passed}/${availableModels.length})`);
    setStatus(`Scenario suite: ${passed}/${availableModels.length} passed`, 'ok');
  }
}

function clearLinkBuilder() {
  selectedLinkSourceId = null;
  selectedLinkTargetId = null;
  linkPickActive = false;
  updateInterface({ json: false });
}

function handleSelectChange(id, value) {
  const resolved = resolveNodeId(value);
  if (id === 'selected-element-select') {
    if (resolved) selectElement(resolved, { log: false });
    else selectedElementId = null;
  }
  if (id === 'parent-hyperclass-select') selectedParentHyperclassId = resolved;
  if (id === 'attribute-owner-select') selectedAttributeOwnerId = resolved;
  if (id === 'link-source-select') selectedLinkSourceId = resolved;
  if (id === 'link-target-select') selectedLinkTargetId = resolved;
  updateInterface({ json: false });
}

function handleLinkPickButton() {
  linkPickActive = !linkPickActive;
  updateInterface({ json: false });
  showToast(linkPickActive ? 'Pick a source in the diagram' : 'Link pick stopped');
}

function handleDiagramObjectClick(object) {
  const id = object?.userData?.hbdsId;
  if (id == null) return;
  const clicked = nodeById(id);
  if (!clicked) return;

  if (linkPickActive && editMode === 'full') {
    if (!selectedLinkSourceId) {
      selectedLinkSourceId = clicked.id;
      selectedElementId = clicked.id;
      addLog(`Link source: ${clicked.name || clicked.id}`);
      updateInterface({ json: false });
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

function bindDiagramPicking() {
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
    if (picked) handleDiagramObjectClick(picked);
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
  let dragObjectsBackup = null;
  let dragStartZ = 0;

  dragControls.addEventListener('dragstart', event => {
    dragObjectsBackup = dragControls.objects.slice();
    dragControls.objects = [event.object];
    dragStartZ = event.object?.position?.z || 0;
    orbitControls.enabled = false;
    if (event.object?.userData?.hbdsId != null) {
      selectedElementId = event.object.userData.hbdsId;
      updateInterface({ json: false });
    }
  });

  dragControls.addEventListener('drag', event => {
    if (event.object) event.object.position.z = dragStartZ;
    recalculateAllLinks();
    renderOnce();
    updateOverview();
  });

  dragControls.addEventListener('dragend', event => {
    if (dragObjectsBackup) dragControls.objects = dragObjectsBackup;
    orbitControls.enabled = true;
    if (event.object) {
      updateNodePositionsFromObject(event.object);
      recalculateAllLinks();
      updateJsonPreviewFromData();
      updateOverview();
      const moved = nodeById(event.object.userData?.hbdsId);
      if (moved) addLog(`Moved ${moved.name || moved.id}`);
    }
  });

  updateModeControls();
}

function bindUi() {
  $('add-class-button').addEventListener('click', () => runAction(handleAddClass));
  $('add-hyperclass-button').addEventListener('click', () => runAction(handleAddHyperclass));
  $('empty-add-hyperclass-button').addEventListener('click', () => runAction(handleAddHyperclass));
  $('add-attribute-button').addEventListener('click', () => runAction(handleAddAttribute));
  $('add-link-button').addEventListener('click', () => runAction(handleAddLink));
  $('delete-selected-button').addEventListener('click', () => runAction(handleDeleteSelected));
  $('optimize-layout-button').addEventListener('click', () => runAction(handleOptimizeLayout));
  $('fit-model-button').addEventListener('click', handleFitModel);
  $('save-model-button').addEventListener('click', handleSaveModel);
  $('export-json-button').addEventListener('click', handleExportJson);
  $('apply-json-button').addEventListener('click', () => runAction(handleApplyJson));
  $('reset-model-button').addEventListener('click', () => runAction(handleResetModel));
  $('seed-demo-button').addEventListener('click', () => runAction(handleSeedDemo));
  $('empty-seed-demo-button').addEventListener('click', () => runAction(handleSeedDemo));
  $('load-model-button').addEventListener('click', () => runAction(handleLoadModel));
  $('run-scenario-suite-button').addEventListener('click', () => runAction(runScenarioSuite));
  $('clear-link-button').addEventListener('click', clearLinkBuilder);
  $('link-pick-button').addEventListener('click', handleLinkPickButton);
  $('selected-color-input')?.addEventListener('input', event => runAction(() => handleSelectedColorChange(event)));
  $('reset-scene-settings-button')?.addEventListener('click', handleResetSceneSettings);

  [
    'scene-background-input',
    'ambient-light-input',
    'front-light-input',
    'source-one-intensity-input',
    'source-one-x-input',
    'source-one-y-input',
    'source-one-z-input',
    'source-two-intensity-input',
    'source-two-x-input',
    'source-two-y-input',
    'source-two-z-input'
  ].forEach(id => $(id)?.addEventListener('input', handleSceneSettingInput));

  $('layout-algorithm-select')?.addEventListener('change', handleLayoutSettingChange);

  $('test-model-select').addEventListener('change', () => {
    updateModelSummary();
    runAction(handleLoadModel);
  });

  $('edit-mode-select').addEventListener('change', event => {
    editMode = event.target.value || 'full';
    if (editMode !== 'full') linkPickActive = false;
    updateInterface({ json: false });
  });

  $('mode-full').addEventListener('click', () => {
    editMode = 'full';
    updateInterface({ json: false });
  });
  $('mode-structure').addEventListener('click', () => {
    editMode = 'structure';
    linkPickActive = false;
    updateInterface({ json: false });
  });
  $('mode-readonly').addEventListener('click', () => {
    editMode = 'readonly';
    linkPickActive = false;
    updateInterface({ json: false });
  });

  ['selected-element-select', 'parent-hyperclass-select', 'attribute-owner-select', 'link-source-select', 'link-target-select'].forEach(id => {
    $(id).addEventListener('change', event => handleSelectChange(id, event.target.value));
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

  ensureLighting();
  applySceneSettings({ syncControls: true });
  compactControlSections();
  bindUi();
  bindDiagramPicking();
  installDebugHooks();
  window.addEventListener('resize', resizeRenderers);

  await resetData({ context: ctx(), refresh: true });
  initModelOverview(ctx());
  clearOverview();
  await populateModelSelect();
  updateInterface();
  addLog('Ready');

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
