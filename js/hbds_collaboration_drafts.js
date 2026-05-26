export const DEFAULT_DRAFT_MODEL_POLICY = Object.freeze({
  fullSnapshotIntervalMs: 15000,
  previewIntervalMs: 5000,
  maxInlineModelBytes: 1000000
});

export const DEFAULT_COLLABORATION_STATUS_POLICY = Object.freeze({
  showAfterMs: 900,
  minVisibleMs: 450
});

export const COLLABORATION_STATUS_MESSAGES = Object.freeze({
  apply: 'Applying remote changes...',
  merge: 'Checking merge conflicts...',
  preview: 'Generating collaboration preview...',
  render: 'Rendering remote collaboration details...',
  sync: 'Syncing with server...'
});

export const MERGEABLE_DRAFT_OPERATION_TYPES = Object.freeze([
  'updateClass',
  'createClass',
  'deleteClass',
  'updateLink',
  'createLink',
  'deleteLink'
]);

export function estimateDraftModelBytes(model) {
  try {
    const text = JSON.stringify(model ?? null);
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(text).length;
    }
    return text.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function shouldIncludeDraftModel(options = {}) {
  const policy = {
    ...DEFAULT_DRAFT_MODEL_POLICY,
    ...(options.policy || {})
  };
  const dirty = options.dirty !== false;
  const force = options.force === true;
  const now = finiteNumber(options.now) ?? Date.now();
  const lastSnapshotAt = finiteNumber(options.lastSnapshotAt) ?? 0;
  const modelBytes = finiteNumber(options.modelBytes) ?? estimateDraftModelBytes(options.model);
  const snapshotKey = String(options.snapshotKey || '');
  const lastSnapshotKey = String(options.lastSnapshotKey || '');
  const modelName = String(options.modelName || '');
  const lastModelName = String(options.lastModelName || '');

  if (!dirty && !force) {
    return decision(false, 'presence', modelBytes);
  }
  if (!snapshotKey) {
    return decision(false, 'missing-snapshot-key', modelBytes);
  }
  if (modelBytes > policy.maxInlineModelBytes) {
    return decision(false, 'model-too-large', modelBytes);
  }
  if (force) {
    return decision(true, 'forced', modelBytes);
  }
  if (!lastSnapshotKey || modelName !== lastModelName) {
    return decision(true, 'initial', modelBytes);
  }
  if (now - lastSnapshotAt >= policy.fullSnapshotIntervalMs) {
    return decision(true, 'interval', modelBytes);
  }
  return decision(false, 'throttled', modelBytes);
}

export function shouldBuildDraftPreview(options = {}) {
  const policy = {
    ...DEFAULT_DRAFT_MODEL_POLICY,
    ...(options.policy || {})
  };
  const dirty = options.dirty !== false;
  const force = options.force === true;
  const now = finiteNumber(options.now) ?? Date.now();
  const lastPreviewAt = finiteNumber(options.lastPreviewAt) ?? 0;
  const hasCachedPreview = options.hasCachedPreview === true;

  if (force) return { include: true, reason: 'forced' };
  if (!dirty) return { include: false, reason: 'presence' };
  if (!hasCachedPreview) return { include: true, reason: 'initial' };
  if (now - lastPreviewAt >= policy.previewIntervalMs) return { include: true, reason: 'interval' };
  return { include: false, reason: 'throttled' };
}

export function collaborationWorkStatusDecision(options = {}) {
  const policy = {
    ...DEFAULT_COLLABORATION_STATUS_POLICY,
    ...(options.policy || {})
  };
  const startedAt = finiteNumber(options.startedAt) ?? 0;
  const now = finiteNumber(options.now) ?? startedAt;
  const showAfterMs = finiteNumber(options.showAfterMs) ?? policy.showAfterMs;
  const elapsedMs = Math.max(0, now - startedAt);
  const force = options.force === true;
  const kind = String(options.kind || 'sync');
  const message = String(options.message || COLLABORATION_STATUS_MESSAGES[kind] || COLLABORATION_STATUS_MESSAGES.sync);
  return {
    show: force || elapsedMs >= showAfterMs,
    elapsedMs,
    message
  };
}

export function shouldKeepCollaborationStatusVisible(options = {}) {
  const policy = {
    ...DEFAULT_COLLABORATION_STATUS_POLICY,
    ...(options.policy || {})
  };
  const visibleAt = finiteNumber(options.visibleAt) ?? 0;
  const now = finiteNumber(options.now) ?? visibleAt;
  const minVisibleMs = finiteNumber(options.minVisibleMs) ?? policy.minVisibleMs;
  return Math.max(0, now - visibleAt) < minVisibleMs;
}

export function createBoundedChangeCollector(limit = Number.POSITIVE_INFINITY) {
  const maxItems = normalizeLimit(limit);
  const items = [];
  let observed = 0;
  let truncated = false;

  return {
    push(change) {
      observed += 1;
      if (items.length < maxItems) {
        items.push(change);
        return true;
      }
      truncated = true;
      return false;
    },
    shouldContinue() {
      return !truncated;
    },
    toArray() {
      return items.slice();
    },
    get length() {
      return items.length;
    },
    get observed() {
      return observed;
    },
    get truncated() {
      return truncated;
    }
  };
}

export function createCollaborationPerformanceTracker(options = {}) {
  const maxSamples = normalizeLimit(options.maxSamples ?? 80);
  const slowThresholdMs = finiteNumber(options.slowThresholdMs) ?? 120;
  const metrics = new Map();
  const counters = new Map();
  let updatedAt = '';

  function touch(now = new Date()) {
    updatedAt = typeof now === 'string' ? now : now.toISOString();
  }

  return {
    record(name, durationMs, details = {}) {
      const cleanName = String(name || '').trim();
      const duration = finiteNumber(durationMs);
      if (!cleanName || duration === null) return;
      const bucket = metrics.get(cleanName) || [];
      bucket.push({
        durationMs: Number(duration.toFixed(2)),
        slow: duration >= slowThresholdMs,
        details: sanitizeMetricDetails(details)
      });
      while (bucket.length > maxSamples) bucket.shift();
      metrics.set(cleanName, bucket);
      touch();
    },
    count(name, amount = 1) {
      const cleanName = String(name || '').trim();
      const cleanAmount = finiteNumber(amount) ?? 1;
      if (!cleanName) return;
      counters.set(cleanName, (counters.get(cleanName) || 0) + cleanAmount);
      touch();
    },
    summary() {
      const metricSummary = {};
      for (const [name, samples] of metrics.entries()) {
        const durations = samples.map(sample => sample.durationMs);
        const total = durations.reduce((sum, value) => sum + value, 0);
        metricSummary[name] = {
          count: samples.length,
          lastMs: durations.at(-1) ?? 0,
          avgMs: samples.length ? Number((total / samples.length).toFixed(2)) : 0,
          maxMs: durations.length ? Math.max(...durations) : 0,
          slow: samples.filter(sample => sample.slow).length,
          lastDetails: samples.at(-1)?.details || {}
        };
      }
      return {
        updatedAt,
        slowThresholdMs,
        metrics: metricSummary,
        counters: Object.fromEntries(counters.entries())
      };
    },
    reset() {
      metrics.clear();
      counters.clear();
      updatedAt = '';
    }
  };
}

export function coalesceDraftPublishRequest(currentRequest, nextRequest = {}) {
  const current = currentRequest && typeof currentRequest === 'object' ? currentRequest : {};
  const next = nextRequest && typeof nextRequest === 'object' ? nextRequest : {};
  const currentOptions = current.options && typeof current.options === 'object' ? current.options : {};
  const nextOptions = next.options && typeof next.options === 'object' ? next.options : {};
  const mergedOptions = {
    ...currentOptions,
    ...nextOptions
  };

  if (currentOptions.forcePreview || nextOptions.forcePreview) mergedOptions.forcePreview = true;
  if (currentOptions.forceSnapshot || nextOptions.forceSnapshot) mergedOptions.forceSnapshot = true;
  if (hasOwn(nextOptions, 'dirty')) {
    mergedOptions.dirty = nextOptions.dirty;
  } else if (hasOwn(currentOptions, 'dirty')) {
    mergedOptions.dirty = currentOptions.dirty;
  }

  return {
    reason: String(next.reason || current.reason || 'Updated draft'),
    options: mergedOptions
  };
}

export function coalesceDraftOperations(existingOperations = [], nextOperation = null, options = {}) {
  const maxOperations = normalizeLimit(options.maxOperations ?? Number.POSITIVE_INFINITY);
  const operations = Array.isArray(existingOperations)
    ? existingOperations.map(normalizeDraftOperation).filter(Boolean)
    : [];
  const incomingOperations = Array.isArray(nextOperation) ? nextOperation : [nextOperation];

  for (const operation of incomingOperations) {
    const clean = normalizeDraftOperation(operation);
    if (!clean) continue;
    const structuralResult = foldStructuralDraftOperation(operations, clean);
    if (structuralResult === 'folded' || structuralResult === 'canceled') {
      continue;
    }
    const key = draftOperationCoalesceKey(clean);
    if (key) {
      const existingIndex = findLastOperationIndex(operations, key);
      if (existingIndex >= 0) {
        operations[existingIndex] = {
          ...operations[existingIndex],
          patch: mergeDraftPatch(operations[existingIndex].patch, clean.patch),
          updatedAt: clean.updatedAt || operations[existingIndex].updatedAt
        };
        continue;
      }
    }
    operations.push(clean);
  }

  if (operations.length > maxOperations) {
    return { operations: [], overflow: true };
  }
  return { operations, overflow: false };
}

export function isMergeableDraftOperation(operation) {
  if (!operation || typeof operation !== 'object' || operation.mergeable === false) return false;
  return MERGEABLE_DRAFT_OPERATION_TYPES.includes(String(operation.type || '').trim());
}

export function draftOperationsSignature(operations = []) {
  return stableStringify(normalizeOperationsForSignature(operations));
}

export function draftPublishSignature(modelName, draft = {}) {
  return stableStringify({
    modelName: String(modelName || ''),
    mode: draft.mode || '',
    dirty: draft.dirty === true || draft.isDirty === true,
    baseModelRevision: draft.baseModelRevision || '',
    modelSnapshotKey: draft.modelSnapshotKey || '',
    modelOmitted: draft.modelOmitted === true,
    modelOmittedReason: draft.modelOmittedReason || '',
    previewOmitted: draft.previewOmitted === true,
    previewOmittedReason: draft.previewOmittedReason || '',
    previewKind: draft.preview?.kind || '',
    previewCapturedAt: draft.preview?.capturedAt || '',
    previewWidth: draft.preview?.width || 0,
    previewHeight: draft.preview?.height || 0,
    selection: draft.selection || null,
    viewport: draft.viewport || null,
    summary: draft.summary || null,
    operations: normalizeOperationsForSignature(draft.operations),
    status: draft.status || ''
  });
}

export function mergeDraftUpdate(existingDraft, incomingDraft) {
  if (!incomingDraft || typeof incomingDraft !== 'object') return existingDraft || null;
  if (!existingDraft || typeof existingDraft !== 'object') return { ...incomingDraft };

  const merged = {
    ...existingDraft,
    ...incomingDraft
  };
  const sameModel = !existingDraft.modelName || !incomingDraft.modelName || existingDraft.modelName === incomingDraft.modelName;
  const incomingHasModel = hasOwn(incomingDraft, 'model') && incomingDraft.model != null;
  if (!sameModel) {
    if (!incomingHasModel) delete merged.model;
    if (!hasUsefulPreview(incomingDraft.preview)) delete merged.preview;
    delete merged.modelPreservedFromPreviousDraft;
    delete merged.previewPreservedFromPreviousDraft;
    return merged;
  }

  if (!incomingHasModel && sameModel && existingDraft.model != null) {
    merged.model = existingDraft.model;
    merged.modelPreservedFromPreviousDraft = true;
  } else if (incomingHasModel) {
    merged.modelPreservedFromPreviousDraft = false;
  }

  const incomingPreview = incomingDraft.preview;
  const existingPreview = existingDraft.preview;
  if (!hasUsefulPreview(incomingPreview) && hasUsefulPreview(existingPreview)) {
    merged.preview = existingPreview;
    merged.previewPreservedFromPreviousDraft = true;
  }

  return merged;
}

function decision(include, reason, modelBytes) {
  return {
    include,
    reason,
    modelBytes
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(number));
}

function sanitizeMetricDetails(details) {
  if (!details || typeof details !== 'object') return {};
  return Object.fromEntries(Object.entries(details).map(([key, value]) => {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return [key, value ?? ''];
    if (typeof value === 'number') return [key, Number.isFinite(value) ? Number(value.toFixed(2)) : 0];
    return [key, String(value)];
  }));
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeDraftOperation(operation) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return null;
  const type = String(operation.type || '').trim();
  if (!type) return null;
  const clean = cloneDraftValue(operation);
  clean.type = type;
  if (clean.patch && typeof clean.patch === 'object' && !Array.isArray(clean.patch)) {
    clean.patch = cloneDraftValue(clean.patch);
    delete clean.patch.id;
  }
  return clean;
}

function foldStructuralDraftOperation(operations, operation) {
  const type = operation?.type || '';
  if (type !== 'updateClass' && type !== 'updateLink' && type !== 'deleteClass' && type !== 'deleteLink') {
    return 'append';
  }
  const targetId = operationTargetId(operation);
  if (targetId == null) return 'append';
  const updateType = type === 'updateClass' || type === 'deleteClass' ? 'updateClass' : 'updateLink';
  const createType = type === 'updateClass' || type === 'deleteClass' ? 'createClass' : 'createLink';
  const deleteType = type === 'updateClass' || type === 'deleteClass' ? 'deleteClass' : 'deleteLink';
  const payloadKey = createType === 'createClass' ? 'class' : 'link';

  if (type === updateType) {
    const createIndex = findLastOperationIndexByTypeAndTarget(operations, createType, targetId);
    if (createIndex >= 0 && isPlainObject(operations[createIndex][payloadKey]) && isPlainObject(operation.patch)) {
      operations[createIndex] = {
        ...operations[createIndex],
        [payloadKey]: mergeDraftPatch(operations[createIndex][payloadKey], operation.patch),
        updatedAt: operation.updatedAt || operations[createIndex].updatedAt
      };
      return 'folded';
    }
  }

  if (type === deleteType) {
    removeOperationsByTypeAndTarget(operations, updateType, targetId);
    const createIndex = findLastOperationIndexByTypeAndTarget(operations, createType, targetId);
    if (createIndex >= 0) {
      operations.splice(createIndex, 1);
      return 'canceled';
    }
  }

  return 'append';
}

function draftOperationCoalesceKey(operation) {
  if (!operation || (operation.type !== 'updateClass' && operation.type !== 'updateLink')) return '';
  const targetId = operationTargetId(operation);
  if (targetId == null || !isPlainObject(operation.patch)) return '';
  return `${operation.type}:${String(targetId)}`;
}

function findLastOperationIndex(operations, key) {
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    if (draftOperationCoalesceKey(operations[index]) === key) return index;
  }
  return -1;
}

function findLastOperationIndexByTypeAndTarget(operations, type, targetId) {
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];
    if (operation?.type === type && String(operationTargetId(operation)) === String(targetId)) return index;
  }
  return -1;
}

function removeOperationsByTypeAndTarget(operations, type, targetId) {
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];
    if (operation?.type === type && String(operationTargetId(operation)) === String(targetId)) {
      operations.splice(index, 1);
    }
  }
}

function operationTargetId(operation) {
  if (!operation || typeof operation !== 'object') return null;
  if (operation.targetId != null) return operation.targetId;
  if (operation.classId != null) return operation.classId;
  if (operation.linkId != null) return operation.linkId;
  if (operation.id != null) return operation.id;
  if (isPlainObject(operation.class) && operation.class.id != null) return operation.class.id;
  if (isPlainObject(operation.node) && operation.node.id != null) return operation.node.id;
  if (isPlainObject(operation.link) && operation.link.id != null) return operation.link.id;
  if (isPlainObject(operation.value) && operation.value.id != null) return operation.value.id;
  return null;
}

function normalizeOperationsForSignature(operations = []) {
  if (!Array.isArray(operations)) return [];
  return operations
    .map(operation => {
      const clean = normalizeDraftOperation(operation);
      if (!clean) return null;
      return {
        type: clean.type,
        targetId: operationTargetId(clean) ?? '',
        mergeable: isMergeableDraftOperation(clean),
        patch: clean.patch || null,
        class: clean.class || clean.node || null,
        link: clean.link || null,
        value: clean.value || null
      };
    })
    .filter(Boolean);
}

function mergeDraftPatch(left, right) {
  const base = isPlainObject(left) ? cloneDraftValue(left) : {};
  if (!isPlainObject(right)) return base;
  Object.entries(right).forEach(([key, value]) => {
    if (key === 'id') return;
    if (isPlainObject(value) && isPlainObject(base[key])) {
      base[key] = mergeDraftPatch(base[key], value);
      return;
    }
    base[key] = cloneDraftValue(value);
  });
  return base;
}

function cloneDraftValue(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasUsefulPreview(preview) {
  if (!preview || typeof preview !== 'object') return false;
  if (preview.kind === 'live-canvas-snapshot') return typeof preview.dataUrl === 'string' && preview.dataUrl.length > 0;
  return preview.kind && preview.kind !== 'model-preview';
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
