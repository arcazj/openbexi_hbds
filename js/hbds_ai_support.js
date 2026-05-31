export const HBDS_AI_PROMPT_TEMPLATE_VERSION = 'hbds-ai-prompt-v1';

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
  }
];

export const AI_CUSTOM_MODEL_VALUE = '__custom__';
export const AI_MANUAL_PROVIDER_ID = 'chatgpt-manual';

export const AI_REASONING_EFFORTS = [
  { id: 'none', label: 'none' },
  { id: 'low', label: 'low' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high' },
  { id: 'xhigh', label: 'xhigh' }
];

export const AI_PROVIDER_DEFINITIONS = [
  {
    id: 'openai',
    label: 'ChatGPT/OpenAI',
    defaultModel: 'gpt-5.5',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5', supportsReasoningEffort: true, defaultReasoningEffort: 'medium' },
      { id: 'gpt-5.4', label: 'GPT-5.4', supportsReasoningEffort: true, defaultReasoningEffort: 'medium' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', supportsReasoningEffort: true, defaultReasoningEffort: 'low' },
      { id: 'gpt-4.1', label: 'GPT-4.1', supportsReasoningEffort: false }
    ],
    requiresKey: true,
    allowsUserKey: true,
    requiresBaseUrl: false,
    supportsCustomBaseUrl: false,
    supportsJsonMode: true,
    supportsReasoningEffort: true
  },
  {
    id: AI_MANUAL_PROVIDER_ID,
    label: 'ChatGPT Pro / Manual',
    defaultModel: '',
    models: [],
    requiresKey: false,
    allowsUserKey: false,
    requiresBaseUrl: false,
    supportsCustomBaseUrl: false,
    supportsJsonMode: true,
    manualWorkflow: true
  },
  {
    id: 'anthropic',
    label: 'Claude/Anthropic',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: [
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-latest', label: 'Claude 3 Opus' }
    ],
    requiresKey: true,
    allowsUserKey: true,
    requiresBaseUrl: false,
    supportsCustomBaseUrl: false,
    supportsJsonMode: true
  },
  {
    id: 'ollama',
    label: 'Local/Ollama',
    defaultModel: 'llama3.1',
    models: [
      { id: 'llama3.1', label: 'Llama 3.1' },
      { id: 'llama3.2', label: 'Llama 3.2' },
      { id: 'qwen2.5', label: 'Qwen 2.5' },
      { id: 'mistral', label: 'Mistral' }
    ],
    requiresKey: false,
    allowsUserKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://127.0.0.1:11434',
    supportsCustomBaseUrl: true,
    supportsJsonMode: false
  },
  {
    id: 'custom-openai',
    label: 'Custom OpenAI-compatible',
    defaultModel: '',
    models: [],
    supportsReasoningEffort: true,
    requiresKey: false,
    allowsUserKey: true,
    requiresBaseUrl: true,
    defaultBaseUrl: '',
    supportsCustomBaseUrl: true,
    supportsJsonMode: true
  }
];

function normalizeModelOption(option) {
  if (typeof option === 'string') {
    return { id: option, label: option, supportsReasoningEffort: false };
  }
  return {
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
  return localProviders.map(provider => ({
    ...provider,
    ...(serverById.get(provider.id) || {})
  }));
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
  if (defaultModel && !seen.has(defaultModel)) {
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
  return Boolean(provider.supportsReasoningEffort);
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
  }
  return payload;
}

export function validateAiRequestConfig(config = {}, provider = {}, options = {}) {
  const errors = [];
  const serverEnabled = options.serverEnabled !== false;
  const requestText = String(config.requestText || '').trim();
  if (!requestText) errors.push('HBDS request is required');
  if (provider.requiresBaseUrl && !String(config.baseUrl || '').trim()) {
    errors.push('Base URL is required for this provider');
  }
  if (serverEnabled && provider.requiresKey && !provider.configuredOnServer && provider.allowsUserKey !== false && !String(config.apiKey || '').trim()) {
    errors.push('API key is required for this provider unless configured on server');
  }
  const reasoningEffort = String(config.reasoningEffort || '').trim();
  if (reasoningEffort && !AI_REASONING_EFFORTS.some(item => item.id === reasoningEffort)) {
    errors.push('Reasoning effort must be none, low, medium, high, or xhigh');
  }
  return {
    valid: errors.length === 0,
    errors
  };
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
  return { valid: true, errors: [], model };
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
