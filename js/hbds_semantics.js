export const HBDS_SEMANTIC_VERSION = 1;
export const HBDS_SEMANTICS_VERSION = HBDS_SEMANTIC_VERSION;

const SEMANTIC_COLLECTIONS = ['object', 'objectLink', 'membership', 'inheritance'];

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null);
}

function cleanId(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeVersion(value) {
  if (value === undefined || value === null || value === '') return HBDS_SEMANTIC_VERSION;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function normalizeEntityInput(value) {
  return isObject(value) ? value : {};
}

function semanticArray(hypergraph, key) {
  return Array.isArray(hypergraph?.[key]) ? hypergraph[key] : [];
}

export function hasSemanticLayer(model) {
  const metadata = isObject(model?.metadata) ? model.metadata : {};
  const hypergraph = isObject(model?.hypergraph) ? model.hypergraph : {};
  return hasOwn(metadata, 'semanticVersion')
    || hasOwn(metadata, 'semanticsVersion')
    || SEMANTIC_COLLECTIONS.some(key => hasOwn(hypergraph, key));
}

export function normalizeAttributeValue(value) {
  const source = normalizeEntityInput(value);
  const normalized = {
    ...source,
    attributeId: cleanId(firstDefined(source.attributeId, source.attribute, source.id)),
    value: hasOwn(source, 'value') ? clone(source.value) : undefined
  };
  delete normalized.attribute;
  delete normalized.id;
  return normalized;
}

function normalizeAttributeValues(value) {
  if (Array.isArray(value)) return value.map(normalizeAttributeValue);
  if (isObject(value)) {
    return Object.entries(value).map(([attributeId, attributeValue]) => ({
      attributeId: cleanId(attributeId),
      value: clone(attributeValue)
    }));
  }
  return [];
}

export function normalizeObjectData(value = {}) {
  const source = normalizeEntityInput(value);
  const normalized = {
    ...source,
    id: cleanId(source.id),
    classId: cleanId(firstDefined(source.classId, source.class, source.classRef)),
    attributeValues: normalizeAttributeValues(firstDefined(
      source.attributeValues,
      source.attributes,
      source.values
    ))
  };
  if (source.name !== undefined && source.name !== null) normalized.name = String(source.name);
  delete normalized.class;
  delete normalized.classRef;
  delete normalized.attributes;
  delete normalized.values;
  return normalized;
}

export function normalizeObjectLinkData(value = {}) {
  const source = normalizeEntityInput(value);
  const normalized = {
    ...source,
    id: cleanId(source.id),
    classLinkId: cleanId(firstDefined(source.classLinkId, source.linkId, source.relationshipId)),
    sourceObjectId: cleanId(firstDefined(source.sourceObjectId, source.source)),
    targetObjectId: cleanId(firstDefined(source.targetObjectId, source.target))
  };
  delete normalized.linkId;
  delete normalized.relationshipId;
  delete normalized.source;
  delete normalized.target;
  return normalized;
}

export function normalizeMembershipData(value = {}) {
  const source = normalizeEntityInput(value);
  const normalized = {
    ...source,
    id: cleanId(source.id),
    classId: cleanId(firstDefined(source.classId, source.memberClassId, source.memberId)),
    hyperclassId: cleanId(firstDefined(source.hyperclassId, source.groupId))
  };
  delete normalized.memberClassId;
  delete normalized.memberId;
  delete normalized.groupId;
  return normalized;
}

export function normalizeInheritanceData(value = {}) {
  const source = normalizeEntityInput(value);
  const normalized = {
    ...source,
    id: cleanId(source.id),
    subClassId: cleanId(firstDefined(
      source.subClassId,
      source.subclassId,
      source.childClassId,
      source.sourceClassId
    )),
    superClassId: cleanId(firstDefined(
      source.superClassId,
      source.superclassId,
      source.baseClassId,
      source.targetClassId
    ))
  };
  delete normalized.subclassId;
  delete normalized.childClassId;
  delete normalized.sourceClassId;
  delete normalized.superclassId;
  delete normalized.baseClassId;
  delete normalized.targetClassId;
  return normalized;
}

export function normalizeSemanticModel(model = {}) {
  const normalized = clone(isObject(model) ? model : {});
  if (!hasSemanticLayer(normalized)) return normalized;

  normalized.metadata = isObject(normalized.metadata) ? normalized.metadata : {};
  normalized.metadata.semanticVersion = normalizeVersion(firstDefined(
    normalized.metadata.semanticVersion,
    normalized.metadata.semanticsVersion
  ));
  delete normalized.metadata.semanticsVersion;

  normalized.hypergraph = isObject(normalized.hypergraph) ? normalized.hypergraph : {};
  normalized.hypergraph.object = semanticArray(normalized.hypergraph, 'object').map(normalizeObjectData);
  normalized.hypergraph.objectLink = semanticArray(normalized.hypergraph, 'objectLink').map(normalizeObjectLinkData);
  normalized.hypergraph.membership = semanticArray(normalized.hypergraph, 'membership').map(normalizeMembershipData);
  normalized.hypergraph.inheritance = semanticArray(normalized.hypergraph, 'inheritance').map(normalizeInheritanceData);
  return normalized;
}

function addToArrayMap(map, key, value) {
  if (!key) return;
  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
}

export function buildSemanticIndex(model = {}) {
  const normalizedModel = normalizeSemanticModel(model);
  const hypergraph = isObject(normalizedModel.hypergraph) ? normalizedModel.hypergraph : {};
  const classes = Array.isArray(hypergraph.class) ? hypergraph.class : [];
  const classLinks = Array.isArray(hypergraph.link) ? hypergraph.link : [];
  const objects = semanticArray(hypergraph, 'object');
  const objectLinks = semanticArray(hypergraph, 'objectLink');
  const memberships = semanticArray(hypergraph, 'membership');
  const inheritances = semanticArray(hypergraph, 'inheritance');

  const index = {
    isSemanticIndex: true,
    model: normalizedModel,
    classById: new Map(),
    attributeById: new Map(),
    attributeOwnerById: new Map(),
    classLinkById: new Map(),
    objectById: new Map(),
    objectLinkById: new Map(),
    membershipById: new Map(),
    membershipsByClassId: new Map(),
    inheritanceById: new Map(),
    inheritancesBySubClassId: new Map()
  };

  for (const node of classes) {
    if (!isObject(node)) continue;
    const nodeId = cleanId(node.id);
    if (!nodeId) continue;
    index.classById.set(nodeId, node);
    const attributes = Array.isArray(node.attributes) ? node.attributes : [];
    for (const attribute of attributes) {
      if (!isObject(attribute)) continue;
      const attributeId = cleanId(attribute.id);
      if (!attributeId) continue;
      index.attributeById.set(attributeId, attribute);
      index.attributeOwnerById.set(attributeId, nodeId);
    }
  }
  for (const link of classLinks) {
    if (!isObject(link)) continue;
    const linkId = cleanId(link.id);
    if (linkId) index.classLinkById.set(linkId, link);
  }
  for (const object of objects) {
    if (object.id) index.objectById.set(object.id, object);
  }
  for (const objectLink of objectLinks) {
    if (objectLink.id) index.objectLinkById.set(objectLink.id, objectLink);
  }
  for (const membership of memberships) {
    if (membership.id) index.membershipById.set(membership.id, membership);
    addToArrayMap(index.membershipsByClassId, membership.classId, membership);
  }
  for (const inheritance of inheritances) {
    if (inheritance.id) index.inheritanceById.set(inheritance.id, inheritance);
    addToArrayMap(index.inheritancesBySubClassId, inheritance.subClassId, inheritance);
  }
  return index;
}

function asSemanticIndex(modelOrIndex) {
  return modelOrIndex?.isSemanticIndex === true ? modelOrIndex : buildSemanticIndex(modelOrIndex);
}

function inheritanceOrder(index, classId) {
  const requestedId = cleanId(classId);
  if (!index.classById.has(requestedId)) return [];
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();

  const visit = currentId => {
    if (!currentId || visited.has(currentId) || visiting.has(currentId)) return;
    visiting.add(currentId);
    for (const inheritance of index.inheritancesBySubClassId.get(currentId) || []) {
      if (index.classById.has(inheritance.superClassId)) visit(inheritance.superClassId);
    }
    visiting.delete(currentId);
    visited.add(currentId);
    ordered.push(currentId);
  };

  visit(requestedId);
  return ordered;
}

export function getClassAncestors(modelOrIndex, classId) {
  const index = asSemanticIndex(modelOrIndex);
  const requestedId = cleanId(classId);
  return inheritanceOrder(index, requestedId).filter(id => id !== requestedId);
}

export function getEffectiveClassAttributes(modelOrIndex, classId) {
  const index = asSemanticIndex(modelOrIndex);
  const requestedId = cleanId(classId);
  const attributesByKey = new Map();
  const order = [];

  for (const ownerId of inheritanceOrder(index, requestedId)) {
    const node = index.classById.get(ownerId);
    const attributes = Array.isArray(node?.attributes) ? node.attributes : [];
    attributes.forEach((attribute, attributeIndex) => {
      const attributeId = isObject(attribute) ? cleanId(attribute.id) : '';
      const key = attributeId || `anonymous:${ownerId}:${attributeIndex}`;
      const normalizedAttribute = isObject(attribute)
        ? clone(attribute)
        : { name: String(attribute ?? '') };
      const effectiveAttribute = {
        ...normalizedAttribute,
        declaredOnClassId: ownerId,
        inherited: ownerId !== requestedId
      };
      if (!attributesByKey.has(key)) order.push(key);
      attributesByKey.set(key, effectiveAttribute);
    });
  }
  return order.map(key => attributesByKey.get(key));
}

function collectMembershipDetails(index, classId) {
  const requestedId = cleanId(classId);
  const details = new Map();
  const queue = [];

  const addMembership = (membership, sourceClassId, relation) => {
    const hyperclassId = membership.hyperclassId;
    const hyperclass = index.classById.get(hyperclassId);
    if (!hyperclass || hyperclass.type !== 'hyperclass') return;
    let detail = details.get(hyperclassId);
    if (!detail) {
      detail = {
        hyperclassId,
        hyperclass: clone(hyperclass),
        membershipIds: [],
        sourceClassIds: [],
        direct: false,
        inherited: false,
        transitive: false
      };
      details.set(hyperclassId, detail);
      queue.push(hyperclassId);
    }
    if (membership.id && !detail.membershipIds.includes(membership.id)) detail.membershipIds.push(membership.id);
    if (sourceClassId && !detail.sourceClassIds.includes(sourceClassId)) detail.sourceClassIds.push(sourceClassId);
    if (relation === 'direct') detail.direct = true;
    if (relation === 'inherited') detail.inherited = true;
    if (relation === 'transitive') detail.transitive = true;
  };

  for (const ownerId of inheritanceOrder(index, requestedId)) {
    const relation = ownerId === requestedId ? 'direct' : 'inherited';
    for (const membership of index.membershipsByClassId.get(ownerId) || []) {
      addMembership(membership, ownerId, relation);
    }
  }

  for (let position = 0; position < queue.length; position += 1) {
    const memberHyperclassId = queue[position];
    for (const membership of index.membershipsByClassId.get(memberHyperclassId) || []) {
      addMembership(membership, memberHyperclassId, 'transitive');
    }
  }
  return [...details.values()];
}

export function getEffectiveClassMemberships(modelOrIndex, classId) {
  return collectMembershipDetails(asSemanticIndex(modelOrIndex), classId);
}

export function getEffectiveHyperclassMemberships(modelOrIndex, classId) {
  return getEffectiveClassMemberships(modelOrIndex, classId);
}

export function getEffectiveHyperclassIds(modelOrIndex, classId) {
  return getEffectiveClassMemberships(modelOrIndex, classId).map(detail => detail.hyperclassId);
}

function endpointMatch(index, classId, endpointClassId, ancestorIds, membershipIds) {
  if (endpointClassId === classId) return { via: 'direct', matchedClassId: classId };
  const endpoint = index.classById.get(endpointClassId);
  if (!endpoint) return null;
  if (endpoint.type === 'hyperclass') {
    return membershipIds.has(endpointClassId)
      ? { via: 'membership', matchedClassId: endpointClassId }
      : null;
  }
  return ancestorIds.has(endpointClassId)
    ? { via: 'inheritance', matchedClassId: endpointClassId }
    : null;
}

export function getEffectiveClassLinks(modelOrIndex, classId) {
  const index = asSemanticIndex(modelOrIndex);
  const requestedId = cleanId(classId);
  if (!index.classById.has(requestedId)) return [];
  const ancestorIds = new Set(getClassAncestors(index, requestedId));
  const membershipIds = new Set(getEffectiveHyperclassIds(index, requestedId));
  const links = [];

  for (const link of index.classLinkById.values()) {
    const roles = [];
    const sourceMatch = endpointMatch(
      index,
      requestedId,
      cleanId(link.sourceClassId),
      ancestorIds,
      membershipIds
    );
    const targetMatch = endpointMatch(
      index,
      requestedId,
      cleanId(link.targetClassId),
      ancestorIds,
      membershipIds
    );
    if (sourceMatch) roles.push({ role: 'source', endpointClassId: cleanId(link.sourceClassId), ...sourceMatch });
    if (targetMatch) roles.push({ role: 'target', endpointClassId: cleanId(link.targetClassId), ...targetMatch });
    if (!roles.length) continue;
    links.push({
      ...clone(link),
      effectiveRoles: roles,
      inherited: roles.some(role => role.via === 'inheritance'),
      membershipBased: roles.some(role => role.via === 'membership')
    });
  }
  return links;
}

function findDirectedCycles(adjacency) {
  const state = new Map();
  const path = [];
  const cycles = [];
  const seenCycles = new Set();

  const visit = nodeId => {
    const currentState = state.get(nodeId) || 0;
    if (currentState === 2) return;
    if (currentState === 1) {
      const start = path.lastIndexOf(nodeId);
      const cycle = [...path.slice(start), nodeId];
      const edgeKeys = cycle.slice(0, -1).map((value, index) => `${value}>${cycle[index + 1]}`).sort();
      const key = edgeKeys.join('|');
      if (!seenCycles.has(key)) {
        seenCycles.add(key);
        cycles.push(cycle);
      }
      return;
    }
    state.set(nodeId, 1);
    path.push(nodeId);
    for (const nextId of adjacency.get(nodeId) || []) visit(nextId);
    path.pop();
    state.set(nodeId, 2);
  };

  const nodes = new Set([...adjacency.keys(), ...[...adjacency.values()].flat()]);
  for (const nodeId of nodes) visit(nodeId);
  return cycles;
}

function validateCollectionType(hypergraph, key, errors) {
  if (hasOwn(hypergraph, key) && !Array.isArray(hypergraph[key])) {
    errors.push(`hypergraph.${key} must be an array`);
  }
}

function registerId(registry, value, owner, errors) {
  const id = cleanId(value);
  if (!id) {
    errors.push(`${owner} missing id`);
    return '';
  }
  if (registry.has(id)) errors.push(`duplicate model id ${id} used by ${registry.get(id)} and ${owner}`);
  else registry.set(id, owner);
  return id;
}

function classEndpointCompatible(index, objectClassId, endpointClassId) {
  const requestedId = cleanId(objectClassId);
  const endpointId = cleanId(endpointClassId);
  if (!requestedId || !endpointId) return false;
  if (requestedId === endpointId) return true;
  const endpoint = index.classById.get(endpointId);
  if (!endpoint) return false;
  if (endpoint.type === 'hyperclass') {
    return getEffectiveHyperclassIds(index, requestedId).includes(endpointId);
  }
  return getClassAncestors(index, requestedId).includes(endpointId);
}

export function validateSemanticModel(model = {}) {
  const errors = [];
  const warnings = [];
  if (!hasSemanticLayer(model)) return { valid: true, errors, warnings };
  if (!isObject(model)) return { valid: false, errors: ['model must be an object'], warnings };

  const metadata = isObject(model.metadata) ? model.metadata : {};
  const hypergraph = isObject(model.hypergraph) ? model.hypergraph : {};
  if (!isObject(model.hypergraph)) errors.push('hypergraph must be an object');
  for (const key of SEMANTIC_COLLECTIONS) validateCollectionType(hypergraph, key, errors);

  const version = normalizeVersion(firstDefined(metadata.semanticVersion, metadata.semanticsVersion));
  if (version !== HBDS_SEMANTIC_VERSION) {
    errors.push(`unsupported metadata.semanticVersion ${String(version)}`);
  }

  const normalized = normalizeSemanticModel(model);
  const index = buildSemanticIndex(normalized);
  const normalizedHypergraph = index.model.hypergraph || {};
  const classes = Array.isArray(normalizedHypergraph.class) ? normalizedHypergraph.class : [];
  const classLinks = Array.isArray(normalizedHypergraph.link) ? normalizedHypergraph.link : [];
  const objects = semanticArray(normalizedHypergraph, 'object');
  const objectLinks = semanticArray(normalizedHypergraph, 'objectLink');
  const memberships = semanticArray(normalizedHypergraph, 'membership');
  const inheritances = semanticArray(normalizedHypergraph, 'inheritance');
  const ids = new Map();

  for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
    const node = classes[classIndex];
    if (!isObject(node)) continue;
    const nodeId = registerId(ids, node.id, `hypergraph.class[${classIndex}]`, errors);
    const attributes = Array.isArray(node.attributes) ? node.attributes : [];
    for (let attributeIndex = 0; attributeIndex < attributes.length; attributeIndex += 1) {
      const attribute = attributes[attributeIndex];
      if (!isObject(attribute)) continue;
      registerId(ids, attribute.id, `class ${nodeId || classIndex} attribute[${attributeIndex}]`, errors);
    }
  }
  for (let linkIndex = 0; linkIndex < classLinks.length; linkIndex += 1) {
    const link = classLinks[linkIndex];
    if (isObject(link)) registerId(ids, link.id, `hypergraph.link[${linkIndex}]`, errors);
  }

  const membershipPairs = new Set();
  const membershipAdjacency = new Map();
  memberships.forEach((membership, membershipIndex) => {
    const owner = `hypergraph.membership[${membershipIndex}]`;
    registerId(ids, membership.id, owner, errors);
    const memberClass = index.classById.get(membership.classId);
    const hyperclass = index.classById.get(membership.hyperclassId);
    if (!membership.classId || !memberClass) errors.push(`${owner} classId must reference an existing class`);
    if (!membership.hyperclassId || !hyperclass || hyperclass.type !== 'hyperclass') {
      errors.push(`${owner} hyperclassId must reference an existing hyperclass`);
    }
    if (membership.classId && membership.classId === membership.hyperclassId) {
      errors.push(`${owner} cannot make a hyperclass a member of itself`);
    }
    const pair = `${membership.classId}>${membership.hyperclassId}`;
    if (membershipPairs.has(pair)) errors.push(`${owner} duplicates membership ${pair}`);
    else membershipPairs.add(pair);
    addToArrayMap(membershipAdjacency, membership.classId, membership.hyperclassId);
  });

  const inheritancePairs = new Set();
  const inheritanceAdjacency = new Map();
  inheritances.forEach((inheritance, inheritanceIndex) => {
    const owner = `hypergraph.inheritance[${inheritanceIndex}]`;
    registerId(ids, inheritance.id, owner, errors);
    const subClass = index.classById.get(inheritance.subClassId);
    const superClass = index.classById.get(inheritance.superClassId);
    if (!inheritance.subClassId || !subClass || subClass.type === 'hyperclass') {
      errors.push(`${owner} subClassId must reference an existing regular class`);
    }
    if (!inheritance.superClassId || !superClass || superClass.type === 'hyperclass') {
      errors.push(`${owner} superClassId must reference an existing regular class`);
    }
    if (inheritance.subClassId && inheritance.subClassId === inheritance.superClassId) {
      errors.push(`${owner} cannot inherit a class from itself`);
    }
    const pair = `${inheritance.subClassId}>${inheritance.superClassId}`;
    if (inheritancePairs.has(pair)) errors.push(`${owner} duplicates inheritance ${pair}`);
    else inheritancePairs.add(pair);
    addToArrayMap(inheritanceAdjacency, inheritance.subClassId, inheritance.superClassId);
  });

  for (const cycle of findDirectedCycles(inheritanceAdjacency)) {
    errors.push(`inheritance cycle detected: ${cycle.join(' -> ')}`);
  }
  for (const cycle of findDirectedCycles(membershipAdjacency)) {
    errors.push(`membership cycle detected: ${cycle.join(' -> ')}`);
  }

  objects.forEach((object, objectIndex) => {
    const owner = `hypergraph.object[${objectIndex}]`;
    registerId(ids, object.id, owner, errors);
    const objectClass = index.classById.get(object.classId);
    if (!object.classId || !objectClass || objectClass.type === 'hyperclass') {
      errors.push(`${owner} classId must reference an existing regular class`);
    }
    if (!Array.isArray(object.attributeValues)) {
      errors.push(`${owner} attributeValues must be an array`);
      return;
    }
    const effectiveAttributeIds = new Set(
      objectClass
        ? getEffectiveClassAttributes(index, object.classId).map(attribute => cleanId(attribute.id)).filter(Boolean)
        : []
    );
    const usedAttributeIds = new Set();
    object.attributeValues.forEach((attributeValue, valueIndex) => {
      const valueOwner = `${owner}.attributeValues[${valueIndex}]`;
      const attributeId = cleanId(attributeValue?.attributeId);
      if (!attributeId) {
        errors.push(`${valueOwner} missing attributeId`);
        return;
      }
      if (usedAttributeIds.has(attributeId)) errors.push(`${valueOwner} duplicates attributeId ${attributeId}`);
      else usedAttributeIds.add(attributeId);
      if (!index.attributeById.has(attributeId)) errors.push(`${valueOwner} attributeId ${attributeId} not found`);
      else if (!effectiveAttributeIds.has(attributeId)) {
        errors.push(`${valueOwner} attributeId ${attributeId} is not effective for class ${object.classId}`);
      }
    });
  });

  objectLinks.forEach((objectLink, objectLinkIndex) => {
    const owner = `hypergraph.objectLink[${objectLinkIndex}]`;
    registerId(ids, objectLink.id, owner, errors);
    const classLink = index.classLinkById.get(objectLink.classLinkId);
    const sourceObject = index.objectById.get(objectLink.sourceObjectId);
    const targetObject = index.objectById.get(objectLink.targetObjectId);
    if (!objectLink.classLinkId || !classLink) errors.push(`${owner} classLinkId must reference an existing class link`);
    if (!objectLink.sourceObjectId || !sourceObject) errors.push(`${owner} sourceObjectId must reference an existing object`);
    if (!objectLink.targetObjectId || !targetObject) errors.push(`${owner} targetObjectId must reference an existing object`);
    if (!classLink || !sourceObject || !targetObject) return;
    if (!classEndpointCompatible(index, sourceObject.classId, classLink.sourceClassId)) {
      errors.push(`${owner} source object class ${sourceObject.classId} is incompatible with ${classLink.sourceClassId}`);
    }
    if (!classEndpointCompatible(index, targetObject.classId, classLink.targetClassId)) {
      errors.push(`${owner} target object class ${targetObject.classId} is incompatible with ${classLink.targetClassId}`);
    }
    if (objectLink.sourceObjectId === objectLink.targetObjectId && classLink.allowSelfLink === false) {
      errors.push(`${owner} self link is not allowed by class link ${objectLink.classLinkId}`);
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}
