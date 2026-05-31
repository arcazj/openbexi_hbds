# HBDS Roadmap

This roadmap is a backlog of executable prompts for future HBDS work. Each item is intended to be copied into an implementation session, then completed with code, documentation, and regression coverage.

## How To Use This Roadmap

1. Pick one prompt at a time.
2. Inspect the affected files before coding.
3. Update `Test_and_Integration.md` when behavior or validation changes.
4. Update README, Help, and OpenAPI/Swagger when user-facing or API behavior changes.
5. Run the suggested tests, then rerun any broader suite affected by the change.

## Definition Of Done

Every roadmap item should be treated as incomplete until:

* code is implemented and scoped to the requested behavior
* docs and Help are updated when the workflow changes
* OpenAPI/Swagger is updated when API behavior changes
* regression tests are added or extended for the risk area
* `Test_and_Integration.md` is updated and followed
* validators, browser regressions, smoke tests, and Maven checks pass where applicable
* secrets are not written into model JSON, exports, drafts, logs, or diagnostics

## Do Not Regress

Keep these behaviors protected:

* model text appears immediately after load, before zoom, move, select, or fit
* class, hyperclass, attribute, and link font inheritance works after load, save, reload, and collaboration updates
* `Apply Overall Font To All` clears all category and element font-size overrides while preserving the current overall size
* attribute font validation covers `attribute.font.size`, `attribute.rendering.font.size`, `node.rendering.attributes.font.size`, `node.rendering.attributes.fontSize`, and `node.rendering.attributes.labelFontSize`
* link arrows, directions, colors, line styles, and label sizing render correctly
* AI keys remain transient and never leak into saved data or diagnostics
* AI apply, save-as-new, preview, delete, and rollback preserve recoverability
* model delete creates backups and refreshes manifests
* collaboration drafts, merge choices, remote operation summaries, and live preview remain responsive

## Candidate Test Models

Use these models when a roadmap item touches rendering, layout, font, links, AI, or collaboration:

* `test_models/render_033_font_properties.json`
* `test_models/links_034_extended_arrow_types.json`
* `models/AI_Models_World.json`
* `models/human_and_car_links.json`
* `models/bridge_road_links.json`
* `models/transportation_links.json`
* `models/multimodal_transportation_diagram.json`
* `models/satellite_world_complete_structure.json`
* `models/satellite_world_complete_structure2.json`
* `models/satellite_world_simple_structure.json`

## Recently Fixed, Keep Covered

### Prompt: Protect Immediate Text Rendering After Model Load

Priority: High

Expected benefit: Prevents the old issue where hyperclass, class, and attribute names appeared only after zooming, moving, or selecting.

Affected files/modules: `js/hbds_model.js`, `js/hbds_class.js`, `js/hbds_hyperclass_class.js`, `js/test_dynamic_hbds_layout.js`, `scripts/collaboration_browser_regression.py`, `Test_and_Integration.md`

Suggested tests: immediate label browser regression, satellite font zoom regression, `py scripts\collaboration_browser_regression.py`

### Prompt: Preserve The Revised Font Inheritance Policy

Priority: High

Expected benefit: Keeps overall, category, and element-level font behavior predictable for classes, hyperclasses, attributes, and links.

Affected files/modules: `js/hbds_model.js`, `js/test_dynamic_hbds_layout.js`, `js/hbds_class.js`, `js/hbds_class_link.js`, `test_dynamic_hbds_layout.html`, `tools/validate_manifests.py`

Suggested tests: `test_models/render_033_font_properties.json`, font policy browser regression, `py tools\validate_manifests.py`

### Prompt: Keep Attribute Font Resize Working Across All Supported Storage Paths

Priority: High

Expected benefit: Ensures the Attribute font-size slider works even for models using legacy or class-level attribute font fields.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `js/hbds_class.js`, `scripts/collaboration_browser_regression.py`, `Test_and_Integration.md`

Suggested tests: create a model with `attribute.font.size`, `attribute.rendering.font.size`, `node.rendering.attributes.font.size`, `node.rendering.attributes.fontSize`, and `node.rendering.attributes.labelFontSize`; confirm Attribute slider clears all of them.

## Model Rendering And Layout

### Prompt: Improve Dense Model Readability And Auto Fit

Priority: High

Expected benefit: Large models remain readable without manual zoom tuning.

Affected files/modules: `js/hbds_model.js`, `js/hbds_layout.js`, `js/hbds_class.js`, `js/hbds_class_link.js`, `test_dynamic_hbds_layout.html`

Suggested tests: satellite models, transportation models, immediate label regression, satellite font zoom regression.

### Prompt: Add Layout Quality Diagnostics

Priority: Medium

Expected benefit: Makes overlap, tiny text, excessive whitespace, and off-canvas placement measurable instead of visual-only.

Affected files/modules: `js/hbds_model.js`, `js/test_dynamic_hbds_layout.js`, `tools/validate_test_models.py`

Suggested tests: add diagnostics for node overlap, link label overlap, viewport usage, and attribute label clipping.

### Prompt: Add Layout Preview Before Applying Grid, Hierarchy, Or Radial

Priority: Medium

Expected benefit: Users can compare the current layout with proposed layout changes before committing.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `css/test_dynamic_hbds_layout.css`, `test_dynamic_hbds_layout.html`

Suggested tests: preview does not mutate JSON until applied; cancel restores previous layout and selection.

### Prompt: Add Layout Locking Per Element

Priority: Medium

Expected benefit: Optimize layout can move unlocked elements while preserving carefully placed nodes.

Affected files/modules: `js/hbds_model.js`, `js/test_dynamic_hbds_layout.js`, `tools/validate_manifests.py`

Suggested tests: locked classes and hyperclasses keep positions after grid/hierarchy/radial optimization.

## Font And Visual Styling

### Prompt: Add Font Source Badges In Appearance

Priority: Medium

Expected benefit: Users can see whether a label uses overall, category, class-level, or element-level font sizing.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `css/test_dynamic_hbds_layout.css`

Suggested tests: selecting class, hyperclass, attribute, and link shows the correct inherited source.

### Prompt: Add Visual Theme Presets For Models

Priority: Medium

Expected benefit: Users can quickly apply readable, high-contrast palettes without hand-editing every class.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `js/hbds_class.js`, model JSON schemas, `README.md`

Suggested tests: theme application preserves IDs, links, fonts, and custom per-element overrides unless explicitly replaced.

### Prompt: Add Contrast Validation For Text And Labels

Priority: High

Expected benefit: Prevents unreadable white text or low-contrast attribute/link labels.

Affected files/modules: `js/hbds_class.js`, `js/hbds_class_link.js`, `tools/validate_manifests.py`, `scripts/collaboration_browser_regression.py`

Suggested tests: models with dark/light backgrounds, white label text, link label backgrounds, and class body colors.

### Prompt: Add Shape And Image Rendering Regression Screenshots

Priority: Medium

Expected benefit: Detects accidental breakage in icons, class images, class shapes, and label placement.

Affected files/modules: `scripts/collaboration_browser_regression.py`, `.codex_previews/`, `test_models/render_030_extended_shape_class_bodies.json`, `test_models/render_031_class_image_gallery.json`

Suggested tests: browser screenshots plus DOM/canvas nonblank checks.

## Links And Relationship Rendering

### Prompt: Expand Link Routing Presets And Avoidance

Priority: High

Expected benefit: Complex diagrams have fewer link crossings, less label overlap, and clearer relationship paths.

Affected files/modules: `js/hbds_class_link.js`, `js/hbds_hyperclass_link.js`, `js/test_dynamic_hbds_layout.js`

Suggested tests: `test_models/links_034_extended_arrow_types.json`, dense transportation models, hub fan models.

### Prompt: Add Link Label Collision Resolution

Priority: High

Expected benefit: Link labels remain readable when many relationships connect the same classes.

Affected files/modules: `js/hbds_class_link.js`, `js/hbds_hyperclass_link.js`

Suggested tests: bidirectional links, hub fan links, dense stress models, link label font-size changes.

### Prompt: Add Link Endpoint Port Editing

Priority: Medium

Expected benefit: Users can control source and target sides for relationships without editing JSON.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `js/hbds_class_link.js`, `test_dynamic_hbds_layout.html`

Suggested tests: top/right/bottom/left source and target ports save, reload, and appear in collaboration diffs.

### Prompt: Add Link Type Semantics

Priority: Medium

Expected benefit: Relationship types such as composition, association, dependency, inheritance, ownership, and validation can drive default styling and legends.

Affected files/modules: `js/hbds_class_link.js`, `js/test_dynamic_hbds_layout.js`, `server.py`, OpenAPI schemas

Suggested tests: link type save/load, default style mapping, Swagger schema coverage.

## AI Support

### Prompt: Improve AI Prompt Enhancement For HBDS JSON

Priority: High

Expected benefit: AI outputs more valid HBDS JSON with correct layout, IDs, links, attributes, and no Markdown fences.

Affected files/modules: `server.py`, `js/hbds_ai_support.js`, `scripts/ai_support_test.mjs`, `models/AI_Models_World.json`

Suggested tests: prompt preparation helper tests, strict JSON validation, invalid Markdown rejection, layout metadata preservation.

### Prompt: Add AI Provider Capability Validation

Priority: High

Expected benefit: Prevents unsupported model/reasoning/provider combinations from producing confusing API errors.

Affected files/modules: `server.py`, `js/hbds_ai_support.js`, OpenAPI docs

Suggested tests: OpenAI, Anthropic, Ollama, custom OpenAI-compatible, ChatGPT manual, no-key flows.

### Prompt: Add AI Result Diff Explanation

Priority: Medium

Expected benefit: Users can understand what an AI-generated model changes before applying it.

Affected files/modules: `js/hbds_ai_support.js`, `js/test_dynamic_hbds_layout.js`, `css/test_dynamic_hbds_layout.css`

Suggested tests: generate, validate current model, improve current model, same-ID apply, apply-as-new, rollback.

### Prompt: Add AI Model Quality Score

Priority: Medium

Expected benefit: AI results can be checked for duplicate IDs, missing positions, isolated classes, invalid links, overlapping layout, unreadable labels, and missing metadata before apply.

Affected files/modules: `server.py`, `tools/validate_models.py`, `tools/validate_test_models.py`, `js/hbds_ai_support.js`

Suggested tests: intentionally invalid AI payloads and valid generated models.

### Prompt: Expand `AI_Models_World.json`

Priority: Medium

Expected benefit: The AI reference model stays aligned with the real AI menu, provider list, model options, security policy, and workflows.

Affected files/modules: `models/AI_Models_World.json`, `models/models_manifest.json`, `tools/validate_models.py`

Suggested tests: model validation, no overlap inspection, layout remains `none` where required.

## Collaboration And Draft Handling

### Prompt: Add True Multi-User Undo Conflict Handling

Priority: High

Expected benefit: Users can recover safely when undo/redo interacts with remote edits.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `js/hbds_collaboration_drafts.js`, `server.py`

Suggested tests: two-browser edits, local undo after remote update, merge conflicts, stale draft behavior.

### Prompt: Add Collaboration Timeline Export

Priority: Medium

Expected benefit: Users can inspect or attach a compact history of remote operations when debugging collaboration issues.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `server.py`

Suggested tests: operation-only drafts, full model drafts, exported timeline excludes secrets.

### Prompt: Improve Collaboration Preview For Large Models

Priority: Medium

Expected benefit: Remote previews remain fast and readable for satellite and transportation models.

Affected files/modules: `js/hbds_collaboration_preview.js`, `js/test_dynamic_hbds_layout.js`, `css/test_dynamic_hbds_layout.css`

Suggested tests: large-model collaboration performance, preview zoom, deferred rendering diagnostics.

### Prompt: Add External Client Collaboration Examples

Priority: Low

Expected benefit: API users can publish drafts and operations without using the browser UI.

Affected files/modules: `README.md`, `server.py`, OpenAPI docs, `doc/`

Suggested tests: sample curl or Python script publishes an operation-only draft and browser UI receives it.

## Model Management

### Prompt: Add Model Rename With Backup And Manifest Refresh

Priority: Medium

Expected benefit: Users can rename model files without manually editing manifests or risking data loss.

Affected files/modules: `server.py`, `js/hbds_server_api.js`, `js/test_dynamic_hbds_layout.js`, OpenAPI docs

Suggested tests: rename creates backup, refuses protected/default models, updates selector, updates manifests.

### Prompt: Add Model Duplicate As New File

Priority: Medium

Expected benefit: Users can branch a model before risky AI or manual changes.

Affected files/modules: `server.py`, `js/test_dynamic_hbds_layout.js`, `js/hbds_server_api.js`

Suggested tests: duplicate under `models/` and `test_models/`, no ID mutation unless requested, backup policy.

### Prompt: Add Model Metadata Editor

Priority: Medium

Expected benefit: Users can edit model name, description, purpose, version, layout metadata, and tags without JSON editing.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `tools/validate_manifests.py`, `README.md`

Suggested tests: metadata save/reload, manifest refresh, invalid metadata validation.

### Prompt: Add Model Import Wizard

Priority: Medium

Expected benefit: Users can import external JSON, normalize legacy fields, preview validation warnings, and save safely.

Affected files/modules: `server.py`, `js/test_dynamic_hbds_layout.js`, `js/hbds_model.js`

Suggested tests: legacy `kind`, `attribute`, `source`, `target`, layout fields, duplicate IDs.

## API, OpenAPI, And Backend

### Prompt: Split `server.py` Into Focused Modules

Priority: High

Expected benefit: Backend model, AI, OpenAPI, draft, event, and static-file logic become easier to test and maintain.

Affected files/modules: `server.py`, new `server_*` modules or package, `scripts/smoke_server.py`

Suggested tests: full smoke suite, OpenAPI comparison, server startup manifest sync.

### Prompt: Add Stronger API Schema Validation

Priority: High

Expected benefit: API errors become clearer and invalid models are rejected consistently before save/apply.

Affected files/modules: `server.py`, OpenAPI schemas, `tools/validate_models.py`

Suggested tests: invalid font fields, invalid links, duplicate IDs, invalid AI apply payloads, stale revisions.

### Prompt: Add API Examples To Swagger Docs

Priority: Medium

Expected benefit: Users can understand model save, scoped save, AI prompt, AI apply, rollback, delete, drafts, and operations quickly.

Affected files/modules: `server.py`, generated docs in `/api/docs`

Suggested tests: `/api/docs` loads, `/api/openapi.json` validates, examples do not include secrets.

### Prompt: Add Authentication Option For Connected Server Mode

Priority: Low

Expected benefit: Local or shared demos can protect write/delete/AI endpoints.

Affected files/modules: `server.py`, `js/hbds_server_api.js`, README, OpenAPI docs

Suggested tests: unauthenticated write fails, read-only allowed if configured, UI reports auth state.

## Testing And Regression Coverage

### Prompt: Add A Dedicated Font Policy Unit Test

Priority: High

Expected benefit: Font inheritance and reset behavior can be tested without running the full browser regression.

Affected files/modules: new test script under `scripts/`, `js/test_dynamic_hbds_layout.js`, `js/hbds_model.js`

Suggested tests: overall, class, hyperclass, attribute, link, element override, reset-all.

### Prompt: Add Browser Screenshot Baselines For Core Models

Priority: Medium

Expected benefit: Major rendering regressions become visible in CI-like local runs.

Affected files/modules: `scripts/collaboration_browser_regression.py`, `.codex_previews/`

Suggested tests: bridge, AI world, render 033, links 034, satellite, transportation.

### Prompt: Add Test Coverage For Model Delete And Backup Restore

Priority: Medium

Expected benefit: Backup behavior remains trustworthy after delete, rename, and duplicate changes.

Affected files/modules: `server.py`, `scripts/smoke_server.py`, `js/test_dynamic_hbds_layout.js`

Suggested tests: delete creates backup, protected delete rejected, backup is loadable JSON.

### Prompt: Add Performance Budgets For Large Models

Priority: Medium

Expected benefit: Large satellite and transportation models remain usable as features grow.

Affected files/modules: `scripts/collaboration_browser_regression.py`, `js/test_dynamic_hbds_layout.js`

Suggested tests: load time, fit time, label metrics, collaboration panel render, draft publish.

## Documentation And User Guidance

### Prompt: Keep Help User Guide In Sync With README And Tests

Priority: High

Expected benefit: Users see current workflows for AI, model delete, rollback, collaboration, font controls, and Edit/Tests save locations.

Affected files/modules: `index.html`, `README.md`, `Test_and_Integration.md`

Suggested tests: shell Help browser regression and manual guide review.

### Prompt: Add Troubleshooting Guide

Priority: Medium

Expected benefit: Users can diagnose server disconnected, AI backend disabled, provider HTTP errors, Maven/ripgrep wrappers, and browser module loading issues.

Affected files/modules: `README.md`, `Roadmap.md`, new `Troubleshooting.md` or Help section

Suggested tests: docs review; link checks from README and Help.

### Prompt: Add Developer Architecture Notes

Priority: Medium

Expected benefit: Future changes are easier because model normalization, rendering, collaboration, AI, and server responsibilities are documented.

Affected files/modules: new `doc/Architecture.md`, README links

Suggested tests: docs-only review and link validation.

## Security And Secrets

### Prompt: Add Secret Leak Regression Coverage

Priority: High

Expected benefit: AI keys and provider credentials stay out of model JSON, exports, drafts, logs, diagnostics, and OpenAPI examples.

Affected files/modules: `js/hbds_ai_support.js`, `js/hbds_server_api.js`, `server.py`, `scripts/collaboration_browser_regression.py`, `scripts/ai_support_test.mjs`

Suggested tests: enter fake key, validate provider, export JSON, publish draft, inspect diagnostics and logs.

### Prompt: Add Backend Key Configuration Documentation

Priority: Medium

Expected benefit: Users with real provider keys understand when to use transient UI keys versus server-side environment variables.

Affected files/modules: `README.md`, `index.html`, `server.py`, OpenAPI docs

Suggested tests: docs review; AI connection smoke tests remain key-redacted.

### Prompt: Add Optional Key Storage Policy

Priority: Low

Expected benefit: If persistent credentials are ever requested, the app has an explicit opt-in policy instead of accidental local storage.

Affected files/modules: `js/hbds_ai_support.js`, `js/hbds_server_api.js`, README

Suggested tests: default mode never persists keys; opt-in mode warns clearly and redacts exports.

## Compatibility And Legacy Models

### Prompt: Preserve Legacy HBDS JSON Aliases

Priority: High

Expected benefit: Older models using `kind`, `attribute`, `source`, `target`, `hyperclass`, `relationship`, or legacy font fields continue to load.

Affected files/modules: `js/hbds_model.js`, `server.py`, validators

Suggested tests: legacy model fixture, AI alias normalization, save/reload round trip.

### Prompt: Add Schema Migration Report

Priority: Medium

Expected benefit: Users can see what fields were normalized when loading old or AI-generated models.

Affected files/modules: `js/hbds_model.js`, `js/test_dynamic_hbds_layout.js`, `server.py`

Suggested tests: load legacy aliases and display a nonblocking migration summary.

### Prompt: Add Backward-Compatible Font Field Tests

Priority: High

Expected benefit: Future font changes do not break old models with `fontSize`, `labelFontSize`, `rendering.font`, or attribute-group font fields.

Affected files/modules: `tools/validate_manifests.py`, `scripts/collaboration_browser_regression.py`, `test_models/render_033_font_properties.json`

Suggested tests: all supported class, hyperclass, attribute, and link font paths.

## Technical Debt And Cleanup

### Prompt: Split The Large Dynamic UI Controller

Priority: High

Expected benefit: `js/test_dynamic_hbds_layout.js` becomes easier to reason about, test, and review.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, possible new modules for selection, inspectors, AI UI, collaboration UI, font controls, model tree, productivity tools.

Suggested tests: JS syntax checks, helper tests, browser regression.

### Prompt: Consolidate Font Resolution Helpers

Priority: High

Expected benefit: Class, hyperclass, attribute, and link rendering use one clear inheritance implementation.

Affected files/modules: `js/hbds_model.js`, `js/hbds_class.js`, `js/hbds_hyperclass_class.js`, `js/hbds_class_link.js`, `js/hbds_hyperclass_link.js`

Suggested tests: render 033, links 034, attribute font storage paths, save/reload.

### Prompt: Consolidate Link Rendering Logic

Priority: Medium

Expected benefit: Class links and hyperclass links share arrow, label, routing, and font behavior.

Affected files/modules: `js/hbds_class_link.js`, `js/hbds_hyperclass_link.js`

Suggested tests: class-class, class-hyperclass, hyperclass-hyperclass, bidirectional, arrow type matrix.

### Prompt: Clean Generated Preview And Backup Artifacts

Priority: Low

Expected benefit: Working trees stay easier to inspect and commits are less noisy.

Affected files/modules: `.gitignore`, `.codex_previews/`, `.tmp-collab-browser-profile-*`, `models/.backups/`, `test_models/.backups/`

Suggested tests: cleanup script only removes explicitly generated artifacts and never deletes user models without confirmation.

### Prompt: Add Repo Hygiene Check

Priority: Medium

Expected benefit: Local wrappers, generated manifests, backups, previews, and line endings are handled consistently.

Affected files/modules: `.gitignore`, scripts under `scripts/`, README

Suggested tests: `git diff --check`, generated artifact ignore checks, wrapper availability on Windows.

## Low-Risk Future Enhancements

### Prompt: Add Keyboard Shortcuts Help And Command Palette Improvements

Priority: Low

Expected benefit: Power users can quickly find and execute editing commands.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `index.html`, `README.md`

Suggested tests: command palette opens, commands respect read-only/edit modes, Help lists shortcuts.

### Prompt: Add Model Search Across All Files

Priority: Low

Expected benefit: Users can find models by class, attribute, link, provider, or tag text.

Affected files/modules: `server.py`, `js/test_dynamic_hbds_layout.js`, `index.html`

Suggested tests: search models and test_models, manifest refresh, no UI freeze on large model directories.

### Prompt: Add Export To Image And SVG

Priority: Low

Expected benefit: Users can share diagrams outside the app.

Affected files/modules: `js/test_dynamic_hbds_layout.js`, `js/hbds_model.js`, renderer snapshot helpers

Suggested tests: export preserves visible labels, current fit, high-contrast text, and link arrows.

