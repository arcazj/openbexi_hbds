import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modulePath = new URL('../js/hbds_semantics.js', import.meta.url);
const source = readFileSync(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const semantics = await import(moduleUrl);

const pureV1 = {
  metadata: { name: 'V1 model' },
  hypergraph: {
    class: [{ id: 'v1_class', attributes: [] }],
    link: []
  }
};
assert.deepEqual(semantics.normalizeSemanticModel(pureV1), pureV1);
assert.equal(Object.hasOwn(semantics.normalizeSemanticModel(pureV1).hypergraph, 'object'), false);
assert.deepEqual(semantics.validateSemanticModel(pureV1), { valid: true, errors: [], warnings: [] });

const model = {
  metadata: { name: 'Semantic model', semanticVersion: 1 },
  hypergraph: {
    class: [
      {
        id: 'hc_asset',
        name: 'Asset',
        type: 'hyperclass',
        attributes: [{ id: 'attr_visual_only', name: 'visual only' }],
        children: ['satellite']
      },
      {
        id: 'hc_operational',
        name: 'Operational',
        type: 'hyperclass',
        attributes: [],
        children: []
      },
      {
        id: 'hc_space',
        name: 'Space',
        type: 'hyperclass',
        attributes: [],
        children: []
      },
      {
        id: 'base_a',
        name: 'Base A',
        type: 'roundedRectangle',
        attributes: [{ id: 'attr_a', name: 'A' }]
      },
      {
        id: 'base_b',
        name: 'Base B',
        type: 'roundedRectangle',
        attributes: [{ id: 'attr_b', name: 'B' }]
      },
      {
        id: 'satellite',
        name: 'Satellite',
        type: 'roundedRectangle',
        parentClassId: 'hc_asset',
        attributes: [{ id: 'attr_satellite', name: 'Satellite value' }]
      },
      {
        id: 'ground_site',
        name: 'Ground Site',
        type: 'roundedRectangle',
        attributes: [{ id: 'attr_site', name: 'Site value' }]
      }
    ],
    link: [
      {
        id: 'link_base_to_site',
        sourceClassId: 'base_a',
        targetClassId: 'ground_site',
        allowSelfLink: false
      },
      {
        id: 'link_operational_to_site',
        sourceClassId: 'hc_operational',
        targetClassId: 'ground_site',
        allowSelfLink: false
      },
      {
        id: 'link_visual_to_site',
        sourceClassId: 'hc_asset',
        targetClassId: 'ground_site',
        allowSelfLink: false
      }
    ],
    inheritance: [
      { id: 'inherit_satellite_a', subClassId: 'satellite', superClassId: 'base_a' },
      { id: 'inherit_satellite_b', subClassId: 'satellite', superClassId: 'base_b' }
    ],
    membership: [
      { id: 'membership_base_operational', classId: 'base_a', hyperclassId: 'hc_operational' },
      { id: 'membership_satellite_space', classId: 'satellite', hyperclassId: 'hc_space' },
      { id: 'membership_operational_space', classId: 'hc_operational', hyperclassId: 'hc_space' }
    ],
    object: [
      {
        id: 'satellite_1',
        classId: 'satellite',
        name: 'Satellite 1',
        attributeValues: [
          { attributeId: 'attr_a', value: 'inherited A' },
          { attributeId: 'attr_b', value: 'inherited B' },
          { attributeId: 'attr_satellite', value: 'direct' }
        ]
      },
      {
        id: 'site_1',
        classId: 'ground_site',
        attributeValues: [{ attributeId: 'attr_site', value: 'site' }]
      }
    ],
    objectLink: [
      {
        id: 'object_link_inherited',
        classLinkId: 'link_base_to_site',
        sourceObjectId: 'satellite_1',
        targetObjectId: 'site_1'
      },
      {
        id: 'object_link_membership',
        classLinkId: 'link_operational_to_site',
        sourceObjectId: 'satellite_1',
        targetObjectId: 'site_1'
      }
    ]
  }
};

const normalized = semantics.normalizeSemanticModel(model);
assert.notEqual(normalized, model);
assert.deepEqual(semantics.getClassAncestors(normalized, 'satellite'), ['base_a', 'base_b']);
assert.deepEqual(
  semantics.getEffectiveClassAttributes(normalized, 'satellite').map(attribute => attribute.id),
  ['attr_a', 'attr_b', 'attr_satellite']
);
assert.equal(
  semantics.getEffectiveClassAttributes(normalized, 'satellite').find(attribute => attribute.id === 'attr_a').inherited,
  true
);
assert.equal(
  semantics.getEffectiveClassAttributes(normalized, 'satellite').some(attribute => attribute.id === 'attr_visual_only'),
  false,
  'visual containment must not provide inherited attributes'
);

const membershipDetails = semantics.getEffectiveClassMemberships(normalized, 'satellite');
assert.deepEqual(
  membershipDetails.map(detail => detail.hyperclassId),
  ['hc_operational', 'hc_space']
);
assert.equal(membershipDetails.find(detail => detail.hyperclassId === 'hc_operational').inherited, true);
assert.equal(membershipDetails.find(detail => detail.hyperclassId === 'hc_space').direct, true);
assert.equal(membershipDetails.find(detail => detail.hyperclassId === 'hc_space').transitive, true);
assert.equal(
  membershipDetails.some(detail => detail.hyperclassId === 'hc_asset'),
  false,
  'parentClassId must not imply semantic membership'
);

const effectiveLinks = semantics.getEffectiveClassLinks(normalized, 'satellite');
assert.deepEqual(effectiveLinks.map(link => link.id), ['link_base_to_site', 'link_operational_to_site']);
assert.equal(effectiveLinks[0].effectiveRoles[0].via, 'inheritance');
assert.equal(effectiveLinks[1].effectiveRoles[0].via, 'membership');
assert.equal(semantics.validateSemanticModel(normalized).valid, true);

const aliasModel = semantics.normalizeSemanticModel({
  metadata: { semanticsVersion: '1' },
  hypergraph: {
    class: model.hypergraph.class,
    link: model.hypergraph.link,
    object: [{
      id: 'alias_object',
      class: 'satellite',
      attributes: { attr_a: 1 }
    }],
    objectLink: [{
      id: 'alias_object_link',
      linkId: 'link_base_to_site',
      source: 'alias_object',
      target: 'alias_object'
    }],
    membership: [{ id: 'alias_membership', memberClassId: 'satellite', groupId: 'hc_space' }],
    inheritance: [{ id: 'alias_inheritance', subclassId: 'satellite', superclassId: 'base_a' }]
  }
});
assert.equal(aliasModel.metadata.semanticVersion, 1);
assert.deepEqual(aliasModel.hypergraph.object[0].attributeValues, [{ attributeId: 'attr_a', value: 1 }]);
assert.equal(aliasModel.hypergraph.objectLink[0].classLinkId, 'link_base_to_site');
assert.equal(aliasModel.hypergraph.membership[0].classId, 'satellite');
assert.equal(aliasModel.hypergraph.inheritance[0].superClassId, 'base_a');

const visualMembershipOnly = structuredClone(model);
visualMembershipOnly.hypergraph.membership = visualMembershipOnly.hypergraph.membership
  .filter(membership => membership.hyperclassId !== 'hc_operational');
visualMembershipOnly.hypergraph.objectLink = [{
  id: 'visual_membership_is_not_semantic',
  classLinkId: 'link_visual_to_site',
  sourceObjectId: 'satellite_1',
  targetObjectId: 'site_1'
}];
const visualValidation = semantics.validateSemanticModel(visualMembershipOnly);
assert.equal(visualValidation.valid, false);
assert.ok(visualValidation.errors.some(error => error.includes('incompatible with hc_asset')));

const invalid = structuredClone(model);
invalid.hypergraph.inheritance.push({
  id: 'inherit_cycle',
  subClassId: 'base_a',
  superClassId: 'satellite'
});
invalid.hypergraph.object[0].attributeValues.push({ attributeId: 'attr_site', value: 'wrong class' });
invalid.hypergraph.objectLink.push({
  id: 'object_link_missing',
  classLinkId: 'missing_link',
  sourceObjectId: 'satellite_1',
  targetObjectId: 'missing_object'
});
const invalidValidation = semantics.validateSemanticModel(invalid);
assert.equal(invalidValidation.valid, false);
assert.ok(invalidValidation.errors.some(error => error.includes('inheritance cycle detected')));
assert.ok(invalidValidation.errors.some(error => error.includes('attr_site is not effective')));
assert.ok(invalidValidation.errors.some(error => error.includes('classLinkId must reference')));
assert.ok(invalidValidation.errors.some(error => error.includes('targetObjectId must reference')));

const duplicate = structuredClone(model);
duplicate.hypergraph.object.push({ id: 'satellite', classId: 'satellite', attributeValues: [] });
const duplicateValidation = semantics.validateSemanticModel(duplicate);
assert.equal(duplicateValidation.valid, false);
assert.ok(duplicateValidation.errors.some(error => error.includes('duplicate model id satellite')));

const unsupportedVersion = structuredClone(model);
unsupportedVersion.metadata.semanticVersion = 2;
assert.equal(semantics.validateSemanticModel(unsupportedVersion).valid, false);

console.log('HBDS semantics tests passed.');
