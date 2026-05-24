const DEFAULT_API_BASE = '';
const DEFAULT_SERVER_PORT = '8010';
const DEFAULT_TIMEOUT_MS = 3500;
const SERVER_MODEL_PREFIX = 'server:';
let discoveredApiBase = null;

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
  return apiRequest(`/api/models/${name}`, {
    ...options,
    method: 'POST',
    body: modelData
  });
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

function normalizeApiBase(value) {
  const clean = String(value || '').trim().replace(/\/+$/, '');
  return clean;
}

function normalizeError(error, status) {
  if (error && typeof error === 'object') {
    return {
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
