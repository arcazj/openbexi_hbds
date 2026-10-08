# Layout and optimization

Models open optimized by default, including models with a saved camera view.
With **Auto Layout** enabled, choosing Grid, Radial, or Hierarchy applies that
layout immediately. **Optimize** also arranges the diagram and fits the view.
With Auto Layout disabled, choosing an algorithm keeps existing positions until
Optimize is used. **Fit View** changes the camera without moving model elements.

**Separates links**, immediately after Algorithm, is checked by default.
Models without a saved preference use separated links. An explicit unchecked
preference retains the legacy layout and routing behavior. Checking it
immediately recalculates the selected layout with extra room for parallel
relationships, separates route lanes, and keeps labels clear of hyperclass
borders. With Algorithm set to None, it recalculates links without moving nodes.
Unchecking it reapplies the original spacing for the selected algorithm.
The option is stored in `metadata.layout.separateLinks` and restored on load.
It changes diagram geometry,
not classes, containment, or relationships. Enabling it clears saved link
waypoints so they can be recalculated.
On dense models, arranging separated links can take several seconds.

Enable **Keep saved positions on load** to retain a manual arrangement. The
preference is saved as `metadata.preserveLayout`. Selecting **None** also keeps
manual positions. These options retain explicit link waypoints until Optimize
is used. The OpenBEXI Timeline model ships with a saved manual arrangement;
its **Keep saved positions on load** preference preserves that arrangement.

## Arrangement

All three algorithms measure classes together with their attribute markers and
label area. They size nested hyperclasses from the inside out, then place each
group and its descendants together. This keeps children within their visual
groups and prevents sibling groups from overlapping.

- **Grid** packs measured groups into rows and columns.
- **Radial** places groups around a ring whose spacing and aspect ratio account
  for their full dimensions. The same rule applies to children within groups.
- **Hierarchy** places source-to-target relationships on successive levels.
  Cyclic relationships share a level, and disconnected peers use compact rows.
  Relationships between descendants inform the arrangement of their groups.

Optimization changes positions and sizes and clears absolute link waypoints
from the previous arrangement. It preserves identities, attributes,
relationships, source mappings, and visual styles. Repeating an optimization or
switching away and back produces the same geometry for the same model content.

## Labels, links, and zoom

Classes and hyperclasses place their first attribute level with the existing
circular connection point. One horizontal line joins that point to the first
attribute marker; subsequent attributes have no connectors. Markers and labels
align in a compact vertical column on the right. The default clear space between
rows is 0.02 world units, adjustable from 0 to 1 using **Attribute spacing** in
the **2D attribute inspector**. The adjacent number shows the current value;
changes apply immediately to the selected attribute's entire class or hyperclass
column. Reset restores 0.02; Undo and Redo work as for other properties. The value
is saved in the owner's `rendering.attributes.spacing`, independent of attribute
data, container height, and attribute count. Rendering this list preserves the container and marker
dimensions, styling, and connection point.
Text scales with zoom and stays within its allocated area. Large diagrams provide an overview when fitted to
the window; zoom in to read individual attributes.

Attribute text defaults to twice the overall font size (24px with the default
12px overall size); explicit per-type and individual font sizes remain available.
The Timeline model's existing attribute setting is doubled from 20px to 40px.
At overview zoom, text reserves 0.34 world units in height, twice its previous
0.17-unit allowance. Row pitch includes this text area plus the chosen clear
spacing, or the marker height if larger. Changing spacing does not shrink text.

Class and hyperclass names use bold text by default. Their font size uses the
actual font's measured width, icon dimensions, and available title area, up to
the configured size. Names stay complete instead of ending in an ellipsis.
Automatic layout allows more body width for longer titles.
**Bold class and hyperclass names** controls the default independently of
attribute and link styles; individual font overrides remain available.
`rendering.titleColor` colors a title independently of its attributes. Decay
classes use dark red to distinguish lifecycle information.

Link labels reserve space around class bodies, attributes, group titles, and
other link labels and paths. Placement searches for free intervals along the
label's own route, favoring nearby positions. A label with a background can sit
on its own line; its background keeps the text readable. Automatic routes
compare clear, short paths between ports, then search around obstacles when
necessary. They avoid endpoint bodies,
unrelated nodes, attribute areas, and group titles. Links between a group and
its children attach inward. Multiple relationships use separated ports and
prefer distinct lanes when space permits. Saved manual waypoints are regenerated
when the layout is optimized. Link crossings and shared port segments can still
occur in dense graphs; avoiding nodes does not make every graph planar.

Fit View includes attribute areas, relationship routes, and label space. The
model title is larger, frameless, and has a separate area above both renderers.
It wraps on narrow screens, and the diagram and overview move below it. Panning
and zooming clip the diagram at that area's boundary. PNG/SVG exports and collaboration previews
retain the same title spacing.

Arrowheads face the camera in 3-D and retain a visible size when zoomed out.
Their default projected length is between 10 and 22 pixels; the simple satellite
model uses an 11-pixel minimum. Optional `rendering.arrowheadMinPixels` and
`rendering.arrowheadMaxPixels` override these limits. Set the minimum to `0` to
disable the lower limit. Existing arrow types and directions remain available.
These shared rendering rules apply in Models, Edit, and Tests.

Shipped relationship labels use verbs or short verb phrases. Redundant target
names are removed, while meaningful qualifiers remain (for example, **may
identify** for an unverified identity). AI generation uses the same wording
rules and defaults to Grid. Source evidence and relationship direction are
unchanged.

## Regression coverage

Run the complete checks:

```powershell
py -3.9 -B scripts/check_project.py
```

For the layout browser checks only:

```powershell
py -3.9 -B scripts/check_project.py --browser-only --browser-suite layout
```

For the Separates links checkbox, parallel lanes, label spacing, and save/reload:

```powershell
py -B scripts/check_project.py --browser-only --browser-suite separation
```

The browser checks cover all 15 shipped models, nested hyperclasses, and a
larger stress model. They exercise default loading, automatic selection, repeated optimization,
layout switching, zoom, resizing, Fit View, and save/reload. They check rendered
group containment, node and label overlap, title clearance, snapshot geometry,
manual layout preservation, and links crossing unrelated nodes.
Pure geometry checks also cover all supplied model fixtures and cyclic graphs.
The layout suite also checks that satellite link labels stay close to their
routes in all three layouts. Focused readability checks cover full class names,
title wrapping and clearance on desktop and mobile, and visible arrowheads after
a 3-D rotation. Run them separately:

```powershell
py -3.9 -B scripts/check_project.py --browser-only --browser-suite readability
```
