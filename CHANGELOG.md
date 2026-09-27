# Release notes

## 1.2 - 2026-09-27

### Diagram layout and readability

* Improve Grid, Radial, and Hierarchy layouts for nested groups, classes, attributes, and relationship labels.
* Reserve space for the model title in the viewer, editor, and image exports.
* Use bold class and hyperclass names with text sizing based on available space and zoom.
* Optimize models on load by default, with a **Keep saved positions on load** option for manual layouts.
* Route links around diagram elements, favor shorter clear paths, and use concise verb labels while preserving relationship qualifiers.

### Satellite models and AI support

* Rebuild the simple satellite model from the local space JSON sources, including decay records, decay predictions, refresh status, and documented source evidence.
* Retain the complete satellite structure 2 model and the other example models.
* Improve AI modeling prompts, validation, selective change previews, save, rollback, and provider support.

### Validation and licensing

* Expand layout, visual, font, export, AI, and collaboration regression coverage across the 14 shipped models.
* Individual noncommercial use, including eligible student use, is free under [LICENSE.txt](LICENSE.txt). Companies, government bodies, and other organizations require a commercial license for material covered by this license. Earlier MIT-licensed material and third-party components retain their existing terms.

Dense diagrams may still contain crossing links; the layout does not guarantee a crossing-free graph.
