export const HBDS_AI_PROMPT_TEMPLATE_VERSION = 'hbds-ai-prompt-v2';

export const AI_OPERATION_MODES = [
  {
    id: 'generate',
    label: 'Generate new model',
    requiresCurrentModel: false
  },
  {
    id: 'validate',
    label: 'Validate current model',
    requiresCurrentModel: true
  },
  {
    id: 'improve',
    label: 'Improve current model',
    requiresCurrentModel: true
  },
  { id: 'repair', label: 'Repair validation errors', requiresCurrentModel: true },
  { id: 'explain-selection', label: 'Explain selection', requiresCurrentModel: true, requiresSelection: true },
  { id: 'improve-selection', label: 'Improve selection', requiresCurrentModel: true, requiresSelection: true }
];

export const AI_CUSTOM_MODEL_VALUE = '__custom__';
export const AI_MANUAL_PROVIDER_ID = 'chatgpt-manual';

export const AI_REASONING_EFFORTS = [
  { id: 'none', label: 'none' },
  { id: 'low', label: 'low' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high' },
  { id: 'xhigh', label: 'xhigh' },
  { id: 'max', label: 'max' }
];

// The catalog is shared with server.py. A manual fallback keeps static pages usable.
export const AI_PROVIDER_DEFINITIONS = [{
  id: AI_MANUAL_PROVIDER_ID, label: 'ChatGPT / Manual', defaultModel: '', models: [],
  requiresKey: false, allowsUserKey: false, manualWorkflow: true
}];

export async function loadAiProviderDefinitions(fetcher = globalThis.fetch) {
  const response = await fetcher('./js/hbds_ai_providers.json');
  if (!response.ok) throw new Error('AI provider catalog could not be loaded');
  const catalog = await response.json();
  if (!Array.isArray(catalog.providers) || !catalog.providers.length) {
    throw new Error('AI provider catalog is invalid');
  }
  AI_PROVIDER_DEFINITIONS.splice(0, AI_PROVIDER_DEFINITIONS.length, ...catalog.providers);
  return AI_PROVIDER_DEFINITIONS;
}

function normalizeModelOption(option) {
  if (typeof option === 'string') {
    return { id: option, label: option, supportsReasoningEffort: false };
  }
  return {
    ...option,
    id: String(option?.id || option?.value || '').trim(),
    label: String(option?.label || option?.id || option?.value || '').trim(),
    supportsReasoningEffort: Boolean(option?.supportsReasoningEffort),
    defaultReasoningEffort: String(option?.defaultReasoningEffort || '').trim()
  };
}

export function providerById(providerId, providers = AI_PROVIDER_DEFINITIONS) {
  const cleanId = String(providerId || '').trim();
  return providers.find(provider => provider.id === cleanId) || providers[0];
}

export function isManualWorkflowProvider(provider = {}) {
  return Boolean(provider.manualWorkflow || provider.id === AI_MANUAL_PROVIDER_ID);
}

export function mergeProviderCapabilities(serverProviders = [], localProviders = AI_PROVIDER_DEFINITIONS) {
  const serverById = new Map((Array.isArray(serverProviders) ? serverProviders : []).map(provider => [provider.id, provider]));
  const merged = localProviders.map(provider => ({ ...provider, ...(serverById.get(provider.id) || {}) }));
  const known = new Set(merged.map(provider => provider.id));
  return [...merged, ...serverProviders.filter(provider => !known.has(provider.id))];
}

export function modelOptionsForProvider(provider = {}) {
  const seen = new Set();
  const options = [];
  (Array.isArray(provider.models) ? provider.models : [])
    .map(normalizeModelOption)
    .filter(option => option.id)
    .forEach(option => {
      if (seen.has(option.id)) return;
      seen.add(option.id);
      options.push(option);
    });
  const defaultModel = String(provider.defaultModel || '').trim();
  if (defaultModel && !seen.has(defaultModel) && !provider.modelsDiscovered) {
    options.unshift({ id: defaultModel, label: defaultModel, supportsReasoningEffort: Boolean(provider.supportsReasoningEffort) });
  }
  return options;
}

export function modelOptionById(provider = {}, modelId = '') {
  const cleanId = String(modelId || '').trim();
  return modelOptionsForProvider(provider).find(option => option.id === cleanId) || null;
}

export function defaultModelForProvider(provider = {}) {
  const defaultModel = String(provider.defaultModel || '').trim();
  if (defaultModel) return defaultModel;
  return modelOptionsForProvider(provider)[0]?.id || '';
}

export function providerSupportsReasoningEffort(provider = {}, modelId = '') {
  const option = modelOptionById(provider, modelId);
  if (option) return Boolean(option.supportsReasoningEffort);
  return false;
}

export function defaultReasoningEffortForModel(provider = {}, modelId = '') {
  const option = modelOptionById(provider, modelId);
  const effort = option?.defaultReasoningEffort || provider.defaultReasoningEffort || 'medium';
  return AI_REASONING_EFFORTS.some(item => item.id === effort) ? effort : 'medium';
}

export function credentialStateForProvider(provider = {}, serverEnabled = false) {
  if (isManualWorkflowProvider(provider)) {
    return {
      status: 'none',
      message: 'Manual copy/paste mode; no key required',
      showKeyField: false,
      keyRequired: false
    };
  }
  if (provider.configuredOnServer) {
    return {
      status: 'configured',
      message: 'Configured on server',
      showKeyField: false,
      keyRequired: false
    };
  }
  if (provider.requiresKey) {
    return {
      status: 'required',
      message: serverEnabled ? 'Key required' : 'Key required when AI backend is enabled',
      showKeyField: provider.allowsUserKey !== false,
      keyRequired: true
    };
  }
  if (provider.allowsUserKey) {
    return {
      status: 'optional',
      message: 'Key optional',
      showKeyField: true,
      keyRequired: false
    };
  }
  return {
    status: 'none',
    message: 'No key required',
    showKeyField: false,
    keyRequired: false
  };
}

export function sanitizeAiConfigForDiagnostics(config = {}) {
  return {
    providerId: String(config.providerId || ''),
    modelName: String(config.modelName || ''),
    reasoningEffort: String(config.reasoningEffort || ''),
    baseUrl: String(config.baseUrl || ''),
    outputMode: String(config.outputMode || 'auto'),
    operationMode: String(config.operationMode || ''),
    hasUserKey: Boolean(config.apiKey),
    apiKey: config.apiKey ? '[redacted]' : ''
  };
}

export function buildAiPromptRequestPayload(config = {}, currentModel = null) {
  const operationMode = String(config.operationMode || AI_OPERATION_MODES[0].id);
  const mode = AI_OPERATION_MODES.find(item => item.id === operationMode) || AI_OPERATION_MODES[0];
  const requestText = String(config.requestText || '').trim();
  const payload = {
    providerId: String(config.providerId || ''),
    modelName: String(config.modelName || ''),
    baseUrl: String(config.baseUrl || ''),
    outputMode: String(config.outputMode || 'auto'),
    reasoningEffort: String(config.reasoningEffort || ''),
    operationMode: mode.id,
    requestText,
    promptTemplateVersion: HBDS_AI_PROMPT_TEMPLATE_VERSION
  };
  const apiKey = String(config.apiKey || '').trim();
  if (apiKey) {
    payload.apiKey = apiKey;
  }
  const reasoningEffort = String(config.reasoningEffort || '').trim();
  if (reasoningEffort) {
    payload.reasoningEffort = reasoningEffort;
  }
  if (mode.requiresCurrentModel && currentModel) {
    payload.currentModel = currentModel;
    payload.selectionIds = Array.isArray(config.selectionIds) ? config.selectionIds : [];
    payload.validationFindings = Array.isArray(config.validationFindings) ? config.validationFindings : [];
  }
  return payload;
}

export function validateAiRequestConfig(config = {}, provider = {}, options = {}) {
  const errors = [];
  const serverEnabled = options.serverEnabled !== false;
  const requestText = String(config.requestText || '').trim();
  if (!requestText) errors.push('HBDS request is required');
  const mode = AI_OPERATION_MODES.find(item => item.id === config.operationMode);
  if (mode?.requiresSelection && !config.selectionIds?.length) errors.push('Select classes or a link first');
  if (provider.requiresBaseUrl && !String(config.baseUrl || '').trim()) {
    errors.push('Base URL is required for this provider');
  }
  if (serverEnabled && provider.requiresKey && !provider.configuredOnServer && provider.allowsUserKey !== false && !String(config.apiKey || '').trim()) {
    errors.push('API key is required for this provider unless configured on server');
  }
  const reasoningEffort = String(config.reasoningEffort || '').trim();
  if (reasoningEffort && !AI_REASONING_EFFORTS.some(item => item.id === reasoningEffort)) {
    errors.push('Unsupported reasoning effort');
  }
  const efforts = modelOptionById(provider, config.modelName)?.reasoningEfforts || [];
  if (reasoningEffort && !efforts.includes(reasoningEffort)) errors.push('Reasoning effort is not supported by this model');
  return {
    valid: errors.length === 0,
    errors
  };
}

export function constrainAiModelProposal(model, currentModel, operationMode, selectionIds = []) {
  const proposed = clonePlainObject(model);
  if (!currentModel || operationMode === 'generate' || !proposed?.hypergraph) return proposed;
  const previousClasses = new Map((currentModel.hypergraph?.class || []).map(item => [String(item.id), item]));
  (proposed.hypergraph.class || []).forEach(item => {
    const previous = previousClasses.get(String(item.id));
    if (previous?.position) item.position = clonePlainObject(previous.position);
  });
  if (operationMode !== 'improve-selection') return proposed;
  const result = clonePlainObject(currentModel);
  const selected = new Set(selectionIds);
  for (const collection of ['class', 'link']) {
    const byId = new Map((proposed.hypergraph[collection] || []).map(item => [String(item.id), item]));
    result.hypergraph[collection] = (result.hypergraph[collection] || []).map(previous => {
      if (!selected.has(String(previous.id)) || !byId.has(String(previous.id))) return previous;
      const replacement = clonePlainObject(byId.get(String(previous.id)));
      if (collection === 'class') {
        for (const key of ['position', 'parentClassId', 'children', 'type']) {
          if (Object.hasOwn(previous, key)) replacement[key] = clonePlainObject(previous[key]);
          else delete replacement[key];
        }
      }
      return replacement;
    });
  }
  return result;
}

const AI_COLLECTIONS = ['class', 'link', 'object', 'objectLink', 'membership', 'inheritance'];
const SERVER_METADATA_FIELDS = new Set(['revision', 'contentHash', 'modified', 'modifiedIso']);

// Stable ordering avoids treating a provider's object-key ordering as an edit.
export function aiModelFingerprint(value) {
  function ordered(item) {
    if (Array.isArray(item)) return item.map(ordered);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])]));
  }
  return JSON.stringify(ordered(value));
}

export function buildAiChangeReview(before = {}, after = {}) {
  const changes = [];
  const equal = (a, b) => aiModelFingerprint(a) === aiModelFingerprint(b);
  const add = (target, oldValue, newValue, label) => {
    if (equal(oldValue, newValue)) return;
    const action = newValue === undefined ? 'remove' : oldValue === undefined ? 'add' : 'update';
    changes.push({ ...target, key: String(changes.length), action, label,
      before: clonePlainObject(oldValue), after: clonePlainObject(newValue),
      destructive: action === 'remove' || (target.field === 'name' && oldValue !== undefined) });
  };
  const diffFields = (oldValue, newValue, target, label, ignored = new Set()) => {
    for (const field of new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})])) {
      if (!ignored.has(field)) add({ ...target, field }, oldValue?.[field], newValue?.[field], `${label}: ${field}`);
    }
  };
  const diffEntities = (oldItems, newItems, collection, ownerId = '') => {
    const oldMap = new Map((oldItems || []).map(item => [String(item.id), item]));
    const newMap = new Map((newItems || []).map(item => [String(item.id), item]));
    for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
      const previous = oldMap.get(id), next = newMap.get(id);
      const target = { collection, ownerId, id };
      const label = `${collection} ${previous?.name || next?.name || id}`;
      if (!previous || !next) add(target, previous, next, label);
      else if (collection === 'class') {
        diffFields(previous, next, target, label, new Set(['id', 'attributes']));
        diffEntities(previous.attributes, next.attributes, 'attribute', id);
      } else {
        diffFields(previous, next, target, label, new Set(['id']));
      }
    }
  };
  AI_COLLECTIONS.forEach(collection => diffEntities(before.hypergraph?.[collection], after.hypergraph?.[collection], collection));
  diffFields(before.metadata, after.metadata, { collection: 'metadata' }, 'Metadata', SERVER_METADATA_FIELDS);
  diffFields(before.hypergraph, after.hypergraph, { collection: 'hypergraph' }, 'Hypergraph', new Set(AI_COLLECTIONS));
  diffFields(before, after, { collection: 'root' }, 'Model', new Set(['metadata', 'hypergraph']));
  return changes;
}

export function applyAiSelectedChanges(before, changes, selectedKeys) {
  const result = clonePlainObject(before);
  result.metadata ||= {};
  result.hypergraph ||= { class: [], link: [] };
  const selected = new Set(selectedKeys);
  for (const change of changes) {
    if (!selected.has(change.key)) continue;
    let target;
    if (change.collection === 'root') target = result;
    else if (change.collection === 'metadata') target = result.metadata;
    else if (change.collection === 'hypergraph') target = result.hypergraph;
    else {
      let list;
      if (change.collection === 'attribute') {
        const owner = result.hypergraph.class.find(item => String(item.id) === change.ownerId);
        if (!owner) throw new Error('The selected attribute change needs its class');
        list = owner.attributes ||= [];
      } else list = result.hypergraph[change.collection] ||= [];
      const index = list.findIndex(item => String(item.id) === change.id);
      if (!change.field) {
        if (change.action === 'remove') { if (index >= 0) list.splice(index, 1); }
        else if (index >= 0) list[index] = clonePlainObject(change.after);
        else list.push(clonePlainObject(change.after));
        continue;
      }
      target = list[index];
      if (!target) throw new Error('A selected change needs an entity that was excluded');
    }
    if (change.action === 'remove') delete target[change.field];
    else Object.defineProperty(target, change.field, { value: clonePlainObject(change.after), enumerable: true, writable: true, configurable: true });
  }
  return result;
}

export function hasApplyableAiModelResponse(value) {
  if (!value || typeof value !== 'object') return false;
  const hypergraph = value.hypergraph;
  return Boolean(
    hypergraph &&
    typeof hypergraph === 'object' &&
    Array.isArray(hypergraph.class) &&
    Array.isArray(hypergraph.link)
  );
}

function clonePlainObject(value) {
  if (!value || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeAiAttributeList(value) {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object' && !Array.isArray(item));
  if (value && typeof value === 'object' && !Array.isArray(value)) return [value];
  return [];
}

function normalizeAiPosition(value) {
  const position = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  ['x', 'y', 'z'].forEach(axis => {
    const numberValue = Number(position[axis] ?? 0);
    position[axis] = Number.isFinite(numberValue) ? numberValue : 0;
  });
  return position;
}

export function normalizeAiHbdsModelResponse(model) {
  const normalized = clonePlainObject(model);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized;
  const hypergraph = normalized.hypergraph;
  if (!hypergraph || typeof hypergraph !== 'object' || Array.isArray(hypergraph)) return normalized;

  if (!Array.isArray(hypergraph.class) && Array.isArray(hypergraph.classes)) {
    hypergraph.class = hypergraph.classes;
  }
  if (!Array.isArray(hypergraph.link) && Array.isArray(hypergraph.links)) {
    hypergraph.link = hypergraph.links;
  }

  if (Array.isArray(hypergraph.class)) {
    hypergraph.class.forEach(node => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return;
      if (!node.type && node.kind) node.type = node.kind;
      if (!Array.isArray(node.attributes)) {
        node.attributes = normalizeAiAttributeList(node.attributes ?? node.attribute);
      }
      node.position = normalizeAiPosition(node.position);
    });
  }

  if (Array.isArray(hypergraph.link)) {
    hypergraph.link.forEach(link => {
      if (!link || typeof link !== 'object' || Array.isArray(link)) return;
      if (!link.sourceClassId && link.source) link.sourceClassId = link.source;
      if (!link.targetClassId && link.target) link.targetClassId = link.target;
    });
  }
  return normalized;
}

function isFinitePositionValue(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function addUniqueId(errors, seenIds, entityId, owner) {
  const cleanId = String(entityId || '').trim();
  if (!cleanId) {
    errors.push(`${owner} is missing id`);
    return '';
  }
  if (seenIds.has(cleanId)) errors.push(`duplicate id ${cleanId}`);
  seenIds.add(cleanId);
  return cleanId;
}

export function parseManualAiResponseText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return { valid: false, errors: ['AI response is required'], model: null };
  if (raw.includes('```')) {
    return { valid: false, errors: ['AI response must be JSON only, without Markdown fences'], model: null };
  }
  let model = null;
  try {
    model = JSON.parse(raw);
  } catch (error) {
    return { valid: false, errors: [`AI response is not valid JSON: ${error.message}`], model: null };
  }
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    return { valid: false, errors: ['AI response must be one HBDS JSON object'], model: null };
  }
  return { valid: true, errors: [], model: model.model || model.correctedModel || (model.hypergraph ? model : null), explanation: String(model.explanation || '') };
}

export function validateManualHbdsModelResponse(model) {
  const errors = [];
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    return { valid: false, errors: ['AI response must be one HBDS JSON object'] };
  }
  if (!model.metadata || typeof model.metadata !== 'object' || Array.isArray(model.metadata)) {
    errors.push('missing metadata object');
  }
  const hypergraph = model.hypergraph;
  if (!hypergraph || typeof hypergraph !== 'object' || Array.isArray(hypergraph)) {
    errors.push('missing hypergraph object');
    return { valid: false, errors };
  }
  const classes = hypergraph.class;
  const links = hypergraph.link;
  if (!Array.isArray(classes)) errors.push('missing hypergraph.class array');
  if (!Array.isArray(links)) errors.push('missing hypergraph.link array');
  if (!Array.isArray(classes) || !Array.isArray(links)) return { valid: false, errors };

  const seenIds = new Set();
  const classIds = new Set();
  const childRefs = [];
  const parentRefs = [];
  classes.forEach((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`class[${index}] must be an object`);
      return;
    }
    const nodeId = addUniqueId(errors, seenIds, node.id, `class[${index}]`);
    if (nodeId) classIds.add(nodeId);
    if (!Array.isArray(node.attributes)) {
      errors.push(`class ${nodeId || index} attributes must be an array`);
    } else {
      node.attributes.forEach((attribute, attrIndex) => {
        if (!attribute || typeof attribute !== 'object' || Array.isArray(attribute)) return;
        addUniqueId(errors, seenIds, attribute.id, `class ${nodeId || index} attribute[${attrIndex}]`);
      });
    }
    const position = node.position;
    if (!position || typeof position !== 'object' || Array.isArray(position)) {
      errors.push(`class ${nodeId || index} is missing position`);
    } else if (!isFinitePositionValue(position.x) || !isFinitePositionValue(position.y)) {
      errors.push(`class ${nodeId || index} position must include numeric x and y`);
    } else if (position.z !== undefined && !isFinitePositionValue(position.z)) {
      errors.push(`class ${nodeId || index} position.z must be numeric when provided`);
    }
    if (node.parentClassId) parentRefs.push([nodeId || `class[${index}]`, String(node.parentClassId)]);
    if (Array.isArray(node.children)) {
      node.children.forEach(childId => childRefs.push([nodeId || `class[${index}]`, String(childId)]));
    }
  });

  links.forEach((link, index) => {
    if (!link || typeof link !== 'object' || Array.isArray(link)) {
      errors.push(`link[${index}] must be an object`);
      return;
    }
    const linkId = addUniqueId(errors, seenIds, link.id, `link[${index}]`);
    if (!classIds.has(String(link.sourceClassId || ''))) {
      errors.push(`link ${linkId || index} sourceClassId must reference an existing class`);
    }
    if (!classIds.has(String(link.targetClassId || ''))) {
      errors.push(`link ${linkId || index} targetClassId must reference an existing class`);
    }
  });

  parentRefs.forEach(([nodeId, parentId]) => {
    if (!classIds.has(parentId)) errors.push(`class ${nodeId} parentClassId must reference an existing class`);
  });
  childRefs.forEach(([nodeId, childId]) => {
    if (!classIds.has(childId)) errors.push(`class ${nodeId} children must reference existing classes`);
  });

  return { valid: errors.length === 0, errors };
}
