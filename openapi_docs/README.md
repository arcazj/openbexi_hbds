# HBDS Graphic Simulator — Functor Navigation API

**Proposed specification · Contract version 1.0.0 · OpenAPI 3.1.1 · Read-only model navigation**

A self-contained OpenAPI YAML/JSON contract for navigating HBDS structures with typed functors. It covers **141 named functors**, **159 HTTP operations** and **916 component schemas**, based on François Bouillé's supplied chapters 10.1, 10.2 and 10.4. Its JSON pipeline representation supports single TADs, homogeneous TAD lists, parameterized calls, chaining, supported composition closure, value extraction and aggregation.

This is an **additive API design**, not a deployed service, a backend implementation or a replacement for the simulator's current OpenAPI document. The source chapters do not specify HTTP endpoints, JSON transport, authentication or all evaluator edge cases; those are explicitly identified design choices. Chapter 10.4 itself states that the larger historical functor library is not fully detailed. “Complete” in this package means coverage of the operations identified in the three supplied chapters, not every possible HBDS extension.

## Start here

| File | Purpose |
|---|---|
| [hbds-openapi.yaml](hbds-openapi.yaml) | Main, standalone OpenAPI description; internal references only. |
| [hbds-openapi.json](hbds-openapi.json) | Equivalent machine-readable JSON. |
| [FUNCTOR_CATALOG.md](FUNCTOR_CATALOG.md) | All 141 functions: input/output signatures, parameters, source pages and special rules. |
| [SEMANTICS.md](SEMANTICS.md) | Normative execution rules, identity, direction, snapshots, values, recursion and source ambiguities. |
| [INTEGRATION.md](INTEGRATION.md) | Existing endpoint inventory, additive merge procedure and native-model adapter requirements. |
| [validation-report.json](validation-report.json) | Imported validation report from the original delivery; see the limitations below. |

## Coverage

| Family | Named functions |
|---|---:|
| Base direct, inverse, homogeneous and multifunctors | 37 |
| Values and aggregates: VAL, SIGMA, CARD | 3 |
| Hypercomponent functors | 14 |
| Hypercomponent-to-base bridges | 8 |
| Embryon functors | 33 |
| Embryon-to-skeleton provenance | 12 |
| Prototype functors | 6 |
| Structure functors | 8 |
| O-structure functors | 8 |
| General relation/property/set mappings | 12 |
| **Total** | **141** |

Each catalog entry has an explicit `POST /api/models/{modelName}/functors/NAME` operation, a unique operation ID and typed request/call/response schemas. Generic and pipeline operations accept exactly the same canonical function catalog. General-concept inputs are distinguished from the six base TADs and the extended TAD families.

## Endpoint map

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/functors` | Discover the versioned semantic catalog. |
| GET | `/api/functors/{functorName}` | Inspect one canonical function definition. |
| POST | `/api/models/{modelName}/functors/ATT` | Execute ATT with its dedicated request schema. There is a corresponding route for each of the 141 functions. |
| POST | `/api/models/{modelName}/functors/execute` | Execute one typed call through a generic interface. |
| POST | `/api/models/{modelName}/queries/execute` | Execute a typed sequence of functors. |
| POST | `/api/models/{modelName}/queries/validate` | Validate the complete pipeline before traversal. |
| POST | `/api/models/{modelName}/queries/explain` | Obtain the validated execution plan. |
| POST | `/api/models/{modelName}/queries/parse` | Parse the supported HBDS navigation notation into a validated JSON pipeline. |
| POST | `/api/models/{modelName}/tads/resolve` | Resolve qualified names into stable typed identifiers. |
| GET | `/api/models/{modelName}/functors/capabilities` | Discover what the actual backend/model adapter implements. |
| GET | `/api/models/{modelName}/queries/results/{resultId}` | Read a retained immutable result page. |

The eight service resources from `functors/execute` through `queries/results/{resultId}` also exist below `/api/model-files/{scope}/{modelName}`, where scope is `models` or `test_models`. Scoped generic execution exposes every function without another 141 duplicated convenience endpoints.

Catalog presence does not mean a deployed server supports an operation. The capability endpoint and explicit unsupported-function errors prevent silently treating missing functionality as an empty valid result.

## Example 1 — follow outgoing class links

The HBDS expression:

```text
"PONT" 'PSC 'FIN
```

maps to:

```http
POST /api/models/demo.json/queries/execute
Content-Type: application/json
Authorization: Bearer <your-token>
```

```json
{
  "prefix": {
    "kind": "names",
    "type": "class",
    "names": [{"name": "PONT"}]
  },
  "steps": [
    {"functor": "PSC"},
    {"functor": "FIN"}
  ],
  "options": {
    "pageSize": 100,
    "trace": true
  }
}
```

`PSC` yields outgoing **class-link TADs**. `FIN` then yields their destination **class TADs**. Repeated paths to the same identity do not create duplicate destination TADs. `demo.json`, labels, IDs and revision tokens in all examples are synthetic and must be replaced with data from the target model.

A single-TAD selection can instead contain its stable reference:

```json
{
  "kind": "tads",
  "type": "class",
  "items": [{"type": "class", "id": "C:PONT"}]
}
```

A multiple-input selection adds references of the **same TAD type**. An empty selection must still declare its type. Inverse functors require identifiers rather than a directly named prefix; call `tads/resolve` first when necessary.

## Example 2 — select by relation and final class

```text
X["PONT"] 'OPSCRC("supporte", "CANAL") 'OFIN
```

The equivalent calls are:

```json
[
  {
    "functor": "OPSCRC",
    "parameters": {
      "relation": {"type": "relation", "name": {"name": "supporte"}},
      "targetClass": {"type": "class", "name": {"name": "CANAL"}}
    }
  },
  {"functor": "OFIN"}
]
```

Use an object selection for `prefix`; use the request envelope shown in Example 1 with the calls above. The expression can also be submitted to `queries/parse` with a typed binding for `X`; parsing resolves identifiers and pins the model snapshot before returning the canonical pipeline. It does not execute traversal.

## Execution invariants

A functor returns typed references unless its documented result is a value or scalar. `VATT` and `OATTN` return object-attribute TADs; `VAL` extracts their values. “Single” lists are unique by TAD identity, not lists with exactly one member. The pipeline retains that identity through each step.

Execution operates on one immutable saved-model or live-draft snapshot. Supplying `expectedRevision` detects a stale request. The evaluator must finish all intermediate steps and aggregates before paginating the final result; it must never silently truncate a query because of a budget limit. `SIGMA` must not collapse equal numeric values belonging to distinct object attributes.

The API performs no model mutation, AI-provider call, backup creation or model-change SSE notification. Embryon, prototype and structure provenance functions retrieve existing associations; they are not constructors. Stable IDs, inverse orientations, inheritance correspondence and composition membership must come from the normalized adapter, not from diagram coordinates or guessed associations.

See [SEMANTICS.md](SEMANTICS.md) for the remaining required runtime rules. Not every runtime condition can be expressed in JSON Schema.

## Package contents and validation

This repository contains the two equivalent contract files, this README, the functor catalog, semantic and integration notes, and the imported validation report. Embedded synthetic examples are available inside both contract files.

The original delivery also referred to a structured catalog, an expression grammar, source notes, 16 standalone examples, generator and validator scripts, dependency requirements, and a checksum manifest. Those companion files were not supplied in this repository. In particular, the expression parser proposal still needs its complete grammar before implementation.

The imported report records **694 checks with zero failures**, including **312 embedded examples**, **916 schema definitions**, and **5,715 reference/discriminator targets**. It describes validation in the original delivery environment; the missing scripts and companion examples prevent reproducing that full run from this snapshot. It is not a report of live API tests against this project.

No navigation backend, native model adapter, HTTP execution, result cache, concurrency behavior, security integration, Swagger UI rendering, or generated SDK is certified by that report. The original report also states that `openapi-spec-validator` was unavailable. Review its tool versions and limitations when completing the proposal.

Source chapter titles and page counts remain in `x-hbds-sources` in the contract. Per-operation `x-hbds-source` entries and [FUNCTOR_CATALOG.md](FUNCTOR_CATALOG.md) retain page references. Source PDFs are not distributed with this proposal.

## Integrate without replacing existing behavior

Merge this specification into the real application contract only after collision checks and review of its OpenAPI version, components, authentication, deployment paths and revision format. The bearer scheme in this proposal is not a claim about the current simulator. Original CRUD, `/ops`, drafts, SSE, AI and documentation endpoints stay unchanged; their unknown request/response schemas have not been invented.

The application needs a read-only adapter over its actual JSON representation and an evaluator implementing the catalog's declared semantics. Use [INTEGRATION.md](INTEGRATION.md) for the original endpoint inventory and precise integration boundaries. These files document a proposal; the running application contract remains available at `/api/openapi.json`.
