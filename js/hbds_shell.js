import { listQueryModels, loadQueryModel } from './hbds_query_models.js?v=panels-v1';

const frame = document.getElementById('view-frame');
const queryFrame = document.getElementById('query-frame');
const previewFrame = document.getElementById('query-preview-frame');
const treeToggle = document.getElementById('shell-tree-toggle');
const helpOverlay = document.getElementById('shell-help');
const connectionStatus = document.getElementById('connection-status');
const connectionIcon = document.getElementById('connection-icon');
const connectionValue = document.getElementById('connection-value');
const appVersion = document.getElementById('app-version');
const viewButtons = Array.from(document.querySelectorAll('.mode-button[data-view]'));
const helpSections = Array.from(document.querySelectorAll('.help-section'));
const HBDS_APP_VERSION = '2.7';
let activeView = 'models';
let sourceView = 'models';
let queryReady = false;
let snapshotSerial = '', snapshotTicket = 0, pendingSnapshot = false;
let queryModels = [], selectedQueryModel = '@current', queryModelRequest = 0, queryModelsRequest = 0;
let queryModelLoading = false, previewReady = null, resolvePreview = null;
let requestedQueryModel = '@current';
let serverConnectionState = 'not_connected';
let serverConnectionPollTimer = null;
const views = {
  models: {
    src: 'index_models.html?embeddedShell=1&appVersion=release-2.7',
    title: 'HBDS Models view'
  },
  edit: {
    src: 'test_dynamic_hbds_layout.html?embeddedShell=1&modelsPath=models/&manifestPath=models/models_manifest.json&appVersion=release-2.7',
    title: 'HBDS Edit view'
  },
  tests: {
    src: 'test_dynamic_hbds_layout.html?embeddedShell=1&modelsPath=test_models/&manifestPath=test_models/test_models_manifest.json&appVersion=release-2.7',
    title: 'HBDS Tests view'
  }
};
appVersion.textContent = `v${HBDS_APP_VERSION}`;

function setServerConnectionState(state) {
  serverConnectionState = state === 'connected' || state === 'connecting' ? state : 'not_connected';
  const labels = {
    not_connected: 'Not connected',
    connecting: 'Connecting',
    connected: 'Connected'
  };
  connectionStatus.classList.toggle('connected', serverConnectionState === 'connected');
  connectionStatus.classList.toggle('connecting', serverConnectionState === 'connecting');
  connectionStatus.setAttribute('aria-label', `Connection status: ${labels[serverConnectionState].toLowerCase()}`);
  connectionValue.textContent = labels[serverConnectionState];
  connectionIcon.src = serverConnectionState === 'connected' ? 'icons/power_green.png' : 'icons/power_red.png';
  window.HBDS_SERVER_STATE = serverConnectionState;
  broadcastServerConnectionState();
}

function broadcastServerConnectionState() {
  if (!frame.contentWindow) return;
  const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  frame.contentWindow.postMessage({
    type: 'hbds-server-state',
    state: serverConnectionState
  }, targetOrigin);
}

async function refreshServerConnectionState(options = {}) {
  if (options.showConnecting === true) setServerConnectionState('connecting');
  try {
    const api = await import('./hbds_server_api.js?v=server-api-20260718a');
    const result = await api.checkServerConnection({ timeoutMs: 1600 });
    setServerConnectionState(result.ok ? 'connected' : 'not_connected');
  } catch {
    setServerConnectionState('not_connected');
  }
}

function startServerConnectionPolling() {
  window.clearInterval(serverConnectionPollTimer);
  serverConnectionPollTimer = window.setInterval(() => {
    refreshServerConnectionState({ showConnecting: false });
  }, 2500);
}

function selectView(name, options = {}) {
  if (name === 'help') {
    viewButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === 'help'));
    });
    setHelpOpen(true);
    if (!options.skipHash) history.replaceState(null, '', '#help');
    return;
  }
  if (name === 'query') {
    const opening = activeView !== 'query';
    activeView = 'query';
    setHelpOpen(false);
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === 'query')));
    // Keep the source iframe alive, including its undo stack and unsaved model.
    document.body.classList.add('query-open');
    queryFrame.hidden = false;
    sourceApi()?.setQueryOpen(true);
    if (!queryFrame.getAttribute('src')) queryFrame.src = 'functor_queries.html?embeddedShell=1';
    if (queryReady) sendSnapshot();
    else pendingSnapshot = true;
    if (opening) refreshQueryModels();
    syncTreeToggle();
    if (!options.skipHash) history.replaceState(null, '', '#query');
    return;
  }
  queryFrame.hidden = true;
  ++queryModelRequest;
  queryModelLoading = false;
  selectedQueryModel = '@current';
  showQueryPreview(false);
  document.body.classList.remove('query-open');
  sourceApi()?.setQueryOpen(false);
  const view = views[name] || views.models;
  activeView = views[name] ? name : 'models';
  sourceView = activeView;
  setHelpOpen(false);
  viewButtons.forEach(button => {
    const active = button.dataset.view === name;
    button.setAttribute('aria-pressed', String(active));
  });
  frame.title = view.title;
  if (!frame.src.endsWith(view.src)) frame.src = view.src;
  else frame.contentWindow?.dispatchEvent(new Event('resize'));
  syncTreeToggle();
  if (!options.skipHash) history.replaceState(null, '', `#${name}`);
}

function setHelpOpen(open) {
  helpOverlay.hidden = !open;
  document.querySelector('[data-view="help"]')?.setAttribute('aria-pressed', String(open));
  if (open && !helpSections.some(section => section.open)) {
    helpSections[0].open = true;
  }
}

helpSections.forEach(section => {
  section.addEventListener('toggle', () => {
    if (!section.open) return;
    helpSections.forEach(other => {
      if (other !== section) other.open = false;
    });
  });
});

viewButtons.forEach(button => {
  button.addEventListener('click', () => selectView(button.dataset.view));
});

function sourceApi() {
  // A navigation keeps the previous document briefly. Wait for the requested
  // view's bridge instead of capturing that document under the new view name.
  if (frame.contentDocument?.URL !== new URL(views[sourceView].src, location.href).href) return null;
  return frame.contentWindow?.HBDSQuerySource;
}
function querySourceApi() {
  return selectedQueryModel === '@current' ? sourceApi() : previewFrame.contentWindow?.HBDSQuerySource;
}
function showQueryPreview(show) {
  previewFrame.hidden = !show;
  document.body.classList.toggle('query-preview', show);
  frame.inert = show;
  if (!show) previewFrame.contentWindow?.HBDSQuerySource?.clearHighlights();
}
function sendModelChoices() {
  const current = sourceApi()?.read();
  sendQueryMessage({ type: 'hbds-query-models', selected: queryModelLoading ? requestedQueryModel : selectedQueryModel, models: [
    { value: '@current', label: current?.name || 'Current model', group: 'Current session',
      hint: `${sourceView === 'tests' ? 'Tests' : sourceView === 'edit' ? 'Edit' : 'Models'} · Current diagram, including unsaved changes` },
    ...queryModels.map(entry => ({ value: entry.value, label: entry.label, group: entry.group, hint: entry.name }))
  ] });
}
async function refreshQueryModels() {
  const request = ++queryModelsRequest;
  sendModelChoices();
  const models = await listQueryModels(serverConnectionState === 'connected');
  if (request !== queryModelsRequest || activeView !== 'query') return;
  queryModels = models;
  sendModelChoices();
}
function ensurePreview() {
  if (!previewReady) {
    previewReady = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        previewReady = null; resolvePreview = null;
        previewFrame.removeAttribute('src');
        reject(new Error('The model preview could not start. Select the model again to retry.'));
      }, 45000);
      resolvePreview = api => { clearTimeout(timeout); resolve(api); };
    });
    previewFrame.src = 'index_models.html?embeddedShell=1&queryPreview=1&appVersion=panels-v1';
  }
  return previewReady;
}
async function selectQueryModel(value) {
  if (activeView !== 'query') return;
  const entry = queryModels.find(item => item.value === value);
  if (value !== '@current' && !entry) {
    sendSnapshot();
    sendQueryMessage({ type: 'hbds-query-model-error', message: 'This model is no longer available. Choose another model.' });
    return;
  }
  const request = ++queryModelRequest;
  querySourceApi()?.clearHighlights();
  queryModelLoading = true;
  requestedQueryModel = value;
  sendQueryMessage({ type: 'hbds-query-waiting' });
  if (value === '@current') {
    selectedQueryModel = value;
    showQueryPreview(false);
    queryModelLoading = false;
    sendSnapshot();
    return;
  }
  try {
    const model = await loadQueryModel(entry);
    if (request !== queryModelRequest || activeView !== 'query') return;
    const preview = await ensurePreview();
    if (request !== queryModelRequest || activeView !== 'query') return;
    showQueryPreview(true);
    try {
      preview.showModel(model, { name: entry.label, scope: entry.scope, view: entry.scope === 'models' ? 'models' : 'tests',
        source: 'Query model preview', selectionKey: value });
    } catch (error) {
      selectedQueryModel = '@current'; showQueryPreview(false); throw error;
    }
    selectedQueryModel = value;
    queryModelLoading = false;
    sendSnapshot();
  } catch (error) {
    if (request !== queryModelRequest || activeView !== 'query') return;
    queryModelLoading = false;
    sendSnapshot();
    sendQueryMessage({ type: 'hbds-query-model-error', message: error.message });
  }
}
function syncTreeToggle() {
  const tree = sourceApi()?.tree;
  treeToggle.disabled = !tree || activeView === 'query';
  treeToggle.setAttribute('aria-expanded', String(Boolean(tree?.expanded())));
  treeToggle.title = treeToggle.disabled ? 'Model tree is available in Edit and Tests' : tree.expanded() ? 'Hide model tree' : 'Show model tree';
}
treeToggle.addEventListener('click', () => { sourceApi()?.tree?.toggle(); syncTreeToggle(); });
function sendQueryMessage(message) { queryFrame.contentWindow?.postMessage(message, location.origin); }
function sourceSerial(source) { return JSON.stringify([source.name, source.scope, source.model]); }
function sendSnapshot() {
  if (!queryReady) { pendingSnapshot = true; return; }
  if (queryModelLoading) { sendQueryMessage({ type: 'hbds-query-waiting' }); return; }
  const source = querySourceApi()?.read();
  if (!source) { pendingSnapshot = true; sendQueryMessage({ type: 'hbds-query-waiting' }); return; }
  pendingSnapshot = false;
  querySourceApi()?.clearHighlights();
  snapshotSerial = sourceSerial(source);
  snapshotTicket += 1;
  sendModelChoices();
  sendQueryMessage({ type: 'hbds-query-snapshot', ticket: snapshotTicket, source: {
    ...source, view: selectedQueryModel === '@current' ? sourceView : source.view, selectionKey: selectedQueryModel
  } });
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  if (event.source === previewFrame.contentWindow && event.data?.type === 'hbds-query-source-ready') {
    resolvePreview?.(previewFrame.contentWindow.HBDSQuerySource);
    resolvePreview = null;
    return;
  }
  if (event.source === frame.contentWindow && event.data?.type === 'hbds-query-source-ready') {
    sourceApi()?.setQueryOpen(activeView === 'query');
    syncTreeToggle();
    if (pendingSnapshot && activeView === 'query') sendSnapshot();
    return;
  }
  if (event.source !== queryFrame.contentWindow) return;
  if (event.data?.type === 'hbds-query-ready') { queryReady = true; if (activeView === 'query') sendSnapshot(); }
  if (event.data?.type === 'hbds-query-select-model') selectQueryModel(event.data.value);
  if (event.data?.type === 'hbds-query-refresh') sendSnapshot();
  if (event.data?.type === 'hbds-query-clear-highlights') querySourceApi()?.clearHighlights();
  if (event.data?.type === 'hbds-query-locate' && activeView === 'query') {
    const source = querySourceApi()?.read();
    if (queryModelLoading || !source || event.data.ticket !== snapshotTicket || sourceSerial(source) !== snapshotSerial) {
      sendQueryMessage({ type: 'hbds-query-stale' }); return;
    }
    // Validate every result against the exact captured source before locating any.
    const records = event.data.records;
    if (!Array.isArray(records) || !records.length || records.length > 100000) return;
    for (const record of records) {
      const path = /^\/hypergraph\/(class|link)\/(\d+)(?:\/attributes\/(\d+))?$/.exec(record?.path || '');
      if (!path || path[1] === 'link' && path[3] !== undefined) return;
      const owner = source.model.hypergraph[path[1]][Number(path[2])];
      const attribute = path[3] !== undefined, value = attribute ? owner?.attributes?.[Number(path[3])] : owner;
      if (value === undefined) return;
      const legacy = attribute && (value === null || typeof value !== 'object');
      if (record.id !== (legacy ? `@legacy:${record.path}` : String(value?.id))) return;
      if (attribute && (String(owner.id) !== record.ownerId || Number(path[3]) !== record.attributeIndex)) return;
    }
    const located = querySourceApi()?.locate(records);
    sendQueryMessage({ type: 'hbds-query-located', ticket: snapshotTicket, requestId: event.data.requestId, ...located });
  }
});
window.setInterval(() => {
  if (activeView !== 'query' || !queryReady || !snapshotSerial || queryModelLoading) return;
  const source = querySourceApi()?.read();
  if (!source || sourceSerial(source) !== snapshotSerial) sendSnapshot();
}, 750);
frame.addEventListener('load', () => { broadcastServerConnectionState(); syncTreeToggle(); });

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    setHelpOpen(false);
    viewButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === activeView));
    });
  }
});

const initialView = window.location.hash.slice(1);
selectView(initialView === 'help' || initialView === 'query' || views[initialView] ? initialView : 'models', { skipHash: !initialView });
refreshServerConnectionState({ showConnecting: true });
startServerConnectionPolling();
window.addEventListener('online', () => refreshServerConnectionState({ showConnecting: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshServerConnectionState({ showConnecting: false });
});
