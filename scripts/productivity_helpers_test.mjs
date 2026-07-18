import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const helperUrl = new URL('../js/hbds_model_productivity.js', import.meta.url);
const source = readFileSync(helperUrl, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const helpers = await import(moduleUrl);

{
  const existing = new Set(['class_a', 'class_a_copy']);
  assert.equal(helpers.makeUniqueId('class_a_copy', existing, 'class'), 'class_a_copy_2');
  assert.ok(existing.has('class_a_copy_2'));
}

{
  const sourceNodes = [
    { id: 'parent', type: 'hyperclass', name: 'Parent', children: ['child', 'outside'], position: { x: 1, y: 2, z: 3 } },
    { id: 'child', type: 'class', name: 'Child', parentClassId: 'parent', position: { x: 2, y: 3, z: 0 }, rendering: { class: { color: '#fff' } } }
  ];
  const cloned = helpers.cloneNodesForPaste(sourceNodes, new Set(['parent', 'child']));
  assert.equal(cloned.nodes.length, 2);
  assert.notEqual(cloned.nodes[0].id, 'parent');
  assert.equal(cloned.nodes[0].children.length, 1);
  assert.equal(cloned.nodes[0].children[0], cloned.nodes[1].id);
  assert.equal(cloned.nodes[1].parentClassId, cloned.nodes[0].id);
  assert.equal(cloned.nodes[1].rendering.class.color, '#fff');
  assert.equal(cloned.nodes[1].position.x, 2.45);
}

{
  const cloned = helpers.cloneNodesForPaste([
    { id: 'parent', type: 'hyperclass', children: ['child'], position: { x: 0, y: 0, z: 0 } }
  ], new Set(['parent', 'child']));
  assert.deepEqual(cloned.nodes[0].children, []);
}

{
  const parsed = helpers.parseBulkAttributeNames('status\nOwner\nstatus\nregion', [{ name: 'owner' }]);
  assert.deepEqual(parsed.names, ['status', 'region']);
  assert.deepEqual(parsed.duplicates, ['Owner', 'status']);
}

{
  const result = helpers.moveArrayItem(['a', 'b', 'c'], 1, -1);
  assert.equal(result.moved, true);
  assert.deepEqual(result.items, ['b', 'a', 'c']);
  assert.equal(helpers.moveArrayItem(['a'], 0, 1).moved, false);
}

{
  const model = {
    metadata: { name: 'source' },
    hypergraph: {
      class: [
        { id: 'group', type: 'hyperclass', children: ['child', 'leaf'] },
        { id: 'child', type: 'class', parentClassId: 'group' },
        { id: 'leaf', type: 'class', parentClassId: 'group' },
        { id: 'outside', type: 'class' }
      ],
      link: [
        { id: 'inside', sourceClassId: 'child', targetClassId: 'leaf' },
        { id: 'outside', sourceClassId: 'child', targetClassId: 'outside' }
      ]
    }
  };
  const subgraph = helpers.buildSelectedSubgraph(model, new Set(['group']));
  assert.deepEqual(subgraph.hypergraph.class.map(node => node.id), ['group', 'child', 'leaf']);
  assert.deepEqual(subgraph.hypergraph.link.map(link => link.id), ['inside']);
  assert.deepEqual(model.hypergraph.class[0].children, ['child', 'leaf']);
}

{
  const model = {
    metadata: { semanticVersion: 1 },
    hypergraph: {
      class: [
        { id: 'semantic_hyper', type: 'hyperclass', children: ['semantic_base', 'semantic_child'] },
        { id: 'semantic_base', type: 'class', parentClassId: 'semantic_hyper' },
        { id: 'semantic_child', type: 'class', parentClassId: 'semantic_hyper' },
        { id: 'semantic_outside', type: 'class' }
      ],
      link: [
        { id: 'semantic_link', sourceClassId: 'semantic_child', targetClassId: 'semantic_base' },
        { id: 'semantic_outside_link', sourceClassId: 'semantic_child', targetClassId: 'semantic_outside' }
      ],
      object: [
        { id: 'semantic_object_child', classId: 'semantic_child' },
        { id: 'semantic_object_base', classId: 'semantic_base' },
        { id: 'semantic_object_outside', classId: 'semantic_outside' }
      ],
      objectLink: [
        { id: 'semantic_object_link', classLinkId: 'semantic_link', sourceObjectId: 'semantic_object_child', targetObjectId: 'semantic_object_base' },
        { id: 'semantic_object_link_outside', classLinkId: 'semantic_outside_link', sourceObjectId: 'semantic_object_child', targetObjectId: 'semantic_object_outside' }
      ],
      membership: [
        { id: 'semantic_membership', classId: 'semantic_child', hyperclassId: 'semantic_hyper' },
        { id: 'semantic_membership_outside', classId: 'semantic_outside', hyperclassId: 'semantic_hyper' }
      ],
      inheritance: [
        { id: 'semantic_inheritance', subClassId: 'semantic_child', superClassId: 'semantic_base' },
        { id: 'semantic_inheritance_outside', subClassId: 'semantic_child', superClassId: 'semantic_outside' }
      ]
    }
  };
  const subgraph = helpers.buildSelectedSubgraph(model, new Set(['semantic_hyper']));
  assert.deepEqual(subgraph.hypergraph.object.map(item => item.id), ['semantic_object_child', 'semantic_object_base']);
  assert.deepEqual(subgraph.hypergraph.objectLink.map(item => item.id), ['semantic_object_link']);
  assert.deepEqual(subgraph.hypergraph.membership.map(item => item.id), ['semantic_membership']);
  assert.deepEqual(subgraph.hypergraph.inheritance.map(item => item.id), ['semantic_inheritance']);
}

{
  assert.deepEqual(helpers.routePresetPatch('horizontal').orthogonalStyle, 'horizontal');
  assert.equal(helpers.routePresetFromRendering({ orthogonalStyle: 'vertical' }), 'vertical');
  assert.equal(helpers.routePresetFromRendering(helpers.routePresetPatch('direct')), 'direct');
  assert.equal(helpers.PRODUCTIVITY_ROUTE_PRESETS.includes('orthogonal'), true);
}

console.log('Productivity helper tests passed.');
