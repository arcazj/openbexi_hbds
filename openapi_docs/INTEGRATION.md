# Integration with HBDS Graphic Simulator

## Scope

This package defines a proposed **additive functor/navigation API**. It neither implements a backend nor changes the existing application's files. Only the endpoint names and brief purposes below were supplied; their actual request bodies, response envelopes, authentication, revision format and complete OpenAPI document were not provided. Those contracts must not be guessed or overwritten.

A canonical operation is `POST /api/models/{modelName}/functors/ATT`. All 141 named operations have this form. Generic execution and pipeline resources have both model aliases and scoped paths:

```text
/api/models/{modelName}/...                         # scope=models
/api/model-files/{scope}/{modelName}/...             # models or test_models
```

Their generic endpoint accepts all 141 typed calls, so scoped models have the same semantic coverage without duplicating 141 more convenience paths. New paths require a `.json` basename; map that explicitly through the application's filename adapter rather than assuming its existing endpoints use the same naming convention.

## Existing routes supplied by the owner — unchanged

| Method | Existing path | Supplied purpose |
|---|---|---|
| GET | /api/health | Connection status for the menu bar. |
| GET | /api/models | List JSON models in models/. |
| GET | /api/models/{modelName} | Load a model from models/. |
| POST | /api/models/{modelName} | Validate and save a model into models/. |
| DELETE | /api/models/{modelName} | Delete a model after creating a backup. |
| POST | /api/models/{modelName}/ops | Element-level model operations with revision checks. |
| GET | /api/models/{modelName}/drafts | List live drafts for a model. |
| POST | /api/models/{modelName}/drafts/{clientId} | Publish a client's live model draft. |
| DELETE | /api/models/{modelName}/drafts/{clientId} | Clear a client's live draft. |
| GET | /api/model-files/{scope}/{modelName} | Load a model from models or test_models. |
| POST | /api/model-files/{scope}/{modelName} | Save a scoped model; supplied description enables scoped saving for test_models. |
| DELETE | /api/model-files/{scope}/{modelName} | Delete a scoped file after creating a backup. |
| GET | /api/drafts/{scope}/{modelName} | List scoped live drafts. |
| POST | /api/drafts/{scope}/{modelName}/clients/{clientId} | Publish a scoped live draft. |
| DELETE | /api/drafts/{scope}/{modelName}/clients/{clientId} | Clear a scoped live draft. |
| GET | /api/events | SSE for presence, model changes, draft updates and clears. |
| GET | /api/ai/providers | List AI capabilities without secrets. |
| POST | /api/ai/models | Refresh provider model IDs without generating text. |
| POST | /api/ai/connection | Validate provider credential and selected model. |
| POST | /api/ai/prompt | Prepare the deterministic HBDS prompt; optionally invoke the enabled provider. |
| POST | /api/ai/apply | Normalize, validate, save and return an AI-produced HBDS model. |
| POST | /api/ai/rollback | Restore a previous HBDS snapshot. |
| GET | /api/docs | Browser-readable documentation. |
| GET | /api/openapi.json | Machine-readable OpenAPI description. |

There is no supplied `POST /api/models` or `DELETE /api/models` collection endpoint. Do not infer either from the per-model routes.

## New shared resources

`GET /api/functors` returns the bounded, versioned catalog. `GET /api/functors/{functorName}` describes one canonical entry. Catalog presence is not an implementation capability claim.

Under each model/scoped base path, the package adds `functors/execute`, `queries/execute`, `queries/validate`, `queries/explain`, `queries/parse`, `tads/resolve`, `functors/capabilities`, and `queries/results/{resultId}`. The named convenience endpoints exist under `/api/models/{modelName}/functors/NAME`.

## Safe merge into /api/openapi.json

Load the existing application OpenAPI document and this package as separate inputs. Preserve every original path, method, operation ID, security scheme, server setting and component until an explicit reviewed change is made. Detect path/method, component-name and operation-ID collisions; **fail the merge** rather than silently preferring either document. Component names in this standalone package are not guaranteed to be absent from the application; a merge may need to namespace them and rewrite every internal `$ref` and discriminator mapping consistently.

Keep an OpenAPI 3.1-aware document at the output. Do not change a `3.0.x` root to `3.1.1` without reviewing the existing schemas. Retain the application's real authentication scheme and adapt the new operations to it; bearer authentication here is a proposed contract, not an observed configuration. Keep deployment-specific server URLs and path prefixes unchanged.

Register the merged description with the existing `GET /api/openapi.json` and browser documentation at `GET /api/docs`. This package does not redefine either endpoint's handler or return schema. Do not expose source PDFs, credentials or server-side model storage paths through documentation.

## Normalized read adapter

Implement an immutable adapter over the existing JSON representation; **do not migrate or rewrite model JSON merely to run a query**. The adapter needs stable entity IDs, typed name resolution, class/object membership, class/object attributes, relation identities and oriented incidence indexes, inverse views, grouped attributes and multilinks, hyperclass membership, hyperattribute/hyperlink correspondences, inheritance provenance, embryon provenance, prototype/structure composition, O-structure kernels and membership, and general relation/property/set associations.

Derived inherited attributes/links need deterministic stable virtual identities and provenance, not fabricated persisted records. No pointer or geometry heuristic may substitute for an association absent from the model. Unsupported model families must be declared in capabilities and rejected explicitly, not reported as empty valid data.

Map `expectedRevision` to a stable immutable content version for the selected saved model or live draft. If the current application lacks draft revisions, an adapter can define a versioned content digest and base-model revision as an **implementation addition**. Do not confuse this proposal with an existing draft payload field. Snapshot acquisition must be atomic relative to CRUD, `/ops`, draft publish/clear and AI apply/rollback.

Functors do not produce `/api/events` model-update notifications. The UI may use its existing SSE subscriptions to notice a newer revision and decide whether to rerun a query. A retained query result remains bound to the old snapshot until expiry, unless access is revoked. Do not let reads create backups or invoke `/api/ai/*`.

## UI and AI integration

A visual query builder can read the catalog to show only type-compatible next steps and required arguments. It can call `queries/validate` for structural diagnostics, `queries/explain` for a readable plan and `queries/execute` for result references to highlight. A returned `VATT` result must highlight attribute instances; extracting numeric display data requires `VAL`.

An AI component may propose canonical JSON pipelines, but execution must still pass the same deterministic type, permission, reference, revision and budget checks. The query evaluator is not an arbitrary natural-language executor. The proposed API adds no new autonomous model-write authorization.
