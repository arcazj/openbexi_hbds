export const SEMANTIC_PROFILE_IDS = Object.freeze([
  'units',
  'temporal',
  'geospatial',
  'fuzzy',
  'prototype'
]);

const PROFILE_ALIASES = Object.freeze({
  unit: 'units',
  units: 'units',
  quantity: 'units',
  quantities: 'units',
  time: 'temporal',
  temporal: 'temporal',
  geo: 'geospatial',
  geometry: 'geospatial',
  geographic: 'geospatial',
  geospatial: 'geospatial',
  fuzzy: 'fuzzy',
  fuzziness: 'fuzzy',
  prototype: 'prototype',
  prototypes: 'prototype'
});

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'base' });
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizeProfileId(value) {
  return PROFILE_ALIASES[cleanText(value).toLowerCase()] || '';
}

function diagnostic(profile, severity, code, message, path = '', details = undefined) {
  const result = { profile, severity, code, message, path };
  if (details !== undefined) result.details = details;
  return result;
}

function sortDiagnostics(diagnostics) {
  return diagnostics.sort((left, right) => (
    compareText(left.path, right.path)
    || compareText(left.profile, right.profile)
    || compareText(left.severity, right.severity)
    || compareText(left.code, right.code)
    || compareText(left.message, right.message)
  ));
}

function uniqueDiagnostics(diagnostics) {
  const seen = new Set();
  return sortDiagnostics(diagnostics).filter(item => {
    const key = `${item.profile}\u0000${item.severity}\u0000${item.code}\u0000${item.path}\u0000${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finishDiagnostics(profile, diagnostics) {
  const finalDiagnostics = uniqueDiagnostics(diagnostics);
  return {
    profile,
    valid: !finalDiagnostics.some(item => item.severity === 'error'),
    diagnostics: finalDiagnostics,
    errors: finalDiagnostics.filter(item => item.severity === 'error').map(item => `${item.path}: ${item.message}`),
    warnings: finalDiagnostics.filter(item => item.severity === 'warning').map(item => `${item.path}: ${item.message}`)
  };
}

function rawProfileDeclaration(model, options) {
  if (own(options, 'profiles')) return options.profiles;
  return model?.metadata?.semanticProfiles ?? model?.metadata?.profiles?.semantics ?? [];
}

function declaredProfileEntries(declaration) {
  if (typeof declaration === 'string') {
    return declaration.split(',').map(item => [item.trim(), true]).filter(([id]) => id);
  }
  if (Array.isArray(declaration)) return declaration.map(item => [item, true]);
  const object = asObject(declaration);
  return object ? Object.entries(object) : [];
}

export function resolveEnabledSemanticProfiles(model = {}, options = {}) {
  const enabled = new Set();
  const configs = {};
  const unknown = [];
  for (const [rawId, rawConfig] of declaredProfileEntries(rawProfileDeclaration(model, options))) {
    const profileId = normalizeProfileId(rawId);
    if (!profileId) {
      const unknownId = cleanText(rawId);
      if (unknownId) unknown.push(unknownId);
      continue;
    }
    const configObject = asObject(rawConfig);
    const isEnabled = rawConfig !== false && rawConfig !== null && configObject?.enabled !== false;
    if (!isEnabled) continue;
    enabled.add(profileId);
    configs[profileId] = configObject ? { ...configObject } : {};
    delete configs[profileId].enabled;
  }
  const optionConfigs = asObject(options.profileOptions) || {};
  for (const profileId of enabled) {
    configs[profileId] = {
      ...(configs[profileId] || {}),
      ...(asObject(optionConfigs[profileId]) || asObject(optionConfigs[profileId.replace(/s$/, '')]) || {})
    };
  }
  return {
    enabledProfiles: [...enabled].sort(compareText),
    configs,
    unknownProfiles: [...new Set(unknown)].sort(compareText)
  };
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function unitSymbol(value) {
  const unit = value?.unit ?? value?.unitSymbol;
  if (typeof unit === 'string' || typeof unit === 'number') return cleanText(unit);
  return cleanText(unit?.symbol ?? unit?.code ?? unit?.id);
}

function validateNumericValue(profile, value, path, diagnostics, code = 'invalid-numeric-value') {
  if (Array.isArray(value)) {
    if (!value.length) {
      diagnostics.push(diagnostic(profile, 'error', code, 'Numeric value array must not be empty.', path));
      return false;
    }
    let valid = true;
    value.forEach((item, index) => {
      if (!finiteNumber(item)) {
        valid = false;
        diagnostics.push(diagnostic(profile, 'error', code, 'Value must be a finite number.', `${path}[${index}]`));
      }
    });
    return valid;
  }
  if (!finiteNumber(value)) {
    diagnostics.push(diagnostic(profile, 'error', code, 'Value must be a finite number.', path));
    return false;
  }
  return true;
}

export function validateUnitSemanticValue(value, options = {}) {
  const profile = 'units';
  const path = options.path || 'value';
  const diagnostics = [];
  const annotation = asObject(value);
  if (!annotation) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-unit-annotation', 'Unit annotation must be an object.', path));
    return finishDiagnostics(profile, diagnostics);
  }
  const magnitude = annotation.value ?? annotation.magnitude ?? annotation.values;
  if (magnitude === undefined) {
    diagnostics.push(diagnostic(profile, 'error', 'missing-unit-value', 'Unit annotation requires value or magnitude.', `${path}.value`));
  } else {
    validateNumericValue(profile, magnitude, `${path}.${own(annotation, 'magnitude') ? 'magnitude' : (own(annotation, 'values') ? 'values' : 'value')}`, diagnostics);
  }
  const symbol = unitSymbol(annotation);
  if (!symbol) diagnostics.push(diagnostic(profile, 'error', 'missing-unit', 'Unit annotation requires a nonempty unit symbol.', `${path}.unit`));

  if (annotation.dimension !== undefined && !cleanText(annotation.dimension)) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-unit-dimension', 'Unit dimension must be a nonempty string when provided.', `${path}.dimension`));
  }
  if (annotation.uncertainty !== undefined && (!finiteNumber(annotation.uncertainty) || annotation.uncertainty < 0)) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-unit-uncertainty', 'Unit uncertainty must be a finite nonnegative number.', `${path}.uncertainty`));
  }

  const config = asObject(options.profileOptions) || {};
  const allowedUnits = Array.isArray(config.allowedUnits) ? new Set(config.allowedUnits.map(cleanText).filter(Boolean)) : null;
  if (symbol && allowedUnits?.size && !allowedUnits.has(symbol)) {
    diagnostics.push(diagnostic(profile, 'error', 'unit-not-allowed', `Unit ${symbol} is not allowed by this profile.`, `${path}.unit`, { unit: symbol }));
  }
  const definitions = asObject(config.unitDefinitions);
  const expectedDimension = symbol && definitions
    ? cleanText(asObject(definitions[symbol])?.dimension ?? definitions[symbol])
    : '';
  const declaredDimension = cleanText(annotation.dimension);
  if (expectedDimension && declaredDimension && expectedDimension !== declaredDimension) {
    diagnostics.push(diagnostic(
      profile,
      'error',
      'unit-dimension-mismatch',
      `Unit ${symbol} has dimension ${expectedDimension}, not ${declaredDimension}.`,
      `${path}.dimension`,
      { unit: symbol, expectedDimension, declaredDimension }
    ));
  }
  return finishDiagnostics(profile, diagnostics);
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const ISO_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/;

function hasValidCalendarDate(value) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validateTemporalPoint(value, path, diagnostics) {
  const text = cleanText(value);
  if (!text || !ISO_DATE_TIME.test(text) || !hasValidCalendarDate(text) || !Number.isFinite(Date.parse(text))) {
    diagnostics.push(diagnostic('temporal', 'error', 'invalid-temporal-value', 'Temporal value must be a valid ISO 8601 date or date-time.', path));
    return null;
  }
  if (text.includes('T') && !ISO_TIMEZONE.test(text)) {
    diagnostics.push(diagnostic('temporal', 'warning', 'temporal-timezone-missing', 'Date-time has no explicit UTC offset.', path));
  }
  return Date.parse(text);
}

export function validateTemporalSemanticValue(value, options = {}) {
  const profile = 'temporal';
  const path = options.path || 'value';
  const diagnostics = [];
  const annotation = asObject(value);
  if (!annotation) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-temporal-annotation', 'Temporal annotation must be an object.', path));
    return finishDiagnostics(profile, diagnostics);
  }
  const instant = annotation.instant ?? annotation.dateTime
    ?? (typeof annotation.value === 'string' ? annotation.value : undefined);
  const start = annotation.start ?? annotation.validFrom ?? annotation.from;
  const end = annotation.end ?? annotation.validTo ?? annotation.to;
  if (instant === undefined && start === undefined && end === undefined) {
    diagnostics.push(diagnostic(profile, 'error', 'missing-temporal-value', 'Temporal annotation requires instant, start, or end.', path));
    return finishDiagnostics(profile, diagnostics);
  }
  if (instant !== undefined) validateTemporalPoint(instant, `${path}.${own(annotation, 'instant') ? 'instant' : (own(annotation, 'dateTime') ? 'dateTime' : 'value')}`, diagnostics);
  const startTime = start !== undefined
    ? validateTemporalPoint(start, `${path}.${own(annotation, 'start') ? 'start' : (own(annotation, 'validFrom') ? 'validFrom' : 'from')}`, diagnostics)
    : null;
  const endTime = end !== undefined
    ? validateTemporalPoint(end, `${path}.${own(annotation, 'end') ? 'end' : (own(annotation, 'validTo') ? 'validTo' : 'to')}`, diagnostics)
    : null;
  if (startTime !== null && endTime !== null && startTime > endTime) {
    diagnostics.push(diagnostic(profile, 'error', 'temporal-range-reversed', 'Temporal start must not be after end.', path));
  }
  if (annotation.durationMs !== undefined && (!finiteNumber(annotation.durationMs) || annotation.durationMs < 0)) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-temporal-duration', 'durationMs must be a finite nonnegative number.', `${path}.durationMs`));
  }
  return finishDiagnostics(profile, diagnostics);
}

function validateCoordinatePair(coordinates, path, diagnostics) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    diagnostics.push(diagnostic('geospatial', 'error', 'invalid-coordinate', 'Coordinate must contain longitude and latitude.', path));
    return;
  }
  const [longitude, latitude, altitude] = coordinates;
  if (!finiteNumber(longitude) || longitude < -180 || longitude > 180) {
    diagnostics.push(diagnostic('geospatial', 'error', 'longitude-out-of-range', 'Longitude must be between -180 and 180 degrees.', `${path}[0]`));
  }
  if (!finiteNumber(latitude) || latitude < -90 || latitude > 90) {
    diagnostics.push(diagnostic('geospatial', 'error', 'latitude-out-of-range', 'Latitude must be between -90 and 90 degrees.', `${path}[1]`));
  }
  if (altitude !== undefined && !finiteNumber(altitude)) {
    diagnostics.push(diagnostic('geospatial', 'error', 'invalid-altitude', 'Altitude must be a finite number when provided.', `${path}[2]`));
  }
}

function validateCoordinateNesting(coordinates, depth, path, diagnostics) {
  if (depth === 0) {
    validateCoordinatePair(coordinates, path, diagnostics);
    return;
  }
  if (!Array.isArray(coordinates) || !coordinates.length) {
    diagnostics.push(diagnostic('geospatial', 'error', 'invalid-coordinate-array', 'Coordinate array must not be empty.', path));
    return;
  }
  coordinates.forEach((item, index) => validateCoordinateNesting(item, depth - 1, `${path}[${index}]`, diagnostics));
}

function validateGeometry(geometry, path, diagnostics) {
  const object = asObject(geometry);
  if (!object) {
    diagnostics.push(diagnostic('geospatial', 'error', 'invalid-geometry', 'Geometry must be an object.', path));
    return;
  }
  if (object.type === 'Feature') {
    validateGeometry(object.geometry, `${path}.geometry`, diagnostics);
    return;
  }
  if (object.type === 'GeometryCollection') {
    if (!Array.isArray(object.geometries) || !object.geometries.length) {
      diagnostics.push(diagnostic('geospatial', 'error', 'invalid-geometry-collection', 'GeometryCollection requires geometries.', `${path}.geometries`));
      return;
    }
    object.geometries.forEach((item, index) => validateGeometry(item, `${path}.geometries[${index}]`, diagnostics));
    return;
  }
  const nestingByType = {
    Point: 0,
    MultiPoint: 1,
    LineString: 1,
    MultiLineString: 2,
    Polygon: 2,
    MultiPolygon: 3
  };
  if (!own(nestingByType, object.type)) {
    diagnostics.push(diagnostic('geospatial', 'error', 'unsupported-geometry-type', `Unsupported geometry type ${cleanText(object.type) || '(empty)'}.`, `${path}.type`));
    return;
  }
  validateCoordinateNesting(object.coordinates, nestingByType[object.type], `${path}.coordinates`, diagnostics);
}

export function validateGeospatialSemanticValue(value, options = {}) {
  const profile = 'geospatial';
  const path = options.path || 'value';
  const diagnostics = [];
  const annotation = asObject(value);
  if (!annotation) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-geospatial-annotation', 'Geospatial annotation must be an object.', path));
    return finishDiagnostics(profile, diagnostics);
  }
  const hasLatitude = own(annotation, 'latitude') || own(annotation, 'lat');
  const hasLongitude = own(annotation, 'longitude') || own(annotation, 'lon') || own(annotation, 'lng');
  if (hasLatitude || hasLongitude) {
    const latitudeKey = own(annotation, 'latitude') ? 'latitude' : 'lat';
    const longitudeKey = own(annotation, 'longitude') ? 'longitude' : (own(annotation, 'lon') ? 'lon' : 'lng');
    const latitude = annotation[latitudeKey];
    const longitude = annotation[longitudeKey];
    if (!hasLatitude || !finiteNumber(latitude) || latitude < -90 || latitude > 90) {
      diagnostics.push(diagnostic(profile, 'error', 'latitude-out-of-range', 'Latitude must be between -90 and 90 degrees.', `${path}.${latitudeKey}`));
    }
    if (!hasLongitude || !finiteNumber(longitude) || longitude < -180 || longitude > 180) {
      diagnostics.push(diagnostic(profile, 'error', 'longitude-out-of-range', 'Longitude must be between -180 and 180 degrees.', `${path}.${longitudeKey}`));
    }
    const altitudeKey = own(annotation, 'altitude') ? 'altitude' : (own(annotation, 'alt') ? 'alt' : '');
    if (altitudeKey && !finiteNumber(annotation[altitudeKey])) {
      diagnostics.push(diagnostic(profile, 'error', 'invalid-altitude', 'Altitude must be a finite number when provided.', `${path}.${altitudeKey}`));
    }
  } else if (annotation.geometry !== undefined) {
    validateGeometry(annotation.geometry, `${path}.geometry`, diagnostics);
  } else if (annotation.type !== undefined || annotation.coordinates !== undefined) {
    validateGeometry(annotation, path, diagnostics);
  } else {
    diagnostics.push(diagnostic(profile, 'error', 'missing-geospatial-value', 'Geospatial annotation requires latitude/longitude or GeoJSON geometry.', path));
  }
  return finishDiagnostics(profile, diagnostics);
}

function validateMembershipDegree(value, path, diagnostics) {
  if (!finiteNumber(value) || value < 0 || value > 1) {
    diagnostics.push(diagnostic('fuzzy', 'error', 'fuzzy-degree-out-of-range', 'Fuzzy membership degree must be between 0 and 1.', path));
  }
}

function validateOrderedPoints(points, expectedLength, path, diagnostics, code) {
  if (!Array.isArray(points) || points.length !== expectedLength) {
    diagnostics.push(diagnostic('fuzzy', 'error', code, `Fuzzy shape requires ${expectedLength} numeric points.`, path));
    return;
  }
  let valid = true;
  points.forEach((point, index) => {
    if (!finiteNumber(point)) {
      valid = false;
      diagnostics.push(diagnostic('fuzzy', 'error', code, 'Fuzzy shape points must be finite numbers.', `${path}[${index}]`));
    }
  });
  if (valid && points.some((point, index) => index > 0 && point < points[index - 1])) {
    diagnostics.push(diagnostic('fuzzy', 'error', 'fuzzy-points-unordered', 'Fuzzy shape points must be in nondecreasing order.', path));
  }
}

export function validateFuzzySemanticValue(value, options = {}) {
  const profile = 'fuzzy';
  const path = options.path || 'value';
  const diagnostics = [];
  const annotation = asObject(value);
  if (!annotation) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-fuzzy-annotation', 'Fuzzy annotation must be an object.', path));
    return finishDiagnostics(profile, diagnostics);
  }
  let found = false;
  for (const key of ['membership', 'degree']) {
    if (!own(annotation, key)) continue;
    found = true;
    validateMembershipDegree(annotation[key], `${path}.${key}`, diagnostics);
  }
  if (own(annotation, 'memberships')) {
    found = true;
    if (Array.isArray(annotation.memberships)) {
      if (!annotation.memberships.length) diagnostics.push(diagnostic(profile, 'error', 'empty-fuzzy-memberships', 'memberships must not be empty.', `${path}.memberships`));
      annotation.memberships.forEach((entry, index) => {
        const item = asObject(entry);
        const degree = item ? (item.degree ?? item.membership ?? item.value) : entry;
        validateMembershipDegree(degree, `${path}.memberships[${index}]`, diagnostics);
      });
    } else if (asObject(annotation.memberships)) {
      const entries = Object.entries(annotation.memberships);
      if (!entries.length) diagnostics.push(diagnostic(profile, 'error', 'empty-fuzzy-memberships', 'memberships must not be empty.', `${path}.memberships`));
      entries.forEach(([label, degree]) => validateMembershipDegree(degree, `${path}.memberships.${label}`, diagnostics));
    } else {
      diagnostics.push(diagnostic(profile, 'error', 'invalid-fuzzy-memberships', 'memberships must be an array or object.', `${path}.memberships`));
    }
  }
  if (own(annotation, 'triangle')) {
    found = true;
    validateOrderedPoints(annotation.triangle, 3, `${path}.triangle`, diagnostics, 'invalid-fuzzy-triangle');
  }
  if (own(annotation, 'trapezoid')) {
    found = true;
    validateOrderedPoints(annotation.trapezoid, 4, `${path}.trapezoid`, diagnostics, 'invalid-fuzzy-trapezoid');
  }
  if (!found) diagnostics.push(diagnostic(profile, 'error', 'missing-fuzzy-value', 'Fuzzy annotation requires membership, memberships, triangle, or trapezoid.', path));
  return finishDiagnostics(profile, diagnostics);
}

function prototypeReference(value) {
  return cleanText(value?.prototypeId ?? value?.prototypeRef ?? value?.extendsPrototypeId ?? value?.basePrototypeId);
}

export function validatePrototypeSemanticValue(value, options = {}) {
  const profile = 'prototype';
  const path = options.path || 'value';
  const diagnostics = [];
  const annotation = asObject(value);
  if (!annotation) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-prototype-annotation', 'Prototype annotation must be an object.', path));
    return finishDiagnostics(profile, diagnostics);
  }
  const reference = prototypeReference(annotation);
  if (!reference) {
    diagnostics.push(diagnostic(profile, 'error', 'missing-prototype-reference', 'Prototype annotation requires prototypeId or prototypeRef.', `${path}.prototypeId`));
  }
  if (annotation.overrides !== undefined && !asObject(annotation.overrides)) {
    diagnostics.push(diagnostic(profile, 'error', 'invalid-prototype-overrides', 'Prototype overrides must be an object.', `${path}.overrides`));
  }
  const knownIds = options.knownPrototypeIds instanceof Set ? options.knownPrototypeIds : null;
  if (reference && knownIds && !knownIds.has(reference)) {
    diagnostics.push(diagnostic(profile, 'error', 'unknown-prototype-reference', `Prototype ${reference} does not exist.`, `${path}.prototypeId`, { prototypeId: reference }));
  }
  const ownerId = cleanText(options.ownerId);
  if (reference && ownerId && reference === ownerId) {
    diagnostics.push(diagnostic(profile, 'error', 'prototype-self-reference', `Entity ${ownerId} cannot use itself as a prototype.`, `${path}.prototypeId`, { entityId: ownerId }));
  }
  return finishDiagnostics(profile, diagnostics);
}

function entityArray(model, singular, plural) {
  const hypergraph = asObject(model?.hypergraph) || {};
  if (Array.isArray(hypergraph[singular])) return { values: hypergraph[singular], path: `hypergraph.${singular}` };
  if (Array.isArray(hypergraph[plural])) return { values: hypergraph[plural], path: `hypergraph.${plural}` };
  return { values: [], path: `hypergraph.${singular}` };
}

function markerProfiles(value) {
  const raw = value?.semanticType ?? value?.semanticProfile ?? value?.$semantic ?? value?.profile;
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map(normalizeProfileId).filter(Boolean);
}

function signatureProfiles(value) {
  const profiles = [];
  if ((own(value, 'unit') || own(value, 'unitSymbol'))
    && (own(value, 'value') || own(value, 'magnitude') || own(value, 'values'))) profiles.push('units');
  if (own(value, 'instant') || own(value, 'dateTime') || own(value, 'validFrom') || own(value, 'validTo')
    || own(value, 'start') || own(value, 'end')) profiles.push('temporal');
  if (own(value, 'latitude') || own(value, 'lat') || own(value, 'longitude') || own(value, 'lon') || own(value, 'lng')
    || (own(value, 'type') && own(value, 'coordinates')) || own(value, 'geometry')) profiles.push('geospatial');
  if (own(value, 'membership') || own(value, 'degree') || own(value, 'memberships')
    || own(value, 'triangle') || own(value, 'trapezoid')) profiles.push('fuzzy');
  if (prototypeReference(value)) profiles.push('prototype');
  return profiles;
}

function addCandidate(candidates, candidateKeys, profile, value, path, owner) {
  const key = `${profile}\u0000${path}`;
  if (candidateKeys.has(key)) return;
  candidateKeys.add(key);
  candidates.push({ profile, value, path, owner });
}

function semanticMapCandidates(value, path, owner, enabled, candidates, candidateKeys) {
  for (const containerKey of ['semantics', 'semantic']) {
    const semantics = asObject(value?.[containerKey]);
    if (!semantics) continue;
    for (const [rawProfileId, rawConfig] of Object.entries(semantics)) {
      const profile = normalizeProfileId(rawProfileId);
      if (!profile || !enabled.has(profile) || rawConfig === false) continue;
      const config = asObject(rawConfig) || {};
      const combined = { ...value, ...config, semanticType: profile };
      delete combined.semantics;
      delete combined.semantic;
      addCandidate(candidates, candidateKeys, profile, combined, `${path}.${containerKey}.${rawProfileId}`, owner);
    }
  }
}

function collectFromValue(value, path, owner, enabled, state, depth = 0) {
  if (depth > state.maxDepth || state.visitedNodes >= state.maxNodes) return;
  if (!value || typeof value !== 'object') return;
  if (state.visited.has(value)) return;
  state.visited.add(value);
  state.visitedNodes += 1;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFromValue(item, `${path}[${index}]`, owner, enabled, state, depth + 1));
    return;
  }

  const profiles = new Set([...markerProfiles(value), ...signatureProfiles(value)]);
  for (const profile of profiles) {
    if (enabled.has(profile)) addCandidate(state.candidates, state.candidateKeys, profile, value, path, owner);
  }
  semanticMapCandidates(value, path, owner, enabled, state.candidates, state.candidateKeys);
  for (const [key, child] of Object.entries(value)) {
    if (key === 'semantics' || key === 'semantic') continue;
    if (child && typeof child === 'object') collectFromValue(child, `${path}.${key}`, owner, enabled, state, depth + 1);
  }
}

function collectCarrierValues(entity, path, owner, enabled, state) {
  const directProfiles = new Set([...markerProfiles(entity), ...signatureProfiles(entity)]);
  for (const profile of directProfiles) {
    if (enabled.has(profile)) addCandidate(state.candidates, state.candidateKeys, profile, entity, path, owner);
  }
  semanticMapCandidates(entity, path, owner, enabled, state.candidates, state.candidateKeys);
  for (const key of ['attributeValues', 'attributes', 'values']) {
    if (entity?.[key] !== undefined) collectFromValue(entity[key], `${path}.${key}`, owner, enabled, state);
  }
}

function collectSemanticCandidates(model, enabledProfiles, options) {
  const enabled = new Set(enabledProfiles);
  const state = {
    candidates: [],
    candidateKeys: new Set(),
    visited: new WeakSet(),
    visitedNodes: 0,
    maxDepth: Number.isFinite(Number(options.maxScanDepth)) ? Math.max(1, Number(options.maxScanDepth)) : 16,
    maxNodes: Number.isFinite(Number(options.maxScanNodes)) ? Math.max(1, Number(options.maxScanNodes)) : 100000
  };
  const sources = [
    ['object', 'objects'],
    ['objectLink', 'objectLinks'],
    ['membership', 'memberships'],
    ['prototype', 'prototypes']
  ].map(([singular, plural]) => entityArray(model, singular, plural));
  sources.forEach(source => {
    source.values.forEach((entity, index) => {
      const object = asObject(entity);
      if (!object) return;
      const owner = { id: cleanText(object.id), entity: object, path: `${source.path}[${index}]` };
      collectCarrierValues(object, owner.path, owner, enabled, state);
    });
  });
  return state.candidates.sort((left, right) => compareText(left.path, right.path) || compareText(left.profile, right.profile));
}

function knownPrototypeIds(model) {
  const ids = new Set();
  for (const [singular, plural] of [['object', 'objects'], ['prototype', 'prototypes']]) {
    for (const entity of entityArray(model, singular, plural).values) {
      const id = cleanText(entity?.id);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function prototypeGraphDiagnostics(candidates) {
  const diagnostics = [];
  const graph = new Map();
  const pathByOwnerId = new Map();
  for (const candidate of candidates.filter(item => item.profile === 'prototype')) {
    const ownerId = cleanText(candidate.owner?.id);
    const reference = prototypeReference(candidate.value);
    if (!ownerId || !reference || ownerId === reference) continue;
    if (!graph.has(ownerId)) graph.set(ownerId, new Set());
    graph.get(ownerId).add(reference);
    if (!pathByOwnerId.has(ownerId)) pathByOwnerId.set(ownerId, candidate.path);
  }
  const state = new Map();
  const stack = [];
  const cycleKeys = new Set();
  function visit(nodeId) {
    state.set(nodeId, 1);
    stack.push(nodeId);
    for (const nextId of [...(graph.get(nodeId) || [])].sort(compareText)) {
      if (!graph.has(nextId)) continue;
      if (state.get(nextId) === 1) {
        const start = stack.indexOf(nextId);
        const cycle = [...stack.slice(start), nextId];
        const cycleKey = [...new Set(cycle)].sort(compareText).join('\u0000');
        if (!cycleKeys.has(cycleKey)) {
          cycleKeys.add(cycleKey);
          diagnostics.push(diagnostic(
            'prototype',
            'error',
            'prototype-cycle',
            `Prototype cycle detected: ${cycle.join(' -> ')}.`,
            `${pathByOwnerId.get(nextId) || pathByOwnerId.get(nodeId) || 'hypergraph.object'}.prototypeId`,
            { cycle }
          ));
        }
      } else if (!state.has(nextId)) {
        visit(nextId);
      }
    }
    stack.pop();
    state.set(nodeId, 2);
  }
  for (const nodeId of [...graph.keys()].sort(compareText)) {
    if (!state.has(nodeId)) visit(nodeId);
  }
  return diagnostics;
}

const PROFILE_VALIDATORS = Object.freeze({
  units: validateUnitSemanticValue,
  temporal: validateTemporalSemanticValue,
  geospatial: validateGeospatialSemanticValue,
  fuzzy: validateFuzzySemanticValue,
  prototype: validatePrototypeSemanticValue
});

export function validateSemanticProfiles(model = {}, options = {}) {
  const resolution = resolveEnabledSemanticProfiles(model, options);
  const diagnostics = resolution.unknownProfiles.map(profileId => diagnostic(
    'semantic-profiles',
    'error',
    'unknown-semantic-profile',
    `Unknown semantic profile ${profileId}.`,
    'options.profiles',
    { profileId }
  ));

  if (!resolution.enabledProfiles.length) {
    const finalDiagnostics = uniqueDiagnostics(diagnostics);
    return {
      valid: !finalDiagnostics.some(item => item.severity === 'error'),
      skipped: finalDiagnostics.length === 0,
      enabledProfiles: [],
      diagnostics: finalDiagnostics,
      errors: finalDiagnostics.filter(item => item.severity === 'error').map(item => `${item.path}: ${item.message}`),
      warnings: [],
      profileResults: {},
      counts: {}
    };
  }

  const candidates = collectSemanticCandidates(model, resolution.enabledProfiles, options);
  const prototypeIds = knownPrototypeIds(model);
  const profileResults = {};
  const counts = {};
  for (const profile of resolution.enabledProfiles) {
    const profileCandidates = candidates.filter(candidate => candidate.profile === profile);
    const profileDiagnostics = [];
    for (const candidate of profileCandidates) {
      const result = PROFILE_VALIDATORS[profile](candidate.value, {
        path: candidate.path,
        ownerId: candidate.owner?.id,
        knownPrototypeIds: prototypeIds,
        profileOptions: resolution.configs[profile]
      });
      profileDiagnostics.push(...result.diagnostics);
    }
    if (profile === 'prototype') profileDiagnostics.push(...prototypeGraphDiagnostics(profileCandidates));
    const result = finishDiagnostics(profile, profileDiagnostics);
    profileResults[profile] = { ...result, candidateCount: profileCandidates.length };
    counts[profile] = {
      candidates: profileCandidates.length,
      errors: result.diagnostics.filter(item => item.severity === 'error').length,
      warnings: result.diagnostics.filter(item => item.severity === 'warning').length
    };
    diagnostics.push(...result.diagnostics);
  }
  const finalDiagnostics = uniqueDiagnostics(diagnostics);
  return {
    valid: !finalDiagnostics.some(item => item.severity === 'error'),
    skipped: false,
    enabledProfiles: resolution.enabledProfiles,
    diagnostics: finalDiagnostics,
    errors: finalDiagnostics.filter(item => item.severity === 'error').map(item => `${item.path}: ${item.message}`),
    warnings: finalDiagnostics.filter(item => item.severity === 'warning').map(item => `${item.path}: ${item.message}`),
    profileResults,
    counts
  };
}
