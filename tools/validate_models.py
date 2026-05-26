#!/usr/bin/python3
import json
from collections import defaultdict
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "models"
MANIFEST_NAME = "models_manifest.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def model_files() -> list[Path]:
    return [
        path
        for path in sorted(MODELS_DIR.glob("*.json"), key=lambda item: item.name.lower())
        if path.is_file() and path.name != MANIFEST_NAME and not path.name.startswith(".")
    ]


def add_id(seen_by_file: dict[str, list[str]], seen_globally: dict[str, list[str]], entity_id, owner: str, file_name: str):
    if entity_id is None or str(entity_id).strip() == "":
        return [f"{file_name}: {owner} missing id"]
    clean_id = str(entity_id)
    seen_by_file[clean_id].append(owner)
    seen_globally[clean_id].append(f"{file_name}:{owner}")
    return []


def validate_metadata(path: Path, data: dict):
    errors = []
    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        return [f"{path.name}: metadata must be an object"]

    for key in ("name", "purpose"):
        value = metadata.get(key)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{path.name}: metadata.{key} must be a non-empty string")

    tags = metadata.get("regressionTags")
    if not isinstance(tags, list) or not tags:
        errors.append(f"{path.name}: metadata.regressionTags must be a non-empty array")
    else:
        for index, tag in enumerate(tags):
            if not isinstance(tag, str) or not tag.strip():
                errors.append(f"{path.name}: metadata.regressionTags[{index}] must be a non-empty string")
    return errors


def validate_model_ids(path: Path, data: dict, seen_globally: dict[str, list[str]]):
    errors = []
    seen_by_file: dict[str, list[str]] = defaultdict(list)
    hypergraph = data.get("hypergraph")
    if not isinstance(hypergraph, dict):
        return [f"{path.name}: hypergraph must be an object"]
    if "hyperclass" in hypergraph:
        errors.append(f"{path.name}: legacy hypergraph.hyperclass must be migrated into hypergraph.class")
    if "relationships" in hypergraph:
        errors.append(f"{path.name}: legacy hypergraph.relationships must be migrated into hypergraph.link")

    classes = hypergraph.get("class")
    if not isinstance(classes, list):
        return errors + [f"{path.name}: hypergraph.class must be an array"]

    class_ids = set()
    for class_index, node in enumerate(classes):
        if not isinstance(node, dict):
            errors.append(f"{path.name}: class[{class_index}] must be an object")
            continue
        node_id = node.get("id")
        errors.extend(add_id(seen_by_file, seen_globally, node_id, f"class[{class_index}]", path.name))
        if node_id:
            class_ids.add(str(node_id))

        attributes = node.get("attributes", [])
        if not isinstance(attributes, list):
            errors.append(f"{path.name}: class {node_id or class_index} attributes must be an array")
            continue
        for attr_index, attribute in enumerate(attributes):
            if not isinstance(attribute, dict):
                continue
            errors.extend(
                add_id(
                    seen_by_file,
                    seen_globally,
                    attribute.get("id"),
                    f"class[{node_id or class_index}].attributes[{attr_index}]",
                    path.name,
                )
            )

    links = hypergraph.get("link", [])
    if not isinstance(links, list):
        return errors + [f"{path.name}: hypergraph.link must be an array"]

    for link_index, link in enumerate(links):
        if not isinstance(link, dict):
            errors.append(f"{path.name}: link[{link_index}] must be an object")
            continue
        link_id = link.get("id")
        errors.extend(add_id(seen_by_file, seen_globally, link_id, f"link[{link_index}]", path.name))
        source = str(link.get("sourceClassId", ""))
        target = str(link.get("targetClassId", ""))
        if source not in class_ids:
            errors.append(f"{path.name}: link {link_id or link_index} sourceClassId '{source}' does not match a class id")
        if target not in class_ids:
            errors.append(f"{path.name}: link {link_id or link_index} targetClassId '{target}' does not match a class id")

    for entity_id, owners in sorted(seen_by_file.items()):
        if len(owners) > 1:
            errors.append(f"{path.name}: duplicate local id '{entity_id}' used by {', '.join(owners)}")
    return errors


def validate_global_ids(seen_globally: dict[str, list[str]]):
    errors = []
    for entity_id, owners in sorted(seen_globally.items()):
        files = sorted({owner.split(":", 1)[0] for owner in owners})
        if len(files) > 1:
            errors.append(f"duplicate global model id '{entity_id}' appears in {', '.join(files)}")
    return errors


def main() -> int:
    errors = []
    seen_globally: dict[str, list[str]] = defaultdict(list)
    for path in model_files():
        try:
            data = load_json(path)
        except Exception as exc:
            errors.append(f"{path.name}: invalid JSON: {exc}")
            continue
        if not isinstance(data, dict):
            errors.append(f"{path.name}: top-level JSON must be an object")
            continue
        errors.extend(validate_metadata(path, data))
        errors.extend(validate_model_ids(path, data, seen_globally))

    errors.extend(validate_global_ids(seen_globally))
    if errors:
        print("Model validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Model validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
