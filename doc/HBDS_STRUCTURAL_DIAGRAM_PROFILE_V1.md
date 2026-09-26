# HBDS Structural Diagram Profile v1

Status: project specification for the current simulator data contract

Schema: [`../schemas/hbds-structural-diagram-profile-v1.schema.json`](../schemas/hbds-structural-diagram-profile-v1.schema.json)

## 1. Purpose

This profile defines the JSON structure that the current HBDS Graphic Simulator can load, validate structurally, edit, render, and save. It is a diagram-interchange profile. It does not claim to encode the complete HBDS theory described by the historical course material.

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY describe conformance requirements.

## 2. Conformance Layers

Three layers must not be confused:

1. **Structural profile conformance** means that an instance satisfies the v1 JSON Schema and the cross-reference rules in this document.
2. **Runtime acceptance** means that the current server and browser can load the instance. The runtime supplies defaults for several omitted visual fields.
3. **Repository fixture conformance** adds project-maintenance rules enforced by `tools/validate_models.py`, `tools/validate_test_models.py`, and `tools/validate_manifests.py`.

Repository fixtures require metadata such as `name`, `purpose`, and non-empty `regressionTags`. Those fields are useful but are not core requirements for every external runtime document.

## 3. Instance Identification

An instance MAY declare its schema:

```json
{
  "$schema": "https://openbexi.local/hbds/model/v1"
}
```

The current model collection already uses that URI. It identifies this structural profile; it is not an internet endpoint requirement.

An instance MAY also provide `metadata.version`. Consumers MUST NOT infer unsupported semantic behavior solely from that value.

## 4. Top-Level Structure

A conforming document MUST be a JSON object and MUST contain `hypergraph`.

```json
{
  "$schema": "https://openbexi.local/hbds/model/v1",
  "metadata": {},
  "hypergraph": {
    "class": [],
    "link": []
  }
}
```

`hypergraph.class` and `hypergraph.link` MUST be arrays. Unknown top-level and nested properties MAY be preserved for forward compatibility, but a producer SHOULD place experimental fields under a clearly named extension object.

## 5. Metadata

`metadata` is optional for structural runtime documents and required by the repository fixture policy.

Common fields are:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable model identifier when one is available. |
| `name` | string | Human-readable model name. |
| `description` | string | Longer model description. |
| `purpose` | string | Intended use, especially for fixtures. |
| `version` | string | Producer-controlled model version. |
| `regressionTags` | string array | Capabilities exercised by a repository fixture. |
| `preserveLayout` | boolean | Requests preservation of explicit diagram coordinates. |
| `layout` | object | Layout algorithm and saved fit/view metadata. |
| `font` | object | Model-wide and per-label-category font policy. |
| `sceneSettings` | object | Background and lighting settings. |

### 5.1 Layout

`metadata.layout.algorithm` SHOULD be one of `none`, `grid`, `hierarchy`, or `radial`. `none` means that explicit positions are authoritative. A saved `layout.fit` object is viewport state, not HBDS domain semantics.

When `preserveLayout` is true, every visible class-like element SHOULD have an explicit numeric position and size.

### 5.2 Font Policy

The model-level font object supports:

- `size`, `family`, `bold`, `italic`, and `underline`;
- `classSize`, `hyperclassSize`, `attributeSize`, and `linkSize` category overrides.

Element-level font fields MAY override category values. Producers SHOULD prefer `font.size`; legacy `fontSize` and `labelFontSize` paths remain compatibility inputs. Font sizes MUST be positive numbers when present.

### 5.3 Scene Settings

`sceneSettings.background` is a CSS color. `ambient`, `front`, and light-source intensities are non-negative numbers. Each source direction is a numeric `x`, `y`, `z` vector.

## 6. Classes And Hyperclasses

Every item in `hypergraph.class` is a class-like diagram node.

Core fields:

| Field | Requirement | Meaning |
| --- | --- | --- |
| `id` | MUST | Non-empty identifier unique within the document. |
| `name` | SHOULD | Visible label. Repository visual fixtures should always provide it. |
| `type` | MAY | `hyperclass` identifies a hyperclass; other strings are rendered as regular class categories. |
| `attributes` | MAY | Attribute records or legacy strings. Defaults to an empty array. |
| `position` | MAY | Numeric `x`, `y`, and optional `z` diagram coordinates. |
| `size` | MAY | Positive `width` and `height`, with optional positive `depth`. |
| `parentClassId` | MAY | Visual containment reference only. |
| `children` | MAY | Visual containment references only. |
| `rendering` | MAY | Visual style and label settings. |
| `visible` | MAY | Visibility toggle. |
| `locked` | MAY | Layout/direct-manipulation lock request. |

### 6.1 Visual Containment

`parentClassId` and `children` express diagram containment. They MUST NOT be interpreted as inheritance, type membership, instantiation, prototype derivation, set inclusion, or a formal HBDS functor.

Every referenced parent or child MUST identify an item in the same `hypergraph.class` array. Producers SHOULD keep the two directions consistent: if A lists B in `children`, B should use A as `parentClassId`.

Semantic class-to-hyperclass membership belongs to the additive v2 `hypergraph.membership` array. Semantic inheritance belongs to v2 `hypergraph.inheritance`.

### 6.2 Attributes

The preferred attribute form is:

```json
{
  "id": "server_status",
  "name": "status",
  "value": "active",
  "font": {
    "size": 12
  }
}
```

An attribute object MUST have a non-empty `id`. Its `name`, `value`, `description`, `type`, `font`, and `rendering` fields are optional. Legacy scalar attributes and null placeholders are accepted for compatibility and edge-case fixtures, but null placeholders SHOULD be removed and scalars SHOULD be migrated to objects before collaborative editing.

## 7. Links

Every item in `hypergraph.link` represents a diagram relationship.

Required fields:

- `id`: unique non-empty link identifier;
- `sourceClassId`: ID of an existing class-like item;
- `targetClassId`: ID of an existing class-like item.

Optional fields include `name`, `description`, `type`, `attributes`, `allowSelfLink`, `visible`, and `rendering`.

A self-link SHOULD set `allowSelfLink` to true. Producers MUST NOT use legacy `source` and `target` in canonical v1 output; AI normalization may accept those aliases only as input.

### 7.1 Link Rendering

Known values include:

- `lineStyle`: `solid`, `dashed`, `dotted`, `thick`, or `thin`;
- `arrowDirection`: `source-to-target`, `target-to-source`, `bidirectional`, or `none`;
- `arrowType`: `triangle`, `outline`, `chevron`, `double-chevron`, `triple-chevron`, `filled-triangle`, `hollow-triangle`, `dotted`, `bar-arrow`, `double-bar-arrow`, `cone`, `diamond`, or `none`;
- `orthogonalStyle`: `auto`, `horizontal`, or `vertical`;
- `sourcePortSide` and `targetPortSide`: `top`, `right`, `bottom`, or `left`.

Positive numeric fields include `lineWidth`, `arrowheadSize`, `arrowheadScale`, `maxArrowheadSize`, and `labelFontSize`. Colors are CSS color strings. Route points are visual geometry, not semantic intermediate objects.

`arrowheadType` is a legacy alias for `arrowType` and SHOULD NOT be emitted by new producers.

## 8. Class Body Rendering

`class.rendering.class.bodyType` supports `rectangle`, `shape`, and `image`.

For `shape`, `shapeType` uses the enum in the JSON Schema. For `image`, `imageFit` is `contain` or `cover`. Local image fixtures SHOULD use PNG files below `images/`. Remote images require HTTPS and CORS permission in the browser. Hyperclasses currently ignore shape/image body fields.

Visual material names currently include `metallic`, `flat`, `basic`, `matte`, `mat`, `glossy`, `shine`, `shiny`, `plastic`, `glass`, and `transparent`.

## 9. Identity And Reference Rules

Within one document:

1. Class, object-form attribute, and link IDs MUST be unique across all three categories.
2. Link endpoints MUST resolve to class-like IDs.
3. Parent and child references MUST resolve to class-like IDs.

The repository validators additionally require IDs to be globally unique across all files in `models/`, and separately across all files in `test_models/`. That is a repository convention, not a portable HBDS rule. Repository authors SHOULD prefix IDs with a model-specific token.

## 10. Legacy Input

Canonical v1 output uses `hypergraph.class` and `hypergraph.link`. The following are non-canonical:

- `hypergraph.hyperclass`;
- `hypergraph.relationships`;
- link `source` and `target` aliases;
- class `kind` instead of `type`;
- class `attribute` instead of `attributes`.

AI-response normalization accepts several aliases, but server saves and repository fixtures SHOULD use only canonical fields.

## 11. Excluded Semantics

V1 does not define executable semantics for TADs, functors, embryos, prototypes, inheritance, network superposition/intersection/nesting, associative mechanisms, quantities and units, fuzzy membership, constraints, or inference.

Those concepts are documented in the [support matrix](HBDS_SUPPORT_MATRIX.md). The additive [v2 schema](../schemas/hbds-semantic-profile-v2.schema.json) is explicitly enabled with `metadata.semanticVersion: 1` and defines optional records for objects, object links, class-to-hyperclass membership, and class inheritance. V2 does not change the v1 meaning of visual containment.

## 12. Validation

For repository fixtures, regenerate manifests through connected server startup, then run:

```powershell
py scripts\smoke_server.py
py tools\validate_manifests.py
py tools\validate_models.py
py tools\validate_test_models.py
py tools\lint_model_naming.py
py scripts\collaboration_browser_regression.py
```

JSON Schema validation is necessary but not sufficient because JSON Schema does not verify every identifier reference or repository-wide uniqueness rule.
