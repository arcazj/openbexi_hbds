# Prompt4HDBS Graphic Simulator

## Purpose

You are an expert in reverse engineering, architecture recovery, test planning, and phased implementation. Analyze the complete HBDS Graphic Simulator codebase deeply, then implement or improve the application in controlled phases until the entire simulator capability set is covered.

Important terminology: the repository and product use the acronym **HBDS**, for **Hypergraph-Based Data Structures**. If a task, branch, or user note says **HDBS**, treat it as a typo unless there is explicit evidence that a different acronym is intended.

The goal is not a superficial rewrite. The goal is to recover the real architecture, understand every capability already present, identify inconsistencies and missing coverage, and then implement improvements phase by phase without breaking current behavior.

## Operating Rules

1. Work from the existing codebase first. Read the code, documentation, models, and tests before proposing or editing anything.
2. Preserve existing public behavior unless a phase explicitly replaces it and includes migration notes.
3. Keep each phase independently reviewable and testable.
4. Do not perform a big-bang rewrite.
5. Reuse existing naming, JSON structure, UI conventions, and helper functions where possible.
6. Keep model IDs unique and stable. Remove duplicate IDs when found.
7. Check for inconsistencies across standard models, test models, manifests, docs, server APIs, and frontend rendering.
8. If a capability exists in the app but has no test model or automated check, add coverage in the appropriate phase.
9. Update `Test_and_Integration.md` when test commands, validation rules, fixtures, or integration expectations change.
10. After each implementation phase, run the relevant commands from `Test_and_Integration.md` and report pass or fail with concrete errors.

## Reverse Engineering Scope

Analyze these areas before implementation:

- Root documentation: `README.md`, `Test_and_Integration.md`.
- App shell: `index.html`, `index_models.html`, `test_dynamic_hbds_layout.html`.
- Server: `server.py`.
- Frontend modules under `js/`.
- Standard model fixtures under `models/`.
- Regression and capability fixtures under `test_models/`.
- Validation and smoke scripts under `scripts/` and `tools/`.
- Generated manifests: `models/models_manifest.json`, `test_models/test_models_manifest.json`.

## Current Architecture Summary

The HBDS Graphic Simulator is a browser-based visual simulator for hypergraph-based data structures. It combines a Python local server, JSON model files, Three.js rendering, editable graph and hypergraph objects, model fixtures, test fixtures, and collaboration preview features.

The main runtime modes are:

- Static browser mode, where HTML and JSON files can be opened directly for simple viewing.
- Connected server mode, where `server.py` provides model listing, loading, saving, drafts, operations, OpenAPI documentation, and server-sent events.

The main user-facing workspaces are:

- `Models`: browse and load standard examples from `models/`.
- `Edit`: inspect, modify, build, save, and validate HBDS models.
- `Tests`: browse regression fixtures from `test_models/`.
- `Help`: read local usage and API guidance.

## Data Model Summary

The primary JSON structure is a model document with metadata and a hypergraph payload.

Expected top-level structure:

```json
{
  "metadata": {
    "name": "Model name",
    "description": "Short purpose",
    "sceneSettings": {},
    "layout": {},
    "font": {},
    "preserveLayout": true,
    "purpose": "fixture or model purpose",
    "regressionTags": []
  },
  "hypergraph": {
    "class": [],
    "link": []
  }
}
```

Expected class object responsibilities:

- Stable `id`.
- Human-readable `name`.
- Optional `type`.
- Optional `attributes`.
- Position and size information.
- Rendering information, including shape, color, image, icon, opacity, and label behavior.
- Optional parent or child relationships for nested classes or hyperclasses.

Expected link object responsibilities:

- Stable `id`.
- Source class reference.
- Target class reference.
- Optional `name`.
- Rendering information, including color, width, route style, label, arrowheads, and curvature.

Compatibility expectations:

- Legacy `hypergraph.hyperclass` data should be migrated or normalized into the active model representation.
- Legacy `relationships` data should be migrated or normalized into `hypergraph.link`.
- All IDs across a single model should be unique unless a documented namespace rule explicitly permits reuse.
- Any normalization must preserve enough source semantics to avoid silently changing the model meaning.

## Server/API Findings

`server.py` provides the local backend and should be treated as the source of truth for connected mode.

Core responsibilities:

- Serve static files.
- Serve and regenerate model manifests.
- Load and save standard models and test models.
- Validate model names, draft scopes, and model payloads.
- Store drafts per client/session.
- Apply model operations.
- Track revisions and detect conflicts.
- Expose OpenAPI documentation.
- Broadcast collaboration and model events through server-sent events.

Important endpoints:

- `GET /api/health`
- `GET /api/models`
- `GET /api/models/{modelName}`
- `POST /api/models/{modelName}`
- `POST /api/models/{modelName}/ops`
- `GET /api/models/{modelName}/drafts`
- `POST /api/models/{modelName}/drafts`
- `DELETE /api/models/{modelName}/drafts/{clientId}`
- `GET /api/model-files/{scope}/{modelName}`
- `POST /api/model-files/{scope}/{modelName}`
- `GET /api/drafts/{scope}/{modelName}`
- `POST /api/drafts/{scope}/{modelName}`
- `DELETE /api/drafts/{scope}/{modelName}/{clientId}`
- `GET /api/events`
- `GET /api/docs`
- `GET /api/openapi.json`

Implementation must keep these routes compatible unless a phase explicitly updates API docs, tests, and callers together.

## Frontend Findings

The frontend is split between HTML entry points and JavaScript modules.

Main files:

- `index.html`: main app shell with workspace navigation.
- `index_models.html`: read-focused model viewer.
- `test_dynamic_hbds_layout.html`: editable simulator surface and control panels.

Main JavaScript responsibilities:

- `hbds_model.js`: model state, normalization, validation, layout, scene refresh, fit, overview, create/update/delete operations, save/load integration.
- `hbds_class.js`: class rendering, shape/image/icon support, labels, attributes, sizing.
- `hbds_hyperclass_class.js`: hyperclass rendering and helper behavior.
- `hbds_class_link.js`: link rendering, routing, arrowheads, labels, recalculation.
- `hbds_hyperclass_link.js`: hyperclass link behavior.
- `hbds_server_api.js`: HTTP and event API client wrapper.
- `hbds_collaboration_preview.js`: remote draft preview rendering.
- `hbds_floating_panel.js`: draggable and resizable panels.
- `test_dynamic_hbds_layout.js`: interactive UI state, selection, property panels, builder actions, layout controls, JSON editor, scenario suite, collaboration controls, and regression workflows.

## Capability Inventory

The phased implementation must cover these capabilities:

- Load standard models from `models/`.
- Load test and regression models from `test_models/`.
- Regenerate and validate manifests.
- Render classes.
- Render hyperclasses or nested class structures.
- Render attributes.
- Render links between classes.
- Render links involving hyperclasses where supported.
- Support shape, color, opacity, image, and icon rendering options.
- Support labels and font controls.
- Support 2-D and 3-D views.
- Support grid, radial, and hierarchy layouts.
- Support preserving explicit layout coordinates.
- Support fit, zoom, pan, and overview/minimap behavior.
- Support model builder workflows.
- Support direct manipulation of selected objects.
- Support JSON editing and validation feedback.
- Support save/load through the local server.
- Support operation-based updates.
- Support drafts.
- Support collaboration event streams.
- Support conflict detection and merge or conflict reporting.
- Support OpenAPI documentation.
- Support smoke tests, validators, syntax checks, and model linting.

## Known Risk Areas

Check these carefully during implementation:

- Duplicate IDs in model or test fixture JSON.
- Divergence between `models/` and `test_models/` schema conventions.
- Legacy `hyperclass` or `relationships` structures not normalized consistently.
- Rendering behavior that depends on implicit defaults.
- Links becoming stale after class moves, deletes, or layout changes.
- 3-D mode diverging from 2-D behavior.
- Text labels overflowing or scaling incorrectly.
- Test fixtures covering only happy paths.
- Server validation accepting data that the frontend cannot render.
- Frontend normalization hiding invalid fixture data.
- Collaboration drafts using a different shape than saved models.
- Documentation drifting from actual test commands.

## Phased Implementation Plan

### Phase 1: Reverse Engineering Baseline

Goal: create a reliable architecture map before editing behavior.

Tasks:

- Read root docs and identify stated features.
- Trace HTML entry points and loaded JavaScript modules.
- Trace server routes, payloads, and persistence paths.
- Inventory all JSON model and test fixtures.
- Identify generated files versus source files.
- Record current automated test commands from `Test_and_Integration.md`.

Deliverables:

- Architecture notes.
- Capability inventory.
- Risk list.
- Initial gap list.

Validation:

- No behavior changes.
- Confirm the app starts in connected mode.
- Run the baseline test commands that do not require unavailable external tools.

### Phase 2: Model Schema and Fixture Normalization

Goal: make model and test fixtures consistent, valid, and complete.

Tasks:

- Validate every JSON file in `models/` and `test_models/`.
- Detect and remove duplicate IDs.
- Normalize top-level metadata.
- Normalize `hypergraph.class` and `hypergraph.link`.
- Migrate or document legacy `hypergraph.hyperclass` and `relationships`.
- Ensure test fixture names and metadata describe the capability under test.
- Keep explicit layouts when `preserveLayout` is intended.

Deliverables:

- Clean model fixtures.
- Clean test fixtures.
- Updated validators if needed.
- Updated manifests after regeneration.

Validation:

- Run model validators.
- Run manifest validator.
- Run naming lint.
- Load representative models in the UI.

### Phase 3: Core Server, Persistence, and API Compatibility

Goal: ensure connected mode is stable and documented.

Tasks:

- Review all API routes and align them with frontend callers.
- Verify scoped model loading and saving for `models` and `test_models`.
- Verify draft create/read/delete behavior.
- Verify operation endpoint behavior.
- Validate revision and conflict handling.
- Confirm OpenAPI output matches actual routes and payloads.
- Harden validation errors so invalid model data is rejected clearly.

Deliverables:

- Stable server API behavior.
- Updated OpenAPI docs if routes or payloads change.
- Updated smoke tests if needed.

Validation:

- `py scripts\smoke_server.py`
- API health check.
- Manual load/save of one standard model and one test model.

### Phase 4: 2-D Rendering Engine

Goal: ensure all core visual primitives render consistently.

Tasks:

- Verify class rendering.
- Verify hyperclass or nested class rendering.
- Verify attributes and attribute labels.
- Verify link routing, labels, arrowheads, color, width, and curvature.
- Verify image, shape, icon, fill, border, opacity, and label settings.
- Add or update test models for any rendering feature without coverage.

Deliverables:

- Rendering behavior parity across standard and test models.
- Test fixtures for all supported class and link styling.

Validation:

- Load visual regression fixtures in the Tests workspace.
- Check browser console for module or rendering errors.
- Run JavaScript syntax checks from `Test_and_Integration.md`.

### Phase 5: Layout, Camera, Fit, and Overview

Goal: make navigation and automatic layout reliable.

Tasks:

- Verify grid layout.
- Verify radial layout.
- Verify hierarchy layout.
- Verify explicit coordinate preservation.
- Verify fit-to-view behavior.
- Verify zoom and pan behavior.
- Verify overview/minimap behavior.
- Add regression fixtures for edge cases such as dense graphs, long labels, and disconnected components.

Deliverables:

- Predictable layout controls.
- Fixture coverage for all layout modes.

Validation:

- Run layout-related test models.
- Confirm layout changes do not corrupt saved coordinates unexpectedly.

### Phase 6: 3-D Mode

Goal: ensure 3-D mode is a supported simulator feature, not an incidental view.

Tasks:

- Trace 2-D to 3-D mode switching.
- Verify 3-D camera, lighting, object placement, labels, and links.
- Verify 3-D mode does not lose selection or model state.
- Confirm 3-D mode handles the same model schema as 2-D mode.
- Add test fixtures or manual validation notes for 3-D-only issues.

Deliverables:

- Stable 3-D rendering path.
- Documented 3-D limitations if any remain.

Validation:

- Load small, medium, and dense fixtures in 3-D mode.
- Confirm no blank canvas or broken camera state.

### Phase 7: Application Shell and Workspaces

Goal: make the main app coherent across Models, Edit, Tests, and Help.

Tasks:

- Verify workspace navigation.
- Verify model selector behavior.
- Verify test model selector behavior.
- Verify embedded editor routing and query parameters.
- Verify Help content matches current commands and APIs.
- Ensure empty, loading, error, and disconnected states are clear.

Deliverables:

- Consistent shell behavior.
- Accurate workspace docs.

Validation:

- Manual navigation through all workspaces.
- Connected and static mode checks where applicable.

### Phase 8: Editing and Builder Workflows

Goal: make model creation and editing complete and safe.

Tasks:

- Verify class creation, update, and deletion.
- Verify hyperclass or nested class creation and update if supported.
- Verify attribute editing.
- Verify link creation, update, and deletion.
- Verify selection and property panel synchronization.
- Verify JSON editor validation and apply behavior.
- Verify undo-like or draft recovery behavior if present.
- Ensure deletes remove or repair dependent links safely.

Deliverables:

- Reliable edit workflows.
- Test fixtures or smoke coverage for create/update/delete operations.

Validation:

- Use builder controls to create a small model from scratch.
- Save and reload the model through the server.
- Run operation endpoint smoke checks if available.

### Phase 9: Collaboration, Drafts, and Conflict Handling

Goal: make multi-client behavior understandable and robust.

Tasks:

- Trace event subscription lifecycle.
- Verify presence events.
- Verify draft update events.
- Verify draft clearing.
- Verify collaboration preview rendering.
- Verify conflict detection with stale revisions.
- Verify merge or conflict reporting behavior.
- Add tests or manual scenarios for two-client flows.

Deliverables:

- Documented collaboration lifecycle.
- Stable draft and event handling.

Validation:

- Open two browser sessions against one server.
- Edit and save from both sessions.
- Confirm events, previews, and conflict handling.

### Phase 10: Validation Tools and Automated Tests

Goal: make the test suite match actual app capabilities.

Tasks:

- Review all existing scripts under `scripts/` and `tools/`.
- Ensure validators cover standard models and test models.
- Add checks for duplicate IDs, missing references, invalid links, missing metadata, malformed rendering fields, and stale manifest entries.
- Keep validation messages actionable.
- Update `Test_and_Integration.md` whenever commands change.

Deliverables:

- Complete validation coverage for current fixture schema.
- Updated test documentation.

Validation:

- Run every command listed in `Test_and_Integration.md`.
- Report unavailable tools separately, such as missing Maven or Node.

### Phase 11: Documentation and Developer Workflow

Goal: make the simulator maintainable after the implementation phases.

Tasks:

- Update `README.md` if startup, architecture, or API behavior changes.
- Update `Test_and_Integration.md` if tests, validators, or manual scenarios change.
- Document generated files and when to regenerate them.
- Document fixture authoring rules.
- Document model schema expectations.
- Document known limitations.

Deliverables:

- Accurate developer docs.
- Clear fixture maintenance rules.

Validation:

- Follow the docs from a clean terminal session and confirm they work.

### Phase 12: Release Hardening

Goal: finish with an integrated, tested simulator.

Tasks:

- Run full validation.
- Inspect git diff for unrelated churn.
- Check all generated manifests are consistent with source fixtures.
- Verify no temporary preview, cache, or backup files are included unintentionally.
- Check browser console in main workflows.
- Verify app behavior on at least one desktop viewport and one narrow viewport.
- Produce a final report listing completed phases, tests run, and known residual risks.

Deliverables:

- Final implementation report.
- Passing test checklist.
- Known issues list if anything remains.

Validation:

- Full test command set from `Test_and_Integration.md`.
- Manual connected-mode smoke test.
- Manual UI smoke test.

## Required Test Commands

Use `Test_and_Integration.md` as the authoritative test source. At minimum, consider these commands when relevant to the phase:

```powershell
py -m py_compile server.py scripts\smoke_server.py tools\validate_manifests.py tools\validate_models.py tools\validate_test_models.py tools\lint_model_naming.py
py scripts\smoke_server.py
py tools\validate_manifests.py
py tools\validate_models.py
py tools\validate_test_models.py
py tools\lint_model_naming.py
Get-Content -Raw js\test_dynamic_hbds_layout.js | node --input-type=module --check
Get-Content -Raw js\hbds_collaboration_preview.js | node --input-type=module --check
Get-Content -Raw js\hbds_floating_panel.js | node --input-type=module --check
git diff --check
```

Run Maven tests if Maven is installed:

```powershell
mvn test
```

If a command cannot run because a tool is missing, report that explicitly and do not claim it passed.

## Reporting Format for Each Phase

For every phase, report:

- Phase name.
- Files inspected.
- Files changed.
- Behavior changed.
- Test models added or updated.
- Documentation updated.
- Commands run.
- Passing checks.
- Failing checks with exact errors.
- Remaining risks.
- Next recommended phase.

## Acceptance Criteria

The implementation is complete only when:

- All standard models load.
- All test models load.
- Model IDs are unique.
- Link references are valid.
- Metadata is consistent.
- Manifests are current.
- 2-D rendering works for all supported primitives.
- 3-D mode is validated or clearly documented with limits.
- Layout modes work and are covered by fixtures.
- Editing workflows can create, update, delete, save, and reload models.
- Server APIs match frontend usage and OpenAPI documentation.
- Draft and collaboration behavior is validated.
- `Test_and_Integration.md` is accurate.
- Required tests pass, or any unavailable external tools are clearly reported.

## Final Instruction

Implement the HBDS Graphic Simulator by phases using this report as the controlling prompt. Start with reverse engineering, then normalize and validate data, then improve rendering and interaction features, then harden server APIs and collaboration, and finish with complete tests and documentation. Do not skip a phase silently. Do not mark a phase complete until its validation has been run or its blocker has been documented.
