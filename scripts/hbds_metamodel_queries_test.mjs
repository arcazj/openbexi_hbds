import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const source = readFileSync(new URL('../js/hbds_metamodel_queries.js', import.meta.url), 'utf8') + '\n//# sourceURL=hbds_metamodel_queries.js';
const { QUERY_TYPES, createQuerySnapshot, buildQueryIndex, executeQuery, validateQuery, availableQuerySteps, functorCapability } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const catalog = JSON.parse(readFileSync(new URL('../js/hbds_functor_catalog.json', import.meta.url))).functors;
assert.equal(catalog.length, 141);
assert.equal(new Set(catalog.map(item => item.name)).size, 141);
const model = { hypergraph: { class: [
  { id: 'h', type: 'hyperclass', name: 'Group', attributes: [{ id: 'ha', name: 'Declared property' }], children: ['a'] },
  { id: 'h2', type: 'hyperclass', name: 'Other group' },
  { id: 'a', name: 'Same name', parentClassId: 'h', attributes: [{ id: 'aa', name: 'Definition', value: 7 }, 'Legacy'] },
  { id: 'b', name: 'Same name', attributes: [{ id: 'ba', name: 'Definition' }] },
  { id: 'c', name: 'Isolated' }
], link: [
  { id: 'ab', sourceClassId: 'a', targetClassId: 'b' },
  { id: 'ab2', sourceClassId: 'a', targetClassId: 'b' },
  { id: 'ba-link', sourceClassId: 'b', targetClassId: 'a' },
  { id: 'self', sourceClassId: 'a', targetClassId: 'a' },
  { id: 'hh', sourceClassId: 'h', targetClassId: 'h2' },
  { id: 'mixed', sourceClassId: 'h', targetClassId: 'a' }
] } };
const before = JSON.stringify(model);
const snapshot = createQuerySnapshot(model, { name: 'fixture' });
const index = buildQueryIndex(snapshot);
const run = (type, ids, ...steps) => executeQuery(index, { type, ids, steps });
const ids = result => result.items.map(item => item.id);
assert.deepEqual(ids(run('class', ['a'], 'ATT')), ['@legacy:/hypergraph/class/2/attributes/1', 'aa']);
assert.deepEqual(ids(run('classAttribute', ['aa'], 'ATTOF')), ['a']);
assert.deepEqual(ids(run('class', ['a'], 'PSC')), ['ab', 'ab2', 'self']);
assert.deepEqual(ids(run('class', ['a'], 'PSC', 'FIN')), ['a', 'b']);
assert.deepEqual(ids(run('class', ['a'], 'NSC')), ['ba-link', 'self']);
assert.equal(run('class', ['a'], 'PSC', 'CARD').value, 3);
assert.equal(run('class', [], 'CARD').value, 0);
assert.deepEqual(ids(run('classLink', ['ab'], 'INV', 'INI')), ['b']);
assert.deepEqual(ids(run('classLink', ['ab'], 'INV', 'INV', 'FIN')), ['b']);
assert.deepEqual(ids(run('hyperclass', ['h'], 'HATT')), ['ha']);
assert.deepEqual(ids(run('hyperattribute', ['ha'], 'HATTOF')), ['h']);
assert.deepEqual(ids(run('hyperclass', ['h'], 'HPSC', 'HFIN')), ['h2']);
assert.deepEqual(ids(run('hyperclass', ['h2'], 'HNSC', 'HINI')), ['h']);
assert.deepEqual(ids(run('hyperlink', ['hh'], 'HINV', 'HFIN')), ['h']);
assert.equal(index.byType.get('mixedLink').length, 1, 'Mixed links are indexed for locating, but have no canonical query type');
for (const type of ['mixedLink', 'node', 'link']) assert.throws(() => run(type, undefined), error => error.code === 'INVALID_TYPE');
for (const name of ['structural:children', 'structural:elements', 'query:linksBetweenClasses', 'children']) {
  assert.throws(() => run('hyperclass', ['h'], name), error => error.code === 'UNSUPPORTED_FUNCTOR');
}
assert.deepEqual(ids(run('hyperclass', ['h'], 'CONT')), ['a']);
assert.deepEqual(ids(run('class', ['a'], 'CONTOF')), ['h']);
const couple = target => ({ functor: 'COUPLE', parameters: { targetClass: { type: 'class', id: target } } });
assert.deepEqual(ids(run('class', ['a'], couple('b'))), ['ab', 'ab2'], 'COUPLE preserves parallel links and excludes the opposite direction');
assert.deepEqual(ids(run('class', ['b'], couple('a'))), ['ba-link']);
assert.deepEqual(ids(run('class', ['a'], couple('a'))), ['self']);
assert.deepEqual(ids(run('class', ['a', 'b'], couple('a'))), ['ba-link', 'self']);
assert.equal(run('class', ['a'], couple('b'), 'CARD').value, 2);
assert.deepEqual(ids(run('class', ['a'], couple('b'), 'FIN', 'ATT')), ['ba']);
assert.deepEqual(ids(run('class', ['a'], couple('c'))), [], 'A valid empty relation is not an unsupported operation');
assert.throws(() => run('class', [], 'COUPLE'), error => error.code === 'INVALID_PARAMETERS');
assert.throws(() => run('class', [], couple('h')), error => error.code === 'UNKNOWN_ID');
assert.throws(() => run('class', [], couple('missing')), error => error.code === 'UNKNOWN_ID');
assert.throws(() => run('class', [], { ...couple('b'), parameters: { ...couple('b').parameters, direction: 'either' } }), error => error.code === 'INVALID_PARAMETERS');
assert.throws(() => run('class', [], { functor: 'ATT', parameters: { recursive: true } }), error => error.code === 'INVALID_PARAMETERS');
assert.throws(() => run('class', ['a'], couple('c'), 'ATT'), error => error.code === 'TYPE_MISMATCH');
assert.throws(() => run('class', [], 'PSC', 'ATT'), error => error.code === 'TYPE_MISMATCH' && error.stepIndex === 1);
assert.throws(() => run('class', [], 'OBJ'), error => error.code === 'UNSUPPORTED_FUNCTOR');
assert.throws(() => run('class', [], 'toString'), error => error.code === 'UNSUPPORTED_FUNCTOR');
assert.throws(() => run('class', [], '__proto__'), error => error.code === 'UNSUPPORTED_FUNCTOR');
assert.throws(() => run('class', ['missing']), error => error.code === 'UNKNOWN_ID');
assert.throws(() => run('class', [], 'CARD', 'CARD'), error => error.code === 'TYPE_MISMATCH');
assert.throws(() => run('class', [], ...Array(33).fill('CARD')), error => error.code === 'QUERY_LIMIT');
const excessiveEdges = { hypergraph: { class: [{ id: 'loop', children: Array(200001).fill('loop') }], link: [] } };
assert.throws(() => buildQueryIndex(createQuerySnapshot(excessiveEdges)), error => error.code === 'QUERY_LIMIT', 'Oversized containment must fail explicitly');
for (const type of index.byType.keys()) {
  for (const step of availableQuerySteps(type, index, catalog)) {
    const plan = validateQuery(index, { type, ids: [], steps: [step.name === 'COUPLE' ? couple('a') : step.name] });
    assert.equal(plan[0].type, step.outputType, `${step.name} must match the catalog signature`);
  }
}
assert.equal(catalog.filter(entry => functorCapability(entry.name, index).supported).length, 21);
assert.deepEqual(availableQuerySteps('node', index, catalog), []);
assert.equal(JSON.stringify(model), before, 'Read operations must not mutate the source');
model.hypergraph.class[2].name = 'Edited after capture';
assert.equal(index.nodes.get('a').name, 'Same name', 'Captured results must remain immutable relative to source edits');
const semantic = JSON.parse(before);
semantic.metadata = { semanticVersion: 1 };
semantic.hypergraph.membership = [{ id: 'membership', classId: 'b', hyperclassId: 'h' }];
const semanticIndex = buildQueryIndex(createQuerySnapshot(semantic));
assert.deepEqual(ids(executeQuery(semanticIndex, { type: 'hyperclass', ids: ['h'], steps: ['CONT'] })), ['b'], 'Do not use visual child a as semantic member');
assert.deepEqual(ids(executeQuery(semanticIndex, { type: 'class', ids: ['b'], steps: ['CONTOF'] })), ['h']);
semantic.hypergraph.membership = [];
assert.equal(executeQuery(buildQueryIndex(createQuerySnapshot(semantic)), { type: 'hyperclass', steps: ['CONT', 'CARD'] }).value, 0);
delete semantic.hypergraph.membership;
assert.equal(executeQuery(buildQueryIndex(createQuerySnapshot(semantic)), { type: 'hyperclass', steps: ['CONT', 'CARD'] }).value, 0, 'Opted-in semantic models never fall back to visual parents');
semantic.hypergraph.membership = {};
assert.throws(() => buildQueryIndex(createQuerySnapshot(semantic)), error => error.code === 'INVALID_MODEL');
semantic.hypergraph.membership = [{ id: 'invalid', classId: 'missing', hyperclassId: 'h' }];
assert.throws(() => buildQueryIndex(createQuerySnapshot(semantic)), error => error.code === 'INVALID_MODEL');
semantic.hypergraph.membership = [];
semantic.hypergraph.class.push({ id: 'a' });
assert.throws(() => buildQueryIndex(createQuerySnapshot(semantic)), error => error.code === 'INVALID_MODEL');

// CH10.4 pp.9–12: immediate classes, all-depth classes, and immediate hyperclasses
// are three distinct traversals. Class-in-class nesting is explicitly mentioned on p.11.
const nested = { hypergraph: { class: [
  { id: 'outer', type: 'hyperclass', children: ['inner', 'a', 'shared'] },
  { id: 'inner', type: 'hyperclass', parentClassId: 'outer', children: ['b', 'shared'] },
  { id: 'a', parentClassId: 'outer', children: ['deep'], attributes: ['Not a class'] },
  { id: 'b', parentClassId: 'inner' }, { id: 'deep' }, { id: 'shared' },
  { id: 'geometryOnly', rendering: { x: 1, y: 1, width: 10, height: 10 } }
], link: [] } };
const nestedBefore = JSON.stringify(nested);
const nestedIndex = buildQueryIndex(createQuerySnapshot(nested));
const nestedRun = (type, selection, ...steps) => executeQuery(nestedIndex, { type, ids: selection, steps });
assert.equal(nestedIndex.containmentMode, 'declaredContainment');
assert.deepEqual(ids(nestedRun('hyperclass', ['outer'], 'CONT')), ['a', 'shared']);
assert.deepEqual(ids(nestedRun('hyperclass', ['outer'], 'CONTN')), ['a', 'b', 'deep', 'shared']);
assert.deepEqual(ids(nestedRun('hyperclass', ['outer'], 'HCONT')), ['inner']);
assert.deepEqual(ids(nestedRun('hyperclass', ['inner'], 'HCONTOF')), ['outer']);
assert.deepEqual(ids(nestedRun('class', ['shared'], 'CONTOF')), ['inner', 'outer']);
assert.deepEqual(ids(nestedRun('class', ['deep'], 'CONTOF')), [], 'CONTOF returns only direct containing hyperclasses');
assert.equal(nestedRun('hyperclass', ['inner', 'outer'], 'CONTN', 'CARD').value, 4, 'Shared descendants and multiple prefix roots are deduplicated');
assert.equal(JSON.stringify(nested), nestedBefore);
const explicitNested = JSON.parse(nestedBefore);
explicitNested.metadata = { semanticVersion: 1 };
explicitNested.hypergraph.membership = [
  { id: 'mi', classId: 'inner', hyperclassId: 'outer' },
  { id: 'mb', classId: 'b', hyperclassId: 'inner' }
];
const explicitIndex = buildQueryIndex(createQuerySnapshot(explicitNested));
assert.equal(explicitIndex.containmentMode, 'explicitMembership');
assert.deepEqual(ids(executeQuery(explicitIndex, { type: 'hyperclass', ids: ['outer'], steps: ['CONT'] })), []);
assert.deepEqual(ids(executeQuery(explicitIndex, { type: 'hyperclass', ids: ['outer'], steps: ['HCONT', 'CONT'] })), ['b']);
assert.deepEqual(ids(executeQuery(explicitIndex, { type: 'hyperclass', ids: ['outer'], steps: ['CONTN'] })), ['b']);
explicitNested.hypergraph.membership.push({ id: 'cycle', classId: 'outer', hyperclassId: 'inner' });
assert.throws(() => buildQueryIndex(createQuerySnapshot(explicitNested)), error => error.code === 'CONTAINMENT_CYCLE');
nested.hypergraph.class[1].children.push('outer');
assert.throws(() => buildQueryIndex(createQuerySnapshot(nested)), error => error.code === 'CONTAINMENT_CYCLE');
const deep = { hypergraph: { class: Array.from({ length: 12000 }, (_, i) => ({
  id: `depth-${i}`, type: i === 0 ? 'hyperclass' : 'class', ...(i ? { parentClassId: `depth-${i - 1}` } : {})
})), link: [] } };
assert.equal(executeQuery(buildQueryIndex(createQuerySnapshot(deep)), { type: 'hyperclass', steps: ['CONTN', 'CARD'] }).value, 11999, 'Deep inclusion must not overflow the call stack');
let fixtures = 0;
for (const dir of ['models', 'test_models']) {
  const directory = new URL(`../${dir}/`, import.meta.url);
  for (const file of readdirSync(directory).filter(file => file.endsWith('.json') && !file.includes('manifest'))) {
    const model = JSON.parse(readFileSync(new URL(file, directory)));
    const all = buildQueryIndex(createQuerySnapshot(model));
    const count = type => executeQuery(all, { type, steps: ['CARD'] }).value;
    assert.equal(count('class') + count('hyperclass'), model.hypergraph.class.length, file);
    assert.equal(count('classLink') + count('hyperlink') + all.byType.get('mixedLink').length, model.hypergraph.link.length, file);
    for (const type of Object.keys(QUERY_TYPES)) assert.equal(count(type), all.byType.get(type).length);
    if (file === 'openbexi_timeline.json') {
      assert.equal(executeQuery(all, { type: 'hyperclass', ids: ['obt_model'], steps: ['CONT', 'CARD'] }).value, 11);
      assert.deepEqual(ids(executeQuery(all, { type: 'hyperclass', ids: ['obt_source'], steps: ['CONT'] })), ['obt_record', 'obt_rule', 'obt_time']);
    }
    fixtures++;
  }
}
console.log(`PASS legacy metamodel queries: 21 canonical functors, directed COUPLE, direct/transitive containment, explicit membership precedence, cycles, deep/shared nesting, immutable snapshots and ${fixtures} fixtures`);
