// The structural adapter is deliberately independent of the canvas and server.
// Only names documented in the legacy corpus are accepted as functors.
export const QUERY_PROFILE = 'hbds-legacy-metamodel-query-v2';
export const QUERY_TYPES = Object.freeze({
  class: 'Classes', hyperclass: 'Hyperclasses', classAttribute: 'Class attributes',
  hyperattribute: 'Hyperclass attributes', classLink: 'Class links',
  hyperlink: 'Hyperclass links'
});
const DEFINITIONS = {
  ATT: [['class'], 'classAttribute'], ATTOF: [['classAttribute'], 'class'],
  PSC: [['class'], 'classLink'], NSC: [['class'], 'classLink'],
  INI: [['classLink'], 'class'], FIN: [['classLink'], 'class'], INV: [['classLink'], 'classLink'],
  HATT: [['hyperclass'], 'hyperattribute'], HATTOF: [['hyperattribute'], 'hyperclass'],
  HPSC: [['hyperclass'], 'hyperlink'], HNSC: [['hyperclass'], 'hyperlink'],
  HINI: [['hyperlink'], 'hyperclass'], HFIN: [['hyperlink'], 'hyperclass'], HINV: [['hyperlink'], 'hyperlink'],
  CONT: [['hyperclass'], 'class'], CONTN: [['hyperclass'], 'class'], CONTOF: [['class'], 'hyperclass'],
  HCONT: [['hyperclass'], 'hyperclass'], HCONTOF: [['hyperclass'], 'hyperclass'],
  COUPLE: [['class'], 'classLink'], CARD: [['*'], 'scalar']
};
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const identity = item => JSON.stringify([item.type, item.id, item.direction || 'forward']);
const ordered = items => [...new Map(items.map(item => [identity(item), item])).values()]
  .sort((a, b) => compare(a.type, b.type) || compare(a.id, b.id) || compare(a.direction || 'forward', b.direction || 'forward'));
const cleanId = value => value == null ? '' : String(value).trim();
export class QueryError extends Error {
  constructor(code, message, stepIndex = null) { super(message); this.code = code; this.stepIndex = stepIndex; }
}
function fail(code, message) { throw new QueryError(code, message); }

export function createQuerySnapshot(model, source = {}) {
  const serialized = JSON.stringify(model);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > 16 * 1024 * 1024) fail('MODEL_LIMIT', 'The query snapshot exceeds 16 MiB.');
  const copy = JSON.parse(serialized);
  if (!Array.isArray(copy?.hypergraph?.class) || !Array.isArray(copy?.hypergraph?.link)) {
    fail('INVALID_MODEL', 'Expected hypergraph.class and hypergraph.link arrays.');
  }
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
  return Object.freeze({ model: copy, source: Object.freeze({ ...source }),
    revision: `snapshot-${(hash >>> 0).toString(16)}`, capturedAt: new Date().toISOString() });
}

export function buildQueryIndex(snapshot) {
  const model = snapshot.model;
  const byType = new Map([...Object.keys(QUERY_TYPES), 'mixedLink'].map(type => [type, []]));
  const byIdentity = new Map(), nodes = new Map(), seenIds = new Set();
  const attrs = new Map(), outgoing = new Map(), incoming = new Map();
  const children = new Map(), parents = new Map();
  const push = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  function add(record, synthetic = false) {
    if (!record.id || (!synthetic && seenIds.has(record.id))) fail('INVALID_MODEL', `Missing or duplicate element ID at ${record.path}.`);
    if (!synthetic) seenIds.add(record.id);
    if (byIdentity.has(JSON.stringify([record.type, record.id]))) fail('INVALID_MODEL', `Duplicate query identity at ${record.path}.`);
    if (byIdentity.size >= 100000) fail('MODEL_LIMIT', 'Query models are limited to 100,000 structural elements.');
    byType.get(record.type).push(record);
    byIdentity.set(JSON.stringify([record.type, record.id]), record);
    return record;
  }
  model.hypergraph.class.forEach((node, index) => {
    if (!node || typeof node !== 'object') fail('INVALID_MODEL', `Invalid class at index ${index}.`);
    const path = `/hypergraph/class/${index}`;
    const record = add({ type: node.type === 'hyperclass' ? 'hyperclass' : 'class', id: cleanId(node.id),
      name: String(node.name || node.id || ''), path, data: node });
    nodes.set(record.id, record);
  });
  for (const node of nodes.values()) {
    const attributes = node.data.attributes || [];
    if (!Array.isArray(attributes)) fail('INVALID_MODEL', `Attributes must be an array at ${node.path}.`);
    attributes.forEach((attribute, index) => {
      const path = `${node.path}/attributes/${index}`;
      const isLegacy = attribute === null || ['string', 'number', 'boolean'].includes(typeof attribute);
      if (!isLegacy && (!attribute || typeof attribute !== 'object' || Array.isArray(attribute))) fail('INVALID_MODEL', `Invalid attribute at ${path}.`);
      const record = add({ type: node.type === 'class' ? 'classAttribute' : 'hyperattribute',
        id: isLegacy ? `@legacy:${path}` : cleanId(attribute.id),
        name: String(isLegacy ? attribute : attribute.name || attribute.id || ''),
        ownerId: node.id, ownerName: node.name, attributeIndex: index, synthetic: isLegacy, path, data: attribute }, isLegacy);
      push(attrs, node.id, record);
    });
  }
  model.hypergraph.link.forEach((link, index) => {
    if (!link || typeof link !== 'object') fail('INVALID_MODEL', `Invalid link at index ${index}.`);
    const source = nodes.get(cleanId(link.sourceClassId)), target = nodes.get(cleanId(link.targetClassId));
    if (!source || !target) fail('INVALID_MODEL', `Link ${link.id || index} has an unknown endpoint.`);
    const type = source.type !== target.type ? 'mixedLink' : source.type === 'class' ? 'classLink' : 'hyperlink';
    const record = add({ type, id: cleanId(link.id), name: String(link.name || link.rendering?.labelText || link.id || ''),
      direction: 'forward', sourceId: source.id, targetId: target.id,
      ownerName: `${source.name} → ${target.name}`, path: `/hypergraph/link/${index}`, data: link });
    push(outgoing, source.id, record); push(incoming, target.id, record);
  });
  // CH10.1 pp.31–35 and CH10.4 pp.9–12 describe declared inclusion.
  // Legacy JSON stores that graph as parentClassId / children. An opt-in semantic
  // layer is authoritative instead; its presentation nesting is never merged in.
  const explicitMembership = Object.hasOwn(model.metadata || {}, 'semanticVersion')
    || Object.hasOwn(model.metadata || {}, 'semanticsVersion')
    || ['object', 'objectLink', 'membership', 'inheritance'].some(key => Object.hasOwn(model.hypergraph, key));
  if (explicitMembership && Number(model.metadata?.semanticVersion ?? model.metadata?.semanticsVersion ?? 1) !== 1) {
    fail('INVALID_MODEL', 'Unsupported semantic version for containment queries.');
  }
  const containmentMode = explicitMembership ? 'explicitMembership' : 'declaredContainment';
  const edgeKeys = new Set(); let references = 0;
  function containmentEdge(parentId, childId) {
    if (++references > 200000) fail('QUERY_LIMIT', 'The model exceeds 200,000 containment references.');
    const parent = nodes.get(cleanId(parentId)), child = nodes.get(cleanId(childId));
    if (!parent || !child) fail('INVALID_MODEL', 'Declared containment references an unknown class or hyperclass.');
    const key = JSON.stringify([parent.id, child.id]);
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    push(children, parent.id, child); push(parents, child.id, parent);
  }
  if (explicitMembership) {
    if (Object.hasOwn(model.hypergraph, 'membership') && !Array.isArray(model.hypergraph.membership)) {
      fail('INVALID_MODEL', 'Explicit membership must be an array; an empty array means no members.');
    }
    const membershipIds = new Set();
    for (const membership of model.hypergraph.membership || []) {
      const member = nodes.get(cleanId(membership?.classId)), group = nodes.get(cleanId(membership?.hyperclassId));
      if (!member || group?.type !== 'hyperclass') fail('INVALID_MODEL', 'Membership requires an existing class or hyperclass inside a hyperclass.');
      const id = cleanId(membership.id);
      if (!id || seenIds.has(id) || membershipIds.has(id)) fail('INVALID_MODEL', 'Membership records require unique IDs.');
      membershipIds.add(id);
      containmentEdge(group.id, member.id);
    }
  } else {
    for (const node of nodes.values()) {
      if (node.data.parentClassId != null && node.data.parentClassId !== '') containmentEdge(node.data.parentClassId, node.id);
      if (node.data.children != null && !Array.isArray(node.data.children)) fail('INVALID_MODEL', `Invalid children at ${node.path}.`);
      for (const child of node.data.children || []) containmentEdge(node.id, child);
    }
  }
  // Iterative DFS distinguishes real inclusion cycles from shared descendants.
  const colors = new Map();
  for (const root of nodes.keys()) {
    if (colors.has(root)) continue;
    const stack = [{ id: root, position: 0 }]; colors.set(root, 1);
    while (stack.length) {
      const current = stack.at(-1), entries = children.get(current.id) || [];
      if (current.position === entries.length) { colors.set(current.id, 2); stack.pop(); continue; }
      const child = entries[current.position++];
      if (colors.get(child.id) === 1) fail('CONTAINMENT_CYCLE', `Containment cycle involving ${child.id}.`);
      if (!colors.has(child.id)) { colors.set(child.id, 1); stack.push({ id: child.id, position: 0 }); }
    }
  }
  byType.set('node', [...nodes.values()]);
  byType.set('link', ['classLink', 'hyperlink', 'mixedLink'].flatMap(type => byType.get(type)));
  for (const [type, entries] of byType) byType.set(type, ordered(entries));
  return { snapshot, byType, byIdentity, nodes, attrs, outgoing, incoming, children, parents, containmentMode };
}

export function functorCapability(name, index) {
  const definition = typeof name === 'string' && Object.hasOwn(DEFINITIONS, name) ? DEFINITIONS[name] : null;
  if (!definition) return { supported: false, reason: 'Outside the implemented structural subset.' };
  return { supported: true, reason: ['HATT', 'HATTOF', 'HPSC', 'HNSC', 'HINI', 'HFIN', 'HINV'].includes(name)
    ? 'Direct hyperclass definitions in the structural adapter; inheritance correspondences are not synthesized.'
    : ['CONT', 'CONTN', 'CONTOF', 'HCONT', 'HCONTOF'].includes(name)
      ? index?.containmentMode === 'explicitMembership' ? 'Uses explicit membership records; presentation nesting is ignored.'
        : 'Uses declared parent/child containment in legacy structural models; no geometric inference.'
      : name === 'COUPLE' ? 'Directed class links: PSC(source) intersected with NSC(targetClass).'
        : 'Available for recorded definitions in the structural adapter.' };
}

export function availableQuerySteps(type, index, catalog) {
  if (!Object.hasOwn(QUERY_TYPES, type)) return [];
  const compatible = definition => definition.inputTypes.includes(type) || definition.inputTypes.includes('*');
  return catalog.filter(entry => compatible(entry) && functorCapability(entry.name, index).supported);
}

export function validateQuery(index, query) {
  if (!Object.hasOwn(QUERY_TYPES, query?.type)) fail('INVALID_TYPE', 'Choose a supported starting element type.');
  if (!Array.isArray(query.steps) || query.steps.length > 32) fail('QUERY_LIMIT', 'Use at most 32 query steps.');
  if (query.ids !== undefined && !Array.isArray(query.ids)) fail('INVALID_SELECTION', 'Starting IDs must be an array.');
  let type = query.type;
  const plan = query.steps.map((call, stepIndex) => {
    const name = typeof call === 'string' ? call : call?.functor;
    const capability = functorCapability(name, index);
    if (!capability.supported) throw new QueryError('UNSUPPORTED_FUNCTOR', `${name}: ${capability.reason}`, stepIndex);
    const definition = { inputTypes: DEFINITIONS[name][0], outputType: DEFINITIONS[name][1] };
    if (type === 'scalar' || (!definition.inputTypes.includes('*') && !definition.inputTypes.includes(type))) {
      throw new QueryError('TYPE_MISMATCH', `Step ${stepIndex + 1}: ${name} cannot accept ${type}.`, stepIndex);
    }
    let targetClassId;
    if (name === 'COUPLE') {
      const parameters = call?.parameters, target = parameters?.targetClass;
      if (!parameters || Object.keys(parameters).some(key => key !== 'targetClass') || target?.type !== 'class' || typeof target.id !== 'string') {
        throw new QueryError('INVALID_PARAMETERS', 'COUPLE requires a targetClass reference of type class.', stepIndex);
      }
      targetClassId = target.id;
      if (index.nodes.get(targetClassId)?.type !== 'class') throw new QueryError('UNKNOWN_ID', `Unknown target class: ${targetClassId}`, stepIndex);
    } else if (call?.parameters && Object.keys(call.parameters).length) {
      throw new QueryError('INVALID_PARAMETERS', `${name} does not accept parameters.`, stepIndex);
    }
    type = definition.outputType;
    return { name, type, targetClassId };
  });
  const known = new Set(index.byType.get(query.type).map(item => item.id));
  for (const id of query.ids || []) if (!known.has(String(id))) fail('UNKNOWN_ID', `Unknown ${query.type} identifier: ${id}`);
  return plan;
}

export function executeQuery(index, query) {
  // Validate the whole pipeline even when its starting selection is empty.
  const plan = validateQuery(index, query);
  const selection = query.ids === undefined ? null : new Set(query.ids.map(String));
  let items = index.byType.get(query.type).filter(item => !selection || selection.has(item.id));
  let type = query.type;
  const trace = [{ operation: 'selection', type, count: items.length }];
  for (const step of plan) {
    const name = step.name;
    if (name === 'CARD') return { kind: 'scalar', type: 'scalar', value: items.length,
      trace: [...trace, { operation: name, type: 'scalar', count: 1 }] };
    const results = [];
    const descendantsSeen = new Set(); let traversed = 0;
    for (const item of items) {
      let next = [];
      if (name === 'ATT' || name === 'HATT') next = index.attrs.get(item.id) || [];
      else if (name === 'ATTOF' || name === 'HATTOF') next = [index.nodes.get(item.ownerId)];
      else if (['PSC', 'HPSC', 'NSC', 'HNSC', 'COUPLE'].includes(name)) {
        const incoming = ['NSC', 'HNSC'].includes(name);
        next = (incoming ? index.incoming : index.outgoing).get(item.id) || [];
        next = next.filter(link => link.type === step.type && (name !== 'COUPLE' || link.targetId === step.targetClassId));
      } else if (['INI', 'HINI', 'FIN', 'HFIN'].includes(name)) {
        let useSource = ['INI', 'HINI'].includes(name);
        if (item.direction === 'reverse') useSource = !useSource;
        next = [index.nodes.get(useSource ? item.sourceId : item.targetId)];
      } else if (['INV', 'HINV'].includes(name)) {
        next = [{ ...item, direction: item.direction === 'reverse' ? 'forward' : 'reverse' }];
      } else if (['CONT', 'HCONT'].includes(name)) next = (index.children.get(item.id) || []).filter(child => child.type === step.type);
      else if (['CONTOF', 'HCONTOF'].includes(name)) next = (index.parents.get(item.id) || []).filter(parent => parent.type === 'hyperclass');
      else if (name === 'CONTN' && !descendantsSeen.has(item.id)) {
        const pending = [item]; descendantsSeen.add(item.id);
        while (pending.length) {
          const node = pending.pop();
          for (const child of index.children.get(node.id) || []) {
            if (++traversed > 200000) fail('QUERY_LIMIT', 'CONTN exceeded its traversal budget; no partial result was returned.');
            if (descendantsSeen.has(child.id)) continue;
            descendantsSeen.add(child.id);
            if (child.type === 'class') next.push(child);
            pending.push(child);
          }
        }
      }
      if (results.length + next.length > 200000) fail('QUERY_LIMIT', 'The query exceeded its traversal budget.');
      for (const result of next) results.push(result);
    }
    items = ordered(results); type = step.type;
    trace.push({ operation: name, type, count: items.length });
  }
  return { kind: 'elements', type, items, trace };
}
