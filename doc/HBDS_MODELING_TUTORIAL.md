# HBDS Modeling Tutorial

This tutorial creates a conservative v1 structural diagram that the current simulator can render and edit. It deliberately avoids claiming TAD, functor, inheritance, prototype, unit, or fuzzy semantics that are outside the v1 contract.

## Goal

Model a small parcel-delivery domain with one visual domain container, two classes, attributes, and a relationship.

## 1. Choose The Model Scope

Use `models/` for a maintained example. Use `test_models/` only when the file is a focused regression fixture that should run in the complete scenario suite.

Choose a lowercase underscore-separated filename, for example:

```text
parcel_delivery.json
```

Repository fixtures need non-empty `metadata.name`, `metadata.purpose`, and `metadata.regressionTags`. Test-model metadata names must match the title-cased filename expected by `tools/validate_test_models.py`.

## 2. Start With The Structural Envelope

```json
{
  "$schema": "https://openbexi.local/hbds/model/v1",
  "metadata": {
    "name": "Parcel Delivery",
    "purpose": "Demonstrate a visual hyperclass, classes, attributes, and one link.",
    "regressionTags": ["tutorial", "classes", "links"],
    "preserveLayout": true,
    "layout": {"algorithm": "none"}
  },
  "hypergraph": {
    "class": [],
    "link": []
  }
}
```

`layout.algorithm: "none"` says that explicit coordinates should be used. It does not mean that elements may omit positions.

## 3. Add A Visual Hyperclass

```json
{
  "id": "parcel_delivery_domain",
  "name": "Parcel Delivery Domain",
  "type": "hyperclass",
  "attributes": [],
  "children": ["parcel_delivery_parcel", "parcel_delivery_route"],
  "position": {"x": 0, "y": 0, "z": 0},
  "size": {"width": 8, "height": 4.5},
  "rendering": {
    "class": {
      "color": "#dbeafe",
      "borderColor": "#2563eb",
      "opacity": 0.18
    },
    "textColor": "#111827"
  }
}
```

The `children` array controls visual containment. It does not state that Parcel or Route inherits from, is an instance of, or is semantically a member of the domain.

## 4. Add Classes And Attributes

```json
{
  "id": "parcel_delivery_parcel",
  "name": "Parcel",
  "type": "class",
  "parentClassId": "parcel_delivery_domain",
  "attributes": [
    {"id": "parcel_delivery_tracking_id", "name": "trackingId"},
    {"id": "parcel_delivery_weight", "name": "weight", "value": "2.4 kg"}
  ],
  "position": {"x": -2, "y": 0, "z": 0},
  "size": {"width": 2.5, "height": 1.4},
  "rendering": {
    "class": {"color": "#ffffff", "borderColor": "#2563eb"},
    "textColor": "#111827"
  }
}
```

Create a second class with the same structure and a model-specific ID:

```json
{
  "id": "parcel_delivery_route",
  "name": "Route",
  "type": "class",
  "parentClassId": "parcel_delivery_domain",
  "attributes": [
    {"id": "parcel_delivery_route_code", "name": "routeCode"}
  ],
  "position": {"x": 2, "y": 0, "z": 0},
  "size": {"width": 2.5, "height": 1.2},
  "rendering": {
    "class": {"color": "#f0fdf4", "borderColor": "#15803d"},
    "textColor": "#111827"
  }
}
```

Repository validators require IDs to be unique across every model in the same directory. Prefix class, attribute, and link IDs with a stable model token.

## 5. Add A Relationship

```json
{
  "id": "parcel_delivery_assigned_route",
  "name": "assigned route",
  "sourceClassId": "parcel_delivery_parcel",
  "targetClassId": "parcel_delivery_route",
  "type": "association",
  "rendering": {
    "labelText": "assigned route",
    "lineColor": "#334155",
    "lineWidth": 2,
    "lineStyle": "solid",
    "arrowType": "triangle",
    "arrowDirection": "source-to-target",
    "orthogonalStyle": "auto"
  }
}
```

The string `association` and the arrow are descriptive. The runtime does not enforce cardinality, ownership, or lifecycle behavior.

## 6. Validate And Regenerate Manifests

Connected server startup regenerates both manifests. Static-only mode does not. From the repository root:

```powershell
py scripts\smoke_server.py
py tools\validate_manifests.py
py tools\validate_models.py
py tools\validate_test_models.py
py tools\lint_model_naming.py
```

If the model is under `test_models/`, run the full browser scenario suite:

```powershell
py scripts\collaboration_browser_regression.py
```

For a standard model, start connected mode and load it in both Models and Edit:

```powershell
py server.py --host 127.0.0.1 --port 8010
```

Verify initial labels, fit, pan, zoom, 2-D/3-D switching, overview navigation, and save/reload.

## 7. Add Semantics Only When They Are Explicit

Do not repurpose `parentClassId` for semantic membership or inheritance. To opt into the additive semantic contract, set `metadata.semanticVersion` to `1` and use the v2 arrays described in [Schema And Instance Examples](HBDS_SCHEMA_EXAMPLES.md):

- `hypergraph.object` for objects classified by `classId`, with values tied to class attributes by `attributeId`;
- `hypergraph.objectLink` for object relationships conforming to a structural `classLinkId`;
- `hypergraph.membership` for explicit class-to-hyperclass membership;
- `hypergraph.inheritance` for explicit subclass-to-superclass relationships.

These semantic records are optional and do not change v1 link or visual-containment behavior. Validate every referenced class, hyperclass, class link, object, and attribute definition.

Use `metadata.semanticProfiles` only for value domains that the model actually annotates. The current optional validators cover units, temporal ranges, geospatial values, fuzzy degrees/shapes, and prototype references. Use the semantic workbench to run direct, inverse, or homogeneous object-link queries; use `executeFunctorQuery()` for composed queries.

## 8. Review Questions

- Does every structural element have a stable, model-prefixed ID?
- Do all link and containment references resolve?
- Are class/hyperclass/attribute names visible immediately after load?
- Is visual containment being mistaken for semantics anywhere in the model or documentation?
- Does every `type` string have a documented meaning, or is it clearly descriptive only?
- If a value includes a unit or fuzzy degree, is its provenance and interpretation documented outside v1?
