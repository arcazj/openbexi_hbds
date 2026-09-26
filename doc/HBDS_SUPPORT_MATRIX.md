# HBDS Support Matrix

This matrix separates historical HBDS theory, the current structural diagram profile, and the opt-in additive semantic contract.

## Current Structural Capabilities

| Capability | v1 JSON | Renderer | Editor | Server validation | Automated regression | Status / limitation |
| --- | --- | --- | --- | --- | --- | --- |
| Classes | Yes | 2-D and 3-D | Create/update/delete | IDs and structure | Yes | Core structural node. |
| Hyperclasses | Yes, as `class` with `type: hyperclass` | 2-D and 3-D container | Create/update/delete | IDs and references | Yes | Visual container, not a formal semantic type. |
| Attributes | Yes | Labels and style | Create/update/delete/reorder | Array and object IDs | Yes | Values are descriptive; no type system or constraint execution. |
| Class links | Yes | Routes, labels, arrows | Create/update/delete/style | Endpoint references | Yes | Link `type` is descriptive unless application code assigns meaning. |
| Hyperclass links | Yes | Supported where endpoints render | Edit as ordinary links | Endpoint references | Fixture coverage | No formal inter-network semantics. |
| Visual containment | `parentClassId`, `children` | Nested layout | Editable | Reference checks | Yes | Diagram containment only; never inheritance or membership. |
| Explicit layout | Position/size, `preserveLayout` | Yes | Drag, lock, fit | Basic numeric checks vary | Yes | Saved fit is viewport metadata. |
| Automatic layout | `grid`, `hierarchy`, `radial` | Yes | Yes | Enum guidance | Yes | Layout does not infer HBDS semantics. |
| Fonts and labels | Model/category/element fields | Yes | Yes | Positive-number checks | Yes | Several legacy font paths remain accepted. |
| Shapes and materials | Shape/body/material fields | Yes for regular classes | Style controls | Enum/range checks | Yes | Hyperclasses ignore image/shape body fields. |
| Class images | Local/data/remote source fields | Yes | JSON/style workflow | Source checks | Yes | Remote images require HTTPS and CORS; failures are visual only. |
| Link arrow and route styling | Yes | Yes | Yes | Enum/range checks | Yes | Routing fields are presentation data. |
| Model persistence | JSON files | N/A | Save/delete | Revision and path checks | Yes | Connected local server only; no authentication. |
| Draft collaboration | Runtime draft objects | Preview | Merge choices | In-memory revisions | Yes | Drafts and revision snapshots are not durable. |
| AI model assistance | Produces v1 JSON | Preview | Generate/validate/improve | Alias normalization and validation | Yes | AI output is not proof of HBDS semantic correctness. |

## Opt-In Semantic Capabilities

The semantic contract is enabled only when `metadata.semanticVersion` is the integer `1`. None of these fields are required by the v1 core profile.

| Capability | Locked v2 record | Reference meaning | Relationship to v1 visuals | Status / limitation |
| --- | --- | --- | --- | --- |
| Object | `{id, classId, name?, attributeValues?}` | `classId` identifies the object's structural class. | Does not replace the class diagram node. | Supported opt-in runtime contract. |
| Object attribute value | `{attributeId, value}` | `attributeId` identifies an attribute defined by the object's class contract. | Value data is separate from class-label rendering. | Supported opt-in runtime contract; value typing remains open. |
| Object link | `{id, classLinkId, sourceObjectId, targetObjectId}` | `classLinkId` identifies the structural link followed by the object relationship. | Does not replace class-link rendering. | Supported opt-in runtime contract. |
| Membership | `{id, classId, hyperclassId}` | Explicit class-to-hyperclass semantic membership. | Must not be inferred from `parentClassId` or `children`. | Supported opt-in runtime contract. |
| Inheritance | `{id, subClassId, superClassId}` | Explicit subclass-to-superclass semantic relation. | Must not be inferred from visual nesting or arrow style. | Supported opt-in runtime contract. |
| Effective semantic views | Derived from membership and inheritance records | Multiple inheritance supplies effective attributes and regular-class link roles; memberships supply hyperclass classifications and link roles. | Never reads `parentClassId` or `children`. | Supported by `js/hbds_semantics.js`. |
| Functor query | Runtime query, not a stored core record | Direct, inverse, homogeneous, and composed traversal over `objectLink` records. | Class-link rendering is unchanged. | Supported by `js/hbds_functors.js`; deterministic and bounded. |
| Optional value profiles | `metadata.semanticProfiles` plus annotated values | Units, temporal, geospatial, fuzzy, and prototype shape/reference validation. | No canvas meaning is inferred. | Supported by `js/hbds_semantic_profiles.js`; opt-in only. |

## Historical And Semantic Concepts

| HBDS concept | Historical source | v1 representation | v2 data contract | Runtime semantics | Recommendation |
| --- | --- | --- | --- | --- | --- |
| TAD (abstract data type) | Chapter 10.1 | May be drawn as named classes/hyperclasses | No dedicated v2 TAD record | None | Define a separate controlled vocabulary before adding behavior. |
| Basic/new functors | Chapters 10.2 and 10.4 | May be shown as typed links | No dedicated v2 functor record | Direct, inverse, homogeneous, and composed object-link traversal | Treat the implemented query subset as an application profile, not proof that every historical functor is covered. |
| Embryos | Chapter 10.3 | No canonical field | No dedicated v2 record | None | Do not overload `parentClassId`; define lifecycle semantics first. |
| Prototypes and structures | Chapters 10.3 and 10.5 | Names/types only | Optional object prototype annotations | Reference, self-reference, override-shape, and cycle validation | Materialization and derivation execution remain future work. |
| Inheritance | Discussed across structural material | No canonical v1 semantic edge | `inheritance` with subclass and superclass IDs | Explicit relation | Keep distinct from visual containment and prototype derivation. |
| Network superposition | Chapter 10.6 | No canonical operation | No dedicated v2 operation | None | Define collision, identity, and result-network rules. |
| Network intersection | Chapter 10.6 | No canonical operation | No dedicated v2 operation | None | Define set/graph semantics and provenance. |
| Network nesting | Chapter 10.6 | Visual nesting only | Membership is class-to-hyperclass, not network nesting | None | Do not treat visual or semantic membership as formal network nesting. |
| Associative mechanisms between TADs | Chapter 10.7 | Descriptive typed links | `objectLink` instantiates an existing `classLinkId` | Object-link conformance | Specify cardinality and constraints separately. |
| Quantities and units | Chapter 10.8 | Attribute name/value text | Optional unit annotation in `attributeValues.value` | Finite magnitude, unit, uncertainty, dimension, and optional allow-list validation | Conversion and dimensional arithmetic are not implemented. |
| Fuzzy modeling | Chapter 10.9 | Descriptive labels only | Optional fuzzy annotation in `attributeValues.value` | Degree/range and triangle/trapezoid shape validation | Aggregation and fuzzy inference are not implemented. |
| Modeling methodology | Chapter 10.11 | Tutorial guidance | Not a schema feature | None | Convert the historical methodology into worked, reviewable examples. |
| Errors to avoid | Chapter 10.12 | Validator warnings cover only structural cases | Not a schema feature | Partial | Turn recurring errors into validator rules where objective. |
| UML comparison | `uml_vs_hbds(1).pdf` | No mapping contract | Not defined | None | Publish a sourced mapping with explicit non-equivalences. |

## Explicit Limitations

- The simulator is a structural diagram editor and renderer, not a complete HBDS execution engine.
- `type` strings and link labels do not create executable semantics.
- `parentClassId` and `children` are visual containment only.
- V2 semantics require the explicit `metadata.semanticVersion: 1` opt-in; v1 documents do not acquire semantic meaning implicitly.
- V2 membership and inheritance are explicit records and must never be inferred from layout, containment, labels, or arrow styles.
- The browser query module performs bounded functor composition; the server validates and preserves the semantic graph but does not execute queries.
- Profile validation checks annotation shape and references. It does not perform unit conversion, dimensional arithmetic, fuzzy inference, prototype materialization, cardinality enforcement, or ontology reasoning.
- JSON Schema checks shape and local values; project validators are still required for reference integrity and repository-wide ID rules.
- Historical PDFs have unresolved provenance and redistribution-license status; see [the source catalog](README.md).

## Implemented Delivery Baseline

1. V1 renderer-compatible behavior is frozen and documented.
2. V1 and additive v2 schemas, support matrix, limitations, examples, glossary, tutorial, and source catalog are published.
3. The object layer, semantic memberships, multiple inheritance, inherited views, and reference validation are implemented behind `metadata.semanticVersion: 1`.
4. Direct, inverse, homogeneous, and composed functor queries have deterministic conformance tests.
5. Units, temporal, geospatial, fuzzy, and prototype validators are separate opt-in profiles.
6. Any broader historical HBDS behavior still requires a new explicit profile, migration notes, and regression coverage.
