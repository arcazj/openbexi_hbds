# HBDS Schema And Instance Examples

The schemas and examples are executable companions to the structural profile. V1 is the core structural contract; the v2 schema describes semantic contract version 1, enabled explicitly with `metadata.semanticVersion: 1`. The instance `$schema` URI assists documentation and schema tools but is not the runtime feature switch.

## Files

| File | Purpose |
| --- | --- |
| [`schemas/hbds-structural-diagram-profile-v1.schema.json`](../schemas/hbds-structural-diagram-profile-v1.schema.json) | Current class/link structural diagram contract. |
| [`schemas/hbds-semantic-profile-v2.schema.json`](../schemas/hbds-semantic-profile-v2.schema.json) | Additive schema for optional object-level records. |
| [`schemas/examples/v1_minimal_model.json`](../schemas/examples/v1_minimal_model.json) | Smallest v1 structural document. |
| [`schemas/examples/v1_structural_model.json`](../schemas/examples/v1_structural_model.json) | Renderable class, hyperclass, attribute, and link example. |
| [`schemas/examples/v2_semantic_model.json`](../schemas/examples/v2_semantic_model.json) | Opt-in object, object-link, membership, and inheritance example. |
| [`models/hbds_semantic_object_layer_example.json`](../models/hbds_semantic_object_layer_example.json) | Loadable runtime example with functor queries and all optional profiles. |
| [`test_models/semantics_035_object_layer_functors_profiles.json`](../test_models/semantics_035_object_layer_functors_profiles.json) | Browser and conformance regression fixture. |

## v1: Minimal Structural Instance

```json
{
  "$schema": "https://openbexi.local/hbds/model/v1",
  "hypergraph": {
    "class": [],
    "link": []
  }
}
```

This is structurally valid v1 and is useful for API clients. It is not a valid committed repository fixture because repository validators additionally require metadata and a visual test scenario requires at least one class-like element.

## v1: Schema Plus Renderable Instance

The complete [v1 structural example](../schemas/examples/v1_structural_model.json) demonstrates:

- optional `$schema` selection;
- fixture metadata;
- one hyperclass and two regular classes;
- visual `children`/`parentClassId` containment;
- object-form attributes;
- positions and sizes;
- class styling and font policy;
- one class-to-class link with route and arrow styling.

The containment fields have no instance or inheritance meaning. They only tell the current diagram how nodes are visually grouped.

## v2: Additive Semantic Layer

The complete [v2 semantic example](../schemas/examples/v2_semantic_model.json) retains the v1 `class` and `link` arrays and adds:

```json
{
  "metadata": {
    "semanticVersion": 1
  },
  "hypergraph": {
    "object": [
      {
        "id": "parcel_object_1001",
        "classId": "priority_parcel_class",
        "name": "Parcel 1001",
        "attributeValues": [
          {"attributeId": "parcel_tracking_id", "value": "PX-1001"}
        ]
      }
    ],
    "objectLink": [
      {
        "id": "parcel_route_assignment",
        "classLinkId": "parcel_route_link",
        "sourceObjectId": "parcel_object_1001",
        "targetObjectId": "route_object_north"
      }
    ],
    "membership": [
      {
        "id": "parcel_delivery_membership",
        "classId": "parcel_class",
        "hyperclassId": "delivery_domain"
      }
    ],
    "inheritance": [
      {
        "id": "priority_parcel_inherits_parcel",
        "subClassId": "priority_parcel_class",
        "superClassId": "parcel_class"
      }
    ]
  }
}
```

The arrays are optional after semantic opt-in. Their core item fields are locked by the v2 contract. The named `isPrototype`, `prototypeId`, and `overrides` object fields belong only to the optional prototype profile; other contract changes require a new opt-in version.

A v2-aware validation path must check that:

- every object `classId` resolves to `hypergraph.class`;
- every `attributeId` resolves to an attribute definition appropriate to that object's class;
- every `classLinkId` resolves to `hypergraph.link`;
- every `sourceObjectId` and `targetObjectId` resolves to `hypergraph.object`;
- every membership `classId` resolves to a regular class and `hyperclassId` resolves to a hyperclass;
- every inheritance `subClassId` and `superClassId` resolves to a regular class;
- all IDs follow the chosen document/repository uniqueness policy.

## Optional Semantic Profiles

Profiles are separately enabled and never activate merely because a value resembles a profile annotation:

```json
{
  "metadata": {
    "semanticVersion": 1,
    "semanticProfiles": {
      "units": {"enabled": true},
      "temporal": {"enabled": true},
      "geospatial": {"enabled": true},
      "fuzzy": {"enabled": true},
      "prototype": {"enabled": true}
    }
  }
}
```

Annotated `attributeValues.value` objects use `semanticType`. The validators check finite unit magnitudes and symbols, temporal ordering, geospatial bounds/GeoJSON shape, fuzzy degrees and ordered shapes, and prototype references/cycles. They do not perform conversion, inference, or prototype materialization.

Functor queries are runtime requests rather than stored core entities. `executeFunctorQuery()` accepts direct, inverse, homogeneous, and nested/composed steps over `hypergraph.objectLink`. Both `linkId` and `classLinkId` are accepted as query filters; results and paths are sorted deterministically and bounded by explicit limits.

## Schema Design Decisions

### Open Extension Fields

The v1 envelope and rendering objects permit additional properties. Existing models contain product- and fixture-specific metadata and rendering fields, and the current server generally preserves unknown fields. Open v1 extension fields avoid data loss while named properties document the supported contract.

The locked v2 `object`, `attributeValue`, `objectLink`, `membership`, and `inheritance` records reject unnamed properties. The object schema explicitly names the optional prototype-profile fields. Producers must use a later opt-in semantic version for other contract changes rather than adding fields silently.

### Core Versus Repository Requirements

The v1 schema requires only a `hypergraph` with `class` and `link` arrays. It does not require optional fixture profiles. Repository tools impose additional rules:

- `metadata.name`, `metadata.purpose`, and non-empty `metadata.regressionTags`;
- exact test-model metadata naming derived from the filename;
- IDs unique across every file in the same model directory;
- valid class/link rendering enums and selected fixture-specific coverage.

### References

JSON Schema cannot express all graph reference requirements portably. Project runtime/reference checks remain necessary after schema validation.

## Validation Examples

Check JSON syntax for schemas and examples with Python's standard library:

```powershell
Get-ChildItem schemas -Recurse -Filter *.json | ForEach-Object {
  py -m json.tool $_.FullName *> $null
  if ($LASTEXITCODE -ne 0) { throw "Invalid JSON: $($_.FullName)" }
}
```

When the optional Python `jsonschema` package is installed, validate instances while registering the local v1 schema for the v2 reference:

```python
import json
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

root = Path("schemas")
v1 = json.loads((root / "hbds-structural-diagram-profile-v1.schema.json").read_text())
v2 = json.loads((root / "hbds-semantic-profile-v2.schema.json").read_text())
registry = Registry().with_resource(v1["$id"], Resource.from_contents(v1))

v1_instance = json.loads((root / "examples/v1_structural_model.json").read_text())
v2_instance = json.loads((root / "examples/v2_semantic_model.json").read_text())

Draft202012Validator(v1, registry=registry).validate(v1_instance)
Draft202012Validator(v2, registry=registry).validate(v2_instance)
```

Then run the project validators and real-browser regression documented in [Test_and_Integration.md](../Test_and_Integration.md). Schema success alone is not a release result.

Run the semantic conformance suites directly with:

```powershell
node scripts\hbds_semantics_test.mjs
node scripts\hbds_functors_test.mjs
node scripts\hbds_semantic_profiles_test.mjs
```
