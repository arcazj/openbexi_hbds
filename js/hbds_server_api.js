const DEFAULT_API_BASE = '';
const DEFAULT_SERVER_PORT = '8010';
const DEFAULT_TIMEOUT_MS = 3500;
const SERVER_MODEL_PREFIX = 'server:';
const CLIENT_ID_STORAGE_KEY = 'hbds.server.clientId';
const PAGE_CLIENT_SUFFIX = createClientId('tab');
let discoveredApiBase = null;
let fallbackClientId = null;

export function getOpenApiUrl(apiBase = DEFAULT_API_BASE) {
  return `${normalizeApiBase(apiBase)}/api/openapi.json`;
}

export function getSwaggerDocsUrl(apiBase = DEFAULT_API_BASE) {
  return `${normalizeApiBase(apiBase)}/api/docs`;
}

export function isServerModelValue(value) {
  return String(value || '').startsWith(SERVER_MODEL_PREFIX);
}

export function serverModelValue(modelName) {
  return `${SERVER_MODEL_PREFIX}${modelNameFromValue(modelName)}`;
}

export function modelNameFromValue(value) {
  const clean = String(value || '').trim();
  const withoutPrefix = clean.startsWith(SERVER_MODEL_PREFIX)
    ? clean.slice(SERVER_MODEL_PREFIX.length)
    : clean;
  return withoutPrefix.split('/').pop() || withoutPrefix;
}

export function modelFileNameFromValue(value, fallback = 'hbds_model.json') {
  const clean = modelNameFromValue(value).trim();
  const base = clean || fallback;
  return /\.json$/i.test(base) ? base : `${base}.json`;
}

export async function checkServerConnection(options = {}) {
  return apiRequest('/api/health', options);
}

export async function listServerModels(options = {}) {
  const result = await apiRequest('/api/models', options);
  if (!result.ok) return result;
  const models = Array.isArray(result.data?.models) ? result.data.models : [];
  return {
    ...result,
    models: models.map(item => ({
      ...item,
      value: serverModelValue(item.name),
      label: item.label || labelFromModelName(item.name),
      description: item.description || `Server model: ${item.name}`,
      tags: ['server']
    }))
  };
}

export async function loadServerModel(modelName, options = {}) {
  const name = encodeURIComponent(modelFileNameFromValue(modelName));
  return apiRequest(`/api/models/${name}`, options);
}

export async function saveServerModel(modelName, modelData, options = {}) {
  const name = encodeURIComponent(modelFileNameFromValue(modelName));
  const revision = options.revision ?? modelData?.metadata?.revision ?? modelData?.metadata?.contentHash;
  const headers = { ...(options.headers || {}) };
  if (revision && !hasHeader(headers, 'If-Match')) {
    headers['If-Match'] = String(revision);
  }
  if (!hasHeader(headers, 'X-Client-Id')) {
    headers['X-Client-Id'] = getServerClientId();
  }
  const result = await apiRequest(`/api/models/${name}`, {
    ...options,
    headers,
    method: 'POST',
    body: modelData
  });
  if (result.ok && modelData && typeof modelData === 'object' && result.data?.metadata?.revision) {
    modelData.metadata = {
      ...(modelData.metadata || {}),
      revision: result.data.metadata.revision,
      contentHash: result.data.metadata.contentHash,
      modified: result.data.metadata.modified,
      modifiedIso: result.data.metadata.modifiedIso
    };
  }
  return result;
}

export async function saveScopedModel(modelName, modelData, options = {}) {
  const scope = normalizeDraftScope(options.modelScope || options.scope);
  if (!scope) return saveServerModel(modelName, modelData, options);
  const name = encodeURIComponent(modelFileNameFromValue(modelName));
  const headers = clientHeaders(options);
  return apiRequest(`/api/model-files/${encodeURIComponent(scope)}/${name}`, {
    ...options,
    headers,
    method: 'POST',
    body: modelData
  });
}

export async function applyServerModelOperations(modelName, operations = [], options = {}) {
  const name = encodeURIComponent(modelFileNameFromValue(modelName));
  const clientId = String(options.clientId || getServerClientId());
  const revision = options.revision ?? options.baseModelRevision;
  const headers = clientHeaders(options, { clientId });
  if (revision && !hasHeader(headers, 'If-Match')) {
    headers['If-Match'] = String(revision);
  }
  return apiRequest(`/api/models/${name}/ops`, {
    ...options,
    headers,
    method: 'POST',
    body: {
      clientId,
      baseModelRevision: revision,
      operations
    }
  });
}

export async function listServerDrafts(modelName, options = {}) {
  return apiRequest(draftEndpoint(modelName, options), options);
}

export async function publishServerDraft(modelName, draft = {}, options = {}) {
  const clientId = String(options.clientId || draft?.clientId || getServerClientId());
  const headers = clientHeaders(options, draft);
  return apiRequest(draftEndpoint(modelName, options, clientId), {
    ...options,
    headers,
    method: 'POST',
    body: {
      ...draft,
      clientId
    }
  });
}

export async function clearServerDraft(modelName, options = {}) {
  const clientId = String(options.clientId || getServerClientId());
  const headers = clientHeaders(options);
  return apiRequest(draftEndpoint(modelName, options, clientId), {
    ...options,
    headers,
    method: 'DELETE'
  });
}

export function getServerClientId() {
  if (fallbackClientId) return fallbackClientId;
  let baseClientId = '';
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      baseClientId = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY) || '';
      if (!baseClientId) {
        baseClientId = createClientId('ui');
        window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, baseClientId);
      }
    }
  } catch {
    baseClientId = '';
  }
  fallbackClientId = `${baseClientId || createClientId('ui')}-${PAGE_CLIENT_SUFFIX}`;
  return fallbackClientId;
}

export function subscribeServerEvents(handlers = {}, options = {}) {
  const clientId = options.clientId || getServerClientId();
  const apiBase = getEventApiBase(options);
  if (typeof EventSource !== 'function') {
    handlers.onError?.({ code: 'eventsource_unavailable', message: 'EventSource is unavailable' });
    return { clientId, close() {} };
  }

  const params = new URLSearchParams({ clientId });
  if (options.clientName) params.set('clientName', String(options.clientName));
  const source = new EventSource(`${apiBase}/api/events?${params.toString()}`);
  const dispatch = event => {
    let data = {};
    try {
      data = event?.data ? JSON.parse(event.data) : {};
    } catch {
      handlers.onError?.({ code: 'invalid_event', message: 'Server event was not JSON' });
      return;
    }
    handlers.onEvent?.(data, event);
    if (data?.type) {
      handlers[data.type]?.(data, event);
    }
  };

  [
    'model.updated',
    'client.joined',
    'client.left',
    'draft.updated',
    'draft.cleared'
  ].forEach(eventType => source.addEventListener(eventType, dispatch));
  source.onmessage = dispatch;
  source.onopen = event => handlers.onOpen?.(event);
  source.onerror = event => handlers.onError?.(event);

  return {
    clientId,
    source,
    close() {
      source.close();
    }
  };
}

function clientHeaders(options = {}, payload = {}) {
  const headers = { ...(options.headers || {}) };
  if (!hasHeader(headers, 'X-Client-Id')) {
    headers['X-Client-Id'] = String(options.clientId || payload?.clientId || getServerClientId());
  }
  const clientName = options.clientName || payload?.clientName;
  if (clientName && !hasHeader(headers, 'X-Client-Name')) {
    headers['X-Client-Name'] = String(clientName);
  }
  return headers;
}

function draftEndpoint(modelName, options = {}, clientId = '') {
  const scope = normalizeDraftScope(options.draftScope || options.scope);
  const name = encodeURIComponent(modelFileNameFromValue(modelName));
  if (scope) {
    const base = `/api/drafts/${encodeURIComponent(scope)}/${name}`;
    return clientId ? `${base}/clients/${encodeURIComponent(clientId)}` : base;
  }
  const base = `/api/models/${name}/drafts`;
  return clientId ? `${base}/${encodeURIComponent(clientId)}` : base;
}

function normalizeDraftScope(value) {
  const clean = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  return clean === 'test_models' ? clean : '';
}

function createClientId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function apiRequest(path, options = {}) {
  const explicitApiBase = Object.prototype.hasOwnProperty.call(options, 'apiBase');
  const apiBases = explicitApiBase
    ? [normalizeApiBase(options.apiBase)]
    : getApiBaseCandidates(DEFAULT_API_BASE);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  let lastRetryableError = null;

  for (const apiBase of apiBases) {
    const result = await attemptApiRequest(apiBase, path, options, timeoutMs);
    if (result.retryable && apiBases.length > 1) {
      lastRetryableError = result.payload;
      continue;
    }
    if (result.payload?.ok && !explicitApiBase) discoveredApiBase = apiBase;
    return result.payload;
  }

  return lastRetryableError || {
    ok: false,
    status: 0,
    error: { code: 'network_error', message: 'Server is unavailable' }
  };
}

async function attemptApiRequest(apiBase, path, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const requestOptions = {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },
    signal: controller.signal
  };

  if (options.body !== undefined) {
    requestOptions.headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`${apiBase}${path}`, requestOptions);
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return {
        retryable: true,
        payload: {
          ok: false,
          status: response.status,
          error: { code: 'invalid_api_response', message: 'Server response was not JSON' }
        }
      };
    }
    if (!response.ok || data?.ok === false) {
      return {
        retryable: false,
        payload: {
          ok: false,
          status: response.status,
          error: normalizeError(data?.error, response.status)
        }
      };
    }
    return { retryable: false, payload: { ok: true, status: response.status, data } };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        retryable: true,
        payload: {
          ok: false,
          status: 0,
          error: { code: 'timeout', message: `Server request timed out after ${timeoutMs}ms` }
        }
      };
    }
    return {
      retryable: true,
      payload: {
        ok: false,
        status: 0,
        error: { code: 'network_error', message: error?.message || 'Server is unavailable' }
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function getApiBaseCandidates(value) {
  const configuredBase = normalizeApiBase(value);
  if (configuredBase) return [configuredBase];

  const bases = [];
  const addBase = base => {
    const clean = normalizeApiBase(base);
    if (!bases.includes(clean)) bases.push(clean);
  };

  if (discoveredApiBase !== null) addBase(discoveredApiBase);
  if (canUseSameOriginApi()) addBase('');

  const fallbackBases = getLocalServerFallbackBases();
  fallbackBases.forEach(addBase);

  return bases.length ? bases : [''];
}

function canUseSameOriginApi() {
  if (typeof window === 'undefined' || !window.location) return true;
  const { protocol, origin } = window.location;
  return (protocol === 'http:' || protocol === 'https:') && origin !== 'null';
}

function getLocalServerFallbackBases() {
  const bases = [];
  const addBase = base => {
    const clean = normalizeApiBase(base);
    if (clean && !bases.includes(clean)) bases.push(clean);
  };

  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port } = window.location;
    if ((protocol === 'http:' || protocol === 'https:') && hostname && port !== DEFAULT_SERVER_PORT) {
      addBase(`${protocol}//${hostname}:${DEFAULT_SERVER_PORT}`);
    }
  }

  addBase(`http://127.0.0.1:${DEFAULT_SERVER_PORT}`);
  addBase(`http://localhost:${DEFAULT_SERVER_PORT}`);
  return bases;
}

function getEventApiBase(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'apiBase')) {
    return normalizeApiBase(options.apiBase);
  }
  return getApiBaseCandidates(DEFAULT_API_BASE)[0] || '';
}

function normalizeApiBase(value) {
  const clean = String(value || '').trim().replace(/\/+$/, '');
  return clean;
}

function hasHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  return Object.keys(headers || {}).some(key => key.toLowerCase() === target);
}

function normalizeError(error, status) {
  if (error && typeof error === 'object') {
    return {
      ...error,
      code: String(error.code || `http_${status || 0}`),
      message: String(error.message || 'Server request failed')
    };
  }
  return {
    code: `http_${status || 0}`,
    message: String(error || 'Server request failed')
  };
}

function labelFromModelName(name) {
  return String(name || '')
    .replace(/\.json$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}
