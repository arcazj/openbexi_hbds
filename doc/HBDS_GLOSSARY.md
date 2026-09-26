# HBDS Glossary

This glossary distinguishes terms used by the current application from concepts present only in the historical source material. French terms are retained where they identify a source concept.

| Term | Working definition | Current simulator meaning |
| --- | --- | --- |
| HBDS | Project acronym for Hypergraph-Based Data Structures. Historical French material uses an HBDS modeling approach. | Product and file-format family name. The precise official expansion and attribution should be cited from a verified primary source. |
| Hypergraph | A structure that permits relationships richer than a conventional pairwise graph. | JSON container named `hypergraph`; current links still use one source and one target. |
| Class | Structural category or diagram element. | An item in `hypergraph.class` rendered as a class-like node. |
| Hyperclass | Higher-level class grouping/container in the application. | A `hypergraph.class` item with `type: "hyperclass"`. Its containment behavior is visual, not formal inheritance. |
| Attribute | Named information attached to a class-like node. | Object or legacy string in a class `attributes` array. Values are not evaluated by a type system. |
| Link | Relationship drawn between class-like nodes. | Item in `hypergraph.link` with `sourceClassId` and `targetClassId`. Style does not imply semantics. |
| Visual containment | Diagram nesting used for layout and presentation. | `parentClassId` and `children`; never semantic membership, inheritance, or prototype derivation. |
| Object | Instance-level entity classified by one structural class. | Optional v2 `hypergraph.object` with `id`, `classId`, optional `name`, and `attributeValues`. |
| Attribute value | Object-level value corresponding to a class attribute definition. | V2 `{attributeId, value}` item in an object's `attributeValues` array. |
| Object link | Instance-level relationship conforming to one structural class link. | Optional v2 `hypergraph.objectLink` with `classLinkId`, `sourceObjectId`, and `targetObjectId`. |
| Membership | Explicit semantic relation between a class and a hyperclass. | Optional v2 `hypergraph.membership` with `classId` and `hyperclassId`; separate from visual containment. |
| TAD | French abbreviation for `type abstrait de données` (abstract data type). | Historical concept; no executable v1 construct. A class may visually document a TAD without formal TAD semantics. |
| Functor (`foncteur`) | Mapping or transformation between modeled structures/TADs, as used by the source material. | The object-layer query subset supports direct, inverse, homogeneous, and composed traversal. A typed visual link alone is not executable. |
| Embryo (`embryon`) | Historical HBDS extension concept associated with construction/evolution of structures. | Unsupported; do not encode it as `parentClassId`. |
| Prototype | Reusable or derivational structural pattern in the historical material. | The optional prototype profile validates references, overrides, self-reference, and cycles; it does not materialize derived objects. |
| Inheritance | Semantic derivation in which one class specializes another. | Optional v2 `hypergraph.inheritance` with `subClassId` and `superClassId`. Visual containment remains unrelated. |
| Network (`réseau`) | A connected modeled structure considered as a unit. | A whole model or visual subgraph may be called a network informally; no network entity type is standardized. |
| Superposition | Historical relation/operation combining networks. | Unsupported. No merge command implements formal superposition. |
| Intersection | Historical relation/operation selecting common network structure. | Unsupported. Collaboration merge is not HBDS network intersection. |
| Nesting (`emboîtement`) | Historical relation between networks. | Unsupported formally. Diagram nesting is visual only. |
| Associative mechanism | Historical mechanism connecting TADs. | Descriptive links only; no cardinality or constraint execution. |
| Quantity (`grandeur`) | Measurable property having a value and usually a unit. | The optional units profile validates annotated magnitudes and unit symbols; it does not convert or calculate. |
| Unit | Measurement unit attached to a quantity. | Optional profile annotation with structural validation and an optional allow-list; no conversion engine. |
| Fuzzy membership (`flou`) | Degree-based rather than strictly binary classification. | The optional fuzzy profile validates degrees and triangle/trapezoid shapes; it does not perform fuzzy inference. |
| Layout | Rule or stored coordinates controlling diagram placement. | `metadata.layout`, positions, sizes, fit, and viewport state. Layout is presentation metadata. |
| Structural profile | Contract for IDs, nodes, links, containment, rendering, and persistence. | Current v1 schema and specification. |
| Semantic layer | Additive records describing objects, object links, membership, and inheritance without changing v1 visual containment. | V2 opt-in contract selected by `metadata.semanticVersion: 1`. |
| Semantic profile | Optional validator for one value domain or derivation convention. | Enabled through `metadata.semanticProfiles`; current IDs are `units`, `temporal`, `geospatial`, `fuzzy`, and `prototype`. |
| Repository fixture | Model committed under `models/` or `test_models/` and held to extra metadata/global-ID rules. | Must pass project validators and, for test models, browser scenario rendering. |
| Runtime draft | Live collaboration state for one client/model. | In-memory server data; not a durable model or historical HBDS object. |

## Terms To Avoid Without Qualification

- Do not call visual containment inheritance.
- Do not call collaboration merge superposition or intersection.
- Do not call an arbitrary link a functor.
- Do not call a class node a TAD implementation unless its operations and constraints are separately specified.
- Do not call v2 schema acceptance semantic execution.
