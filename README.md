# Project Title: HDBS Graphic Simulator

## About The Project

This project provides an interactive visualization tool for **Hypergraph-Based Data Structures (HBDS)**. Built entirely with web technologies, it allows users to load, view, and manipulate complex data models in both 2D and 3D space directly in the browser.

### Live Demo

[Live Demo](https://arcazj.github.io/openbexi_hbds/index.html)

![HBDS Human class](pictures/HBDS_Model.JPG)

### Key Features:

* **Interactive 2D & 3D Views**: Seamlessly switch between a 2D pannable layout and a full 3D orbital view.
* **Dynamic Model Loading**: Load different HBDS models on-the-fly from external JSON files.
* **Direct Manipulation**: Drag and drop class entities to organize your diagram in 2D view.
* **Fallback Gracefully**: Automatically loads a default model if a specified one isn't found.

### Built With

* [![Three.js][Three.js]][Three.js-url]

---

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

This project requires no special installations or package managers like npm. You only need a modern web browser and a local web server to handle ES module imports.

### Installation

1.  **Clone the repo**
    ```sh
    git clone https://github.com/arcazj/openbexi_hbds.git
    ```
2.  **Navigate to the project directory**
    ```sh
    cd openbexi_hbds
    ```
3.  **Run a local web server**
    Because the simulator uses ES Modules (`import`), you must serve the `index.html` file. You cannot open it directly via the `file://` protocol. A simple built-in Python server works perfectly:

    * For **Python 3**:
        ```sh
        python3 -m http.server
        ```
    * For **Python 2**:
        ```sh
        python -m SimpleHTTPServer
        ```
4.  **Open the simulator**
    Navigate to `http://localhost:8000` in your web browser.

---

## Usage

* **Select a Model**: Use the dropdown menu on the top right to load different HBDS models.
* **Toggle 3D View**: Check the "Enable 3-D View" box to switch from the default 2D layout to a fully rotatable 3D view.
* **Navigate the Scene**:
    * **Pan**: Right-click and drag (or two-finger drag on a trackpad).
    * **Zoom**: Use the mouse scroll wheel.
    * **Rotate** (in 3D view only): Left-click and drag.
* **Drag Classes**: In 2D view, left-click and drag any class rectangle to move it around the canvas.

To add new models, simply place your `.json` files in the `/models` directory and they will appear in the dropdown.

---

## Roadmap

* [ ] Add support for hyperclasses.
* [ ] Add support for defining relationships between hyperclasses and classes.
* [ ] Implement a search or filter feature for attributes.
* [ ] Allow real-time editing of class properties from the UI.

See the [open issues](https://github.com/arcazj/openbexi_hbds/issues) for a full list of proposed features (and known issues).

---

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

---
## Acknowledgments

* [Three.js](https://threejs.org/)


<!-- MARKDOWN LINKS & IMAGES -->
[Three.js]: https://img.shields.io/badge/three.js-000000?style=for-the-badge&logo=three.js&logoColor=white
[Three.js-url]: https://threejs.org/

---

## HBDS Layout and Hub-to-Hub Link-Routing Prompt (Balanced Layout Addendum)

You are a senior JavaScript, Three.js, computational-geometry, graph-layout, and HBDS / HDBS visualization expert.

Improve the HBDS layout engine so the final diagram is visually balanced, compact, readable, and collision-free.

The goal is not only to prevent overlap. The goal is to produce a smart, well-balanced diagram where classes and hyperclasses are close enough to be visually related, but never stuck together, never overlapping, and never spread so far apart that the diagram becomes hard to read.

### Critical layout requirements

#### 1) No overlap is ever allowed

Classes, hyperclasses, nested hyperclasses, attributes, hubs, labels, and link labels must never overlap.

The overlap test must use the full visual footprint of each element, not only the class or hyperclass body.

The full footprint of a class includes:

- class body
- title
- all attributes
- attribute markers
- attribute labels
- attribute connection lines if visible
- hubs
- selection outline
- padding

The full footprint of a hyperclass includes:

- hyperclass container
- hyperclass title
- hyperclass attributes
- hyperclass attribute markers
- hyperclass attribute labels
- hyperclass hubs
- all child class footprints
- all nested hyperclass footprints
- internal padding
- routing margin
- selection outline

If any overlap is detected, the layout must be rejected and recomputed.

#### 2) Elements must not be too close

Classes and hyperclasses must not touch or appear visually glued together.

Define spacing rules:

```js
const LAYOUT_SPACING = {
  minGap: 0.45,
  idealGap: 1.15,
  maxPreferredGap: 3.5,
  siblingGapX: 0.85,
  siblingGapY: 0.85,
  topLevelGapX: 1.35,
  topLevelGapY: 1.35,
  hyperclassInnerPadding: 0.8,
  attributePadding: 0.25,
  routingChannelGap: 0.55
};
```

Rules:

- If two unrelated top-level objects are closer than `minGap`, separate them.
- If sibling children inside the same hyperclass are closer than `siblingGapX` or `siblingGapY`, separate them.
- If attributes are too close to another class, hyperclass, or attribute group, increase space or resize the owner.
- If a child class is too close to the hyperclass border, enlarge the hyperclass or reposition the child.
- If link paths are too close to class bodies or attributes, reroute the link.

#### 3) Elements must not be too far apart

The optimizer must avoid excessive whitespace and over-spreading.

A readable diagram should be compact and balanced.

Rules:

- Related nodes should remain visually near each other.
- Linked classes and hyperclasses should not be unnecessarily far apart.
- Children inside a hyperclass should use available space efficiently.
- Top-level hyperclasses should form a balanced composition, not a long sparse chain.
- The diagram should avoid very wide or very tall layouts unless required by the model structure.

Add a distance penalty:

```js
function distanceBalancePenalty(layout) {
  // Penalize linked nodes that are too far apart.
  // Penalize sibling nodes that are unnecessarily far apart.
  // Penalize excessive whitespace inside hyperclasses.
  // Penalize extreme diagram aspect ratios.
}
```

#### 4) Use a smart balance score

The layout engine must optimize for both safety and visual quality.

Hard constraints must dominate:

```js
function scoreLayout(layout) {
  return (
    10000000 * hardOverlapPenalty(layout) +
    8000000  * attributeOverlapPenalty(layout) +
    7000000  * childContainmentPenalty(layout) +
    6000000  * linkThroughNodePenalty(layout) +
    5000000  * linkThroughAttributePenalty(layout) +

    500000   * tooClosePenalty(layout) +
    250000   * tooFarPenalty(layout) +
    200000   * badHyperclassWhitespacePenalty(layout) +
    150000   * unbalancedAspectRatioPenalty(layout) +

    50000    * linkCrossingPenalty(layout) +
    20000    * linkBendPenalty(layout) +
    10000    * linkLengthPenalty(layout) +
    5000     * diagramCenteringPenalty(layout)
  );
}
```

Interpretation:

- Overlap is unacceptable.
- Containment failure is unacceptable.
- Links crossing objects is unacceptable.
- Elements being too close is bad.
- Elements being too far apart is also bad.
- The best diagram is compact, balanced, readable, and collision-free.

#### 5) Balanced top-level distribution

Top-level classes and hyperclasses must be distributed evenly around the diagram.

The layout should avoid:

- large empty gaps
- long diagonal chains
- crowded center clusters
- hyperclasses pushed too far away
- hyperclasses touching each other
- unbalanced left-heavy or right-heavy layouts
- very tall or very wide diagrams unless necessary

Use a top-level packing strategy:

```js
function layoutTopLevelNodesBalanced(topLevelNodes, layout, options) {
  // Use full footprints.
  // Place large hyperclasses first.
  // Place linked hyperclasses near each other.
  // Keep minimum gaps.
  // Avoid excessive distance.
  // Prefer a balanced rectangular composition.
  // Leave routing channels between major groups.
}
```

Suggested behavior:

- Sort top-level nodes by size, placing larger hyperclasses first.
- Group related nodes based on link density.
- Place related groups near each other.
- Use a grid or force-assisted packing strategy.
- Keep the diagram centered around the origin.
- Preserve readable routing corridors between groups.
- After placement, run collision validation and compacting passes.

#### 6) Balanced child layout inside hyperclasses

Children inside a hyperclass must be arranged using deterministic grid logic, but the result must also be visually balanced.

Required grid rules:

- 1 child: 1 x 1
- 2 children: vertical, 1 column x 2 rows
- 3 children: vertical, 1 column x 3 rows, unless a wider layout is clearly better
- 4 children: 2 x 2
- 5 or 6 children: 2 columns, filled row by row
- 7, 8, or 9 children: 3 columns, filled row by row
- 10 to 16 children: 4 columns, filled row by row
- more than 16: use a near-square grid

The layout must account for the full footprint of each child, including its attributes.

Example:

```js
function getGridSpec(childCount) {
  if (childCount <= 0) return { columns: 0, rows: 0 };
  if (childCount === 1) return { columns: 1, rows: 1 };
  if (childCount === 2) return { columns: 1, rows: 2 };
  if (childCount === 3) return { columns: 1, rows: 3 };
  if (childCount <= 6) return { columns: 2, rows: Math.ceil(childCount / 2) };
  if (childCount <= 9) return { columns: 3, rows: Math.ceil(childCount / 3) };
  if (childCount <= 16) return { columns: 4, rows: Math.ceil(childCount / 4) };

  const columns = Math.ceil(Math.sqrt(childCount));
  return { columns, rows: Math.ceil(childCount / columns) };
}
```

Each cell must be large enough for the full footprint of the class or nested hyperclass placed in it.

If the grid does not fit, increase the hyperclass size.

#### 7) Hyperclass resizing must be intelligent

A hyperclass must grow when needed, but it must not grow excessively.

Resize rules:

- Grow just enough to contain all children, nested hyperclasses, and attributes.
- Add internal padding.
- Preserve routing channels.
- Preserve title and attribute regions.
- Do not leave huge unused whitespace.
- Do not shrink below the original model size unless explicitly allowed.

Add a compacting step:

```js
function compactHyperclassAfterLayout(hyperNode, layout, options) {
  // After children are placed, compute the minimum safe container size.
  // Keep padding and routing margin.
  // Avoid oversized empty areas.
}
```

#### 8) Attributes must stay inside their owner and be included in balance

Attributes must not be external floating objects unless the model explicitly supports external attribute panels.

Default rule:

- class attributes stay inside the class border
- hyperclass attributes stay inside the hyperclass border
- attributes never overlap child content
- attributes never overlap hubs
- attributes never overlap other attributes

If an owner has many attributes:

- increase owner height
- increase owner width for long labels
- reserve a clean internal attribute region
- then recompute the parent hyperclass size if needed

#### 9) Links must not be direct obstacle-crossing links

Links must not be simple direct straight lines across the diagram.

Links must use hub-to-hub process-flow routing with rounded orthogonal paths.

Correct visual style:

- route starts at source hub
- route leaves source with a short clean segment
- route bends around classes, hyperclasses, and attributes
- route avoids object interiors
- route uses rounded elbows or smoothed corners
- route ends at target hub
- arrowhead points into the target hub

Incorrect visual style:

- direct diagonal line through objects
- direct straight line across hyperclasses
- line passing over attributes
- line passing through class bodies
- line ending at borders instead of hubs

#### 10) Rounded orthogonal link routing

Use orthogonal routing with rounded corners.

Route structure:

```js
[
  sourceHubPoint,
  bendPoint1,
  bendPoint2,
  bendPoint3,
  targetHubPoint
]
```

Then draw the route as:

- straight horizontal or vertical segments
- rounded elbows at bend points
- final arrowhead at target hub

Required helper:

```js
function createRoundedOrthogonalPath(pathPoints, radius) {
  // Convert Manhattan route points into a smooth path
  // with rounded corners while preserving hub endpoints.
}
```

Use:

```js
const ROUTING_OPTIONS = {
  cornerRadius: 0.18,
  minSegmentLength: 0.35,
  obstaclePadding: 0.55,
  attributePadding: 0.35,
  linkChannelGap: 0.28
};
```

#### 11) Links must route around obstacles

Every link route must consider obstacles:

- class footprints
- hyperclass footprints
- nested hyperclass footprints
- attribute boxes
- attribute labels
- link labels
- hubs that are not endpoints

A link may only enter the source and target objects. It should not cross unrelated objects.

Required helper:

```js
function routeAroundObstacles(sourceHub, targetHub, obstacles, options) {
  const candidates = buildRoundedOrthogonalRouteCandidates(sourceHub, targetHub, obstacles, options);

  let best = null;

  for (const candidate of candidates) {
    const score =
      1000000 * routeObstacleIntersectionPenalty(candidate, obstacles) +
      500000  * routeAttributeIntersectionPenalty(candidate, obstacles) +
      100000  * routeTooCloseToObstaclePenalty(candidate, obstacles) +
      50000   * routeCrossingPenalty(candidate) +
      1000    * routeLengthPenalty(candidate) +
      500     * routeBendPenalty(candidate);

    if (!best || score < best.score) {
      best = { route: candidate, score };
    }
  }

  return best.route;
}
```

#### 12) Route candidates must be flexible

Do not rely on one fixed route.

Generate candidates such as:

- horizontal-first route
- vertical-first route
- route above obstacles
- route below obstacles
- route left around obstacles
- route right around obstacles
- corridor route between hyperclasses
- outer route around a large hyperclass
- multi-bend route around attribute blocks

Required helper:

```js
function buildRoundedOrthogonalRouteCandidates(sourceHub, targetHub, obstacles, options) { ... }
```

#### 13) Links must not stick to objects

Links should not run too close to class or hyperclass borders.

Even if a link does not intersect an object, it should maintain a minimum clearance.

Rules:

- keep links at least `obstaclePadding` away from class and hyperclass footprints
- keep links at least `attributePadding` away from attributes
- keep parallel links separated by `linkChannelGap`
- keep labels away from link corners and object bodies

#### 14) Parallel links must be separated

When multiple links connect similar regions or share hubs, they must use separate channels.

Required helper:

```js
function spreadParallelAndNearbyLinks(links, options) {
  // Detect links with same source/target pair or nearby route channels.
  // Assign different offsets or route corridors.
  // Preserve hub endpoints.
}
```

#### 15) Link labels must be placed intelligently

Labels must be placed on a clear segment.

Rules:

- prefer the longest segment
- avoid rounded corners
- avoid classes
- avoid hyperclasses
- avoid attributes
- avoid other labels
- use a small label background
- offset the label from the segment when needed

Required helper:

```js
function placeLinkLabelOnBestClearSegment(link, route, layout, options) { ... }
```

#### 16) Balanced global optimization loop

The layout algorithm must combine these forces:

- strong repulsion for overlap prevention
- mild attraction between linked nodes
- spacing normalization so nodes are not too close or too far
- compacting force to reduce excessive whitespace
- alignment force for clean rows and columns
- containment force for children inside hyperclasses
- routing corridor preservation

Suggested loop:

```js
function optimizeBalancedHBDSLayout(layout, options) {
  let bestLayout = cloneLayout(layout);
  let bestScore = scoreLayout(layout);

  for (let pass = 0; pass < options.maxPasses; pass++) {
    layoutHierarchyBottomUp(layout.rootNodes, layout, options);
    layoutHierarchyTopDown(layout.rootNodes, layout, options);

    layoutTopLevelNodesBalanced(layout.topLevelNodes, layout, options);
    normalizeSpacing(layout, options);
    compactExcessWhitespace(layout, options);

    routeAllLinksRoundedOrthogonal(layout, options);

    const validation = validateNoOverlap(layout);
    if (!validationIsClean(validation)) {
      cleanupOverlapsAndResize(layout, validation, options);
    }

    const score = scoreLayout(layout);

    if (score < bestScore) {
      bestLayout = cloneLayout(layout);
      bestScore = score;
    }
  }

  return bestLayout;
}
```

#### 17) Spacing normalization

Add a spacing-normalization pass.

Required helper:

```js
function normalizeSpacing(layout, options) {
  // If nodes are closer than minGap, push them apart.
  // If linked nodes are farther than maxPreferredGap, gently pull them closer.
  // If sibling nodes have uneven spacing, regularize the spacing.
  // If a hyperclass has excessive whitespace, compact it.
}
```

#### 18) Acceptance criteria

The final diagram must satisfy all of these:

- no class overlaps another class
- no hyperclass overlaps another hyperclass
- no class overlaps a hyperclass unless it is intentionally contained inside it
- no attributes overlap any other element
- every child class is fully inside its parent hyperclass
- every nested hyperclass is fully inside its parent hyperclass
- elements are not stuck together
- elements are not excessively far apart
- the diagram is visually balanced around the center
- the layout uses space efficiently
- links are hub-to-hub
- links are not direct diagonal obstacle-crossing lines
- links use rounded orthogonal routing
- links route around classes, hyperclasses, and attributes
- link labels remain readable
- arrowheads remain attached to target hubs
- saving and reloading preserves the balanced layout

Expected final result:

The final HBDS diagram must look smart, balanced, compact, and professional. Classes and hyperclasses must never overlap, including all attributes and labels. Elements should have comfortable spacing: not too far apart, not too close, and never stuck together. Hyperclasses must resize intelligently to contain their recursive children. Links must not be direct lines through objects; they must use rounded hub-to-hub orthogonal routes around classes, hyperclasses, and attributes. The diagram should feel intentionally composed, readable, and well balanced.

