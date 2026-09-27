# HBDS navigation semantics

Version 1.0.0 · Semantic profile `bouille-http-v1`

## 1. Authority, coverage and explicit design choices

The semantic sources are François Bouillé's supplied chapters **10.1 — Les TAD de base**, **10.2 — Les foncteurs de TAD**, and **10.4 — Nouveaux foncteurs**. The source inventory appears in the contract's `x-hbds-sources`; page references appear in `FUNCTOR_CATALOG.md` and each OpenAPI operation's `x-hbds-source`. See `README.md` for the companion files missing from this imported proposal.

This contract covers **141 identified names**: 37 base navigation/multifunctors, 3 value/count/sum operations, 14 hypercomponent operations, 8 bridges, 33 embryon operations, 12 embryon–skeleton provenance operations, 6 prototype operations, 8 structure operations, 8 O-structure operations and 12 general concept mappings. Chapter 10.4 explicitly says that its full library contains more operations than it details (page 5). No undocumented expansion of that library is claimed.

The HTTP resources, JSON field names, identifier encoding, snapshot handling, deterministic ordering, authentication, pagination, error codes, limits, numeric serialization and optional closure are **proposed engineering contracts**, not features purportedly documented by Bouillé or observed in the current application. The English operation descriptions explain returned elements; they do not invent full-word expansions of the acronym tokens.

The OpenAPI files are standalone descriptions of the **new navigation layer**, not a replacement for the unprovided complete application specification. Existing server code and model JSON have not been inspected.

## 2. Types and identity

The six base TADs are `class`, `classAttribute`, `classLink`, `object`, `objectAttribute`, and `objectLink` (10.1, pages 5 and 20). Hypercomponents are `hyperclass`, `hyperattribute`, `hyperlink`. The six embryons are `classEmbryon`, `attributeEmbryon`, `linkEmbryon`, `hyperclassEmbryon`, `hyperattributeEmbryon`, and `hyperlinkEmbryon`; this contract does not invent object embryons. `prototype`, `structure`, and `oStructure` complete the TAD catalog.

`relation`, `property`, and `set` are **concept inputs**, not extra base TADs. They support the general mappings in 10.4, pages 19–22. Do not confuse a `set` concept with an arbitrary JSON input list or a hyperclass.

An input selection states one element `type`. All of its `items` must have exactly that type. One item represents a single TAD, multiple items a homogeneous list, and zero items a typed empty list. An object list may contain objects of different classes: homogeneity refers to TAD type, not class membership or underlying attribute value type (10.2, page 19).

Reference identity is `(scope, modelName, entityType, id, normalizedDirection)`; the snapshot pins the interpretation of these identities. Direction applies only to link types and defaults to `forward`. Labels and qualified names are not identity. Never merge two TADs because their visible labels match. Return stable, opaque identifiers; never expose raw DSS addresses or process pointers. This preserves the source's emphasis that functor results retain identity, not only names (10.2, pages 9 and 15).

Names are resolved case-sensitively with explicit qualifiers. Class attributes require `className`, objects require `className`, and object attributes require `className` and `objectName`. Link names require endpoint qualifiers as described by `NamedIdentifier`. Hypercomponent/prototype/structure names must resolve uniquely within their type. Missing, ambiguous, redundant-conflicting, or inapplicable qualifiers fail atomically. No fuzzy matching or implicit model creation occurs.

Direct operations may accept names or references. The inverse operations follow 10.2, pages 25–26: **their prefix must contain references**, not names. Resolve names through `/tads/resolve` first when necessary. The HTTP profile extends single/list convenience to the other families; those normalization choices are explicit.

## 3. Link navigation and reverse views

`PSC`/`NSC` return outgoing/incoming **class links**, not endpoint classes. Use `FIN`/`INI` to extract classes. `OPSC`/`ONSC` return object links; use `OFIN`/`OINI` for objects. `EFF` maps class links to existing object-link realizations, never to a Cartesian product of all class members (10.2, pages 11–12, 17 and 22–24).

The adapter supplies oriented link views. `forward` uses the stored source and target; `reverse` swaps them. `INI`/`FIN` and `OINI`/`OFIN` operate on the selected view, not always on the stored orientation. `INV`, `OINV`, `HINV`, `EINV`, and `EHINV` invert that view without changing stored topology. Applying inverse twice restores the original view.

For this HTTP profile, incidence functors enumerate the model's declared oriented relations: stored forward relations and explicitly declared inverse relations. Explicit `INV` can return a reverse endpoint view even when the source model has no inverse relation label; that view has no invented label. Relation-filtered navigation can match only a declared relation identity. An adapter must not silently assume every forward relation has a differently named inverse. The transport-level reverse-view policy is an engineering choice, not a new source definition.

Incoming relation filters inspect the relation of the incoming directed view. For example, `ONSCRC("traverse", "RIVIERE")` from a city finds river-to-city `traverse` links; it does not reinterpret the filter as the outward inverse phrase.

Support self-loops and parallel relations. Distinct parallel link identities remain distinct. No link is generated solely because two shapes overlap. Multi-links remain the corresponding **link TAD type**, with a composite-kind discriminator supplied by the adapter; they are not a seventh base TAD.

## 4. Single lists, chaining and empty results

The source's “single” lists contain unique TADs, **not necessarily one element** (10.2, pages 7, 25, 28 and 32). Normalize duplicate input identities; deduplicate each TAD-producing stage by identity. Preserve homonymous but distinct TADs.

A pipeline is evaluated left to right. Before executing, validate the complete call sequence: input type, parameter type, prefix policy, required arguments, selected capability, and adjacent output/input types. A scalar result is terminal. For example:

```text
class -> PSC -> classLink -> FIN -> class
classAttribute -> VATT -> objectAttribute -> VAL -> values -> SIGMA -> scalar
```

`PSC -> ATT` is invalid, even when `PSC` would return no links. Empty data must not make an ill-typed query valid. A supported navigation on an empty prefix returns an empty list with its declared output type. A supported optional relationship with no members returns an empty list; an unimplemented type/functor is **501**, not a misleading empty success.

`COUPLE` is outgoing links from the prefix intersected with incoming links to the target class (10.2, page 33). `OCOUPLE` follows the object-level analog. Incoming filtered operations remain tagged as `multifunctor` in the HTTP catalog even though some slide paragraphs call them “inverse”; endpoint-extracting inverse operations remain separately identified.

## 5. Composition, containment, intersection and inheritance

`CONT` returns directly contained **classes**; `HCONT` returns directly contained **hyperclasses**. `CONTN` returns contained classes at every nesting level. Their embryon analogs preserve the corresponding types. `HINTERS` returns intersecting hyperclasses; `INTERS` returns member classes participating in intersections (10.4, pages 9–12).

The normalized adapter keeps class membership and nested hyperclass membership distinct. For this profile, recursive class membership is the union of direct class members over all reachable nested hyperclasses. Intersections compare those semantic membership sets, excluding a hyperclass's trivial intersection with itself. This explicitly chosen interpretation makes nesting and intersections reproducible; page 11 alone does not spell out every edge case.

Geometrical container overlap is neither necessary nor sufficient for HBDS intersection. A UI may display semantic intersections without overlapping rectangles. Layout policies never rewrite model membership.

The adapter exposes inherited class-level attributes and links as identifiable TADs with correspondence back to their hyperattributes/hyperlinks. It must retain provenance and avoid collapsing homonymous inherited definitions. Conflicting incompatible definitions produce `MODEL_INVARIANT_VIOLATION` until the model is resolved. The slides warn about homonymy and incompatibilities (10.1, page 36) but do not define conflict-resolution precedence; this API does not invent one.

`ACOMP`, `OACOMP`, `HACOMP` and their embryon analogs return immediate grouped-attribute components. Direct `MLCOMP` operations require a composite link input. Structure/prototype/O-structure composition is also immediate unless closure is requested. Reverse containment/composition functions return immediate parents; use repeated explicit calls when a higher-level ancestor traversal is needed.

### Optional closure

`traversal.mode="closure"` is an **API extension**, allowed only where the catalog says `supportsClosure=true`. It repeatedly applies that operation, returns all positive-depth reachable components including intermediate groups and terminal leaves, excludes the input seeds, and deduplicates identities. Noncomposite leaves are valid stopping points during closure, even though a standalone direct component query requires a composite prefix where stated.

Containment/composition cycles are rejected for this profile. Use both an active recursion stack to detect real cycles and a visited set to avoid repeated work; a node shared by several parents is not by itself a cycle. Ordinary class/object relation cycles and self-loops are allowed and must not trigger a containment-cycle error.

`maxDepth` is a **completeness budget**. If unexplored reachable descendants remain beyond the budget, return `EVALUATION_LIMIT_EXCEEDED`; do not return a partial success. The same rule applies to the intrinsically recursive `CONTN` and `ECONTN`. Requesting direct traversal preserves the historical immediate-operation meaning.

## 6. Embryons, prototypes, structures and O-structures

The page 13 diagram in 10.4 mirrors the class/hypercomponent operations on the six embryon types. The catalog includes only the depicted relevant families; it does not create `EOBJ`, object embryons, or unsupported object-realization analogs.

`EAG`, `ECG`, `ELG`, `EHAG`, `EHCG`, and `EHLG` retrieve TADs **already constructed from** their corresponding embryons. The `...OF` counterparts retrieve recorded origin embryons. These are provenance queries, not constructors. Do not infer provenance from equal names or current containment.

`PCOMPEC` and `PCOMPEHC` return class/hyperclass **embryons**, following the heading and arrows on 10.4 page 16. Its paragraph abbreviates them as classes/hyperclasses; the chosen output type is explicitly recorded rather than silently reconciled. `STRUCT` and `PROTO` connect existing prototypes and structures. `SCOMPC` and `SCOMPHC` retrieve actual classes/hyperclasses in structures (10.4, page 17).

`OSTRUCT`/`OSTRUCTOF` connect structures and existing O-structures. `OSKER` returns kernel objects. `OSCOMPOBJ` returns the **other**, non-kernel component objects, following 10.4 page 18. Each valid O-structure has one kernel in this profile; missing or multiple kernels are model errors. The inverse operations are transcribed from the page 18 diagram.

## 7. General concepts and source naming variants

The general functions are one-way mappings from relation/property/set concepts to the corresponding TADs. The source explicitly says these have no inverse functors (10.4, pages 19–21). No `...OF` counterparts are invented.

The names printed in the earlier diagrams differ from the page 22 recap:

| Page 22 HTTP token | Earlier printed token | Earlier page |
|---|---|---|
| LREL | CREL | 19 |
| HLREL | HREL | 19 |
| ELREL | EREL | 19 |
| EHLREL | EHREL | 19 |
| APROP | CPROP | 20 |
| HAPROP | HCPROP | 20 |
| EAPROP | EPROP | 20 |
| EHAPROP | EHPROP | 20 |

This API chooses the page 22 tokens as canonical. This is an **explicit normalization decision**, not a claim that the document formally declares aliases. JSON calls and paths accept canonical tokens only. The expression parser may accept the earlier token when `allowSourceAliases=true`, must emit `SOURCE_ALIAS_NORMALIZED`, and must return canonical JSON. Case normalization of a canonical expression token is accepted; ordinary names remain case-sensitive.

## 8. Values, missing values and aggregation

`VATT` and `OATTN` return object-attribute TAD references, not the underlying values. `VAL` is a separate extraction operation (10.2, pages 15–16 and 38–39). A `ValueEntry` retains its `source` attribute, a `known`/`missing` state, and a typed value when known.

Repeated attribute identity is deduplicated; **equal numbers from different attributes are not deduplicated**. For instance, two different dam attributes both equal to 100 contribute 200 to `SIGMA`. Otherwise the source's dam-volume example would be misrepresented. Pagination never occurs before extraction or aggregation.

`VAL` defaults to `missingPolicy="include"`: preserve missing entries. `omit` explicitly drops them and emits a diagnostic stating the omitted count; `error` rejects them. `SIGMA` defaults to error on missing entries; explicit omission must also be reported. Missing is not automatically zero, false, the empty string, or an empty list. A known JSON group/list is not itself a missing value.

Typed value JSON is an engineering serialization layer. Exact integers and finite real components use lexical strings to avoid JSON/JavaScript precision loss. Rationals have nonzero denominators, normalized sign and gcd reduction. Complex numbers specify real and imaginary components; Gaussian complex components are integers. Quaternion/octonion arrays have 4/8 components, scalar first. Vector/matrix/tensor values are flattened row-major with dimensions; lists preserve order; groups preserve member attribute identities. Fuzzy encodings require a declared encoding identifier and are preserved rather than numerically reinterpreted.

`SIGMA` adds **homogeneous primitive numeric domains**: integer, float, rational, complex, Gaussian complex, quaternion, or octonion, subject to server capabilities. No string-to-number parsing, unadvertised coercion, list flattening, implicit unit conversion or fuzzy aggregation occurs. Mixed numeric domains produce `NUMERIC_DOMAIN_MISMATCH`; convert them deliberately outside this version's navigation API. Integer/rational arithmetic is exact. Finite decimal representations for float/complex/quaternion/octonion components are added as exact decimal values in this HTTP profile; reject results exceeding the advertised resource/serialization limits rather than silently rounding or overflowing. This deterministic decimal transport policy does not claim to reproduce every historical machine floating-point implementation.

An empty `SIGMA` returns zero in `emptyType` (default integer); for complex/vector-like primitive domains all components are zero. `emptyType` does not coerce nonempty lists. Array, group and fuzzy values are retrievable with `VAL` but not summable by this profile. Capability discovery must distinguish supported retrieval encodings from implemented aggregation domains.

`CARD` returns an integer count of the full input list. It returns zero for an empty list. It counts TAD identities, or value-entry source identities when applied after `VAL`; it does not recursively count elements inside an attribute value. Value-list support for standalone CARD is an API extension beyond the TAD-list use illustrated in the source.

Standalone value inputs to `SIGMA`/`CARD` must reference real object attributes in the selected snapshot and agree with those values; do not treat the navigation service as an unauthenticated arbitrary calculator. Conflicting duplicate source values or stale values fail validation.

## 9. Snapshot isolation, paging and ordering

Omitting `snapshot` selects the current saved model. `source="draft"` additionally identifies a client draft. Both require model/draft read permission. The adapter atomically copies or obtains an immutable view of the selected saved/draft model before evaluation. An opaque `expectedRevision`, when supplied, must match that exact source; mismatches produce **409** before navigation.

A successful execution returns its actual snapshot revision, scope, model basename, source and (for drafts) client/base-model revision. It must never mix saved-model elements with unselected draft elements or changes arriving during the query.

Evaluate the entire query, deduplicate and sort the final result before slicing. TAD ordering is lexicographic Unicode code point order by `(type,id,normalized direction)`. Value-entry ordering is source identity; compound values preserve their internal order. This ordering is a transport choice; the slides do not prescribe it.

A server-side immutable result is bound to `(principal,scope,modelName,snapshot,query,options)` with a random result UUID and advertised TTL. Cursors must be authenticated or unguessably mapped server-side and bound to that result, page size, position and expiry. Never trust raw client-provided offsets as authorization. First-page rereads are allowed until expiry. Pages after a model edit still read the captured snapshot; they do not silently reevaluate against the new model. Access revocation or model deletion denies further reads.

`page.total` reports the complete result size; `page.size` equals returned items. `nextCursor` is null only on the last page. Scalar results have `size=total=1`. Empty list results have `size=total=0`. Result expiry is not extended by reading. Unknown results return 404; known expired tombstones return 410. Model aliases and `scope=models` share the same principal-bound result cache.

## 10. Errors, limits and authorization

Use the specified RFC 9457 `application/problem+json` profile. Invalid JSON/schema/grammar is 400; authenticated permission failures 403; unknown resources 404 (or concealed 404 by authorization policy); stale revisions 409; expired results 410; excessive payloads 413; unsupported media 415; well-formed but semantically invalid queries 422; rate/concurrency limits 429; absent implementation capabilities 501; temporary evaluator outage 503. Unexpected server defects use 500, not a fabricated empty list.

A 422 problem should include the offending `stepIndex`, expected/actual types and JSON pointer when relevant. Do not leak inaccessible IDs, local filesystem paths, credentials, process addresses or AI secrets. Error responses are atomic: no successful-looking partial results after a type, cycle, numeric or budget failure.

Respect input-item, total request-byte, step, nesting, visited-node, CPU/wall-time, numeric-digit, response-byte, trace and result-cache budgets. The schema gives public upper bounds; a deployment may advertise lower limits. Reject a request exceeding those limits rather than silently overriding it with a truncated answer. Account for parallel/inverse edges and cycles when estimating traversal work. Recursively nested JSON values and expression bindings need depth checks in addition to the visible schema bounds.

Use bearer authentication over HTTPS in deployment; tokens are never placed in query strings. Integrate this proposal with the existing identity provider rather than inventing an issuer. Authorize the model, draft, every parameter reference and result access. A model-level permission alone must not bypass any finer TAD authorization rules. Evaluate within the authorized projection, and never leak hidden identities through traces, counts or ambiguity messages. Reject traversals whose required data cannot be safely exposed under the application's policy.

All HTTP `POST` operations in this extension are **read-only with respect to HBDS models**. They may create bounded ephemeral evaluation caches, but not model files, instances, provenance records, backups or draft updates. No unsafe `eval`, arbitrary code, URL loading, untrusted regex execution or implicit AI calls are allowed. Model modifications remain the responsibility of the existing authorized CRUD and `/ops` APIs.

## 11. Explicit source issues

* **CH102-NSC:** page 12 first defines incoming links; its warning says outgoing and mentions objects. This profile adopts incoming **class links**, corroborated by the COUPLE construction on page 33. The contradiction is retained in the catalog notes.
* **CH102-INCOMING-LABEL:** incoming filtered counterparts are sometimes called inverse in the prose. The HTTP catalog keeps them in the parameterized multifunctor family while preserving their incoming direction.
* **CH104-CONTAINMENT:** page 11's nested-class wording is not a complete formal containment schema. The profile explicitly distinguishes nested hyperclasses from member classes, using the surrounding diagrams and chapter 10.1's nesting discussion.
* **CH104-PROTOTYPE:** the paragraph on page 16 says classes/hyperclasses, while its title/arrows target EC/EHC. This contract follows the embryon endpoints and records the choice.
* **CH104-GENERAL-NAMES:** the preceding table preserves the different printed tokens rather than silently replacing them.
* **HISTORICAL ENGINE DETAILS:** no payload schema, storage implementation, performance guarantee, numeric machine representation or complete historical library is supplied. No claim about those details is made. In particular the source's relative inverse-functor performance statement is not promised for a new implementation.
