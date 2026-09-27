# Layout and optimization

With **Auto Layout** enabled, choosing Grid, Radial, or Hierarchy applies that
layout immediately. **Optimize** also arranges the diagram and fits the view.
With Auto Layout disabled, choosing an algorithm keeps existing positions until
Optimize is used. **Fit View** changes the camera without moving model elements.

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

Optimization changes positions and sizes. It preserves identities, attributes,
relationships, source mappings, and visual styles. Repeating an optimization or
switching away and back produces the same geometry for the same model content.

## Labels, links, and zoom

Attribute rows use the available class height. Text scales with zoom and stays
within its allocated area. Large diagrams provide an overview when fitted to
the window; zoom in to read individual attributes.

Link labels reserve space around class bodies, attributes, group titles, and
other link labels. Automatic routes avoid unrelated nodes and their attribute
areas. When a simple lane adjustment remains blocked, the router searches for
an orthogonal path around obstacles. Explicit `rendering.routePoints` remain
under the model author's control. Link crossings can still occur in dense
graphs; avoiding nodes does not make every graph planar.

Fit View includes attribute areas, relationship routes, and label space.

## Regression coverage

Run the complete checks:

```powershell
py -3.9 -B scripts/check_project.py
```

For the layout browser checks only:

```powershell
py -3.9 -B scripts/check_project.py --browser-only --browser-suite layout
```

The browser checks cover both satellite models, nested hyperclasses, and a
larger stress model. They exercise automatic selection, repeated optimization,
layout switching, zoom, resizing, Fit View, and save/reload. They check rendered
group containment, node and label overlap, and links crossing unrelated nodes.
Pure geometry checks also cover all supplied model fixtures and cyclic graphs.
