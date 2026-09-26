import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modulePath = new URL('../js/hbds_functors.js', import.meta.url);
const source = readFileSync(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  buildFunctorIndex,
  composeFunctorSteps,
  createFunctorQueryEngine,
  executeFunctorQuery,
  resolveObjectClassIds,
  resolveObjectHyperclassIds,
  selectObjectIdsByClass,
  selectObjectIdsByHyperclass
} = await import(moduleUrl);
const semanticsSource = readFileSync(new URL('../js/hbds_semantics.js', import.meta.url), 'utf8');
const semanticsUrl = `data:text/javascript;base64,${Buffer.from(semanticsSource).toString('base64')}`;
const { buildSemanticIndex } = await import(semanticsUrl);

const model = {
  metadata: { semanticVersion: 1 },
  hypergraph: {
    object: [
      { id: 'river-a', classId: 'river', attributeValues: [] },
      { id: 'dam-b', classId: 'dam', attributeValues: [] },
      { id: 'city-c', classId: 'city', attributeValues: [] },
      { id: 'city-a', classId: 'city', attributeValues: [] },
      { id: 'dam-a', classId: 'dam', attributeValues: [] },
      { id: 'city-b', classId: 'city', attributeValues: [] }
    ],
    objectLink: [
      { id: 'feed-b', classLinkId: 'feeds', sourceObjectId: 'dam-b', targetObjectId: 'river-a' },
      { id: 'sister-b', classLinkId: 'sister-city', sourceObjectId: 'city-b', targetObjectId: 'city-c' },
      { id: 'cross-a', classLinkId: 'crosses', sourceObjectId: 'city-a', targetObjectId: 'river-a' },
      { id: 'feed-a', classLinkId: 'feeds', sourceObjectId: 'dam-a', targetObjectId: 'river-a' },
      { id: 'sister-a', classLinkId: 'sister-city', sourceObjectId: 'city-a', targetObjectId: 'city-b' }
    ],
    membership: [
      { id: 'member-river-water', classId: 'river', hyperclassId: 'water' },
      { id: 'member-city-place', classId: 'city', hyperclassId: 'place' },
      { id: 'member-dam-infrastructure', classId: 'dam', hyperclassId: 'infrastructure' }
    ]
  }
};

const originalModel = JSON.stringify(model);
const index = buildFunctorIndex(model);
assert.equal(index.valid, true);
assert.equal(buildFunctorIndex(buildSemanticIndex(model)).valid, true);
assert.deepEqual(index.objects.map(object => object.id), ['city-a', 'city-b', 'city-c', 'dam-a', 'dam-b', 'river-a']);
assert.deepEqual(resolveObjectClassIds(index, 'city-a'), ['city']);
assert.deepEqual(resolveObjectHyperclassIds(index, 'city-a'), ['place']);
assert.deepEqual(selectObjectIdsByClass(index, 'dam'), ['dam-a', 'dam-b']);
assert.deepEqual(selectObjectIdsByHyperclass(index, 'place'), ['city-a', 'city-b', 'city-c']);

{
  const result = executeFunctorQuery(index, {
    startObjectIds: ['city-a'],
    steps: [{ kind: 'direct', linkId: 'crosses' }]
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.objectIds, ['river-a']);
  assert.deepEqual(result.paths[0].objectLinkIds, ['cross-a']);
  assert.deepEqual(result.paths[0].directions, ['direct']);
}

{
  const result = executeFunctorQuery(index, {
    startObjectIds: ['river-a'],
    steps: [{ kind: 'inverse', linkId: 'feeds' }]
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.objectIds, ['dam-a', 'dam-b']);
  assert.deepEqual(result.paths.map(path => path.objectLinkIds[0]), ['feed-a', 'feed-b']);
}

{
  const result = executeFunctorQuery(index, {
    startObjectIds: ['city-a'],
    steps: [composeFunctorSteps(
      { kind: 'direct', linkId: 'crosses', targetHyperclassId: 'water' },
      { kind: 'inverse', linkId: 'feeds', toHyperclassId: 'infrastructure' }
    )]
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.objectIds, ['dam-a', 'dam-b']);
  assert.deepEqual(result.paths[0].objectIds, ['city-a', 'river-a', 'dam-a']);
  assert.deepEqual(result.steps.map(step => step.kind), ['direct', 'inverse']);
}

{
  const result = executeFunctorQuery(index, {
    startObjectIds: ['city-b'],
    steps: [{ kind: 'homogeneous', linkId: 'sister-city' }]
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.objectIds, ['city-a', 'city-c']);
  assert.deepEqual(result.paths.map(path => path.directions[0]), ['inverse', 'direct']);
  assert.equal(result.diagnostics.some(item => item.code === 'non-homogeneous-object-link'), false);
}

{
  const byClass = executeFunctorQuery(index, {
    startClassId: 'city',
    steps: []
  });
  assert.deepEqual(byClass.objectIds, ['city-a', 'city-b', 'city-c']);

  const byHyperclass = executeFunctorQuery(index, {
    startHyperclassIds: ['infrastructure'],
    steps: []
  });
  assert.deepEqual(byHyperclass.objectIds, ['dam-a', 'dam-b']);

  const byMembership = executeFunctorQuery(index, {
    startMembershipIds: ['member-city-place'],
    steps: []
  });
  assert.deepEqual(byMembership.objectIds, ['city-a', 'city-b', 'city-c']);
}

{
  const result = executeFunctorQuery(index, {
    startObjectIds: ['river-a'],
    maxPaths: 1,
    steps: [{ kind: 'inverse', classLinkId: 'feeds' }]
  });
  assert.equal(result.truncated, true);
  assert.deepEqual(result.objectIds, ['dam-a']);
  assert.ok(result.diagnostics.some(item => item.code === 'functor-path-limit'));
}

{
  const engine = createFunctorQueryEngine(model);
  assert.deepEqual(engine.objectClassIds('dam-a'), ['dam']);
  assert.deepEqual(engine.objectHyperclassIds('dam-a'), ['infrastructure']);
  assert.deepEqual(engine.objectIdsForClass('river'), ['river-a']);
  assert.deepEqual(engine.objectIdsForHyperclass('water'), ['river-a']);
  assert.deepEqual(engine.execute({
    startObjectIds: 'city-a',
    steps: [{ functor: 'forward', relationshipId: 'crosses' }]
  }).objectIds, ['river-a']);
}

{
  const unknownStart = executeFunctorQuery(index, { startObjectIds: ['missing'], steps: [] });
  assert.equal(unknownStart.valid, true);
  assert.deepEqual(unknownStart.objectIds, []);
  assert.ok(unknownStart.diagnostics.some(item => item.code === 'unknown-start-object'));

  const noStart = executeFunctorQuery(index, { steps: [] });
  assert.equal(noStart.valid, false);
  assert.ok(noStart.diagnostics.some(item => item.code === 'missing-query-start'));

  const badDirection = executeFunctorQuery(index, {
    startObjectIds: ['city-a'],
    steps: [{ kind: 'homogeneous', direction: 'sideways' }]
  });
  assert.equal(badDirection.valid, false);
  assert.ok(badDirection.diagnostics.some(item => item.code === 'invalid-homogeneous-direction'));
}

{
  const broken = buildFunctorIndex({
    hypergraph: {
      object: [{ id: 'one', classId: 'sample' }],
      objectLink: [{ id: 'broken', classLinkId: 'rel', sourceObjectId: 'one', targetObjectId: 'missing' }],
      membership: []
    }
  });
  assert.equal(broken.valid, false);
  assert.ok(broken.diagnostics.some(item => item.code === 'unknown-object-link-endpoint'));
  assert.equal(broken.objectLinks.length, 0);
}

assert.equal(JSON.stringify(model), originalModel);

for (const relativePath of [
  '../models/hbds_semantic_object_layer_example.json',
  '../test_models/semantics_035_object_layer_functors_profiles.json'
]) {
  const fixtureUrl = new URL(relativePath, import.meta.url);
  const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  const fixtureIndex = buildFunctorIndex(fixture);
  assert.equal(fixtureIndex.valid, true, `${relativePath}: ${fixtureIndex.diagnostics.map(item => item.message).join('; ')}`);
  const examples = fixture.metadata?.semanticExamples?.functorQueries || [];
  assert.ok(examples.length >= 4, `${relativePath} must provide direct, inverse, homogeneous, and composed examples`);
  for (const example of examples) {
    const result = executeFunctorQuery(fixtureIndex, example.query);
    assert.equal(result.valid, true, `${example.id}: ${result.errors.join('; ')}`);
    assert.deepEqual(result.objectIds, example.expectedObjectIds, example.id);
  }
}

console.log('HBDS functor query tests passed.');
