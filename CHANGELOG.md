# Release notes

## 1.2.1 - 2026-09-27

* Shorten the README, add fresh Satellite World Simple Structure and Transportation Links illustrations, and move server/AI setup details into a focused guide.
* Remove obsolete documentation images and synchronize application, server, API, and Maven version references.
* Fix Models-view switching when arrow sizing runs before a new batch of links has been routed.

* Recheck all 32 local space source files and preserve the simple satellite model's structure and provenance. Clarify relationship verbs, save a clearer hierarchy, and enlarge target arrows.
* Show complete class and hyperclass names, keep link labels close to their routes, and separate shared ports and route lanes where space permits.
* Use a larger frameless title that wraps above the diagram and overview on narrow screens. Keep arrowheads visible in 2-D and 3-D across Models, Edit, and Tests.
* Add desktop, mobile, and 3-D readability checks alongside the full model layout regression suite.

## 1.2 - 2026-09-27

### Diagram layout and readability

* Improve Grid, Radial, and Hierarchy layouts for nested groups, classes, attributes, and relationship labels.
* Reserve space for the model title in the viewer, editor, and image exports.
* Use bold class and hyperclass names with text sizing based on available space and zoom.
* Optimize models on load by default, with a **Keep saved positions on load** option for manual layouts.
* Route links around diagram elements, favor shorter clear paths, and use concise verb labels while preserving relationship qualifiers.

### Satellite models and AI support

* Rebuild the simple satellite model from the local space JSON sources, including historical decay records, refresh status, and documented source evidence. Decay predictions are not present in the inspected source snapshot.
* Retain the complete satellite structure 2 model and the other example models.
* Improve AI modeling prompts, validation, selective change previews, save, rollback, and provider support.

### Validation and licensing

* Expand layout, visual, font, export, AI, and collaboration regression coverage across the 14 shipped models.
* Individual noncommercial use, including eligible student use, is free under [LICENSE.txt](LICENSE.txt). Companies, government bodies, and other organizations require a commercial license for material covered by this license. Earlier MIT-licensed material and third-party components retain their existing terms.

Dense diagrams may still contain crossing links; the layout does not guarantee a crossing-free graph.
