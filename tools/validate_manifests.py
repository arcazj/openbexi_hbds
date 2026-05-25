#!/usr/bin/env python3
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
CLASS_BODY_TYPES = {"rectangle", "image", "shape"}
CLASS_IMAGE_FITS = {"contain", "cover"}
CLASS_SURFACE_MATERIALS = {"metallic", "flat", "basic", "matte", "mat", "glossy", "shine", "shiny", "plastic", "glass", "transparent"}
CLASS_SHAPE_TYPES = {
    "roundedRectangle",
    "rectangle",
    "square",
    "circle",
    "ellipse",
    "diamond",
    "triangle",
    "pentagon",
    "hexagon",
    "octagon",
    "star",
    "capsule",
    "parallelogram",
    "trapezoid",
    "invertedTrapezoid",
    "document",
    "paperTape",
    "predefinedProcess",
    "manualInput",
    "database",
    "directAccessStorage",
    "internalStorage",
    "display",
    "storedData",
    "triangleDown",
    "circlePlus",
    "circleX",
    "offPageConnector",
    "braceLeft",
    "braceRight",
    "textLines",
    "bracketedList",
    "table",
    "tableColumns",
    "tableRows",
}
CLASS_IMAGE_GALLERY_SOURCES = {
    "./images/class_car.png",
    "./images/class_satellite.png",
    "./images/class_vehicle.png",
    "./images/class_voiture.png",
    "./images/class_human.png",
    "./images/class_user.png",
    "./images/class_man.png",
    "./images/class_supplier.png",
}
FLOWCHART_SHAPE_TYPES = {
    "invertedTrapezoid",
    "document",
    "paperTape",
    "predefinedProcess",
    "manualInput",
    "database",
    "directAccessStorage",
    "internalStorage",
    "display",
    "storedData",
    "triangleDown",
    "circlePlus",
    "circleX",
    "offPageConnector",
    "braceLeft",
    "braceRight",
    "textLines",
    "bracketedList",
    "table",
    "tableColumns",
    "tableRows",
}


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def validate_manifest(manifest_path: Path, default_base: str):
    errors = []
    data = load_json(manifest_path)
    items = data.get("models")
    if not isinstance(items, list):
        return [f"{manifest_path}: 'models' must be an array"]
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{manifest_path}: models[{idx}] must be an object")
            continue
        value = item.get("value")
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{manifest_path}: models[{idx}].value must be a non-empty string")
            continue
        normalized = value if value.endswith(".json") else f"{default_base}{value}.json"
        model_path = ROOT / normalized
        if not model_path.exists():
            errors.append(f"{manifest_path}: models[{idx}] -> missing file {normalized}")
        else:
            errors.extend(validate_model_file(model_path))
    return errors


def validate_model_file(model_path: Path):
    errors = []
    try:
        data = load_json(model_path)
    except Exception as exc:
        return [f"{model_path}: invalid JSON: {exc}"]

    hg = data.get("hypergraph") if isinstance(data, dict) else None
    classes = hg.get("class") if isinstance(hg, dict) else None
    links = hg.get("link", []) if isinstance(hg, dict) else []
    if not isinstance(classes, list):
        return [f"{model_path}: missing hypergraph.class array"]
    if not isinstance(links, list):
        errors.append(f"{model_path}: hypergraph.link must be an array")
        links = []
    errors.extend(validate_font_fields(model_path, data.get("metadata", {}) if isinstance(data, dict) else {}, "metadata"))

    ids = set()
    by_id = {}
    for idx, node in enumerate(classes):
        if not isinstance(node, dict):
            errors.append(f"{model_path}: class[{idx}] must be an object")
            continue
        node_id = node.get("id")
        if not node_id:
            errors.append(f"{model_path}: class[{idx}] missing id")
            continue
        if node_id in ids:
            errors.append(f"{model_path}: duplicate class id {node_id}")
        ids.add(node_id)
        by_id[node_id] = node
        if not isinstance(node.get("attributes", []), list):
            errors.append(f"{model_path}: class {node_id} attributes must be an array")
        errors.extend(validate_class_surface_fields(model_path, node))
        errors.extend(validate_class_body_fields(model_path, node))
        errors.extend(validate_font_fields(model_path, (node.get("rendering") or {}).get("font"), f"class {node_id} rendering.font"))
        for attr_idx, attribute in enumerate(node.get("attributes", []) if isinstance(node.get("attributes", []), list) else []):
            if isinstance(attribute, dict):
                errors.extend(validate_font_fields(model_path, attribute.get("font"), f"class {node_id} attributes[{attr_idx}].font"))

    for node in classes:
        if not isinstance(node, dict) or not node.get("id"):
            continue
        parent_id = node.get("parentClassId")
        if parent_id and parent_id not in by_id:
            errors.append(f"{model_path}: class {node['id']} missing parent {parent_id}")
        for child_id in node.get("children", []) or []:
            if child_id not in by_id:
                errors.append(f"{model_path}: hyperclass {node['id']} missing child {child_id}")

    link_ids = set()
    for idx, link in enumerate(links):
        if not isinstance(link, dict):
            errors.append(f"{model_path}: link[{idx}] must be an object")
            continue
        link_id = link.get("id")
        if link_id:
            if link_id in link_ids:
                errors.append(f"{model_path}: duplicate link id {link_id}")
            link_ids.add(link_id)
        source = link.get("sourceClassId")
        target = link.get("targetClassId")
        if source not in by_id:
            errors.append(f"{model_path}: link {link_id or idx} missing source {source}")
        if target not in by_id:
            errors.append(f"{model_path}: link {link_id or idx} missing target {target}")
    return errors


def validate_font_fields(model_path: Path, value, label: str):
    if value is None:
        return []
    errors = []
    font = (value.get("font") if label == "metadata" and isinstance(value, dict) and "font" in value else value)
    if font is None:
        return []
    if not isinstance(font, dict):
        return [f"{model_path}: {label} must be an object"]
    size = font.get("size", font.get("fontSize", font.get("labelFontSize")))
    if size is not None and (not isinstance(size, (int, float)) or size <= 0):
        errors.append(f"{model_path}: {label}.size must be a positive number")
    family = font.get("family", font.get("fontFamily"))
    if family is not None and (not isinstance(family, str) or not family.strip()):
        errors.append(f"{model_path}: {label}.family must be a non-empty string")
    for key in ("bold", "italic", "underline"):
        if key in font and font[key] is not None and not isinstance(font[key], bool):
            errors.append(f"{model_path}: {label}.{key} must be a boolean or null")
    return errors


def validate_class_body_fields(model_path: Path, node: dict):
    errors = []
    node_id = node.get("id", "<missing>")
    rendering_class = ((node.get("rendering") or {}).get("class") or {})
    body_keys = {"bodyType", "imageSrc", "imageFit", "shapeType"}
    has_body_fields = any(key in rendering_class for key in body_keys)
    if node.get("type") == "hyperclass":
        if has_body_fields:
            errors.append(f"{model_path}: hyperclass {node_id} must not define image/shape body fields")
        return errors

    body_type = rendering_class.get("bodyType")
    if body_type is not None and body_type not in CLASS_BODY_TYPES:
        errors.append(f"{model_path}: class {node_id} unsupported bodyType {body_type}")
    if body_type == "image":
        image_src = rendering_class.get("imageSrc")
        if not image_src:
            errors.append(f"{model_path}: class {node_id} image body missing imageSrc")
        elif not is_allowed_image_source(image_src):
            errors.append(f"{model_path}: class {node_id} imageSrc must be a PNG under ./images or an http(s) URL")
        image_fit = rendering_class.get("imageFit")
        if image_fit is not None and image_fit not in CLASS_IMAGE_FITS:
            errors.append(f"{model_path}: class {node_id} unsupported imageFit {image_fit}")
    if body_type == "shape":
        shape_type = rendering_class.get("shapeType", "roundedRectangle")
        if shape_type not in CLASS_SHAPE_TYPES:
            errors.append(f"{model_path}: class {node_id} unsupported shapeType {shape_type}")
    return errors


def validate_class_surface_fields(model_path: Path, node: dict):
    errors = []
    node_id = node.get("id", "<missing>")
    rendering_class = ((node.get("rendering") or {}).get("class") or {})
    material = rendering_class.get("material", rendering_class.get("surfaceMaterial"))
    if material is not None and str(material).strip().lower() not in CLASS_SURFACE_MATERIALS:
        errors.append(f"{model_path}: class {node_id} unsupported material {material}")
    for key in ("metalness", "roughness", "opacity", "emissiveIntensity"):
        if key not in rendering_class:
            continue
        value = rendering_class.get(key)
        if not isinstance(value, (int, float)) or value < 0 or value > 1:
            errors.append(f"{model_path}: class {node_id} {key} must be a number between 0 and 1")
    return errors


def is_allowed_image_source(value: str):
    clean = str(value or "").strip()
    if clean.startswith(("http://", "https://")) or clean.startswith("data:image/png"):
        return True
    normalized = clean.replace("\\", "/")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lower().startswith("images/") and normalized.lower().split("?", 1)[0].endswith(".png")


def validate_image_shape_regression_model():
    model_path = ROOT / "test_models" / "render_029_image_shape_class_bodies.json"
    shape_catalog_path = ROOT / "test_models" / "render_030_extended_shape_class_bodies.json"
    image_gallery_path = ROOT / "test_models" / "render_031_class_image_gallery.json"
    flowchart_shape_path = ROOT / "test_models" / "render_032_flowchart_shape_class_bodies.json"
    missing_models = [path for path in (model_path, shape_catalog_path, image_gallery_path, flowchart_shape_path) if not path.exists()]
    if missing_models:
        return [f"missing image/shape regression model: {path}" for path in missing_models]
    data = load_json(model_path)
    shape_catalog_data = load_json(shape_catalog_path)
    image_gallery_data = load_json(image_gallery_path)
    flowchart_shape_data = load_json(flowchart_shape_path)
    classes = data["hypergraph"]["class"]
    shape_catalog_classes = shape_catalog_data["hypergraph"]["class"]
    image_gallery_classes = image_gallery_data["hypergraph"]["class"]
    flowchart_shape_classes = flowchart_shape_data["hypergraph"]["class"]
    links = data["hypergraph"].get("link", [])
    by_id = {node["id"]: node for node in classes}
    errors = []

    regular = [node for node in classes if node.get("type") != "hyperclass"]
    body_types = {((node.get("rendering") or {}).get("class") or {}).get("bodyType", "rectangle") for node in regular}
    for required in CLASS_BODY_TYPES:
        if required not in body_types:
            errors.append(f"{model_path}: regression model missing bodyType {required}")

    shape_regular = (
        regular
        + [node for node in shape_catalog_classes if node.get("type") != "hyperclass"]
        + [node for node in flowchart_shape_classes if node.get("type") != "hyperclass"]
    )
    shape_types = {
        ((node.get("rendering") or {}).get("class") or {}).get("shapeType")
        for node in shape_regular
        if ((node.get("rendering") or {}).get("class") or {}).get("bodyType") == "shape"
    }
    missing_shapes = CLASS_SHAPE_TYPES - shape_types
    if missing_shapes:
        errors.append(f"{model_path} / {shape_catalog_path} / {flowchart_shape_path}: regression models missing shape types {sorted(missing_shapes)}")
    missing_flowchart_shapes = FLOWCHART_SHAPE_TYPES - shape_types
    if missing_flowchart_shapes:
        errors.append(f"{flowchart_shape_path}: flowchart regression model missing shape types {sorted(missing_flowchart_shapes)}")

    image_nodes = [
        node for node in regular
        if ((node.get("rendering") or {}).get("class") or {}).get("bodyType") == "image"
    ]
    existing_local_images = []
    missing_local_images = []
    for node in image_nodes:
        src = ((node.get("rendering") or {}).get("class") or {}).get("imageSrc", "")
        normalized = src.replace("\\", "/")
        if normalized.startswith("./"):
            normalized = normalized[2:]
        if normalized.lower().startswith("images/"):
            target = ROOT / normalized
            if target.exists():
                existing_local_images.append(src)
            else:
                missing_local_images.append(src)
    if not existing_local_images:
        errors.append(f"{model_path}: regression model needs at least one existing local PNG image")
    if not missing_local_images:
        errors.append(f"{model_path}: regression model needs at least one missing image fallback case")

    gallery_image_sources = {
        ((node.get("rendering") or {}).get("class") or {}).get("imageSrc")
        for node in image_gallery_classes
        if node.get("type") != "hyperclass"
        and ((node.get("rendering") or {}).get("class") or {}).get("bodyType") == "image"
    }
    missing_gallery_sources = CLASS_IMAGE_GALLERY_SOURCES - gallery_image_sources
    if missing_gallery_sources:
        errors.append(f"{image_gallery_path}: image gallery missing sources {sorted(missing_gallery_sources)}")
    for src in CLASS_IMAGE_GALLERY_SOURCES:
        local_path = src.replace("\\", "/")
        if local_path.startswith("./"):
            local_path = local_path[2:]
        if not (ROOT / local_path).exists():
            errors.append(f"{image_gallery_path}: image gallery source does not exist: {src}")

    for node in [*classes, *shape_catalog_classes, *image_gallery_classes, *flowchart_shape_classes]:
        rendering_class = ((node.get("rendering") or {}).get("class") or {})
        if node.get("type") == "hyperclass" and any(key in rendering_class for key in ("bodyType", "imageSrc", "imageFit", "shapeType")):
            errors.append(f"{model_path}: hyperclass {node['id']} must not carry class body image/shape fields")

    link_type_pairs = set()
    for link in links:
        source = by_id.get(link.get("sourceClassId"))
        target = by_id.get(link.get("targetClassId"))
        if not source or not target:
            continue
        link_type_pairs.add((body_kind(source), body_kind(target)))
    required_pairs = {("rectangle", "image"), ("image", "shape"), ("shape", "shape"), ("hyperclass", "image")}
    missing_pairs = required_pairs - link_type_pairs
    if missing_pairs:
        errors.append(f"{model_path}: regression model missing link body-type pairs {sorted(missing_pairs)}")
    return errors


def validate_font_regression_model():
    model_path = ROOT / "test_models" / "render_033_font_properties.json"
    if not model_path.exists():
        return [f"missing font regression model: {model_path}"]
    data = load_json(model_path)
    classes = data["hypergraph"]["class"]
    errors = []
    metadata_font = (data.get("metadata") or {}).get("font") or {}
    if metadata_font.get("size") != 13:
        errors.append(f"{model_path}: font regression model must define metadata.font.size 13")
    if not any(((node.get("rendering") or {}).get("font") or {}).get("size") for node in classes if node.get("type") != "hyperclass"):
        errors.append(f"{model_path}: font regression model missing regular class font override")
    if not any(((node.get("rendering") or {}).get("font") or {}).get("italic") for node in classes if node.get("type") == "hyperclass"):
        errors.append(f"{model_path}: font regression model missing hyperclass italic override")
    attr_fonts = [
        attribute.get("font")
        for node in classes
        for attribute in node.get("attributes", [])
        if isinstance(attribute, dict) and attribute.get("font")
    ]
    if not attr_fonts:
        errors.append(f"{model_path}: font regression model missing individual attribute font override")
    if not any(isinstance(attribute, str) for node in classes for attribute in node.get("attributes", [])):
        errors.append(f"{model_path}: font regression model missing legacy string attribute fallback")
    return errors


def body_kind(node: dict):
    if node.get("type") == "hyperclass":
        return "hyperclass"
    return ((node.get("rendering") or {}).get("class") or {}).get("bodyType", "rectangle")


def main():
    checks = [
        (ROOT / "models" / "models_manifest.json", "models/"),
        (ROOT / "test_models" / "test_models_manifest.json", "test_models/"),
    ]
    all_errors = []
    for manifest_path, default_base in checks:
        if not manifest_path.exists():
            all_errors.append(f"missing manifest: {manifest_path}")
            continue
        all_errors.extend(validate_manifest(manifest_path, default_base))
    all_errors.extend(validate_image_shape_regression_model())
    all_errors.extend(validate_font_regression_model())
    if all_errors:
        print("Manifest validation failed:")
        for err in all_errors:
            print(f"- {err}")
        return 1
    print("Manifest validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

