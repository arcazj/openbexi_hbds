export const FUNCTOR_KINDS = Object.freeze([
  'direct',
  'inverse',
  'homogeneous',
  'chain'
]);

export const DEFAULT_FUNCTOR_QUERY_LIMITS = Object.freeze({
  maxPaths: 10000,
  maxSteps: 64,
  maxCompositionDepth: 16
});

const INDEX_MARKER = 'hbds-functor-index-v1';
const COMPOSITION_KINDS = new Set(['chain', 'composed', 'compose', 'composition']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanId(value) {
  return String(value ?? '').trim();
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'base' });
}

function sortedUnique(values) {
  return [...new Set(values.map(cleanId).filter(Boolean))].sort(compareText);
}

function makeDiagnostic(severity, code, message, path = '', details = undefined) {
  const diagnostic = { severity, code, message, path };
  if (details !== undefined) diagnostic.details = details;
  return diagnostic;
}

function sortDiagnostics(diagnostics) {
  return diagnostics.sort((left, right) => (
    compareText(left.path, right.path)
    || compareText(left.severity, right.severity)
    || compareText(left.code, right.code)
    || compareText(left.message, right.message)
  ));
}

function arraySource(model, singularName, pluralName) {
  const root = asObject(model) || {};
  const hypergraph = asObject(root.hypergraph) || {};
  const candidates = [
    [hypergraph[singularName], `hypergraph.${singularName}`],
    [hypergraph[pluralName], `hypergraph.${pluralName}`],
    [root[pluralName], pluralName],
    [root[singularName], singularName]
  ];
  const found = candidates.find(([value]) => Array.isArray(value));
  return found ? { values: found[0], path: found[1] } : { values: [], path: `hypergraph.${singularName}` };
}

function objectClassId(object) {
  return cleanId(object?.classId ?? object?.classTypeId ?? object?.typeId);
}

function membershipObjectId(membership) {
  return cleanId(membership?.objectId ?? membership?.memberObjectId ?? membership?.memberId);
}

function membershipClassId(membership) {
  return cleanId(membership?.classId ?? membership?.memberClassId ?? membership?.typeId);
}

function membershipHyperclassId(membership) {
  return cleanId(membership?.hyperclassId ?? membership?.parentHyperclassId ?? membership?.containerId);
}

function objectLinkSourceId(objectLink) {
  return cleanId(objectLink?.sourceObjectId ?? objectLink?.sourceId ?? objectLink?.source);
}

function objectLinkTargetId(objectLink) {
  return cleanId(objectLink?.targetObjectId ?? objectLink?.targetId ?? objectLink?.target);
}

function objectLinkTypeId(objectLink) {
  return cleanId(objectLink?.linkId ?? objectLink?.classLinkId ?? objectLink?.relationshipId ?? objectLink?.predicateId);
}

function appendMapArray(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function objectLinkComparator(left, right) {
  return (
    compareText(left.id, right.id)
    || compareText(left.linkId, right.linkId)
    || compareText(left.sourceObjectId, right.sourceObjectId)
    || compareText(left.targetObjectId, right.targetObjectId)
  );
}

export function buildFunctorIndex(model, options = {}) {
  if (model?.indexType === INDEX_MARKER) return model;
  const sourceModel = model?.isSemanticIndex === true && model.model ? model.model : model;

  const diagnostics = [];
  const objectSource = arraySource(sourceModel, 'object', 'objects');
  const objectLinkSource = arraySource(sourceModel, 'objectLink', 'objectLinks');
  const membershipSource = arraySource(sourceModel, 'membership', 'memberships');
  const hypergraph = asObject(sourceModel?.hypergraph);

  if (!hypergraph && !Array.isArray(sourceModel?.objects) && !Array.isArray(sourceModel?.object)) {
    diagnostics.push(makeDiagnostic('error', 'missing-hypergraph', 'Functor input must contain a hypergraph object.', 'hypergraph'));
  }
  if (!Array.isArray(hypergraph?.object) && !Array.isArray(hypergraph?.objects)
    && !Array.isArray(sourceModel?.objects) && !Array.isArray(sourceModel?.object)) {
    diagnostics.push(makeDiagnostic('error', 'missing-object-array', 'Functor input must contain hypergraph.object[].', 'hypergraph.object'));
  }
  if (!Array.isArray(hypergraph?.objectLink) && !Array.isArray(hypergraph?.objectLinks)
    && !Array.isArray(sourceModel?.objectLinks) && !Array.isArray(sourceModel?.objectLink)) {
    diagnostics.push(makeDiagnostic('error', 'missing-object-link-array', 'Functor input must contain hypergraph.objectLink[].', 'hypergraph.objectLink'));
  }

  const objects = [];
  const objectById = new Map();
  const classIdsByObjectId = new Map();
  objectSource.values.forEach((rawObject, index) => {
    const path = `${objectSource.path}[${index}]`;
    const object = asObject(rawObject);
    if (!object) {
      diagnostics.push(makeDiagnostic('error', 'invalid-object', 'Object entries must be JSON objects.', path));
      return;
    }
    const id = cleanId(object.id);
    if (!id) {
      diagnostics.push(makeDiagnostic('error', 'missing-object-id', 'Object is missing an id.', `${path}.id`));
      return;
    }
    if (objectById.has(id)) {
      diagnostics.push(makeDiagnostic('error', 'duplicate-object-id', `Duplicate object id ${id}.`, `${path}.id`, { objectId: id }));
      return;
    }
    objectById.set(id, object);
    objects.push(object);
    const classId = objectClassId(object);
    classIdsByObjectId.set(id, new Set(classId ? [classId] : []));
  });

  const memberships = [];
  const membershipById = new Map();
  const membershipsByObjectId = new Map();
  const membershipsByClassId = new Map();
  const hyperclassIdsByClassId = new Map();
  const hyperclassIdsByObjectId = new Map();
  membershipSource.values.forEach((rawMembership, index) => {
    const path = `${membershipSource.path}[${index}]`;
    const membership = asObject(rawMembership);
    if (!membership) {
      diagnostics.push(makeDiagnostic('error', 'invalid-membership', 'Membership entries must be JSON objects.', path));
      return;
    }
    const id = cleanId(membership.id) || `@membership:${index}`;
    const objectId = membershipObjectId(membership);
    const classId = membershipClassId(membership);
    const hyperclassId = membershipHyperclassId(membership);
    if (!classId) {
      diagnostics.push(makeDiagnostic('error', 'missing-membership-class', 'Membership is missing classId.', `${path}.classId`));
      return;
    }
    if (!objectId && !hyperclassId) {
      diagnostics.push(makeDiagnostic('error', 'missing-membership-target', 'Membership requires hyperclassId.', `${path}.hyperclassId`));
      return;
    }
    if (objectId && !objectById.has(objectId)) {
      diagnostics.push(makeDiagnostic('error', 'unknown-membership-object', `Membership references unknown object ${objectId}.`, `${path}.objectId`, { objectId }));
      return;
    }
    if (membershipById.has(id)) {
      diagnostics.push(makeDiagnostic('error', 'duplicate-membership-id', `Duplicate membership id ${id}.`, `${path}.id`, { membershipId: id }));
      return;
    }
    const normalized = { raw: membership, id, objectId, classId, hyperclassId, path };
    memberships.push(normalized);
    membershipById.set(id, normalized);
    if (objectId) {
      appendMapArray(membershipsByObjectId, objectId, normalized);
      classIdsByObjectId.get(objectId).add(classId);
    }
    if (hyperclassId) {
      appendMapArray(membershipsByClassId, classId, normalized);
      if (!hyperclassIdsByClassId.has(classId)) hyperclassIdsByClassId.set(classId, new Set());
      hyperclassIdsByClassId.get(classId).add(hyperclassId);
    }
  });

  for (const object of objects) {
    const objectId = cleanId(object.id);
    const hyperclassIds = new Set();
    for (const classId of classIdsByObjectId.get(objectId) || []) {
      for (const hyperclassId of hyperclassIdsByClassId.get(classId) || []) hyperclassIds.add(hyperclassId);
    }
    hyperclassIdsByObjectId.set(objectId, hyperclassIds);
  }

  const objectLinks = [];
  const objectLinkById = new Map();
  const outgoingByObjectId = new Map();
  const incomingByObjectId = new Map();
  objectLinkSource.values.forEach((rawObjectLink, index) => {
    const path = `${objectLinkSource.path}[${index}]`;
    const objectLink = asObject(rawObjectLink);
    if (!objectLink) {
      diagnostics.push(makeDiagnostic('error', 'invalid-object-link', 'Object-link entries must be JSON objects.', path));
      return;
    }
    const id = cleanId(objectLink.id);
    const sourceObjectId = objectLinkSourceId(objectLink);
    const targetObjectId = objectLinkTargetId(objectLink);
    const linkId = objectLinkTypeId(objectLink);
    if (!id) {
      diagnostics.push(makeDiagnostic('error', 'missing-object-link-id', 'Object link is missing an id.', `${path}.id`));
      return;
    }
    if (objectLinkById.has(id)) {
      diagnostics.push(makeDiagnostic('error', 'duplicate-object-link-id', `Duplicate object-link id ${id}.`, `${path}.id`, { objectLinkId: id }));
      return;
    }
    if (!sourceObjectId || !targetObjectId) {
      diagnostics.push(makeDiagnostic('error', 'missing-object-link-endpoint', `Object link ${id} must have sourceObjectId and targetObjectId.`, path, { objectLinkId: id }));
      return;
    }
    if (!objectById.has(sourceObjectId) || !objectById.has(targetObjectId)) {
      const missing = [sourceObjectId, targetObjectId].filter(objectId => !objectById.has(objectId));
      diagnostics.push(makeDiagnostic('error', 'unknown-object-link-endpoint', `Object link ${id} references unknown endpoint ${missing.join(', ')}.`, path, { objectLinkId: id, missingObjectIds: missing }));
      return;
    }
    if (!linkId) {
      diagnostics.push(makeDiagnostic('warning', 'missing-object-link-type', `Object link ${id} has no linkId and can only be matched by an unfiltered step.`, `${path}.linkId`, { objectLinkId: id }));
    }
    const normalized = { raw: objectLink, id, sourceObjectId, targetObjectId, linkId, path };
    objectLinks.push(normalized);
    objectLinkById.set(id, normalized);
    appendMapArray(outgoingByObjectId, sourceObjectId, normalized);
    appendMapArray(incomingByObjectId, targetObjectId, normalized);
  });

  objects.sort((left, right) => compareText(left.id, right.id));
  memberships.sort((left, right) => compareText(left.id, right.id));
  objectLinks.sort(objectLinkComparator);
  for (const links of outgoingByObjectId.values()) links.sort(objectLinkComparator);
  for (const links of incomingByObjectId.values()) links.sort(objectLinkComparator);
  for (const objectMemberships of membershipsByObjectId.values()) {
    objectMemberships.sort((left, right) => compareText(left.id, right.id));
  }
  for (const classMemberships of membershipsByClassId.values()) {
    classMemberships.sort((left, right) => compareText(left.id, right.id));
  }

  const sortedDiagnostics = sortDiagnostics(diagnostics);
  return {
    indexType: INDEX_MARKER,
    model: sourceModel,
    objects,
    objectLinks,
    memberships,
    objectById,
    objectLinkById,
    membershipById,
    membershipsByObjectId,
    membershipsByClassId,
    classIdsByObjectId,
    hyperclassIdsByClassId,
    hyperclassIdsByObjectId,
    outgoingByObjectId,
    incomingByObjectId,
    diagnostics: sortedDiagnostics,
    valid: !sortedDiagnostics.some(diagnostic => diagnostic.severity === 'error'),
    options: { ...options }
  };
}

export function resolveObjectClassIds(modelOrIndex, objectId) {
  const index = modelOrIndex?.indexType === INDEX_MARKER ? modelOrIndex : buildFunctorIndex(modelOrIndex);
  return [...(index.classIdsByObjectId.get(cleanId(objectId)) || [])].sort(compareText);
}

export function selectObjectIdsByClass(modelOrIndex, classId) {
  const index = modelOrIndex?.indexType === INDEX_MARKER ? modelOrIndex : buildFunctorIndex(modelOrIndex);
  const expected = cleanId(classId);
  if (!expected) return [];
  return index.objects
    .map(object => cleanId(object.id))
    .filter(objectId => index.classIdsByObjectId.get(objectId)?.has(expected))
    .sort(compareText);
}

export function resolveObjectHyperclassIds(modelOrIndex, objectId) {
  const index = modelOrIndex?.indexType === INDEX_MARKER ? modelOrIndex : buildFunctorIndex(modelOrIndex);
  return [...(index.hyperclassIdsByObjectId.get(cleanId(objectId)) || [])].sort(compareText);
}

export function selectObjectIdsByHyperclass(modelOrIndex, hyperclassId) {
  const index = modelOrIndex?.indexType === INDEX_MARKER ? modelOrIndex : buildFunctorIndex(modelOrIndex);
  const expected = cleanId(hyperclassId);
  if (!expected) return [];
  return index.objects
    .map(object => cleanId(object.id))
    .filter(objectId => index.hyperclassIdsByObjectId.get(objectId)?.has(expected))
    .sort(compareText);
}

function normalizeFunctorKind(value) {
  const kind = String(value ?? '').trim().toLowerCase();
  if (kind === 'forward') return 'direct';
  if (kind === 'reverse') return 'inverse';
  if (kind === 'same-class' || kind === 'sameclass') return 'homogeneous';
  return kind;
}

function flattenSteps(rawSteps, diagnostics, options, path = 'query.steps', depth = 0) {
  if (depth > options.maxCompositionDepth) {
    diagnostics.push(makeDiagnostic('error', 'composition-too-deep', `Functor composition exceeds ${options.maxCompositionDepth} levels.`, path));
    return [];
  }
  if (!Array.isArray(rawSteps)) {
    diagnostics.push(makeDiagnostic('error', 'invalid-functor-steps', 'Functor steps must be an array.', path));
    return [];
  }
  const flattened = [];
  rawSteps.forEach((rawStep, index) => {
    const stepPath = `${path}[${index}]`;
    const step = typeof rawStep === 'string' ? { kind: rawStep } : asObject(rawStep);
    if (!step) {
      diagnostics.push(makeDiagnostic('error', 'invalid-functor-step', 'Functor step must be a string or object.', stepPath));
      return;
    }
    const kind = normalizeFunctorKind(step.kind ?? step.functor ?? step.type);
    if (COMPOSITION_KINDS.has(kind)) {
      flattened.push(...flattenSteps(step.steps ?? step.chain, diagnostics, options, `${stepPath}.steps`, depth + 1));
      return;
    }
    if (!['direct', 'inverse', 'homogeneous'].includes(kind)) {
      diagnostics.push(makeDiagnostic('error', 'unknown-functor-kind', `Unsupported functor kind ${kind || '(empty)'}.`, `${stepPath}.kind`));
      return;
    }
    flattened.push({ ...step, kind, queryPath: stepPath });
  });
  return flattened;
}

function normalizeIdFilter(singleValue, arrayValue) {
  const values = Array.isArray(arrayValue)
    ? arrayValue
    : (singleValue === undefined || singleValue === null || singleValue === '' ? [] : [singleValue]);
  return new Set(sortedUnique(values));
}

function matchesObjectClasses(index, objectId, requiredClassIds) {
  if (!requiredClassIds.size) return true;
  const actual = index.classIdsByObjectId.get(objectId) || new Set();
  return [...requiredClassIds].some(classId => actual.has(classId));
}

function matchesObjectHyperclasses(index, objectId, requiredHyperclassIds) {
  if (!requiredHyperclassIds.size) return true;
  const actual = index.hyperclassIdsByObjectId.get(objectId) || new Set();
  return [...requiredHyperclassIds].some(hyperclassId => actual.has(hyperclassId));
}

function homogeneousClassIds(index, sourceObjectId, targetObjectId) {
  const sourceClasses = index.classIdsByObjectId.get(sourceObjectId) || new Set();
  const targetClasses = index.classIdsByObjectId.get(targetObjectId) || new Set();
  return [...sourceClasses].filter(classId => targetClasses.has(classId)).sort(compareText);
}

function normalizeHomogeneousDirection(value) {
  const direction = String(value ?? 'both').trim().toLowerCase();
  if (['direct', 'outgoing', 'forward'].includes(direction)) return 'direct';
  if (['inverse', 'incoming', 'reverse'].includes(direction)) return 'inverse';
  return direction === 'both' ? 'both' : '';
}

function linkMatchesStep(index, objectLink, step, fromObjectId, toObjectId) {
  const linkIds = normalizeIdFilter(
    step.linkId ?? step.classLinkId ?? step.relationshipId,
    step.linkIds ?? step.classLinkIds ?? step.relationshipIds
  );
  if (linkIds.size && !linkIds.has(objectLink.linkId)) return false;

  const sourceClasses = normalizeIdFilter(step.sourceClassId, step.sourceClassIds);
  const targetClasses = normalizeIdFilter(step.targetClassId, step.targetClassIds);
  const fromClasses = normalizeIdFilter(step.fromClassId, step.fromClassIds);
  const toClasses = normalizeIdFilter(step.toClassId, step.toClassIds);
  const sourceHyperclasses = normalizeIdFilter(step.sourceHyperclassId, step.sourceHyperclassIds);
  const targetHyperclasses = normalizeIdFilter(step.targetHyperclassId, step.targetHyperclassIds);
  const fromHyperclasses = normalizeIdFilter(step.fromHyperclassId, step.fromHyperclassIds);
  const toHyperclasses = normalizeIdFilter(step.toHyperclassId, step.toHyperclassIds);
  if (!matchesObjectClasses(index, objectLink.sourceObjectId, sourceClasses)) return false;
  if (!matchesObjectClasses(index, objectLink.targetObjectId, targetClasses)) return false;
  if (!matchesObjectClasses(index, fromObjectId, fromClasses)) return false;
  if (!matchesObjectClasses(index, toObjectId, toClasses)) return false;
  if (!matchesObjectHyperclasses(index, objectLink.sourceObjectId, sourceHyperclasses)) return false;
  if (!matchesObjectHyperclasses(index, objectLink.targetObjectId, targetHyperclasses)) return false;
  if (!matchesObjectHyperclasses(index, fromObjectId, fromHyperclasses)) return false;
  if (!matchesObjectHyperclasses(index, toObjectId, toHyperclasses)) return false;

  if (typeof step.objectLinkFilter === 'function' && !step.objectLinkFilter(objectLink.raw, {
    sourceObject: index.objectById.get(objectLink.sourceObjectId),
    targetObject: index.objectById.get(objectLink.targetObjectId)
  })) return false;
  if (typeof step.objectFilter === 'function' && !step.objectFilter(index.objectById.get(toObjectId))) return false;
  return true;
}

function stepTransitions(index, objectId, step, diagnosticState, diagnostics) {
  const candidates = [];
  if (step.kind === 'direct') {
    for (const objectLink of index.outgoingByObjectId.get(objectId) || []) {
      candidates.push({ objectLink, direction: 'direct', toObjectId: objectLink.targetObjectId });
    }
  } else if (step.kind === 'inverse') {
    for (const objectLink of index.incomingByObjectId.get(objectId) || []) {
      candidates.push({ objectLink, direction: 'inverse', toObjectId: objectLink.sourceObjectId });
    }
  } else {
    const direction = normalizeHomogeneousDirection(step.direction);
    if (!direction) {
      const key = `${step.queryPath}:homogeneous-direction`;
      if (!diagnosticState.has(key)) {
        diagnosticState.add(key);
        diagnostics.push(makeDiagnostic('error', 'invalid-homogeneous-direction', 'Homogeneous direction must be direct, inverse, or both.', `${step.queryPath}.direction`));
      }
      return [];
    }
    if (direction === 'direct' || direction === 'both') {
      for (const objectLink of index.outgoingByObjectId.get(objectId) || []) {
        candidates.push({ objectLink, direction: 'direct', toObjectId: objectLink.targetObjectId });
      }
    }
    if (direction === 'inverse' || direction === 'both') {
      for (const objectLink of index.incomingByObjectId.get(objectId) || []) {
        candidates.push({ objectLink, direction: 'inverse', toObjectId: objectLink.sourceObjectId });
      }
    }
  }

  const classFilter = normalizeIdFilter(step.classId, step.classIds);
  const transitions = [];
  for (const candidate of candidates) {
    const { objectLink, direction, toObjectId } = candidate;
    if (!linkMatchesStep(index, objectLink, step, objectId, toObjectId)) continue;
    if (step.kind === 'homogeneous') {
      const sharedClasses = homogeneousClassIds(index, objectId, toObjectId);
      const matchingClasses = classFilter.size
        ? sharedClasses.filter(classId => classFilter.has(classId))
        : sharedClasses;
      if (!matchingClasses.length) {
        if (!sharedClasses.length) {
          const key = `${step.queryPath}:${objectLink.id}:class`;
          if (!diagnosticState.has(key)) {
            diagnosticState.add(key);
            diagnostics.push(makeDiagnostic(
              'warning',
              'non-homogeneous-object-link',
              `Object link ${objectLink.id} does not connect objects with a shared class membership.`,
              objectLink.path,
              { objectLinkId: objectLink.id }
            ));
          }
        }
        continue;
      }
    }
    transitions.push({
      objectLink,
      direction,
      fromObjectId: objectId,
      toObjectId
    });
  }

  const seen = new Set();
  return transitions
    .sort((left, right) => (
      compareText(left.objectLink.id, right.objectLink.id)
      || compareText(left.direction, right.direction)
      || compareText(left.toObjectId, right.toObjectId)
    ))
    .filter(transition => {
      const key = `${transition.objectLink.id}\u0000${transition.direction}\u0000${transition.toObjectId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function explicitStartObjectIds(query) {
  const start = asObject(query.start);
  const raw = query.startObjectIds
    ?? query.objectIds
    ?? start?.objectIds
    ?? start?.ids
    ?? (typeof query.start === 'string' || Array.isArray(query.start) ? query.start : undefined);
  if (raw === undefined || raw === null) return [];
  return sortedUnique(Array.isArray(raw) ? raw : [raw]);
}

function selectedStartObjectIds(index, query, diagnostics) {
  const explicitIds = explicitStartObjectIds(query);
  const membershipIds = normalizeIdFilter(query.startMembershipId, query.startMembershipIds);
  const classIds = normalizeIdFilter(
    query.startClassId ?? query.start?.classId,
    query.startClassIds ?? query.start?.classIds
  );
  const hyperclassIds = normalizeIdFilter(
    query.startHyperclassId ?? query.start?.hyperclassId,
    query.startHyperclassIds ?? query.start?.hyperclassIds
  );
  const selected = new Set();

  for (const objectId of explicitIds) {
    if (!index.objectById.has(objectId)) {
      diagnostics.push(makeDiagnostic('warning', 'unknown-start-object', `Start object ${objectId} does not exist.`, 'query.startObjectIds', { objectId }));
      continue;
    }
    selected.add(objectId);
  }
  for (const membershipId of membershipIds) {
    const membership = index.membershipById.get(membershipId);
    if (!membership) {
      diagnostics.push(makeDiagnostic('warning', 'unknown-start-membership', `Start membership ${membershipId} does not exist.`, 'query.startMembershipIds', { membershipId }));
      continue;
    }
    if (membership.objectId) {
      selected.add(membership.objectId);
    } else {
      for (const objectId of selectObjectIdsByClass(index, membership.classId)) selected.add(objectId);
    }
  }
  if (classIds.size) {
    for (const object of index.objects) {
      const objectId = cleanId(object.id);
      if (matchesObjectClasses(index, objectId, classIds)) selected.add(objectId);
    }
  }
  if (hyperclassIds.size) {
    for (const object of index.objects) {
      const objectId = cleanId(object.id);
      if (matchesObjectHyperclasses(index, objectId, hyperclassIds)) selected.add(objectId);
    }
  }
  if (!explicitIds.length && !membershipIds.size && !classIds.size && !hyperclassIds.size) {
    diagnostics.push(makeDiagnostic('error', 'missing-query-start', 'Functor query requires object, membership, class, or hyperclass start selectors.', 'query'));
  }
  if (classIds.size && ![...selected].some(objectId => matchesObjectClasses(index, objectId, classIds))) {
    diagnostics.push(makeDiagnostic('warning', 'empty-start-class', `No objects match start class ${[...classIds].join(', ')}.`, 'query.startClassIds'));
  }
  if (hyperclassIds.size && ![...selected].some(objectId => matchesObjectHyperclasses(index, objectId, hyperclassIds))) {
    diagnostics.push(makeDiagnostic('warning', 'empty-start-hyperclass', `No objects match start hyperclass ${[...hyperclassIds].join(', ')}.`, 'query.startHyperclassIds'));
  }
  return [...selected].sort(compareText);
}

function pathSignature(path) {
  return `${path.objectIds.join('\u0001')}\u0002${path.objectLinkIds.join('\u0001')}\u0002${path.directions.join('\u0001')}`;
}

function normalizedPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export function executeFunctorQuery(modelOrIndex, query = {}, options = {}) {
  const index = modelOrIndex?.indexType === INDEX_MARKER ? modelOrIndex : buildFunctorIndex(modelOrIndex, options);
  const diagnostics = [...index.diagnostics];
  const queryObject = asObject(query);
  if (!queryObject) {
    diagnostics.push(makeDiagnostic('error', 'invalid-functor-query', 'Functor query must be an object.', 'query'));
  }
  const safeQuery = queryObject || {};
  const limits = {
    maxPaths: normalizedPositiveInteger(safeQuery.maxPaths ?? options.maxPaths, DEFAULT_FUNCTOR_QUERY_LIMITS.maxPaths),
    maxSteps: normalizedPositiveInteger(safeQuery.maxSteps ?? options.maxSteps, DEFAULT_FUNCTOR_QUERY_LIMITS.maxSteps),
    maxCompositionDepth: normalizedPositiveInteger(
      safeQuery.maxCompositionDepth ?? options.maxCompositionDepth,
      DEFAULT_FUNCTOR_QUERY_LIMITS.maxCompositionDepth
    )
  };
  const rawSteps = safeQuery.steps
    ?? safeQuery.chain
    ?? (safeQuery.kind || safeQuery.functor ? [safeQuery] : []);
  const steps = flattenSteps(rawSteps, diagnostics, limits);
  if (steps.length > limits.maxSteps) {
    diagnostics.push(makeDiagnostic('error', 'too-many-functor-steps', `Functor query exceeds ${limits.maxSteps} steps.`, 'query.steps'));
  }
  const effectiveSteps = steps.slice(0, limits.maxSteps);
  const startObjectIds = selectedStartObjectIds(index, safeQuery, diagnostics);

  let paths = startObjectIds.map(objectId => ({
    objectIds: [objectId],
    objectLinkIds: [],
    directions: [],
    transitions: []
  }));
  let truncated = false;
  const diagnosticState = new Set();
  effectiveSteps.forEach((step, stepIndex) => {
    const nextPaths = [];
    let reachedPathLimit = false;
    pathLoop: for (const path of paths) {
      const fromObjectId = path.objectIds[path.objectIds.length - 1];
      for (const transition of stepTransitions(index, fromObjectId, step, diagnosticState, diagnostics)) {
        if (safeQuery.allowCycles === false && path.objectIds.includes(transition.toObjectId)) continue;
        nextPaths.push({
          objectIds: [...path.objectIds, transition.toObjectId],
          objectLinkIds: [...path.objectLinkIds, transition.objectLink.id],
          directions: [...path.directions, transition.direction],
          transitions: [...path.transitions, {
            stepIndex,
            kind: step.kind,
            direction: transition.direction,
            objectLinkId: transition.objectLink.id,
            linkId: transition.objectLink.linkId,
            fromObjectId: transition.fromObjectId,
            toObjectId: transition.toObjectId
          }]
        });
        if (nextPaths.length > limits.maxPaths) {
          reachedPathLimit = true;
          break pathLoop;
        }
      }
    }
    const uniquePaths = new Map();
    for (const path of nextPaths.sort((left, right) => compareText(pathSignature(left), pathSignature(right)))) {
      const signature = pathSignature(path);
      if (!uniquePaths.has(signature)) uniquePaths.set(signature, path);
    }
    paths = [...uniquePaths.values()];
    if (reachedPathLimit || paths.length > limits.maxPaths) {
      paths = paths.slice(0, limits.maxPaths);
      truncated = true;
      diagnostics.push(makeDiagnostic(
        'warning',
        'functor-path-limit',
        `Functor result was truncated to ${limits.maxPaths} paths.`,
        step.queryPath,
        { maxPaths: limits.maxPaths, stepIndex }
      ));
    }
  });

  paths.sort((left, right) => compareText(pathSignature(left), pathSignature(right)));
  const objectIds = sortedUnique(paths.map(path => path.objectIds[path.objectIds.length - 1]));
  const objects = objectIds.map(objectId => index.objectById.get(objectId));
  const finalDiagnostics = sortDiagnostics(diagnostics);
  return {
    valid: !finalDiagnostics.some(diagnostic => diagnostic.severity === 'error'),
    objectIds,
    objects,
    paths,
    startObjectIds,
    steps: effectiveSteps.map(({ queryPath, ...step }) => ({ ...step })),
    diagnostics: finalDiagnostics,
    errors: finalDiagnostics.filter(diagnostic => diagnostic.severity === 'error').map(diagnostic => `${diagnostic.path}: ${diagnostic.message}`),
    warnings: finalDiagnostics.filter(diagnostic => diagnostic.severity === 'warning').map(diagnostic => `${diagnostic.path}: ${diagnostic.message}`),
    truncated
  };
}

export function composeFunctorSteps(...steps) {
  const flattened = steps.length === 1 && Array.isArray(steps[0]) ? steps[0] : steps;
  return { kind: 'chain', steps: flattened };
}

export function createFunctorQueryEngine(model, options = {}) {
  const index = buildFunctorIndex(model, options);
  return Object.freeze({
    index,
    execute(query, queryOptions = {}) {
      return executeFunctorQuery(index, query, { ...options, ...queryOptions });
    },
    objectClassIds(objectId) {
      return resolveObjectClassIds(index, objectId);
    },
    objectHyperclassIds(objectId) {
      return resolveObjectHyperclassIds(index, objectId);
    },
    objectIdsForClass(classId) {
      return selectObjectIdsByClass(index, classId);
    },
    objectIdsForHyperclass(hyperclassId) {
      return selectObjectIdsByHyperclass(index, hyperclassId);
    }
  });
}
