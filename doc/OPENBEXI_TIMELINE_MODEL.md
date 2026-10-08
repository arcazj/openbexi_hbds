# OpenBEXI Timeline HBDS model

HBDS **2.6.2** includes [openbexi_timeline.json](../models/openbexi_timeline.json),
a conceptual model of Timeline presentation, users, filters, sources, and records.
Choose **openbexi timeline** in the **Models** selector to explore it.

![OpenBEXI Timeline in the HBDS Models viewer](../pictures/openbexi_timeline.png)

This screenshot is captured from the running Models viewer with the shipped
model, its saved positions, and separated links enabled. Attribute text is larger,
and each class has a single connector to its first attribute.

## Classes and relationships

The diagram has 19 nodes (17 classes and two hyperclasses), 25 relationships,
and 125 attributes. Class names are nouns; relationship labels are verbs.

| Element | Placement and meaning |
| --- | --- |
| User | Outside the presentation model. `role` is an attribute. Users create, update, and delete models and filters. |
| Model | Presentation hyperclass with its own attributes, including name, dimensions, and colors. It connects to Source and uses Render. |
| Namespace | Inside Model. Describes the namespace of a presentation. Source also has its own namespace attribute. |
| Parameter, Band, Zone, Range, Focus, Tick, Grouping, Condition, Header, Scale | Inside Model; describe the presentation's nested settings. |
| Source | Data source hyperclass containing Rule, Time, and Record. |
| Record | Inside Source. Represents the records supplied to a presentation. |
| Filter | Outside both hyperclasses. `Filter —filters→ Record`; `regex` holds the expression. |
| Render | Outside Source and Model. One `Model —uses→ Render` link expresses shared rendering. |

Within the Timeline domain, classes nested inside Model inherit its rendering
settings, with local overrides where supported. The Model node records that rule
in `extensions.openbexiTimeline.renderInheritance`; the diagram avoids
duplicating a `uses` link for each nested class. This is a domain description,
separate from the HBDS viewer's own `rendering` fields.

Filter has no `backgroundColor` attribute. The source mapping preserves the
legacy `filter_value` key and its relationship to the conceptual `regex`
attribute. Keep the original serialized Timeline contracts when building
adapters; conceptual class names do not change those payloads automatically.

## Source coverage and recreation prompt

The source audit covers all 14 JSON files inspected under the companion
OpenBEXI Timeline `models/` directory on October 8, 2026, plus the supplied user
settings. The model metadata contains source hashes and mappings for 123 model
paths and 43 settings paths, with no unmapped paths in that inspected inventory.

The [complete recreation prompt](../prompts/openbexi_timeline_prompt.MD) describes
the Timeline application from its inspected **2.6.1** baseline, including data
contracts, rendering, APIs, model editing, deployment, and acceptance checks.
That source version is independent of this **HBDS 2.6.2** release. The prompt
distinguishes existing behavior, HBDS companion requirements, and proposed
extensions.

## Layout and attributes

**Separates links** follows Algorithm in **Layout and view** and is checked by
default. It separates parallel links and labels and reserves border clearance.
Uncheck it to restore legacy spacing. With Algorithm **None**, changing it keeps
node positions and recalculates routes. Other algorithms recalculate the
arrangement even when Auto Layout is off.

Attributes remain outside the right edge of each class or hyperclass. ATT1
aligns with the existing circular connection point; one horizontal line joins
it to ATT1's square marker. All subsequent markers and labels align vertically
without additional connectors. The default clear row gap is **0.02 world units**.

Select an attribute and use **Attribute spacing** in the **2D attribute
inspector** to adjust the entire owner's column from 0 to 1. The slider and
number stay synchronized; Reset restores 0.02. Changes support undo/redo and
save/reload through the owner's `rendering.attributes.spacing`.

Attribute text defaults to twice the overall font size. This model explicitly
uses 40px attribute text, doubled from its previous 20px setting; zoom and
available display space determine its rendered size. See
[Layout and optimization](LAYOUT_OPTIMIZATION.md) for all layout rules.

## Validation

Run the complete release checks from the repository root:

```powershell
py -B scripts/check_project.py
```

For the focused attribute and separated-link browser checks:

```powershell
py -B scripts/check_project.py --browser-only --browser-suite separation
```

The checks run in a temporary workspace to preserve local models. They cover
the Timeline model's geometry, connectors, parallel links, labels, spacing
controls, font defaults, undo/redo, read-only state, and save/reload.
