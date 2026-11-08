# Release notes

## 2.7 - 2026-11-08

* Add unsigned Windows x64 and ARM64 installers and portable packages targeting Windows 10 and Windows 11, with a bundled Python runtime, Start menu launch/stop shortcuts, native-architecture checks, and an uninstaller that preserves user data.
* Keep writable models, backups and logs in a separate desktop data folder. Preserve edited and intentionally deleted examples during upgrades, reuse the running local session, and handle occupied ports.
* Bundle pinned Three.js and Swagger UI dependencies so core modeling, query and API documentation work offline. Include upstream notices and verified runtime checksums.
* Retain the Commercial and Exempt Use License, free-use exemptions and earlier/third-party grants. Add Windows installation, upgrade and distribution instructions.
* Restore visible descriptions for selected query functors and added steps. Add a searchable model selector with Current session, Models and Tests groups; saved-model previews preserve the original editing session and undo history. Keep diagram/results synchronized, reject stale loads, and recover from load failures. Share compact panel controls, typography, spacing, and soft section headers across Models, Edit, Tests, Query and Help.
* Display compact Query in a 400-pixel sidebar beside the live diagram and stack it below the diagram on small screens. Use a single-line model heading, inline functor/element selectors, and soft section colors. Reduce Results to Type, Name, and Locate, with identifiers and paths in name tooltips. Add filtered Locate all across every result page and fluorescent yellow text/link highlights that preserve the current camera, model, editing selection and undo history. Omit redundant expression and highlight-count messages.
* Make Query use the active diagram automatically. Replace the source sidebar and Run/Try controls with a functor-first row of searchable typed selectors, immediate results, optional compatible steps, automatic live-model refresh, 25/50/100-row pagination, keyboard input, and source-generation checks.
* Add the Query navigation view with whole-model snapshots, typed pipelines, result inspection and location, and a searchable 141-functor reference with legacy source pages. Implement 21 canonical functors, including directed COUPLE with source/target selectors and parameterized steps. Keep only original functor names in the builder. Support static-only hosting and preserve editor state and undo history while Query is open.
* Align containment with the legacy chapters: CONT returns direct classes, CONTN classes at every nesting depth, HCONT direct hyperclasses, and CONTOF/HCONTOF their direct containing hyperclasses. Map legacy parent/child declarations to inclusion; use explicit memberships exclusively when the semantic layer is present. Reject containment cycles, preserve shared members, and document the recorded-definition subset and its limits.
* Move connection status beside the square tree icon, retain accessible state and keyboard controls, and add model/query helper tests and desktop/mobile browser regressions.
* Recompute editor title clearance when responsive side-panel transitions finish, keeping wrapped headings above the diagram.
* Remove the unused Java starter, Maven build file, wrappers, and bootstrap script. Update development and test instructions for the Python server and JavaScript browser app.

## 2.6.2 - 2026-10-08

* Add the OpenBEXI Timeline HBDS model and map all 14 inspected Timeline model files and the supplied user settings. Keep Record inside Source, Namespace inside Model, and one Model-to-Render relationship for shared rendering.
* Add the complete Timeline application recreation prompt, a model guide, and current application screenshots in the README.
* Enable **Separates links** by default, with distinct parallel routes, label clearance, and an option to restore legacy spacing. Save the preference with each model.
* Arrange loaded models before rendering, reduce routing-grid duplication, and skip label scoring for blocked positions in dense diagrams.
* Reserve room inside groups for incoming and outgoing links so their labels remain close to their routes, including the satellite model's Grid layout.
* Keep one horizontal class-to-attribute connector to the first attribute and align all attributes in a compact right-hand column. Add the live **Attribute spacing** slider, reset, undo/redo, and persistence.
* Double the default attribute text size and the Timeline model's explicit attribute size while preserving class containers, connection points, and square markers.
* Expand browser and geometry checks for separation, attribute columns, editing, and save/reload. Synchronize the application, server, API, Maven, documentation, and browser cache versions at 2.6.2.

* Align licensing with OpenBEXI Timeline's Commercial and Exempt Use License: free personal noncommercial use, student and educator activities, academic and other noncommercial research, and qualifying charities and nonprofits; paid agreements for business use unless exempt.
* Use [openbexi@gmail.com](mailto:openbexi@gmail.com) for licensing inquiries in the license, commercial guide, order form, README, Help, and licensing page.
* Preserve previous MIT and Individual Noncommercial grants and third-party notices. These terms apply to distributions expressly supplied with the updated license from October 7, 2026.

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
* At release 1.2, individual noncommercial use, including eligible student use, was free under the [Individual Noncommercial License](LICENSES/Individual-Noncommercial-1.0-legacy.txt). Companies, government bodies, and other organizations required a commercial license for material covered by that license. Earlier MIT-licensed material and third-party components retained their existing terms. See the current [LICENSE.txt](LICENSE.txt) for the expanded exemptions in later distributions.

Dense diagrams may still contain crossing links; the layout does not guarantee a crossing-free graph.
