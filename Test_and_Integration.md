# HBDS Graphic Simulator Test And Integration Guide

This guide describes end-to-end testing for the HBDS Graphic Simulator, from first setup through deep UI, API, server, collaboration, and release validation.

The examples use Windows PowerShell because the current development environment is Windows. Equivalent commands can be run from other shells with the same Python and Maven tools.

## 1. Test Scope

Use this guide to validate:

* static browser mode
* connected Python server mode
* Models, Edit, Tests, and Help views
* `models/` and `test_models/` manifests
* model and test model metadata consistency and unique IDs
* model load, edit, save, backup, and reload
* 2-D and 3-D rendering
* zoom, pan, fit, and overview behavior
* class, hyperclass, attribute, and link editing
* model tree sidebar search, selection, and multi-selection
* duplicate, copy, and paste for selected class and hyperclass nodes
* bulk attribute add and selected attribute reorder
* link source/target swap and route presets
* selected subgraph export
* layout algorithms
* API documentation and OpenAPI output
* server connection indicator
* collaboration panel and conflict-resolution choices
* immediate class, hyperclass, and attribute label rendering after model load
* smoke tests, manifest validation, naming lint, productivity helper tests, browser collaboration regression, and Maven tests through the repo-local wrapper

## 2. Investigation Issue Ledger

This section records the regression issues that must stay covered by future test passes.

Resolved or mitigated issues:

* Class, hyperclass, and attribute text labels could be invisible immediately after loading a model and only appeared after moving the model, zooming, or selecting an element.
* CSS2D label placement could be broken when code assigned a fixed `translateZ(0)` transform to label elements, replacing the renderer-managed screen transform.
* Class and hyperclass text could become unreadable at some zoom levels when label font sizing had no practical readable floor.
* Empty or missing class icon paths could leave label rendering in a fragile state during model load.
* Dynamic module imports could keep stale label-rendering code in the browser cache when cache-bust query strings were not updated together.
* Model refresh could leave previous class or hyperclass label registry state active if registries were not cleared before re-rendering.
* Java regression tests could not run because `mvn` was not available on the machine PATH; the repo now provides `mvn.cmd`, `mvn.ps1`, and `scripts/bootstrap_maven.ps1`.
* `it_infrastructure_world_complete_structure.json` was removed from the model set and must not remain in manifests, tests, or large-model special-case references.

Known data issue still detected by deep validation:

* `tools/validate_models.py` can fail because `models/satellite_world_complete_structure.json` and `models/satellite_world_complete_structure2.json` contain duplicate global model IDs. Treat this as a model data failure, not a JavaScript rendering failure.

Regression coverage required for these issues:

* Load models in Edit and Tests and confirm class, hyperclass, and attribute names are visible before any pan, zoom, fit, move, or selection.
* Inspect label metrics after load and require non-empty CSS transforms, non-zero bounding boxes, readable font sizes, and placement inside the viewport.
* Repeat label checks after zoom in, zoom out, pan, fit, overview drag, element selection, and switching between 2-D and 3-D.
* Load a satellite model and verify label font sizes remain readable at near, default, and far zoom distances.
* Restart the server and validate both manifests after removing or adding model files.
* Run Maven through the repo-local wrapper so Java checks are never skipped because global Maven is missing.
* Record any current model-data validation failure separately from code regressions.

## 3. Prerequisites

From the repository root:

```powershell
Set-Location C:\projects\openbexi_hbds
```

Check Python:

```powershell
py --version
python --version
python3 --version
```

On Windows, `py` is usually the most reliable command. If `python` or `python3` is not available, use `py` in the commands below.

Check Maven if Java tests are required:

```powershell
.\mvn.cmd -v
.\mvn.ps1 -v
```

If repo-local Maven is missing, bootstrap it:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap_maven.ps1
```

The wrapper uses an installed JDK 17 when `JAVA_HOME` is not already set. In PowerShell, prefer `.\mvn.cmd test` or `.\mvn.ps1 test`. In `cmd.exe`, `mvn test` works from the repository root because `mvn.cmd` is in the current directory.

## 4. Static Mode Smoke Test

Static mode verifies that the browser UI can be served without the Python API.

Start a static server:

```powershell
py -m http.server 8000
```

Open:

```text
http://127.0.0.1:8000/index.html
```

Validate:

* The shell loads.
* The menu shows `Models`, `Edit`, `Tests`, `Help`, and connection status.
* The connection indicator shows not connected.
* Models can be viewed if JSON assets are served.
* Browser console has no fatal module-loading errors.

Stop the static server with `Ctrl+C`.

## 5. Connected Server Mode

Connected mode is the main integration mode.

Start the local server:

```powershell
py server.py --host 127.0.0.1 --port 8010
```

Open:

```text
http://127.0.0.1:8010/index.html
```

For regression runs, enable UI debug logging before exercising Models, Edit, or Tests. Either use the in-app Debug Logging toggle, or open dynamic views with `debug=1`, for example:

```text
http://127.0.0.1:8010/test_dynamic_hbds_layout.html?modelsPath=models/&debug=1
http://127.0.0.1:8010/test_dynamic_hbds_layout.html?modelsPath=test_models/&debug=1
```

Expected debug output:

* `.codex_server_access.log` records server requests.
* `.codex_server_err.log` remains empty for passing runs.
* `debug_logs/*.jsonl` contains client and server timing events for each active UI session.

Validate:

* The connection indicator turns green/connected.
* Stopping the server turns the indicator red/not connected after polling catches up.
* Restarting the server reconnects the UI.
* `models/models_manifest.json` and `test_models/test_models_manifest.json` are refreshed at server startup.
* Loading a large model such as `satellite_world_complete_structure.json` shows a centered non-blocking canvas progress bar instead of a blank or frozen canvas.

## 6. Port In Use Check

If port `8010` is already in use:

```powershell
netstat -ano | findstr :8010
```

Then either stop the process that owns the port or start the server on a different port:

```powershell
py server.py --host 127.0.0.1 --port 8011
```

Open:

```text
http://127.0.0.1:8011/index.html
```

## 7. Models View Test

Open the main shell and select `Models`.

Validate:

* `Select a HBDS Model` is available.
* `Enable 3-D View` is available.
* `Fit Model` is available.
* Save and layout algorithm edit controls are not shown in Models view.
* Zoom in and zoom out still work.
* The overview/minimap is visible and tracks the current viewport.
* Loading multiple models updates the diagram and overview.
* Loading a model with text labels shows class, hyperclass, attribute, and link labels immediately before any interaction.
* Switching between 2-D and 3-D does not break rendering.

Recommended model coverage:

* a simple model, for example `human.json`
* a linked model, for example `bridge_road_links.json`
* a hyperclass model
* a larger model, for example a satellite model

## 8. Edit View Test

Select `Edit` from the shell.

Validate:

* The model selector reads from `models/models_manifest.json`.
* A blank workspace is available after reset.
* Class, hyperclass, and attribute name labels are visible immediately after loading a model, before moving, zooming, pressing Fit, or selecting any element.
* Label DOM nodes have non-empty renderer transforms and non-zero bounds immediately after load.
* Fit uses most of the available canvas without clipping the model or hiding labels.
* Legacy/generated `metadata.layout.fit` values are normalized to the current model bounds and canvas aspect on load.
* Saving after pan, zoom, overview pan, or `Fit Model` stores the current user view in `metadata.layout.fit`.
* Reloading a saved model restores the saved user view instead of recalculating it.
* Models with one or two classes use a smart fit margin so the classes do not appear oversized after load or `Fit Model`.
* The overview/minimap is visible, tracks zoom/pan/fit, and dragging the blue viewport square pans the main canvas.
* Save writes to `./models/` in connected mode.
* Existing model overwrite creates a backup under `models/.backups/`.
* The JSON panel reflects the current model.

Manual edit workflow:

1. Load a model.
2. Search the Model Tree by name, ID, type, attribute text, and link endpoint.
3. Select a class, hyperclass, attribute, and link from the Model Tree and confirm canvas and property panel selection stay synchronized.
4. Shift-click class or hyperclass rows in the Model Tree to build a multi-selection.
5. Add a hyperclass.
6. Add a class.
7. Add attributes to the selected class.
8. Add multiple attributes through Bulk Attributes and confirm duplicate names are rejected.
9. Move a selected attribute up and down and confirm its data is preserved.
10. Duplicate selected class or hyperclass nodes and confirm new IDs, offset positions, and copied rendering.
11. Copy and paste selected class or hyperclass nodes and confirm pasted nodes get new IDs and offset positions.
12. Add a link between two elements.
13. Select a link and verify the delete button reads `Delete selected link`.
14. Swap the selected link source and target, then apply `auto`, `horizontal`, `vertical`, `direct`, and `orthogonal` route presets.
15. Export Selected and confirm the JSON includes selected nodes, selected hyperclass descendants, and only links whose endpoints are included.
16. Select an attribute and click `Delete Attribute`.
17. Delete the selected link.
18. Move a class in 2-D mode.
19. Switch to 3-D and rotate the scene.
20. Switch back to 2-D and verify layout is preserved.
21. Save.
22. Reload the model and verify the saved changes are present.

## 9. Tests View Test

Select `Tests` from the shell.

Validate:

* The model selector reads from `test_models/test_models_manifest.json`.
* Class, hyperclass, and attribute name labels are visible immediately after loading a test model, before any canvas interaction.
* Label DOM nodes have non-empty renderer transforms and non-zero bounds immediately after load.
* Fit uses most of the available canvas without clipping the model or labels.
* Legacy/generated `metadata.layout.fit` values are normalized to the current model bounds and canvas aspect on load.
* Saving after pan, zoom, overview pan, or `Fit Model` stores the current user view in `metadata.layout.fit`.
* Reloading a saved test model restores the saved user view instead of recalculating it.
* Test models with one or two classes use a smart fit margin so the classes do not appear oversized after load or `Fit Model`.
* The overview/minimap is visible, tracks zoom/pan/fit, and dragging the blue viewport square pans the main canvas.
* The collaboration panel is enabled for Tests when another client edits the same test model.
* Saving a test model writes under `./test_models/`.
* Reset changes the selector summary back to `Blank workspace`.
* Scenario Suite can run from the Tests panel.

Scoped save test:

1. Open `Tests`.
2. Load or create a model.
3. Save as a test model.
4. Confirm the file exists under `test_models/`.
5. Confirm it does not appear under `models/`.

## 10. Help And API Documentation

Open `Help` from the shell.

Validate:

* Help opens as a panel.
* Keyboard/help content is grouped under Help.
* API documentation link opens a readable HTML documentation page.
* OpenAPI link or direct URL can return JSON.

Direct checks:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/api/health
Invoke-RestMethod http://127.0.0.1:8010/api/openapi.json
```

Open in browser:

```text
http://127.0.0.1:8010/api/docs
http://127.0.0.1:8010/api/openapi.json
```

Expected:

* `/api/docs` is readable API documentation.
* `/api/openapi.json` is JSON because it is meant for tools and clients.

## 11. Automatic Manifest Generation

The server regenerates both manifests every time `server.py` starts.

Files:

```text
models/models_manifest.json
test_models/test_models_manifest.json
```

Validation procedure:

1. Stop the server.
2. Add a temporary `.json` model file under `models/` or `test_models/`.
3. Start the server.
4. Confirm the file appears in the matching manifest.
5. Delete the temporary file.
6. Restart the server.
7. Confirm the deleted file is removed from the manifest.

Expected manifest entry format:

```json
{
  "value": "models/example_model.json",
  "label": "example model",
  "description": "example model"
}
```

Rules:

* hidden files are ignored
* manifest files are ignored
* removed model files, including `it_infrastructure_world_complete_structure.json`, are removed from the manifest after server restart
* `_` and `-` are converted to spaces in labels
* description matches the label

## 12. API Integration Tests

Health:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/api/health
```

List server models:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/api/models
```

Load a model:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/api/models/human.json
```

Load a scoped test model:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/api/model-files/test_models/layout_001_single_class_few_attributes.json
```

OpenAPI:

```powershell
$spec = Invoke-RestMethod http://127.0.0.1:8010/api/openapi.json
$spec.openapi
$spec.paths.PSObject.Properties.Name
```

Server-Sent Events can be manually checked in a browser by opening:

```text
http://127.0.0.1:8010/api/events?clientId=manual-check&clientName=Manual%20Check
```

Expected:

* the stream connects
* events appear when another tab joins, publishes a draft, saves, or disconnects

## 13. Collaboration Test

Use connected server mode.

Setup:

1. Open `http://127.0.0.1:8010/index.html` in browser window A.
2. Open the same URL in browser window B, or a separate browser profile.
3. In both windows, select `Edit` or `Tests`.
4. Load the same model in both windows.

Expected:

* The floating collaboration panel appears only when another user is active on the same model.
* The panel header shows `Live Collaboration`, `Others' View`, user count connected to the current model, and a user dropdown.
* The panel is movable.
* The panel is resizable.
* The preview can zoom in, zoom out, and fit.
* The panel does not appear in Models view.
* Presence updates show the remote user's selection, viewport, status, and model name without marking the remote user as editing.
* Editing updates mark the remote user as dirty and enable the correct collaboration choices.
* Remote disconnect or draft clear removes the remote user from the panel without leaving stale warnings.

Live presence workflow:

1. In window A and window B, load the same model and make no edits.
2. In window B, select a class, select an attribute, select a link, zoom, pan, and fit the view.
3. In window A, confirm the remote selection and viewport information update without requiring a full model merge.
4. Close window B.
5. Confirm window A removes the remote user after the leave or draft-clear event.

Draft publishing workflow:

1. In window B, move one class, edit a class name, edit an attribute name, and edit a link style.
2. In window A, confirm the collaboration panel updates after each action.
3. Confirm normal editing in window B remains responsive while drafts are publishing.
4. Confirm the wait/loading popup does not appear during ordinary selection, movement, or property edits.
5. In browser DevTools, inspect the hidden diagnostics output when available:

```javascript
JSON.parse(document.getElementById('collaboration-performance-diagnostics')?.textContent || '{}')
```

Expected diagnostics:

* `draft.build.presence`, `draft.build.dirty`, `draft.publish`, `draft.network`, `panel.render`, `diff.compute`, and `preview.build` appear after exercising those paths.
* Duplicate or coalesced draft counters may increase during rapid edits.
* Slow samples are rare during ordinary edits and should correspond to genuinely expensive work.

Lightweight draft and full snapshot fallback:

1. In window B, make several small edits within 15 seconds.
2. In window A, confirm remote status, summary, selection, and operations continue to update even when the full model snapshot is omitted.
3. Confirm `Use Theirs` is disabled when the selected remote draft has no current full snapshot.
4. Confirm `Merge Both` is enabled when safe operations are present.
5. Wait for the next full snapshot interval, or force a larger edit that includes a snapshot.
6. Confirm `Use Theirs` becomes available when a current full snapshot is received.

Performance pass criteria:

* ordinary local edits should feel immediate
* remote draft updates should appear without freezing the editor
* panel rendering should not block canvas interaction
* preview generation should be throttled and should not run on every presence update
* full snapshots should not be sent on every small edit
* the wait/loading popup should appear only for genuinely long-running work, such as server load/save, large merge, or large preview generation

## 14. Remote Changes Vs Mine

With two browser windows on the same model:

1. In window B, move a class.
2. In window A, inspect `Remote changes vs mine`.
3. Confirm the movement appears with old and new position values.
4. In window B, rename an attribute.
5. Confirm the attribute change appears with the owning class or hyperclass.
6. In window B, change link style or route properties.
7. Confirm the link change appears with source/target context.
8. Add enough changes to overflow the section.
9. Confirm the change list scrolls inside `Remote changes vs mine`.

Expected:

* added, removed, moved, and updated rows are visually distinct
* timestamps appear on all rows
* old timestamps are not overwritten by later updates
* repeated unchanged differences do not create duplicate rows
* omitted full snapshots show operation summaries instead of stale model differences
* preserved previews are labelled clearly when the latest update is lightweight

Operation-based merge coverage:

1. In window B, move a class.
2. In window A, choose `Merge Both` and confirm the move applies.
3. Reload the model from the server and confirm the move persists.
4. In window B, rename a class and change its rendering.
5. In window A, choose `Merge Both` and confirm both fields apply.
6. In window B, add a class, add a link to it, rename the new class, and move it.
7. In window A, choose `Merge Both` and confirm the new class and link apply together.
8. In window B, delete an existing link.
9. In window A, choose `Merge Both` and confirm the link is removed.
10. In window B, delete an existing class.
11. In window A, choose `Merge Both` and confirm the class and its links are removed.
12. In window B, change a class parent hyperclass.
13. In window A, choose `Merge Both` and confirm both `parentClassId` and parent `children` membership are correct.

Fallback merge coverage:

1. In window B, use JSON editing, reset, duplicate/paste, or another complex edit path.
2. In window A, confirm the UI falls back to full snapshot merge when operations are not sufficient.
3. Confirm no partial operation merge is offered for an incomplete operation buffer.

## 15. Conflict Choice Test

Use two browser windows on the same model.

`Merge Both`:

1. In window A, change class name.
2. In window B, move a different class.
3. In window A, choose `Merge Both`.
4. Verify final model contains both changes.

`Use Theirs`:

1. In window B, make a visible change.
2. In window A, choose `Use Theirs`.
3. Verify window A adopts window B's diagram.

`Keep Mine`:

1. In window A, make a local change.
2. In window B, make a remote change.
3. In window A, choose `Keep Mine`.
4. Verify window A keeps its local diagram and saves it.

Expected:

* simple non-conflicting changes can merge
* conflicting same-property changes warn or require a manual choice
* action buttons remain compact and readable
* `Use Theirs` is unavailable when only lightweight operations are present
* `Keep Mine` clears or ignores the remote draft and allows saving the local state
* stale server revisions return conflict warnings instead of overwriting remote saves

Save conflict workflow:

1. In window A and window B, load the same server model.
2. In window B, make a change and save.
3. In window A, make a different local change without reloading.
4. Try to save in window A.
5. Confirm the UI blocks or warns about the remote edit and presents `Merge Both`, `Use Theirs`, or `Keep Mine`.
6. Resolve with `Merge Both` and save.
7. Reload in both windows and confirm the final model is correct.

Same-field conflict workflow:

1. In window A, rename class `X` to one value.
2. In window B, rename the same class `X` to a different value.
3. In window A, choose `Merge Both`.
4. Confirm a merge conflict warning appears and neither value is silently lost.
5. Resolve with `Use Theirs` or `Keep Mine`.
6. Save and reload to confirm the selected resolution persists.

## 16. External Client Collaboration Test

External clients can interact through HTTP.

Recommended approach:

* use `/api/drafts/{scope}/{modelName}/clients/{clientId}` for live draft state
* use `/api/models/{modelName}/ops` for element-level server operations
* use `/api/events` to observe updates

Example draft publish shape:

```json
{
  "clientName": "External Python Client",
  "mode": "editing",
  "dirty": true,
  "isDirty": true,
  "operations": [],
  "selection": {
    "selectedElementId": "class_1"
  },
  "model": {
    "hypergraph": {
      "class": [],
      "link": []
    }
  }
}
```

Validate:

* browser UI shows the external client in the collaboration dropdown
* selection and draft status appear
* clearing the draft removes the external client panel state
* operation-only drafts show readable operation summaries
* operation-only drafts can be merged when the base model revision matches
* stale operation drafts return a conflict instead of overwriting changed fields

Example operation draft shape:

```json
{
  "clientName": "External Python Client",
  "mode": "editing",
  "dirty": true,
  "isDirty": true,
  "baseModelRevision": "revision-from-loaded-model",
  "modelOmitted": true,
  "operations": [
    {
      "type": "updateClass",
      "targetId": "class_1",
      "patch": {
        "name": "Updated by external client"
      }
    }
  ],
  "selection": {
    "selectedElementId": "class_1"
  }
}
```

External client operation checks:

1. Load a model through `/api/models/{modelName}` and record its revision.
2. Publish an operation-only draft using the revision as `baseModelRevision`.
3. Confirm the browser shows the external draft without requiring a full model snapshot.
4. Merge from the browser and confirm the operation applies.
5. Publish a stale operation draft after another client changes the same field.
6. Confirm merge reports a conflict.
7. Clear the external draft and confirm the browser panel removes it.

## 17. Large-Model Collaboration Performance Test

Use this section whenever collaboration publishing, remote draft handling, preview generation, merge/diff rendering, or wait/loading behavior changes.

Large model setup:

1. Start connected server mode.
2. Open two browser windows or two browser profiles.
3. In both windows, open `Edit`.
4. Load the largest available model from `models/`. If no large model exists, use the densest linked or hyperclass model available.
5. Fit the model in both windows.
6. Open browser DevTools in both windows.

Rapid edit workload:

1. In window B, drag 10 different classes in sequence.
2. Rename 10 classes or hyperclasses.
3. Rename 10 attributes.
4. Change 5 link styles or route presets.
5. Add 5 classes.
6. Add 5 links.
7. Delete 2 links.
8. Delete 1 non-critical class.
9. Reparent one class into a hyperclass and then back out.
10. Continue interacting with the canvas while updates publish.

Expected large-model behavior:

* window B remains responsive while publishing drafts
* window A receives remote updates without freezing normal pan, zoom, or selection
* the collaboration panel updates are batched and do not visibly stutter on every event
* full snapshots are throttled and are not sent after every small edit
* operation updates are used for safe class, link, attribute, move, create, delete, and parent-change paths
* complex unsupported paths fall back to full snapshots without offering incomplete operation merges
* preview generation is throttled and does not block ordinary editing
* merge/diff rendering is bounded and long lists remain scrollable
* the wait/loading popup appears only during genuinely long-running work
* the centered canvas collaboration progress indicator appears only after the delayed threshold for long preview, diff, merge, apply, or server sync work
* the centered canvas collaboration progress indicator uses `pointer-events: none` and does not prevent selecting, moving, panning, or zooming the model
* no browser console errors appear

Performance diagnostics check:

1. In each browser window, run:

```javascript
JSON.parse(document.getElementById('collaboration-performance-diagnostics')?.textContent || '{}')
```

2. Inspect counters and timings.
3. Confirm repeated rapid edits increase coalescing or duplicate-skip counters.
4. Confirm `preview.build` count is much lower than the number of presence or small edit updates.
5. Confirm `diff.compute` is bounded and does not grow with every remote update.
6. Confirm slow samples have a clear reason, such as large preview or merge work.

Large-model pass criteria:

* collaboration remains correct after the workload
* `Merge Both`, `Use Theirs`, and `Keep Mine` still produce correct final models
* save conflict detection still blocks unsafe saves
* normal edits feel responsive in both windows
* large-model collaboration does not create excessive wait popups
* remote presence and live preview continue to work
* no unnecessary full snapshots are sent or rendered during rapid small edits

## 18. Sequential Live Remote Operations Regression

Use this section whenever `Live Collaboration`, draft publishing, remote draft refresh, merge policy, or the `Remote operations` UI changes.

Automated command:

```powershell
py scripts\collaboration_browser_regression.py
```

The browser regression opens two real clients and publishes a sequence of operation-only drafts from one remote client. The receiving client must update the visible `Remote operations` list for each draft in real time, with no stale operation rows and no `No diagram differences detected` placeholder while operations exist.

Sequential operation coverage:

* class rename
* class move and position values
* combined class update with name, position, attributes, parent hyperclass, fill color, border color, corner radius, and text color
* class rendering update with material, opacity, attribute shape and size, connection style, and font family
* layout display operation
* font display operation
* scene/background display operation
* viewport/view display operation
* link update with name, label text, line color, width, and arrowhead type
* class create with name, parent, position, and attributes
* class delete
* link create with name, source, and target
* link delete

Expected sequential behavior:

* every publish replaces the previous remote operation text for that same client
* new property names and values appear without waiting for a full snapshot
* prior unique values disappear when the next draft arrives
* merge is enabled for mergeable class and link CRUD operations
* merge is disabled for layout, font, scene, and view display-only operations
* normal sequential updates do not show a wait/loading popup
* normal sequential updates do not show the canvas collaboration progress indicator
* the canvas collaboration progress indicator appears for genuinely long work, explains the active task, and does not block pointer interaction
* expensive remote preview and diff rendering is deferred so selection, movement, pan, and zoom stay responsive during collaboration updates
* each remote operation update appears within the browser regression timing budget
* the mixed operation matrix still renders all covered operation types and disables merge when non-mergeable display operations are present

## 19. Second-Page Model Selection Collaboration Latency Regression

Use this section whenever collaboration startup, model selection, edit-mode controls, draft cleanup, or remote draft refresh changes.

Automated command:

```powershell
py scripts\collaboration_browser_regression.py
```

The browser regression includes a dedicated `human_and_car_links.json` workflow:

1. Open a first real browser client on `human_and_car_links.json` in edit mode.
2. Open a second real browser client in edit mode with no model selected.
3. Select `human_and_car_links.json` on the second client.
4. Verify the model-select `change` dispatch stays under the latency budget.
5. Verify the second client loads the model, does not show a wait/loading popup, and does not show the canvas collaboration progress indicator for the normal selection path.
6. Verify the first client sees the collaboration panel after the second client joins the same model.

Expected output includes:

```text
PASS human_and_car_links second-page selection dispatch=<number>ms value=<selected option>
```

## 20. Rendering And Navigation Regression

2-D checks:

* load simple, linked, hyperclass, and dense models
* verify class, hyperclass, and attribute names appear immediately after load in Edit and Tests before moving, zooming, fitting, or selecting anything
* verify immediate-load label DOM metrics include visible text, non-empty CSS transforms, non-zero bounds, readable font sizes, and viewport placement
* verify legacy/generated `metadata.layout.fit` values adapt to the current canvas aspect and do not leave the loaded model tiny
* save after pan, zoom, overview drag, and `Fit Model` in Edit and Tests, then reload and verify the same saved user view is restored
* load and fit one-class and two-class models, then verify the smart margin keeps classes readable without making them oversized
* pan with right-click drag or trackpad
* zoom with mouse wheel or trackpad
* fit the model and confirm the diagram uses most of the canvas while preserving a small margin
* verify overview viewport updates after load, zoom, pan, and fit
* drag the blue overview viewport square and confirm the main canvas pans in Models, Edit, and Tests
* verify labels and attributes do not overlap badly in standard test models

3-D checks:

* enable 3-D view
* rotate with left mouse drag
* zoom and pan
* verify class/hyperclass surfaces render
* switch back to 2-D and verify the model remains usable

Immediate label load regression:

1. Start connected server mode.
2. Open:

```text
http://127.0.0.1:8010/test_dynamic_hbds_layout.html?modelsPath=models/&manifestPath=models/models_manifest.json&debug=1&runImmediateLabelRegression=1
```

3. Wait for the status message.
4. Confirm the pass summary reports visible and placed hyperclass, class, and attribute labels.
5. Confirm no action was required before the labels became visible.

Satellite font zoom regression:

1. Start connected server mode.
2. Open:

```text
http://127.0.0.1:8010/test_dynamic_hbds_layout.html?modelsPath=models/&manifestPath=models/models_manifest.json&debug=1&runSatelliteFontRegression=1
```

3. Wait for the status message.
4. Confirm near, default, and far zoom samples keep readable class, hyperclass, and attribute text.

## 21. Layout Regression

In Edit or Tests:

1. Load a model with several nodes.
2. Select layout algorithm `grid`.
3. Run optimize.
4. Repeat with `hierarchy`.
5. Repeat with `radial`.
6. Fit the model after each layout.

Validate:

* classes remain visible
* hyperclasses remain readable
* attributes remain tied to their owning class/hyperclass
* links route to expected source/target elements
* no layout control appears in Models view

## 22. Model Validation And JSON Editing

Manual validation:

1. Open Edit or Tests.
2. Load a model.
3. Open the JSON section.
4. Modify a property safely.
5. Apply JSON.
6. Confirm the canvas updates.

Invalid JSON test:

1. Enter malformed JSON.
2. Apply JSON.
3. Confirm the UI shows an error and does not corrupt the current model.

Server validation:

* invalid model payloads should return HTTP `400`
* stale saves should return HTTP `409`
* invalid model names should return HTTP `400`

The smoke suite covers these server cases.

## 23. Medium-Risk Modeling Productivity Validation

Validate this section whenever the model tree sidebar, productivity panel, copy/paste behavior, attribute helpers, link helpers, or selected subgraph export changes.

Feature scope:

* model tree sidebar for classes, hyperclasses, attributes, and links
* tree search by name, ID, type, attribute text, and link endpoint
* tree selection and Shift-click multi-selection for class and hyperclass nodes
* duplicate, copy, and paste for selected class and hyperclass nodes
* bulk attribute add with duplicate-name rejection
* selected attribute move up/down
* selected link source/target swap
* selected link route presets
* selected subgraph JSON export

Affected source and documentation files:

```text
test_dynamic_hbds_layout.html
css/test_dynamic_hbds_layout.css
js/test_dynamic_hbds_layout.js
js/hbds_model_productivity.js
scripts/productivity_helpers_test.mjs
README.md
Test_and_Integration.md
Prompt4HDBS_graphi_ simulator.md
```

Manual validation:

1. Open Edit or Tests in connected mode.
2. Confirm the Model Tree is visible, collapsible, and searchable.
3. Load a model and search by class name, ID, type, attribute text, and link endpoint.
4. Click class, hyperclass, attribute, and link tree rows and confirm the canvas and property panel reflect the same selection.
5. Shift-click multiple class or hyperclass rows and confirm the multi-selection status updates.
6. Duplicate selected node rows and confirm new IDs, copied attributes, copied rendering, offset positions, and no unexpected link duplication.
7. Copy and paste selected node rows and confirm the same ID, rendering, and offset behavior.
8. Add multiple attributes with Bulk Attributes and confirm duplicate names are rejected before applying.
9. Move the selected attribute up and down, preserving its name, type, value, and rendering fields.
10. Select a link, swap source and target, then apply `auto`, `horizontal`, `vertical`, `direct`, and `orthogonal` route presets.
11. Export Selected and confirm the JSON includes selected nodes, descendants of selected hyperclasses, and links where both endpoints are included.
12. Confirm Export Selected does not mutate the active model or current selection.

Expected pass criteria:

* Productivity controls are hidden or disabled when no compatible selection exists.
* Duplicate and paste produce unique IDs and readable names.
* Link helpers operate only on selected links.
* Bulk attribute actions do not create duplicate attribute names.
* Export Selected produces valid model JSON without changing the open model.
* The browser console has no new runtime errors during the workflow.

Known limitations:

* Link duplication is intentionally not included.
* Hyperclass duplication does not implicitly duplicate children unless children are selected with it.
* Selected subgraph export is JSON only.
* Model tree drag-to-reparent and inline rename are not included.

## 24. Automated Regression Commands

Execution order:

1. Run automated compile, unit/helper, manifest, model, Maven, and smoke checks.
2. Run browser regressions.
3. Run manual or interactive collaboration checks only for behavior not already covered by automation.
4. If a test fails, fix the related code or test data, update this guide if expected behavior changed, and rerun the affected checks plus any broader regression that could be impacted.

Automated pass criteria:

* All automated checks must pass except explicitly accepted known data issues.
* The current accepted known data issue is `py tools\validate_models.py` failing because `models/satellite_world_complete_structure.json` and `models/satellite_world_complete_structure2.json` share duplicate global model IDs.
* If `py tools\validate_models.py` fails for any different reason, treat it as a new failure.
* Browser regressions must pass with no significant console errors.
* The run is complete only when no remaining failure requires code changes.

Run Python compile checks:

```powershell
py -m py_compile server.py scripts\smoke_server.py scripts\collaboration_browser_regression.py tools\validate_manifests.py tools\validate_models.py tools\validate_test_models.py tools\lint_model_naming.py
```

Run the full server smoke suite:

```powershell
py scripts\smoke_server.py
```

Validate manifests:

```powershell
py tools\validate_manifests.py
```

Validate model metadata and unique IDs:

```powershell
py tools\validate_models.py
```

Validate test model metadata and unique IDs:

```powershell
py tools\validate_test_models.py
```

Lint naming:

```powershell
py tools\lint_model_naming.py
```

Run productivity helper tests:

```powershell
node scripts\productivity_helpers_test.mjs
```

Run collaboration draft helper tests:

```powershell
node scripts\collaboration_drafts_test.mjs
```

Run the browser-level collaboration regression:

```powershell
py scripts\collaboration_browser_regression.py
```

This opens real headless Edge/Chrome clients with `debug=1`, verifies second-page `human_and_car_links.json` model-selection latency during collaboration, then verifies a temporary server model for real draft publishing, sequential real-time `Remote operations` list updates, remote operation rendering for class, link, layout, font, scene, view, movement, rendering, parent, attribute, create, and delete updates, merge behavior, collaboration performance diagnostics, absence of normal-update wait/status dialogs, and the non-blocking long-work canvas progress indicator.

Automated collaboration coverage:

* two real browser clients on the same model
* second-page model selection while another client is already active
* live draft publishing from UI edits
* operation-only remote draft display
* merge enablement for safe class and link operations
* merge disablement for display-only or mixed non-mergeable operations
* real-time replacement of `Remote operations` rows without stale text
* class rename, movement, rendering, parent, attribute, create, and delete operation summaries
* link update, create, and delete operation summaries
* layout, font, scene, and viewport operation summaries
* collaboration performance diagnostics for panel render, draft build, and draft publish
* absence of wait popups and canvas collaboration progress indicators during normal updates
* visible non-blocking canvas progress indicator for intentionally long collaboration work

Manual collaboration coverage is still required for final release if behavior outside the automated list changed, especially disconnect/reconnect timing, two different model tabs, external clients beyond operation-only drafts, and visual inspection of large-model collaboration under sustained human edits.

After automated browser regression, inspect the logs:

```powershell
Get-Item .codex_server_out.log,.codex_server_err.log,.codex_server_access.log
Get-ChildItem debug_logs
```

Expected:

* `.codex_server_err.log` is empty.
* `.codex_server_access.log` has no unexpected `4xx` or `5xx` responses.
* debug JSONL files include `client.function-timing`, `server.function-timing`, and stream events are logged as `server.stream-timing` rather than ordinary slow request timings.

Run Java/Maven tests if Maven is installed:

```powershell
.\mvn.cmd test
```

Run JavaScript syntax checks for all JavaScript modules:

```powershell
Get-ChildItem js -Filter *.js | ForEach-Object {
  Get-Content -Raw $_.FullName | node --input-type=module --check
}
```

Run browser label-load regressions in a connected browser:

```text
http://127.0.0.1:8010/test_dynamic_hbds_layout.html?modelsPath=models/&manifestPath=models/models_manifest.json&debug=1&runImmediateLabelRegression=1
http://127.0.0.1:8010/test_dynamic_hbds_layout.html?modelsPath=models/&manifestPath=models/models_manifest.json&debug=1&runSatelliteFontRegression=1
```

Run the Tests-view scenario suite in a connected browser:

```text
http://127.0.0.1:8010/test_dynamic_hbds_layout.html?modelsPath=test_models/&manifestPath=test_models/test_models_manifest.json&debug=1&runScenarioSuite=1
```

Run Git whitespace checks:

```powershell
git diff --check
```

## 25. Deep Manual Regression Matrix

Run this matrix before major releases.

Models view:

* load every standard model
* test 2-D/3-D toggle
* test zoom, fit, overview
* verify no edit/save controls are exposed

Edit view:

* load from `models/`
* search and select elements through the Model Tree
* create class
* create hyperclass
* add attributes
* bulk add attributes
* reorder selected attributes
* add links
* swap link source and target
* apply link route presets
* duplicate, copy, and paste selected nodes
* export a selected subgraph
* update class and hyperclass rendering properties
* move elements
* save and reload

Tests view:

* load from `test_models/`
* run Scenario Suite
* save a test model
* confirm file is saved under `test_models/`

Help/API:

* open Help
* open API documentation
* open OpenAPI JSON
* verify documentation is readable and links are correct

Collaboration:

* two browser windows on same model
* two browser windows on different models
* external client draft
* live presence without dirty state
* lightweight remote draft update
* full snapshot fallback
* operation-based merge for move, rename, rendering, attribute, create, delete, link, and parent-change paths
* sequential `Remote operations` updates for class, link, layout, font, scene, view, parent, rendering, attribute, create, and delete operations
* `Remote operations` never reports `No diagram differences detected` while operation rows exist
* remote movement
* remote attribute change
* remote link change
* remote class/link create and delete
* `Use Theirs` with a current full snapshot
* `Use Theirs` disabled for operation-only drafts
* `Keep Mine` and follow-up save
* same-property conflict
* different-property merge
* stale operation conflict
* stale save conflict
* preview generation throttling
* panel render batching
* diagnostics output review
* large-model rapid edit workload
* wait/loading popup only for long-running work
* disconnect/reconnect
* panel resize and drag

## 26. Troubleshooting

Port already in use:

```powershell
netstat -ano | findstr :8010
```

Use another port:

```powershell
py server.py --port 8011
```

Browser cache shows old JavaScript or CSS:

* hard refresh with `Ctrl+F5`
* close and reopen the tab
* verify cache-bust query strings changed in HTML

Server disconnected icon:

* check that `server.py` is running
* open `http://127.0.0.1:8010/api/health`
* verify the UI is using the same port as the server

Maven not installed:

```powershell
.\mvn.cmd -v
```

If local Maven is missing, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap_maven.ps1
```

Then run `.\mvn.cmd test` from PowerShell. If this still fails, verify JDK 17 is installed or set `JAVA_HOME` to a JDK 17 directory.

Python command differences:

* Windows usually supports `py`
* macOS/Linux usually use `python3`
* some systems map `python` to Python 3

Collaboration panel not appearing:

* confirm server mode is running
* use Edit or Tests, not Models
* open the same model in a second browser tab/window
* make an edit in the second client
* confirm both clients show connected status

Manifests not updated:

* stop and restart `server.py`
* confirm files are valid `.json`
* hidden files and manifest files are skipped
* run `py scripts\smoke_server.py`

OpenAPI or docs returns JSON when HTML was expected:

* `/api/docs` is the readable documentation page
* `/api/openapi.json` is the machine-readable JSON specification

## 27. Release Checklist

Before release:

* run `py -m py_compile server.py scripts\smoke_server.py scripts\collaboration_browser_regression.py tools\validate_manifests.py tools\validate_models.py tools\validate_test_models.py tools\lint_model_naming.py`
* run `py scripts\smoke_server.py`
* run `py tools\validate_manifests.py`
* run `py tools\validate_models.py`
* run `py tools\validate_test_models.py`
* run `py tools\lint_model_naming.py`
* run `node scripts\productivity_helpers_test.mjs`
* run `node scripts\collaboration_drafts_test.mjs`
* run `py scripts\collaboration_browser_regression.py`
* run JavaScript syntax checks for all `js/*.js` modules
* run immediate label load and satellite font zoom browser regressions
* run `.\mvn.cmd test`
* run `git diff --check`
* start `py server.py --port 8010`
* verify Models, Edit, Tests, and Help manually
* verify API docs and OpenAPI
* verify save to `models/`
* verify save to `test_models/`
* verify model tree search and selection
* verify productivity tools for duplicate, paste, bulk attributes, link routes, and selected export
* verify collaboration with two browser windows
* verify large-model collaboration performance
* verify operation-based merge and full snapshot fallback
* verify per-change timestamps in collaboration
* verify `Merge Both`, `Use Theirs`, and `Keep Mine`
* verify wait/loading popup behavior during collaboration
* verify server disconnect/reconnect status
* verify no temporary smoke files remain
* review `git status --short`
* update README or this guide if behavior changed

## 28. Expected Clean-Up

After tests, confirm no temporary smoke files remain:

```powershell
Get-ChildItem -Path models,test_models -File -Include *_smoke_*.json,zz_deleted_manifest_stale.json
```

Confirm generated backup files are expected before committing:

```powershell
Get-ChildItem -Path models\.backups,test_models\.backups -ErrorAction SilentlyContinue
```

Backup files are useful during manual testing but usually should not be committed unless intentionally preserving fixtures.
