import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modulePath = new URL('../js/hbds_semantic_profiles.js', import.meta.url);
const source = readFileSync(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  resolveEnabledSemanticProfiles,
  validateFuzzySemanticValue,
  validateGeospatialSemanticValue,
  validateSemanticProfiles,
  validateTemporalSemanticValue,
  validateUnitSemanticValue
} = await import(moduleUrl);

const validModel = {
  metadata: {
    semanticVersion: 1,
    semanticProfiles: ['units', 'temporal', 'geospatial', 'fuzzy', 'prototype']
  },
  hypergraph: {
    object: [
      {
        id: 'platform-prototype',
        classId: 'platform',
        isPrototype: true,
        attributeValues: [
          { attributeId: 'mass', semanticType: 'unit', value: 260, unit: 'kg', dimension: 'mass' },
          {
            attributeId: 'service-window',
            value: { semanticType: 'temporal', start: '2026-07-18T00:00:00Z', end: '2027-07-18T00:00:00Z' }
          },
          {
            attributeId: 'position',
            value: { semanticType: 'geospatial', latitude: 49.69, longitude: 6.33, altitude: 300 }
          },
          {
            attributeId: 'availability',
            value: { semanticType: 'fuzzy', memberships: { low: 0.1, normal: 0.9 } }
          },
          {
            attributeId: 'range',
            value: 550,
            semantics: { units: { unit: 'km', dimension: 'length' } }
          }
        ],
        values: {
          confidence: { semanticType: 'fuzzy', membership: 0.85 }
        }
      },
      {
        id: 'platform-instance',
        classId: 'platform',
        prototypeId: 'platform-prototype',
        overrides: { mass: 300 },
        attributeValues: []
      }
    ],
    objectLink: [],
    membership: []
  }
};

{
  const resolution = resolveEnabledSemanticProfiles(validModel);
  assert.deepEqual(resolution.enabledProfiles, ['fuzzy', 'geospatial', 'prototype', 'temporal', 'units']);
  assert.deepEqual(resolution.unknownProfiles, []);
}

{
  const result = validateSemanticProfiles(validModel, {
    profileOptions: {
      units: {
        allowedUnits: ['kg', 'km'],
        unitDefinitions: {
          kg: 'mass',
          km: 'length'
        }
      }
    }
  });
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.skipped, false);
  assert.equal(result.counts.units.candidates, 2);
  assert.equal(result.counts.temporal.candidates, 1);
  assert.equal(result.counts.geospatial.candidates, 1);
  assert.equal(result.counts.fuzzy.candidates, 2);
  assert.equal(result.counts.prototype.candidates, 1);
  assert.equal(result.diagnostics.length, 0);
}

{
  const invalidButDisabled = {
    metadata: { semanticVersion: 1 },
    hypergraph: {
      object: [{
        id: 'sample',
        classId: 'sample',
        attributeValues: [{ attributeId: 'mass', semanticType: 'unit', value: 'large', unit: '' }]
      }],
      objectLink: [],
      membership: []
    }
  };
  const skipped = validateSemanticProfiles(invalidButDisabled);
  assert.equal(skipped.valid, true);
  assert.equal(skipped.skipped, true);
  assert.deepEqual(skipped.diagnostics, []);

  const enabled = validateSemanticProfiles(invalidButDisabled, { profiles: ['units'] });
  assert.equal(enabled.valid, false);
  assert.ok(enabled.diagnostics.some(item => item.code === 'invalid-numeric-value'));
  assert.ok(enabled.diagnostics.some(item => item.code === 'missing-unit'));
  assert.ok(enabled.diagnostics.every(item => item.path.startsWith('hypergraph.object[0].attributeValues[0]')));
}

{
  const invalidModel = {
    metadata: { semanticVersion: 1 },
    hypergraph: {
      object: [
        {
          id: 'cycle-a',
          classId: 'sample',
          prototypeId: 'cycle-b',
          attributeValues: [
            { attributeId: 'window', value: { semanticType: 'temporal', start: '2027-01-01', end: '2026-01-01' } },
            { attributeId: 'site', value: { semanticType: 'geospatial', lat: 95, lon: -181 } },
            { attributeId: 'quality', value: { semanticType: 'fuzzy', membership: 1.2 } }
          ]
        },
        { id: 'cycle-b', classId: 'sample', prototypeId: 'cycle-a', attributeValues: [] },
        { id: 'unknown-ref', classId: 'sample', prototypeId: 'missing', attributeValues: [] },
        { id: 'self-ref', classId: 'sample', prototypeId: 'self-ref', attributeValues: [] }
      ],
      objectLink: [],
      membership: []
    }
  };
  const result = validateSemanticProfiles(invalidModel, {
    profiles: ['temporal', 'geospatial', 'fuzzy', 'prototype']
  });
  assert.equal(result.valid, false);
  for (const code of [
    'temporal-range-reversed',
    'latitude-out-of-range',
    'longitude-out-of-range',
    'fuzzy-degree-out-of-range',
    'unknown-prototype-reference',
    'prototype-self-reference',
    'prototype-cycle'
  ]) {
    assert.ok(result.diagnostics.some(item => item.code === code), `missing diagnostic ${code}`);
  }
  const sorted = [...result.diagnostics].sort((left, right) => (
    left.path.localeCompare(right.path, 'en', { numeric: true, sensitivity: 'base' })
    || left.profile.localeCompare(right.profile, 'en', { numeric: true, sensitivity: 'base' })
    || left.severity.localeCompare(right.severity, 'en', { numeric: true, sensitivity: 'base' })
    || left.code.localeCompare(right.code, 'en', { numeric: true, sensitivity: 'base' })
    || left.message.localeCompare(right.message, 'en', { numeric: true, sensitivity: 'base' })
  ));
  assert.deepEqual(result.diagnostics, sorted);
}

{
  const unit = validateUnitSemanticValue(
    { semanticType: 'unit', value: 5, unit: 'km', dimension: 'time' },
    { path: 'sample.distance', profileOptions: { unitDefinitions: { km: 'length' } } }
  );
  assert.equal(unit.valid, false);
  assert.ok(unit.diagnostics.some(item => item.code === 'unit-dimension-mismatch'));

  const temporal = validateTemporalSemanticValue(
    { semanticType: 'temporal', instant: '2026-07-18T12:30:00' },
    { path: 'sample.instant' }
  );
  assert.equal(temporal.valid, true);
  assert.ok(temporal.diagnostics.some(item => item.code === 'temporal-timezone-missing'));

  const impossibleDate = validateTemporalSemanticValue(
    { semanticType: 'temporal', instant: '2026-02-30' },
    { path: 'sample.impossibleDate' }
  );
  assert.equal(impossibleDate.valid, false);

  const point = validateGeospatialSemanticValue(
    { semanticType: 'geospatial', type: 'Point', coordinates: [6.33, 49.69, 300] },
    { path: 'sample.point' }
  );
  assert.equal(point.valid, true);

  const polygon = validateGeospatialSemanticValue(
    { semanticType: 'geospatial', type: 'Polygon', coordinates: [[[[0, 0], [1, 1]]]] },
    { path: 'sample.polygon' }
  );
  assert.equal(polygon.valid, false);

  const fuzzy = validateFuzzySemanticValue(
    { semanticType: 'fuzzy', trapezoid: [0, 0.25, 0.75, 1] },
    { path: 'sample.fuzzy' }
  );
  assert.equal(fuzzy.valid, true);
}

{
  const unknown = validateSemanticProfiles(validModel, { profiles: ['not-a-profile'] });
  assert.equal(unknown.valid, false);
  assert.equal(unknown.skipped, false);
  assert.ok(unknown.diagnostics.some(item => item.code === 'unknown-semantic-profile'));
}

for (const relativePath of [
  '../models/hbds_semantic_object_layer_example.json',
  '../test_models/semantics_035_object_layer_functors_profiles.json'
]) {
  const fixtureUrl = new URL(relativePath, import.meta.url);
  const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  const result = validateSemanticProfiles(fixture);
  assert.equal(result.valid, true, `${relativePath}: ${result.errors.join('; ')}`);
  assert.deepEqual(result.enabledProfiles, ['fuzzy', 'geospatial', 'prototype', 'temporal', 'units']);
  for (const profile of result.enabledProfiles) {
    assert.ok(result.counts[profile].candidates > 0, `${relativePath} must exercise ${profile}`);
  }
}

console.log('HBDS semantic profile tests passed.');
