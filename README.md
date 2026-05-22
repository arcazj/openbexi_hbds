# HBDS Graphic Simulator

An interactive browser-based simulator for **Hypergraph-Based Data Structures (HBDS)**. The app renders HBDS models as editable 2D diagrams and optional 3D scenes using Three.js.

[Live Demo to go throught diferrent model](https://arcazj.github.io/openbexi_hbds/index.html)

![HBDS Bridge and road model](pictures/HBDS_Model.JPG)

[Live Demo to build a new HDBS model](https://arcazj.github.io/openbexi_hbds/test_dynamic_hbds_layout.html)
![HDBS builder Lab](pictures/HBDS_LAB.PNG)

## Features

* **2D and 3D views**: Switch between an editable 2D canvas and an orbitable 3D view.
* **Sample model library**: Load predefined JSON models from the `models/` directory.
* **Class, hyperclass, and link rendering**: Visualize nested hyperclasses, attributes, and relationships between classes.
* **Direct manipulation**: Drag classes and hyperclasses in editable mode.
* **Layout tools**: Fit models to the canvas and optimize placement with `grid`, `hierarchy`, or `radial` layout algorithms.
* **Overview minimap**: Navigate larger models with the built-in model overview.
* **Model export**: Save the current scene as a JSON file.
* **Dynamic layout test page**: Use `test_dynamic_hbds_layout.html` to add, delete, link, and export model elements during development.

## Built With

* [Three.js](https://threejs.org/)
* Plain HTML, CSS, and JavaScript ES modules

## Getting Started

The simulator runs entirely in the browser, but it must be served from a local web server. Opening `index.html` directly with the `file://` protocol will not work reliably because the app uses ES modules and loads JSON model files.

### Prerequisites

Use a modern browser and one of the following local server options:

* Python 3
* Any static file server that serves this repository root

### Run Locally

```sh
git clone https://github.com/arcazj/openbexi_hbds.git
cd openbexi_hbds
python -m http.server 8000
```

Then open:

* Main simulator: `http://localhost:8000/`
* Dynamic layout test page: `http://localhost:8000/test_dynamic_hbds_layout.html`

On systems where `python` points to Python 2, use:

```sh
python3 -m http.server 8000
```

## Usage

* **Select a model** from the control panel to load a sample from `models/`.
* **Enable 3-D View** to rotate the scene with the mouse.
* **Editable mode** controls whether model nodes can be dragged.
* **Optimize Layout** recalculates node placement with the selected layout algorithm.
* **Fit Model** recenters and zooms the camera around the current model.
* **Save Model** downloads the current HBDS graph as JSON.

Navigation:

* **Pan**: Right-click and drag, or use a two-finger trackpad drag.
* **Zoom**: Use the mouse wheel or trackpad scroll.
* **Rotate**: In 3D mode, left-click and drag.
* **Move nodes**: In 2D editable mode, left-click and drag a class or hyperclass.

## Models

Models live in the `models/` directory as JSON files. The main page discovers its models from `models/models_manifest.json` at runtime.

When adding a new model for the main simulator:

1. Add the JSON file under `models/`.
2. Add an entry to `models/models_manifest.json`.
3. Serve the app locally and verify the model loads.

You can validate model manifest integrity with:

```sh
python3 tools/validate_manifests.py
```

You can lint naming consistency (HBDS/HDBS labels, spaced values, missing files) with:

```sh
python3 tools/lint_model_naming.py
```

## Project Structure

```text
.
|-- css/                         # Application styles
|-- js/                          # HBDS rendering, model, layout, and link modules
|-- models/                      # Sample HBDS JSON models
|-- pictures/                    # README and project images
|-- index.html                   # Main simulator
|-- test_dynamic_hbds_layout.html # Development/test UI for dynamic edits
`-- pom.xml                      # Java/Maven scaffold, not required for the browser app
```

## Roadmap

* [ ] Expand hyperclass editing workflows.
* [ ] Add richer relationship editing between hyperclasses and classes.
* [ ] Implement search or filtering for classes and attributes.
* [ ] Add model validation feedback in the UI.
* [ ] Move the main model selector to manifest-based discovery.

See the [open issues](https://github.com/arcazj/openbexi_hbds/issues) for proposed features and known issues.

## Contributing

1. Fork the project.
2. Create a feature branch: `git checkout -b feature/my-change`.
3. Commit your changes: `git commit -m "Describe the change"`.
4. Push the branch: `git push origin feature/my-change`.
5. Open a pull request.

## License

Distributed under the MIT License. See [LICENSE.txt](LICENSE.txt) for details.
