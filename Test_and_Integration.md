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
* layout algorithms
* API documentation and OpenAPI output
* server connection indicator
* collaboration panel and conflict-resolution choices
* smoke tests, manifest validation, naming lint, and optional Maven tests

## 2. Prerequisites

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
mvn -v
```

If Maven is not installed, Java tests cannot run until Maven is installed or a Maven wrapper is added.

## 3. Static Mode Smoke Test

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

## 4. Connected Server Mode

Connected mode is the main integration mode.

Start the local server:

```powershell
py server.py --host 127.0.0.1 --port 8010
```

Open:

```text
http://127.0.0.1:8010/index.html
```

Validate:

* The connection indicator turns green/connected.
* Stopping the server turns the indicator red/not connected after polling catches up.
* Restarting the server reconnects the UI.
* `models/models_manifest.json` and `test_models/test_models_manifest.json` are refreshed at server startup.

## 5. Port In Use Check

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

## 6. Models View Test

Open the main shell and select `Models`.

Validate:

* `Select a HBDS Model` is available.
* `Enable 3-D View` is available.
* `Fit Model` is available.
* Save and layout algorithm edit controls are not shown in Models view.
* Zoom in and zoom out still work.
* The overview/minimap is visible and tracks the current viewport.
* Loading multiple models updates the diagram and overview.
* Switching between 2-D and 3-D does not break rendering.

Recommended model coverage:

* a simple model, for example `human.json`
* a linked model, for example `bridge_road_links.json`
* a hyperclass model
* a larger model, for example a satellite model

## 7. Edit View Test

Select `Edit` from the shell.

Validate:

* The model selector reads from `models/models_manifest.json`.
* A blank workspace is available after reset.
* Save writes to `./models/` in connected mode.
* Existing model overwrite creates a backup under `models/.backups/`.
* The JSON panel reflects the current model.

Manual edit workflow:

1. Load a model.
2. Add a hyperclass.
3. Add a class.
4. Add attributes to the selected class.
5. Add a link between two elements.
6. Select an attribute and click `Delete Attribute`.
7. Select a link and verify the delete button reads `Delete selected link`.
8. Delete the selected link.
9. Move a class in 2-D mode.
10. Switch to 3-D and rotate the scene.
11. Switch back to 2-D and verify layout is preserved.
12. Save.
13. Reload the model and verify the saved changes are present.

## 8. Tests View Test

Select `Tests` from the shell.

Validate:

* The model selector reads from `test_models/test_models_manifest.json`.
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

## 9. Help And API Documentation

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

## 10. Automatic Manifest Generation

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
* `_` and `-` are converted to spaces in labels
* description matches the label

## 11. API Integration Tests

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

## 12. Collaboration Test

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

## 13. Remote Changes Vs Mine

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

## 14. Conflict Choice Test

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

## 15. External Client Collaboration Test

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

## 16. Rendering And Navigation Regression

2-D checks:

* load simple, linked, hyperclass, and dense models
* pan with right-click drag or trackpad
* zoom with mouse wheel or trackpad
* fit the model
* verify overview viewport updates
* verify labels and attributes do not overlap badly in standard test models

3-D checks:

* enable 3-D view
* rotate with left mouse drag
* zoom and pan
* verify class/hyperclass surfaces render
* switch back to 2-D and verify the model remains usable

## 17. Layout Regression

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

## 18. Model Validation And JSON Editing

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

## 19. Automated Regression Commands

Run Python compile checks:

```powershell
py -m py_compile server.py scripts\smoke_server.py tools\validate_manifests.py tools\validate_models.py tools\validate_test_models.py tools\lint_model_naming.py
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

Run Java/Maven tests if Maven is installed:

```powershell
mvn test
```

Run JavaScript syntax checks for touched modules:

```powershell
Get-Content -Raw js\test_dynamic_hbds_layout.js | node --input-type=module --check
Get-Content -Raw js\hbds_collaboration_preview.js | node --input-type=module --check
Get-Content -Raw js\hbds_floating_panel.js | node --input-type=module --check
```

Run Git whitespace checks:

```powershell
git diff --check
```

## 20. Deep Manual Regression Matrix

Run this matrix before major releases.

Models view:

* load every standard model
* test 2-D/3-D toggle
* test zoom, fit, overview
* verify no edit/save controls are exposed

Edit view:

* load from `models/`
* create class
* create hyperclass
* add attributes
* add links
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
* remote movement
* remote attribute change
* remote link change
* same-property conflict
* different-property merge
* disconnect/reconnect
* panel resize and drag

## 21. Troubleshooting

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
mvn -v
```

If missing, install Maven with Winget or Chocolatey, then reopen PowerShell.

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

## 22. Release Checklist

Before release:

* run `py -m py_compile server.py scripts\smoke_server.py tools\validate_manifests.py tools\validate_models.py tools\validate_test_models.py tools\lint_model_naming.py`
* run `py scripts\smoke_server.py`
* run `py tools\validate_manifests.py`
* run `py tools\validate_models.py`
* run `py tools\validate_test_models.py`
* run `py tools\lint_model_naming.py`
* run `mvn test` if Maven is installed
* run `git diff --check`
* start `py server.py --port 8010`
* verify Models, Edit, Tests, and Help manually
* verify API docs and OpenAPI
* verify save to `models/`
* verify save to `test_models/`
* verify collaboration with two browser windows
* verify per-change timestamps in collaboration
* verify `Merge Both`, `Use Theirs`, and `Keep Mine`
* verify server disconnect/reconnect status
* verify no temporary smoke files remain
* review `git status --short`
* update README or this guide if behavior changed

## 23. Expected Clean-Up

After tests, confirm no temporary smoke files remain:

```powershell
Get-ChildItem -Path models,test_models -File -Include *_smoke_*.json,zz_deleted_manifest_stale.json
```

Confirm generated backup files are expected before committing:

```powershell
Get-ChildItem -Path models\.backups,test_models\.backups -ErrorAction SilentlyContinue
```

Backup files are useful during manual testing but usually should not be committed unless intentionally preserving fixtures.
