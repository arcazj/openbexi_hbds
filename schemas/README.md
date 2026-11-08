# HBDS JSON Schemas

- `hbds-structural-diagram-profile-v1.schema.json` describes the current renderer-compatible structural model.
- `hbds-semantic-profile-v2.schema.json` opts in through `metadata.semanticVersion: 1` and extends v1 with optional `hypergraph.object`, `hypergraph.objectLink`, `hypergraph.membership`, and `hypergraph.inheritance` arrays.
- `examples/` contains syntax- and schema-validation instances.

The stable instance identifiers are:

```text
https://openbexi.local/hbds/model/v1
https://openbexi.local/hbds/model/v2
```

These identifiers match the `$schema` values used by model instances. They are logical schema identifiers, not a promise that `openbexi.local` resolves over the network.

The v2 schema file describes the locked semantic contract version 1. New documents opt in with `metadata.semanticVersion: 1`; `$schema` is documentation/tooling metadata and is not the runtime feature switch. In semantic models, `parentClassId` and `children` remain presentation fields; membership and inheritance use their dedicated v2 arrays. Without a semantic layer, the read-only legacy Query adapter uses declared parent/child containment for inclusion functors. See the [source review and mapping](../doc/HBDS_SUPPORT_MATRIX.md#legacy-source-review-and-containment-mapping).

Optional units, temporal, geospatial, fuzzy, and prototype validators are enabled separately through `metadata.semanticProfiles`. Profile annotations normally live inside `attributeValues.value`; the v2 object schema also names the prototype fields `isPrototype`, `prototypeId`, and `overrides`.

See [`doc/HBDS_STRUCTURAL_DIAGRAM_PROFILE_V1.md`](../doc/HBDS_STRUCTURAL_DIAGRAM_PROFILE_V1.md) and [`doc/HBDS_SCHEMA_EXAMPLES.md`](../doc/HBDS_SCHEMA_EXAMPLES.md).
