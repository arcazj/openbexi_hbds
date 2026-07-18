const COPY_OFFSET = { x: 0.45, y: -0.45, z: 0 };

export const PRODUCTIVITY_ROUTE_PRESETS = ['auto', 'horizontal', 'vertical', 'direct', 'orthogonal'];

function cloneValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function idSet(existingIds) {
  if (existingIds instanceof Set) return new Set([...existingIds].map(String));
  if (Array.isArray(existingIds)) return new Set(existingIds.map(String));
  return new Set();
}

function normalizeIdSeed(value, fallbackPrefix = 'item') {
  const fallback = String(fallbackPrefix || 'item').trim() || 'item';
  const clean = String(value ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || fallback;
}

export function makeUniqueId(seed, existingIds = new Set(), fallbackPrefix = 'item') {
  const taken = idSet(existingIds);
  const base = normalizeIdSeed(seed, fallbackPrefix);
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  if (existingIds && typeof existingIds.add === 'function') existingIds.add(candidate);
  return candidate;
}

function offsetPosition(position = {}) {
  return {
    ...position,
    x: Number(position.x ?? 0) + COPY_OFFSET.x,
    y: Number(position.y ?? 0) + COPY_OFFSET.y,
    z: Number(position.z ?? 0) + COPY_OFFSET.z
  };
}

function copyName(name, fallback) {
  const base = String(name || fallback || 'Node').trim() || 'Node';
  return /\bcopy\b/i.test(base) ? base : `${base} Copy`;
}

export function cloneNodesForPaste(sourceNodes = [], existingIds = new Set()) {
  const source = Array.isArray(sourceNodes) ? sourceNodes.filter(Boolean) : [];
  const selectedIds = new Set(source.map(node => String(node.id)).filter(Boolean));
  const taken = idSet(existingIds);
  const idMap = new Map();

  source.forEach((node, index) => {
    const oldId = node.id == null ? `node_${index + 1}` : String(node.id);
    const seed = `${oldId}_copy`;
    const nextId = makeUniqueId(seed, taken, node.type === 'hyperclass' ? 'hyperclass' : 'class');
    idMap.set(oldId, nextId);
  });

  const nodes = source.map((node, index) => {
    const oldId = node.id == null ? `node_${index + 1}` : String(node.id);
    const next = cloneValue(node);
    next.id = idMap.get(oldId);
    next.name = copyName(next.name, next.id);
    next.position = offsetPosition(next.position);

    if (next.parentClassId != null) {
      const parentId = String(next.parentClassId);
      next.parentClassId = idMap.get(parentId) || (taken.has(parentId) ? next.parentClassId : null);
    }

    if (next.type === 'hyperclass') {
      next.children = (Array.isArray(next.children) ? next.children : [])
        .map(childId => String(childId))
        .filter(childId => selectedIds.has(childId))
        .map(childId => idMap.get(childId))
        .filter(Boolean);
    }

    return next;
  });

  return { nodes, idMap };
}

function attributeName(attribute) {
  if (typeof attribute === 'string') return attribute;
  if (!attribute || typeof attribute !== 'object') return '';
  return attribute.name ?? attribute.id ?? attribute.key ?? '';
}

function normalizeAttributeName(name) {
  return String(name || '').trim().toLowerCase();
}

export function parseBulkAttributeNames(input, existingAttributes = []) {
  const existing = new Set(
    (Array.isArray(existingAttributes) ? existingAttributes : [])
      .map(attribute => normalizeAttributeName(attributeName(attribute)))
      .filter(Boolean)
  );
  const seen = new Set();
  const duplicateKeys = new Set();
  const duplicates = [];
  const names = [];

  String(input || '')
    .split(/\r?\n|,/)
    .map(name => name.trim())
    .filter(Boolean)
    .forEach(name => {
      const key = normalizeAttributeName(name);
      if (existing.has(key) || seen.has(key)) {
        if (!duplicateKeys.has(key)) {
          duplicateKeys.add(key);
          duplicates.push(name);
        }
        return;
      }
      seen.add(key);
      names.push(name);
    });

  return { names, duplicates };
}

export function moveArrayItem(items, fromIndex, delta) {
  const next = Array.isArray(items) ? items.slice() : [];
  const from = Number(fromIndex);
  const offset = Number(delta);
  if (!Number.isInteger(from) || !Number.isInteger(offset)) {
    return { items: next, moved: false, fromIndex: from, toIndex: from };
  }
  const to = from + offset;
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) {
    return { items: next, moved: false, fromIndex: from, toIndex: from };
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return { items: next, moved: true, fromIndex: from, toIndex: to, item };
}

function sourceId(link) {
  return link?.sourceClassId ?? link?.source;
}

function targetId(link) {
  return link?.targetClassId ?? link?.target;
}

export function buildSelectedSubgraph(model, selectedIds = new Set()) {
  const data = cloneValue(model || {});
  const hypergraph = data.hypergraph || {};
  const allNodes = Array.isArray(hypergraph.class) ? hypergraph.class : [];
  const allLinks = Array.isArray(hypergraph.link) ? hypergraph.link : [];
  const byId = new Map(allNodes.map(node => [String(node.id), node]));
  const included = new Set();

  const includeNode = id => {
    const key = String(id);
    const node = byId.get(key);
    if (!node || included.has(key)) return;
    included.add(key);
    if (node.type === 'hyperclass') {
      (Array.isArray(node.children) ? node.children : []).forEach(includeNode);
    }
  };

  [...selectedIds].forEach(includeNode);

  const nodes = allNodes
    .filter(node => included.has(String(node.id)))
    .map(node => {
      const next = cloneValue(node);
      if (next.parentClassId != null && !included.has(String(next.parentClassId))) next.parentClassId = null;
      if (next.type === 'hyperclass') {
        next.children = (Array.isArray(next.children) ? next.children : [])
          .filter(childId => included.has(String(childId)));
      }
      return next;
    });

  const links = allLinks
    .filter(link => included.has(String(sourceId(link))) && included.has(String(targetId(link))))
    .map(cloneValue);
  const includedLinkIds = new Set(links.map(link => String(link.id)));
  const objects = (Array.isArray(hypergraph.object) ? hypergraph.object : [])
    .filter(item => included.has(String(item?.classId)))
    .map(cloneValue);
  const includedObjectIds = new Set(objects.map(item => String(item.id)));
  const objectLinks = (Array.isArray(hypergraph.objectLink) ? hypergraph.objectLink : [])
    .filter(item => includedLinkIds.has(String(item?.classLinkId ?? item?.linkId))
      && includedObjectIds.has(String(item?.sourceObjectId))
      && includedObjectIds.has(String(item?.targetObjectId)))
    .map(cloneValue);
  const memberships = (Array.isArray(hypergraph.membership) ? hypergraph.membership : [])
    .filter(item => included.has(String(item?.classId ?? item?.memberClassId))
      && included.has(String(item?.hyperclassId)))
    .map(cloneValue);
  const inheritances = (Array.isArray(hypergraph.inheritance) ? hypergraph.inheritance : [])
    .filter(item => included.has(String(item?.subClassId)) && included.has(String(item?.superClassId)))
    .map(cloneValue);

  const semanticCollections = {};
  if (Array.isArray(hypergraph.object)) semanticCollections.object = objects;
  if (Array.isArray(hypergraph.objectLink)) semanticCollections.objectLink = objectLinks;
  if (Array.isArray(hypergraph.membership)) semanticCollections.membership = memberships;
  if (Array.isArray(hypergraph.inheritance)) semanticCollections.inheritance = inheritances;

  return {
    ...(data.metadata ? { metadata: cloneValue(data.metadata) } : {}),
    hypergraph: {
      ...(hypergraph.metadata ? { metadata: cloneValue(hypergraph.metadata) } : {}),
      class: nodes,
      link: links,
      ...semanticCollections
    }
  };
}

export function routePresetPatch(preset = 'auto') {
  const clean = PRODUCTIVITY_ROUTE_PRESETS.includes(preset) ? preset : 'auto';
  if (clean === 'horizontal') {
    return { orthogonalStyle: 'horizontal', routeSide: '', routePoints: [] };
  }
  if (clean === 'vertical') {
    return { orthogonalStyle: 'vertical', routeSide: '', routePoints: [] };
  }
  if (clean === 'direct') {
    return {
      orthogonalStyle: 'auto',
      orthogonalClearance: 0,
      relationshipPortStub: 0,
      relationshipCornerRadius: 0,
      routeSide: '',
      routePoints: []
    };
  }
  if (clean === 'orthogonal') {
    return {
      orthogonalStyle: 'auto',
      orthogonalClearance: 0.55,
      relationshipPortStub: 0.24,
      relationshipCornerRadius: 0.16,
      routeSide: '',
      routePoints: []
    };
  }
  return { orthogonalStyle: 'auto', routeSide: '', routePoints: [] };
}

export function routePresetFromRendering(rendering = {}) {
  if (rendering.orthogonalStyle === 'horizontal') return 'horizontal';
  if (rendering.orthogonalStyle === 'vertical') return 'vertical';
  if (
    Number(rendering.orthogonalClearance) === 0 &&
    Number(rendering.relationshipPortStub) === 0 &&
    Number(rendering.relationshipCornerRadius ?? rendering.cornerRadius ?? 0) === 0
  ) {
    return 'direct';
  }
  if (Array.isArray(rendering.routePoints) && rendering.routePoints.length > 0) return 'orthogonal';
  if (rendering.routeSide) return 'orthogonal';
  return 'auto';
}
