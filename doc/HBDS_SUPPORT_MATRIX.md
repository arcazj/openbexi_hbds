# HBDS Support Matrix

This matrix separates historical HBDS theory, the current structural diagram profile, and the opt-in additive semantic contract.

## Current Structural Capabilities

| Capability | v1 JSON | Renderer | Editor | Server validation | Automated regression | Status / limitation |
| --- | --- | --- | --- | --- | --- | --- |
| Classes | Yes | 2-D and 3-D | Create/update/delete | IDs and structure | Yes | Core structural node. |
| Hyperclasses | Yes, as `class` with `type: hyperclass` | 2-D and 3-D container | Create/update/delete | IDs and references | Yes | Queryable hyperclass definitions; full historical inheritance is not synthesized. |
| Attributes | Yes | Labels and style | Create/update/delete/reorder | Array and object IDs | Yes | Values are descriptive; no type system or constraint execution. |
| Class links | Yes | Routes, labels, arrows | Create/update/delete/style | Endpoint references | Yes | Link `type` is descriptive unless application code assigns meaning. |
| Hyperclass links | Yes | Supported where endpoints render | Edit as ordinary links | Endpoint references | Fixture coverage | No formal inter-network semantics. |
| Declared containment | `parentClassId`, `children` | Nested layout | Editable | Reference checks | Yes | Legacy Query inclusion graph when no semantic layer is present. Explicit semantic memberships take precedence; geometry never implies membership. |
| Explicit layout | Position/size, `preserveLayout` | Yes | Drag, lock, fit | Basic numeric checks vary | Yes | Saved fit is viewport metadata. |
| Automatic layout | `grid`, `hierarchy`, `radial` | Yes | Yes | Enum guidance | Yes | Layout does not infer HBDS semantics. |
| Fonts and labels | Model/category/element fields | Yes | Yes | Positive-number checks | Yes | Several legacy font paths remain accepted. |
| Shapes and materials | Shape/body/material fields | Yes for regular classes | Style controls | Enum/range checks | Yes | Hyperclasses ignore image/shape body fields. |
| Class images | Local/data/remote source fields | Yes | JSON/style workflow | Source checks | Yes | Remote images require HTTPS and CORS; failures are visual only. |
| Link arrow and route styling | Yes | Yes | Yes | Enum/range checks | Yes | Routing fields are presentation data. |
| Model persistence | JSON files | N/A | Save/delete | Revision and path checks | Yes | Connected local server only; no authentication. |
| Draft collaboration | Runtime draft objects | Preview | Merge choices | In-memory revisions | Yes | Drafts and revision snapshots are not durable. |
| AI model assistance | Produces v1 JSON | Preview | Generate/validate/improve | Alias normalization and validation | Yes | AI output is not proof of HBDS semantic correctness. |
| Structural functor queries | Direct class/hyperclass definitions, containment and links | Locate results | Query workspace | Browser evaluator | Helper and browser tests | 21 canonical legacy functors; full 141-name reference with signatures, source pages and availability. |

## Opt-In Semantic Capabilities

New semantic documents should explicitly set `metadata.semanticVersion` to the integer `1`. For compatibility, the runtime also recognizes `semanticsVersion` and the presence of semantic arrays, normalizing omitted versions to 1. Query follows that detection rule; an opted-in model never falls back to presentation nesting. None of these fields are required by the v1 core profile.

| Capability | Locked v2 record | Reference meaning | Relationship to v1 visuals | Status / limitation |
| --- | --- | --- | --- | --- |
| Object | `{id, classId, name?, attributeValues?}` | `classId` identifies the object's structural class. | Does not replace the class diagram node. | Supported opt-in runtime contract. |
| Object attribute value | `{attributeId, value}` | `attributeId` identifies an attribute defined by the object's class contract. | Value data is separate from class-label rendering. | Supported opt-in runtime contract; value typing remains open. |
| Object link | `{id, classLinkId, sourceObjectId, targetObjectId}` | `classLinkId` identifies the structural link followed by the object relationship. | Does not replace class-link rendering. | Supported opt-in runtime contract. |
| Membership | `{id, classId, hyperclassId}` | Explicit inclusion of a class or nested hyperclass (`classId`) in a hyperclass (`hyperclassId`). | Authoritative whenever the semantic layer is present; never merged with presentation parents/children. | Supported opt-in runtime contract. |
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
- Legacy Query maps declared `parentClassId` and `children` to inclusion, without creating semantic records or inherited definitions. Screen position and container overlap have no query meaning.
- In semantic models, explicit `membership` records replace that legacy inclusion mapping. An absent or empty membership array in an opted-in layer means no members.
- V2 membership and inheritance records are never inferred or persisted from layout, labels, or arrow styles.
- The browser query modules perform bounded object-link and structural functor composition; the server validates and preserves the semantic graph but does not execute queries. The proposed 141-functor HTTP API remains unimplemented.
- Profile validation checks annotation shape and references. It does not perform unit conversion, dimensional arithmetic, fuzzy inference, prototype materialization, cardinality enforcement, or ontology reasoning.
- JSON Schema checks shape and local values; project validators are still required for reference integrity and repository-wide ID rules.
- Historical PDFs have unresolved provenance and redistribution-license status; see [the source catalog](README.md).

## Implemented Delivery Baseline

1. V1 renderer-compatible behavior is preserved; the read-only legacy Query mapping is documented below.
2. V1 and additive v2 schemas, support matrix, limitations, examples, glossary, tutorial, and source catalog are published.
3. The object layer, semantic memberships, multiple inheritance, inherited views, and reference validation are implemented behind `metadata.semanticVersion: 1`.
4. Direct, inverse, homogeneous, and composed functor queries have deterministic conformance tests.
5. Units, temporal, geospatial, fuzzy, and prototype validators are separate opt-in profiles.
6. Any broader historical HBDS behavior still requires a new explicit profile, migration notes, and regression coverage.

## Structural Query Workspace

Open **Query** between Tests and Help. It initially uses the model already
selected in Models, Edit, or Tests, including unsaved edits. The searchable model
selector beside **Query** groups Current session, Models, and Tests. Selecting a
saved model updates the diagram and query together in a separate read-only preview.
The original source stays alive with its unsaved edits, selection, camera, and undo
history. Select Current session to return to it, or leave Query to restore the
source view. Reopening Query starts from that source again. Other saved models are
loaded from the server library or static manifests; a preview never publishes drafts.
Changing models retains compatible functors and an all-elements selection, resets
individual element selections, COUPLE targets, result filters and pagination, and
clears highlights. Loading disables results and Locate; failed loads restore the
previous query and show an error. Older asynchronous loads cannot replace a newer
selection. There is no separate starting-point panel.
Query uses the same 400-pixel sidebar width as the editor and Help, with its own
scrolling area. The active diagram remains visible and interactive on the left.
At narrow widths, the diagram appears above the Query panel. The source view's
other panels are temporarily hidden and restored when leaving Query.
Builder, Results, and Functor reference headers use soft blue, green, and lavender
backgrounds. Compact controls keep the narrow functor selector and its element
selectors on one row, including COUPLE's two class selectors. Functor explanations
are visible below each selected step, with tooltips and the reference also available.
Models, Edit, Tests and Help use the shared panel stylesheet for compact spacing,
typography, controls and soft section headers. Completed queries omit
the redundant expression, success guidance, and highlight-count message.
Choose a functor first. Its signature determines the inputs displayed on the same
row: **ATT** requests a class, **HATT** a hyperclass, and **FIN** a class link.
**CONT** requests a hyperclass and returns its directly included classes.
**COUPLE** requests source and target classes and returns links directed from the
source to the target. **CARD** also requests an element type. Searchable selectors
show names with owner/ID hints and prefill a compatible diagram selection. Choose
an individual element or explicitly select all elements of that type. Empty types
and elements with no matches remain valid choices.

Selections execute automatically once all required inputs are complete. Typing
inside a dropdown only filters choices; click an option or use arrow keys and
Enter to commit. Escape restores the committed choice. There is no Run button
or Try section. **Add step** enables typed chains such as `PSC → FIN → ATT`.
Changing a functor preserves compatible inputs and steps, removing incompatible
continuations. Incomplete selections, valid empty results, and errors are distinct.

Results have exactly three columns: **Type**, **Name**, and **Locate**. Name
tooltips and accessible descriptions expose identifiers, JSON pointer paths and
ownership/endpoints; selecting a name opens its stored data. **Locate** adds a
fluorescent yellow background to the matching element's text and emphasizes its
outline or actual link route. **Locate all** applies those highlights to all results
matching the Results filter, across every page. It is disabled for empty results
and scalar counts.

Highlighting preserves camera position, pan, zoom, layout, editor selection and
undo history. It does not center or fit the diagram. Off-screen matches remain
highlighted at their existing positions and become visible when the user pans or
zooms. Highlights follow the diagram in 2-D and 3-D, and clear when the query,
result filter, source model, or source data changes, or when Query closes. Paging
alone preserves them. Loading a different model fits its new preview once; Locate
does not refit it. Opening Query keeps the original source iframe alive;
changing to another Models/Edit/Tests view retains the existing loading behavior.

Source changes refresh queries automatically, preserving valid selections and
clearing references to removed elements. Each execution uses one independent
snapshot; monotonically increasing source tickets and execution generations
prevent older results replacing newer ones. Locate verifies that the original
model still matches the result snapshot, refreshing instead of locating stale data.
The shell checks for source changes every 750 ms while Query is open.

The evaluator works without query API endpoints, including in the application's
static-only mode. Opening `functor_queries.html` directly explains how to enter
through the app; it never silently chooses a different model. Existing object-instance
examples remain available through **Instance query examples** (`?legacy=1`).

The implemented adapter is `hbds-legacy-metamodel-query-v2`. It reads existing JSON and
never persists new IDs, model records, or inferred semantic relationships.

### Legacy source review and containment mapping

The implementation was checked against the original text and diagrams: chapter
10.1 pp.31–36 (hyperclass inclusion and inheritance), chapter 10.2 pp.8, 11–12,
27–29, 33 and 49–50 (attributes, oriented links, COUPLE and CARD), and chapter
10.4 pp.8–12 (hypercomponent and containment functors). In particular, p.11
distinguishes direct class inclusion (`CONT`) from all nesting levels (`CONTN`),
and explicitly discusses classes nested inside classes. P.9 defines the separate
hyperclass containment operations. The COUPLE formula on chapter 10.2 p.33 is
`C’PSC ∩ D’NSC`: incoming and outgoing links must not be confused with endpoints.

For legacy models without a semantic layer, the adapter uses the union of declared
`parentClassId` and `children` edges, deduplicating repeated pairs. Both regular
classes and hyperclasses can be intermediate containers for `CONTN`; results are
classes only. Multiple parents and shared descendants are allowed. No membership
is inferred from coordinates, overlapping rectangles, names, or arrows.

When a semantic layer is present, `hypergraph.membership` is authoritative instead.
Its `classId` may reference either a class or a nested hyperclass; `hyperclassId`
must reference a hyperclass. Empty or omitted membership arrays mean no inclusion
edges, even when presentation nesting exists. Invalid references, duplicate record
IDs and containment cycles cause errors. This mapping does not enable inherited
attributes or links, modify JSON, or change the separate object-layer evaluator.

| Query type / operation | Native representation and semantics |
| --- | --- |
| `class`, `hyperclass` | `hypergraph.class` records, separated by `type: hyperclass`. |
| `classAttribute`, `hyperattribute` | Direct `attributes` entries owned by a regular class or hyperclass. This is an explicit structural adapter mapping; inherited correspondence is not synthesized. Legacy scalar entries receive snapshot-local path identifiers and retain their actual values. |
| `classLink`, `hyperlink` | `hypergraph.link` records whose endpoints are both regular classes or both hyperclasses. Stored source/target IDs define orientation; arrow styling does not change it. |
| `ATT`, `ATTOF`, `PSC`, `NSC`, `INI`, `FIN`, `INV` | Direct class attribute ownership, outgoing/incoming class links, endpoints, and reversible link views. `PSC → FIN` returns target classes. |
| `HATT`, `HATTOF`, `HPSC`, `HNSC`, `HINI`, `HFIN`, `HINV` | Corresponding operations over directly declared hyperclass attributes and hyperclass-to-hyperclass links. |
| `CARD` | Count the complete deduplicated result, including zero for an empty selection. Scalar results end the pipeline. |
| `CONT`, `CONTOF` | Directly included classes of a hyperclass, and direct containing hyperclasses of a class. Use the inclusion graph defined above. |
| `CONTN` | All classes at every positive nesting depth. Intermediate containers of either node type are traversed; shared descendants are deduplicated. |
| `HCONT`, `HCONTOF` | Directly included hyperclasses, and their direct containing hyperclasses. These are distinct from class inclusion. |
| `COUPLE` | Directed class links satisfying `PSC(source) ∩ NSC(target)`. The target is a required class parameter, also in added steps. Parallel links remain distinct; self-links appear once. Swapping source and target queries the opposite direction. |

Every canonical entry remains visible in the searchable catalog with its signature,
description, source pages, and availability. Builder and added-step choices use
only original tokens from that catalog; friendly explanations do not introduce
new names. Inheritance correspondences, grouped attributes, object/value operations,
and multifunctors other than COUPLE are unavailable in this adapter. Mixed
class/hyperclass links are preserved in the model but excluded from canonical
classLink/hyperlink queries, because neither historical signature describes them.
The imported HTTP proposal is not silently reinterpreted as deployed functionality.

Full pipeline type checking happens before traversal, even for empty input.
Unknown IDs and unsupported operations are errors. Parallel link identities stay
distinct; names never identify records. Results are deduplicated by type, ID, and
orientation, sorted deterministically, then paged in groups of 25 by default
(25/50/100 available). Changing query inputs, the model, page size, or the result
filter resets to page one. Counts and subsequent functors operate on complete
results before pagination; result totals and page navigation remain visible. Limits are
32 steps, 100,000 indexed structural elements, 200,000 declared containment
references and 200,000 traversed outputs per step,
and 16 MiB of serialized snapshot data. Results are never silently truncated.

The browser catalog is generated from `openapi_docs/hbds-openapi.json` with
`py -B scripts/generate_functor_catalog.py`. The isolated check runner verifies
that all 141 names, signatures, descriptions, and source references remain in sync.
