#!/usr/bin/python3
"""Local HBDS static file and model API server."""

from __future__ import annotations

import argparse
import copy
import datetime as _dt
import hashlib
import json
import os
import queue
import shutil
import tempfile
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT_DIR = Path(__file__).resolve().parent
MODELS_DIR = (ROOT_DIR / "models").resolve()
TEST_MODELS_DIR = (ROOT_DIR / "test_models").resolve()
MODELS_MANIFEST_PATH = MODELS_DIR / "models_manifest.json"
TEST_MODELS_MANIFEST_PATH = TEST_MODELS_DIR / "test_models_manifest.json"
BACKUP_DIR = MODELS_DIR / ".backups"
MAX_JSON_BYTES = 5 * 1024 * 1024
EVENT_HEARTBEAT_SECONDS = 15
MAX_REVISION_SNAPSHOTS_PER_MODEL = 20
MAX_CLIENT_ID_LENGTH = 120
MAX_CLIENT_NAME_LENGTH = 160
LOCAL_ORIGINS = {
    "http://127.0.0.1",
    "http://127.0.0.1:8010",
    "http://localhost",
    "http://localhost:8010",
}


def utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def label_from_model_name(name: str) -> str:
    stem = Path(name).stem.replace("_", " ").replace("-", " ")
    return " ".join(stem.split())


def is_manifest_model_file(path: Path) -> bool:
    return (
        path.is_file()
        and path.suffix.lower() == ".json"
        and not path.name.startswith(".")
        and not path.name.lower().endswith("manifest.json")
    )


def manifest_entry_for_model(path: Path, scope: str) -> dict:
    label = label_from_model_name(path.name)
    return {
        "value": f"{scope}/{path.name}",
        "label": label,
        "description": label,
    }


def build_model_manifest(models_dir: Path, scope: str) -> dict:
    if not models_dir.exists():
        return {"models": []}
    paths = sorted(
        (path for path in models_dir.glob("*.json") if is_manifest_model_file(path)),
        key=lambda item: item.name.lower(),
    )
    return {"models": [manifest_entry_for_model(path, scope) for path in paths]}


def write_json_atomic(target: Path, payload: dict) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=f".{target.stem}.", suffix=".tmp", dir=str(target.parent))
    tmp = Path(tmp_path)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(tmp, target)
    finally:
        if tmp.exists():
            tmp.unlink()


def refresh_model_manifests() -> list[Path]:
    manifest_specs = (
        (MODELS_DIR, "models", MODELS_MANIFEST_PATH),
        (TEST_MODELS_DIR, "test_models", TEST_MODELS_MANIFEST_PATH),
    )
    updated_paths: list[Path] = []
    for models_dir, scope, manifest_path in manifest_specs:
        write_json_atomic(manifest_path, build_model_manifest(models_dir, scope))
        updated_paths.append(manifest_path)
    return updated_paths


def validate_model_name(raw_name: str) -> tuple[str | None, dict | None]:
    name = unquote(str(raw_name or "")).strip()
    if not name:
        return None, error_payload("invalid_model_name", "Model name is required")
    if name.startswith("."):
        return None, error_payload("invalid_model_name", "Hidden model files are not allowed")
    if "/" in name or "\\" in name or name != Path(name).name:
        return None, error_payload("invalid_model_name", "Nested model paths are not allowed")
    if ".." in name:
        return None, error_payload("invalid_model_name", "Path traversal is not allowed")
    if not name.lower().endswith(".json"):
        return None, error_payload("invalid_model_name", "Model file must end with .json")
    if name.lower().endswith("manifest.json"):
        return None, error_payload("invalid_model_name", "Manifest files cannot be edited through the model API")

    target = (MODELS_DIR / name).resolve()
    if target.parent != MODELS_DIR:
        return None, error_payload("invalid_model_name", "Model file must stay inside the models directory")
    return name, None


def validate_draft_scope(raw_scope: str) -> tuple[str | None, dict | None]:
    scope = unquote(str(raw_scope or "")).strip().strip("/")
    if scope == "models":
        return "models", None
    if scope == "test_models":
        return "test_models", None
    return None, error_payload("invalid_draft_scope", "Draft scope must be models or test_models")


def validate_scoped_draft_model(raw_scope: str, raw_name: str) -> tuple[str | None, dict | None]:
    parsed = validate_scoped_model_path(raw_scope, raw_name, require_exists=True)
    if parsed[4]:
        return None, parsed[4]
    return parsed[3], None


def validate_scoped_model_path(
    raw_scope: str,
    raw_name: str,
    *,
    require_exists: bool = False,
) -> tuple[str | None, str | None, Path | None, str | None, dict | None]:
    scope, scope_error = validate_draft_scope(raw_scope)
    if scope_error:
        return None, None, None, None, scope_error
    name, name_error = validate_model_name(raw_name)
    if name_error:
        return None, None, None, None, name_error

    base_dir = MODELS_DIR if scope == "models" else TEST_MODELS_DIR
    target = (base_dir / name).resolve()
    if target.parent != base_dir:
        return None, None, None, None, error_payload("invalid_model_name", "Model file must stay inside its model scope directory")
    if require_exists and not target.exists():
        return None, None, None, None, error_payload("model_not_found", "Model not found")
    model_key = name if scope == "models" else f"{scope}/{name}"
    return scope, name, target, model_key, None


def validate_model_payload(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return error_payload("invalid_model", "Model JSON must be an object")
    hypergraph = payload.get("hypergraph")
    if not isinstance(hypergraph, dict):
        return error_payload("invalid_model", "Model JSON must contain hypergraph")
    if "hyperclass" in hypergraph:
        return error_payload("invalid_model", "Legacy hypergraph.hyperclass must be migrated into hypergraph.class")
    if "relationships" in hypergraph:
        return error_payload("invalid_model", "Legacy hypergraph.relationships must be migrated into hypergraph.link")

    classes = hypergraph.get("class")
    links = hypergraph.get("link")
    if not isinstance(classes, list):
        return error_payload("invalid_model", "Model hypergraph.class must be an array")
    if not isinstance(links, list):
        return error_payload("invalid_model", "Model hypergraph.link must be an array")

    seen_ids: dict[str, list[str]] = {}
    class_ids: set[str] = set()

    def clean_id(value: object) -> str:
        return str(value).strip() if value is not None else ""

    def register_id(value: object, owner: str) -> dict | None:
        entity_id = clean_id(value)
        if not entity_id:
            return error_payload("invalid_model", f"{owner} missing id")
        seen_ids.setdefault(entity_id, []).append(owner)
        return None

    parent_refs: list[tuple[str, str]] = []
    child_refs: list[tuple[str, str]] = []
    for class_index, node in enumerate(classes):
        owner = f"class[{class_index}]"
        if not isinstance(node, dict):
            return error_payload("invalid_model", f"{owner} must be an object")
        validation_error = register_id(node.get("id"), owner)
        if validation_error:
            return validation_error
        node_id = clean_id(node.get("id"))
        class_ids.add(node_id)

        attributes = node.get("attributes", [])
        if not isinstance(attributes, list):
            return error_payload("invalid_model", f"class {node_id} attributes must be an array")
        for attr_index, attribute in enumerate(attributes):
            attr_owner = f"class[{node_id}].attributes[{attr_index}]"
            if not isinstance(attribute, dict):
                continue
            validation_error = register_id(attribute.get("id"), attr_owner)
            if validation_error:
                return validation_error

        parent_id = clean_id(node.get("parentClassId"))
        if parent_id:
            parent_refs.append((node_id, parent_id))
        children = node.get("children", [])
        if children is None:
            children = []
        if not isinstance(children, list):
            return error_payload("invalid_model", f"class {node_id} children must be an array")
        for child_index, child_id in enumerate(children):
            child_ref = clean_id(child_id)
            if not child_ref:
                return error_payload("invalid_model", f"class {node_id} children[{child_index}] must be a non-empty id")
            child_refs.append((node_id, child_ref))

    for link_index, link in enumerate(links):
        owner = f"link[{link_index}]"
        if not isinstance(link, dict):
            return error_payload("invalid_model", f"{owner} must be an object")
        validation_error = register_id(link.get("id"), owner)
        if validation_error:
            return validation_error
        link_id = clean_id(link.get("id"))
        source_id = clean_id(link.get("sourceClassId"))
        target_id = clean_id(link.get("targetClassId"))
        if not source_id or source_id not in class_ids:
            return error_payload("invalid_model", f"link {link_id} sourceClassId must reference an existing class")
        if not target_id or target_id not in class_ids:
            return error_payload("invalid_model", f"link {link_id} targetClassId must reference an existing class")

    for entity_id, owners in sorted(seen_ids.items()):
        if len(owners) > 1:
            return error_payload("invalid_model", f"Duplicate model id '{entity_id}' used by {', '.join(owners)}")
    for node_id, parent_id in parent_refs:
        if parent_id not in class_ids:
            return error_payload("invalid_model", f"class {node_id} parentClassId must reference an existing class")
    for node_id, child_id in child_refs:
        if child_id not in class_ids:
            return error_payload("invalid_model", f"class {node_id} children must reference existing classes")
    return None


class OperationError(ValueError):
    def __init__(self, code: str, message: str, status: HTTPStatus = HTTPStatus.BAD_REQUEST, **details):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details


def error_payload(code: str, message: str, **details) -> dict:
    payload = {"code": code, "message": message}
    payload.update({key: value for key, value in details.items() if value is not None})
    return payload


def model_content_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_metadata(path: Path) -> dict:
    stat = path.stat()
    modified = _dt.datetime.fromtimestamp(stat.st_mtime, _dt.timezone.utc)
    content_hash = model_content_hash(path)
    return {
        "name": path.name,
        "label": label_from_model_name(path.name),
        "size": stat.st_size,
        "modified": stat.st_mtime,
        "modifiedIso": modified.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "revision": content_hash,
        "contentHash": content_hash,
    }


def model_with_server_metadata(model: dict, metadata: dict) -> dict:
    enriched = copy.deepcopy(model)
    model_metadata_obj = enriched.get("metadata")
    if not isinstance(model_metadata_obj, dict):
        model_metadata_obj = {}
    enriched["metadata"] = {
        **model_metadata_obj,
        "revision": metadata["revision"],
        "contentHash": metadata["contentHash"],
        "modified": metadata["modified"],
        "modifiedIso": metadata["modifiedIso"],
    }
    return enriched


def model_without_server_metadata(model: dict) -> dict:
    clean = copy.deepcopy(model)
    model_metadata_obj = clean.get("metadata")
    if isinstance(model_metadata_obj, dict):
        for key in ("revision", "contentHash", "modified", "modifiedIso", "size"):
            model_metadata_obj.pop(key, None)
    return clean


def normalize_revision_token(value: object) -> str:
    clean = str(value or "").strip()
    if clean.startswith("W/"):
        clean = clean[2:].strip()
    if len(clean) >= 2 and clean[0] == clean[-1] == '"':
        clean = clean[1:-1].strip()
    return clean


def client_revision_from_request(headers, payload: dict) -> str:
    header_revision = normalize_revision_token(headers.get("If-Match", ""))
    if header_revision:
        return header_revision
    for key in ("baseModelRevision", "revision", "contentHash"):
        revision = normalize_revision_token(payload.get(key)) if isinstance(payload, dict) else ""
        if revision:
            return revision
    metadata = payload.get("metadata") if isinstance(payload, dict) else None
    if isinstance(metadata, dict):
        return normalize_revision_token(metadata.get("revision") or metadata.get("contentHash"))
    return ""


def clean_client_text(value: object, *, fallback: str = "", max_length: int = MAX_CLIENT_ID_LENGTH) -> str:
    clean = str(value or "").strip()
    if not clean:
        clean = fallback
    return clean[:max_length]


def first_query_value(query: dict[str, list[str]], name: str) -> str:
    values = query.get(name) or []
    return str(values[0]) if values else ""


def format_sse_event(event: dict) -> bytes:
    event_type = str(event.get("type") or "message")
    event_id = str(event.get("sequence") or "")
    data = json.dumps(event, ensure_ascii=False)
    lines = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event_type}")
    lines.extend(f"data: {line}" for line in data.splitlines() or ["{}"])
    lines.append("")
    lines.append("")
    return "\n".join(lines).encode("utf-8")


def write_model_payload(target: Path, payload: dict) -> str | None:
    target.parent.mkdir(parents=True, exist_ok=True)
    backup_dir = target.parent / ".backups"
    backup_name = None
    if target.exists():
        backup_dir.mkdir(parents=True, exist_ok=True)
        timestamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = backup_dir / f"{target.stem}.{timestamp}.bak.json"
        shutil.copy2(target, backup_path)
        backup_name = backup_path.name

    fd, tmp_path = tempfile.mkstemp(prefix=f".{target.stem}.", suffix=".tmp", dir=str(target.parent))
    tmp = Path(tmp_path)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(model_without_server_metadata(payload), handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(tmp, target)
    finally:
        if tmp.exists():
            tmp.unlink()
    return backup_name


def read_stored_model(target: Path) -> dict:
    with target.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ids_equal(left: object, right: object) -> bool:
    return str(left) == str(right)


def operation_target_id(operation: dict, *names: str) -> object:
    for name in names or ("targetId", "id"):
        value = operation.get(name)
        if value is not None and value != "":
            return value
    return None


def deep_merge_patch(target: dict, patch: dict, *, forbidden: set[str]) -> None:
    for key, value in patch.items():
        if key in forbidden:
            raise OperationError("invalid_operation", f"Operation cannot patch {key}")
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            deep_merge_patch(target[key], value, forbidden=set())
        else:
            target[key] = copy.deepcopy(value)


def class_index_by_id(model: dict, target_id: object) -> int:
    classes = model.get("hypergraph", {}).get("class", [])
    for index, item in enumerate(classes):
        if ids_equal(item.get("id"), target_id):
            return index
    return -1


def link_index_by_id(model: dict, target_id: object) -> int:
    links = model.get("hypergraph", {}).get("link", [])
    for index, item in enumerate(links):
        if ids_equal(item.get("id"), target_id):
            return index
    return -1


def normalize_applied_operation(operation: dict) -> dict:
    applied = {
        "opId": operation.get("opId"),
        "type": operation.get("type"),
    }
    for key in ("id", "targetId", "classId", "linkId"):
        if operation.get(key) is not None:
            applied[key] = operation[key]
    if isinstance(operation.get("patch"), dict):
        applied["patch"] = copy.deepcopy(operation["patch"])
    return {key: value for key, value in applied.items() if value is not None}


def apply_model_operations(model: dict, operations: list[dict]) -> list[dict]:
    if not isinstance(operations, list) or not operations:
        raise OperationError("invalid_operations", "Operations must be a non-empty array")
    working = model.setdefault("hypergraph", {})
    working.setdefault("class", [])
    working.setdefault("link", [])
    applied = []
    for index, operation in enumerate(operations):
        if not isinstance(operation, dict):
            raise OperationError("invalid_operation", f"Operation {index} must be an object")
        operation_type = str(operation.get("type") or "").strip()
        if operation_type == "updateClass":
            apply_update_class_operation(model, operation)
        elif operation_type == "createClass":
            apply_create_class_operation(model, operation)
        elif operation_type == "deleteClass":
            apply_delete_class_operation(model, operation)
        elif operation_type == "updateLink":
            apply_update_link_operation(model, operation)
        elif operation_type == "createLink":
            apply_create_link_operation(model, operation)
        elif operation_type == "deleteLink":
            apply_delete_link_operation(model, operation)
        else:
            raise OperationError("unsupported_operation", f"Unsupported operation type: {operation_type or '(missing)'}")
        applied.append(normalize_applied_operation(operation))

    validation_error = validate_model_payload(model)
    if validation_error:
        raise OperationError(
            "invalid_merged_model",
            validation_error["message"],
            HTTPStatus.CONFLICT,
            validationError=validation_error,
        )
    return applied


def apply_update_class_operation(model: dict, operation: dict) -> None:
    target_id = operation_target_id(operation, "targetId", "classId", "id")
    patch = operation.get("patch")
    if target_id is None or not isinstance(patch, dict):
        raise OperationError("invalid_operation", "updateClass requires targetId/classId/id and patch")
    index = class_index_by_id(model, target_id)
    if index < 0:
        raise OperationError("operation_conflict", "Class no longer exists", HTTPStatus.CONFLICT, targetId=target_id)
    deep_merge_patch(model["hypergraph"]["class"][index], patch, forbidden={"id"})


def apply_create_class_operation(model: dict, operation: dict) -> None:
    node = operation.get("class") or operation.get("node") or operation.get("value")
    if not isinstance(node, dict) or node.get("id") is None:
        raise OperationError("invalid_operation", "createClass requires class/node/value with an id")
    if class_index_by_id(model, node["id"]) >= 0:
        raise OperationError("operation_conflict", "Class already exists", HTTPStatus.CONFLICT, targetId=node["id"])
    clean = copy.deepcopy(node)
    clean.setdefault("attributes", [])
    if clean.get("type") == "hyperclass":
        clean.setdefault("children", [])
    model["hypergraph"]["class"].append(clean)


def apply_delete_class_operation(model: dict, operation: dict) -> None:
    target_id = operation_target_id(operation, "targetId", "classId", "id")
    if target_id is None:
        raise OperationError("invalid_operation", "deleteClass requires targetId/classId/id")
    index = class_index_by_id(model, target_id)
    if index < 0:
        raise OperationError("operation_conflict", "Class no longer exists", HTTPStatus.CONFLICT, targetId=target_id)
    del model["hypergraph"]["class"][index]
    model["hypergraph"]["link"] = [
        link for link in model["hypergraph"]["link"]
        if not ids_equal(link.get("sourceClassId"), target_id) and not ids_equal(link.get("targetClassId"), target_id)
    ]
    for node in model["hypergraph"]["class"]:
        if ids_equal(node.get("parentClassId"), target_id):
            node["parentClassId"] = None
        if isinstance(node.get("children"), list):
            node["children"] = [child_id for child_id in node["children"] if not ids_equal(child_id, target_id)]


def apply_update_link_operation(model: dict, operation: dict) -> None:
    target_id = operation_target_id(operation, "targetId", "linkId", "id")
    patch = operation.get("patch")
    if target_id is None or not isinstance(patch, dict):
        raise OperationError("invalid_operation", "updateLink requires targetId/linkId/id and patch")
    index = link_index_by_id(model, target_id)
    if index < 0:
        raise OperationError("operation_conflict", "Link no longer exists", HTTPStatus.CONFLICT, targetId=target_id)
    deep_merge_patch(model["hypergraph"]["link"][index], patch, forbidden={"id"})
    ensure_link_references_exist(model, model["hypergraph"]["link"][index])


def apply_create_link_operation(model: dict, operation: dict) -> None:
    link = operation.get("link") or operation.get("value")
    if not isinstance(link, dict):
        raise OperationError("invalid_operation", "createLink requires link/value")
    if link.get("id") is not None and link_index_by_id(model, link["id"]) >= 0:
        raise OperationError("operation_conflict", "Link already exists", HTTPStatus.CONFLICT, targetId=link["id"])
    clean = copy.deepcopy(link)
    ensure_link_references_exist(model, clean)
    model["hypergraph"]["link"].append(clean)


def apply_delete_link_operation(model: dict, operation: dict) -> None:
    target_id = operation_target_id(operation, "targetId", "linkId", "id")
    if target_id is None:
        raise OperationError("invalid_operation", "deleteLink requires targetId/linkId/id")
    index = link_index_by_id(model, target_id)
    if index < 0:
        raise OperationError("operation_conflict", "Link no longer exists", HTTPStatus.CONFLICT, targetId=target_id)
    del model["hypergraph"]["link"][index]


def ensure_link_references_exist(model: dict, link: dict) -> None:
    source_id = link.get("sourceClassId")
    target_id = link.get("targetClassId")
    if source_id is None or target_id is None:
        raise OperationError("invalid_operation", "Link requires sourceClassId and targetClassId")
    if class_index_by_id(model, source_id) < 0:
        raise OperationError("operation_conflict", "Link source class does not exist", HTTPStatus.CONFLICT, sourceClassId=source_id)
    if class_index_by_id(model, target_id) < 0:
        raise OperationError("operation_conflict", "Link target class does not exist", HTTPStatus.CONFLICT, targetClassId=target_id)


def flattened_patch_paths(patch: dict, prefix: str = "") -> set[str]:
    paths: set[str] = set()
    for key, value in patch.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict) and value:
            paths.update(flattened_patch_paths(value, path))
        else:
            paths.add(path)
    return paths


def changed_paths_between(base: object, current: object, prefix: str = "") -> set[str]:
    if isinstance(base, dict) and isinstance(current, dict):
        paths: set[str] = set()
        for key in set(base.keys()) | set(current.keys()):
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            paths.update(changed_paths_between(base.get(key), current.get(key), child_prefix))
        return paths
    if base != current:
        return {prefix or "$"}
    return set()


def paths_overlap(left: set[str], right: set[str]) -> bool:
    for left_path in left:
        for right_path in right:
            if (
                left_path == right_path
                or left_path.startswith(f"{right_path}.")
                or right_path.startswith(f"{left_path}.")
            ):
                return True
    return False


def get_class_by_id(model: dict, target_id: object) -> dict | None:
    index = class_index_by_id(model, target_id)
    return None if index < 0 else model["hypergraph"]["class"][index]


def get_link_by_id(model: dict, target_id: object) -> dict | None:
    index = link_index_by_id(model, target_id)
    return None if index < 0 else model["hypergraph"]["link"][index]


def links_referencing_class(model: dict, target_id: object) -> list[dict]:
    return [
        link for link in model.get("hypergraph", {}).get("link", [])
        if ids_equal(link.get("sourceClassId"), target_id) or ids_equal(link.get("targetClassId"), target_id)
    ]


def ensure_operations_can_merge(base_model: dict, current_model: dict, operations: list[dict]) -> None:
    if not isinstance(operations, list) or not operations:
        raise OperationError("invalid_operations", "Operations must be a non-empty array")
    for operation in operations:
        operation_type = str(operation.get("type") or "").strip()
        if operation_type == "updateClass":
            ensure_update_can_merge(base_model, current_model, operation, element_type="class")
        elif operation_type == "updateLink":
            ensure_update_can_merge(base_model, current_model, operation, element_type="link")
        elif operation_type == "deleteClass":
            ensure_class_delete_can_merge(base_model, current_model, operation)
        elif operation_type == "deleteLink":
            ensure_link_delete_can_merge(base_model, current_model, operation)
        elif operation_type == "createClass":
            ensure_class_create_can_merge(base_model, current_model, operation)
        elif operation_type == "createLink":
            ensure_link_create_can_merge(base_model, current_model, operation)


def ensure_update_can_merge(base_model: dict, current_model: dict, operation: dict, *, element_type: str) -> None:
    target_id = operation_target_id(operation, "targetId", f"{element_type}Id", "id")
    patch = operation.get("patch")
    if target_id is None or not isinstance(patch, dict):
        return
    base_element = get_class_by_id(base_model, target_id) if element_type == "class" else get_link_by_id(base_model, target_id)
    current_element = get_class_by_id(current_model, target_id) if element_type == "class" else get_link_by_id(current_model, target_id)
    if base_element is None:
        raise OperationError("operation_conflict", f"{element_type.title()} was not present in the base revision", HTTPStatus.CONFLICT, targetId=target_id)
    if current_element is None:
        raise OperationError("operation_conflict", f"{element_type.title()} was deleted by another change", HTTPStatus.CONFLICT, targetId=target_id)
    incoming_paths = flattened_patch_paths(patch)
    changed_paths = changed_paths_between(base_element, current_element)
    if paths_overlap(incoming_paths, changed_paths):
        raise OperationError(
            "operation_conflict",
            f"{element_type.title()} was changed on the same field by another client",
            HTTPStatus.CONFLICT,
            targetId=target_id,
            fields=sorted(incoming_paths),
            changedFields=sorted(changed_paths),
        )


def ensure_class_delete_can_merge(base_model: dict, current_model: dict, operation: dict) -> None:
    target_id = operation_target_id(operation, "targetId", "classId", "id")
    if target_id is None:
        return
    base_class = get_class_by_id(base_model, target_id)
    current_class = get_class_by_id(current_model, target_id)
    if base_class is None or current_class is None:
        raise OperationError("operation_conflict", "Class delete target changed before merge", HTTPStatus.CONFLICT, targetId=target_id)
    changed_paths = changed_paths_between(base_class, current_class)
    if changed_paths:
        raise OperationError("operation_conflict", "Class was edited by another client before delete", HTTPStatus.CONFLICT, targetId=target_id, changedFields=sorted(changed_paths))
    if changed_paths_between(links_referencing_class(base_model, target_id), links_referencing_class(current_model, target_id)):
        raise OperationError("operation_conflict", "Class references changed before delete", HTTPStatus.CONFLICT, targetId=target_id)


def ensure_link_delete_can_merge(base_model: dict, current_model: dict, operation: dict) -> None:
    target_id = operation_target_id(operation, "targetId", "linkId", "id")
    if target_id is None:
        return
    base_link = get_link_by_id(base_model, target_id)
    current_link = get_link_by_id(current_model, target_id)
    if base_link is None or current_link is None:
        raise OperationError("operation_conflict", "Link delete target changed before merge", HTTPStatus.CONFLICT, targetId=target_id)
    changed_paths = changed_paths_between(base_link, current_link)
    if changed_paths:
        raise OperationError("operation_conflict", "Link was edited by another client before delete", HTTPStatus.CONFLICT, targetId=target_id, changedFields=sorted(changed_paths))


def ensure_class_create_can_merge(base_model: dict, current_model: dict, operation: dict) -> None:
    node = operation.get("class") or operation.get("node") or operation.get("value")
    node_id = node.get("id") if isinstance(node, dict) else None
    if node_id is None:
        return
    if get_class_by_id(base_model, node_id) is not None or get_class_by_id(current_model, node_id) is not None:
        raise OperationError("operation_conflict", "Class id is already in use", HTTPStatus.CONFLICT, targetId=node_id)


def ensure_link_create_can_merge(base_model: dict, current_model: dict, operation: dict) -> None:
    link = operation.get("link") or operation.get("value")
    link_id = link.get("id") if isinstance(link, dict) else None
    if link_id is not None and (get_link_by_id(base_model, link_id) is not None or get_link_by_id(current_model, link_id) is not None):
        raise OperationError("operation_conflict", "Link id is already in use", HTTPStatus.CONFLICT, targetId=link_id)


def list_models() -> list[dict]:
    if not MODELS_DIR.exists():
        return []
    return [
        model_metadata(path)
        for path in sorted(MODELS_DIR.glob("*.json"), key=lambda item: item.name.lower())
        if not path.name.startswith(".") and not path.name.lower().endswith("manifest.json")
    ]


def openapi_spec(host: str) -> dict:
    server_url = f"http://{host}" if host else "http://127.0.0.1:8010"
    error_schema = {"$ref": "#/components/schemas/ErrorResponse"}
    model_name_param = {
        "name": "modelName",
        "in": "path",
        "required": True,
        "schema": {"type": "string", "pattern": "^[^/\\\\]+\\.json$"},
        "description": "Direct .json file name inside the models directory.",
    }
    client_id_param = {
        "name": "clientId",
        "in": "path",
        "required": True,
        "schema": {"type": "string"},
        "description": "Stable client identifier for one browser, UI, or automation client.",
    }
    draft_scope_param = {
        "name": "scope",
        "in": "path",
        "required": True,
        "schema": {"type": "string", "enum": ["models", "test_models"]},
        "description": "Draft namespace. Use test_models for the Tests workspace.",
    }
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "HBDS Graphic Simulator API",
            "version": "1.0.0",
            "description": "Local API for HBDS model listing, loading, and saving.",
        },
        "servers": [{"url": server_url}],
        "tags": [
            {"name": "Server", "description": "Local server status and API documentation."},
            {"name": "Models", "description": "List, load, and save HBDS model JSON files."},
            {"name": "Collaboration", "description": "Presence and live draft state used by collaborative editing UI."},
        ],
        "paths": {
            "/api/health": {
                "get": {
                    "tags": ["Server"],
                    "summary": "Check server health",
                    "responses": {
                        "200": {
                            "description": "Server is reachable",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HealthResponse"}}},
                        }
                    },
                }
            },
            "/api/models": {
                "get": {
                    "tags": ["Models"],
                    "summary": "List server-managed HBDS models",
                    "responses": {
                        "200": {
                            "description": "Model list",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelListResponse"}}},
                        },
                        "500": {"description": "Server error", "content": {"application/json": {"schema": error_schema}}},
                    },
                }
            },
            "/api/models/{modelName}": {
                "get": {
                    "tags": ["Models"],
                    "summary": "Load one HBDS model",
                    "parameters": [model_name_param],
                    "responses": {
                        "200": {
                            "description": "Model payload",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelLoadResponse"}}},
                        },
                        "400": {"description": "Invalid model name", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
                "post": {
                    "tags": ["Models"],
                    "summary": "Save one HBDS model",
                    "parameters": [
                        model_name_param,
                        {
                            "name": "If-Match",
                            "in": "header",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Current model revision from metadata.revision. Required when overwriting an existing model.",
                        },
                        {
                            "name": "X-Client-Id",
                            "in": "header",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Client identifier echoed in model.updated events so clients can ignore their own saves.",
                        },
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"type": "object"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Model saved",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelSaveResponse"}}},
                        },
                        "400": {"description": "Invalid input", "content": {"application/json": {"schema": error_schema}}},
                        "409": {
                            "description": "Missing or stale model revision",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ConflictResponse"}}},
                        },
                        "413": {"description": "Payload too large", "content": {"application/json": {"schema": error_schema}}},
                        "500": {"description": "Server error", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
            },
            "/api/models/{modelName}/ops": {
                "post": {
                    "tags": ["Models"],
                    "summary": "Apply element-level model operations",
                    "parameters": [
                        model_name_param,
                        {
                            "name": "If-Match",
                            "in": "header",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Current model revision. Falls back to request body baseModelRevision.",
                        },
                        {
                            "name": "X-Client-Id",
                            "in": "header",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Client identifier echoed in model.updated events.",
                        },
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelOperationsRequest"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Operations applied",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelOperationsResponse"}}},
                        },
                        "400": {"description": "Invalid operation request", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                        "409": {
                            "description": "Stale revision or operation conflict",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ConflictResponse"}}},
                        },
                    },
                }
            },
            "/api/models/{modelName}/drafts": {
                "get": {
                    "tags": ["Collaboration"],
                    "summary": "List live client drafts for one model",
                    "parameters": [model_name_param],
                    "responses": {
                        "200": {
                            "description": "Current in-memory drafts for this model",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDraftListResponse"}}},
                        },
                        "400": {"description": "Invalid model name", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                    },
                }
            },
            "/api/models/{modelName}/drafts/{clientId}": {
                "post": {
                    "tags": ["Collaboration"],
                    "summary": "Publish one client's live draft for a model",
                    "parameters": [model_name_param, client_id_param],
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDraft"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Draft stored and broadcast as draft.updated",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDraftResponse"}}},
                        },
                        "400": {"description": "Invalid draft", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
                "delete": {
                    "tags": ["Collaboration"],
                    "summary": "Clear one client's live draft for a model",
                    "parameters": [model_name_param, client_id_param],
                    "responses": {
                        "200": {
                            "description": "Draft cleared and broadcast as draft.cleared",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDraftDeleteResponse"}}},
                        },
                        "400": {"description": "Invalid model name or client id", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
            },
            "/api/model-files/{scope}/{modelName}": {
                "get": {
                    "tags": ["Models"],
                    "summary": "Load one HBDS model from a named file scope",
                    "parameters": [draft_scope_param, model_name_param],
                    "responses": {
                        "200": {
                            "description": "Scoped model payload",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelLoadResponse"}}},
                        },
                        "400": {"description": "Invalid scope or model name", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
                "post": {
                    "tags": ["Models"],
                    "summary": "Save one HBDS model into a named file scope",
                    "parameters": [draft_scope_param, model_name_param],
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"type": "object"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Scoped model saved",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelSaveResponse"}}},
                        },
                        "400": {"description": "Invalid input", "content": {"application/json": {"schema": error_schema}}},
                        "413": {"description": "Payload too large", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
            },
            "/api/drafts/{scope}/{modelName}": {
                "get": {
                    "tags": ["Collaboration"],
                    "summary": "List live client drafts in a named workspace scope",
                    "parameters": [draft_scope_param, model_name_param],
                    "responses": {
                        "200": {
                            "description": "Current in-memory drafts for this scoped model",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDraftListResponse"}}},
                        },
                        "400": {"description": "Invalid draft scope or model name", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                    },
                }
            },
            "/api/drafts/{scope}/{modelName}/clients/{clientId}": {
                "post": {
                    "tags": ["Collaboration"],
                    "summary": "Publish one client's live draft in a named workspace scope",
                    "parameters": [draft_scope_param, model_name_param, client_id_param],
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDraft"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Draft stored and broadcast as draft.updated",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDraftResponse"}}},
                        },
                        "400": {"description": "Invalid draft", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
                "delete": {
                    "tags": ["Collaboration"],
                    "summary": "Clear one client's live draft in a named workspace scope",
                    "parameters": [draft_scope_param, model_name_param, client_id_param],
                    "responses": {
                        "200": {
                            "description": "Draft cleared and broadcast as draft.cleared",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDraftDeleteResponse"}}},
                        },
                        "400": {"description": "Invalid draft scope, model name, or client id", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
            },
            "/api/events": {
                "get": {
                    "tags": ["Server"],
                    "summary": "Stream real-time API events",
                    "description": "Server-Sent Events stream. Emits client.joined, client.left, model.updated, draft.updated, and draft.cleared.",
                    "parameters": [
                        {
                            "name": "clientId",
                            "in": "query",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Browser, UI, or automation client identifier used for presence events.",
                        },
                        {
                            "name": "clientName",
                            "in": "query",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Human-readable client label used for presence and split-view selectors.",
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "SSE event stream",
                            "content": {
                                "text/event-stream": {
                                    "schema": {"type": "string", "example": "event: model.updated\\ndata: {...}\\n\\n"}
                                }
                            },
                        }
                    },
                }
            },
            "/api/openapi.json": {
                "get": {
                    "tags": ["Server"],
                    "summary": "Return the OpenAPI specification",
                    "responses": {"200": {"description": "OpenAPI document"}},
                }
            },
            "/api/docs": {
                "get": {
                    "tags": ["Server"],
                    "summary": "Return browser-readable API documentation",
                    "responses": {"200": {"description": "HTML API documentation"}},
                }
            },
        },
        "components": {
            "schemas": {
                "HealthResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "status": {"type": "string", "example": "connected"},
                    },
                    "required": ["ok", "status"],
                },
                "ModelMetadata": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "example": "human.json"},
                        "label": {"type": "string", "example": "Human"},
                        "size": {"type": "integer", "example": 1024},
                        "modified": {"type": "number"},
                        "modifiedIso": {"type": "string", "format": "date-time"},
                        "revision": {"type": "string", "description": "Content hash revision used for optimistic concurrency."},
                        "contentHash": {"type": "string"},
                    },
                    "required": ["name", "label", "size", "modified", "modifiedIso", "revision", "contentHash"],
                },
                "ModelListResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "models": {"type": "array", "items": {"$ref": "#/components/schemas/ModelMetadata"}},
                    },
                    "required": ["ok", "models"],
                },
                "ModelLoadResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "model": {"type": "object"},
                        "metadata": {"$ref": "#/components/schemas/ModelMetadata"},
                    },
                    "required": ["ok", "model"],
                },
                "ModelSaveResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "saved": {"type": "string", "example": "human.json"},
                        "backup": {"type": "string", "nullable": True},
                        "metadata": {"$ref": "#/components/schemas/ModelMetadata"},
                    },
                    "required": ["ok", "saved"],
                },
                "ModelOperation": {
                    "type": "object",
                    "properties": {
                        "opId": {"type": "string"},
                        "type": {
                            "type": "string",
                            "enum": ["updateClass", "createClass", "deleteClass", "updateLink", "createLink", "deleteLink"],
                        },
                        "targetId": {"description": "Class or link id used by update/delete operations."},
                        "patch": {"type": "object", "description": "Object patch for update operations."},
                        "class": {"type": "object", "description": "Class payload for createClass."},
                        "link": {"type": "object", "description": "Link payload for createLink."},
                    },
                    "required": ["type"],
                },
                "ModelOperationsRequest": {
                    "type": "object",
                    "properties": {
                        "clientId": {"type": "string"},
                        "baseModelRevision": {"type": "string"},
                        "operations": {"type": "array", "items": {"$ref": "#/components/schemas/ModelOperation"}},
                    },
                    "required": ["operations"],
                },
                "ModelOperationsResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "saved": {"type": "string", "example": "human.json"},
                        "backup": {"type": "string", "nullable": True},
                        "metadata": {"$ref": "#/components/schemas/ModelMetadata"},
                        "operations": {"type": "array", "items": {"$ref": "#/components/schemas/ModelOperation"}},
                        "merged": {"type": "boolean", "description": "True when operations were safely merged from a stale base revision."},
                    },
                    "required": ["ok", "saved", "metadata", "operations"],
                },
                "ModelDraft": {
                    "type": "object",
                    "properties": {
                        "modelName": {"type": "string", "example": "human.json"},
                        "clientId": {"type": "string", "example": "ui-lx9ad3"},
                        "clientName": {"type": "string", "example": "Alice"},
                        "baseModelRevision": {"type": "string"},
                        "mode": {"type": "string", "enum": ["presence", "editing"], "description": "presence means the client is viewing the model; editing means it has unsaved local changes."},
                        "dirty": {"type": "boolean", "description": "True when the draft should block blind saves from other clients."},
                        "isDirty": {"type": "boolean", "description": "Alias for dirty used by browser clients."},
                        "operations": {"type": "array", "items": {"$ref": "#/components/schemas/ModelOperation"}},
                        "selection": {"description": "Optional selected element ids or selection state."},
                        "cursor": {"description": "Optional pointer/cursor state."},
                        "viewport": {"description": "Optional canvas camera or viewport state."},
                        "preview": {
                            "description": "Optional preview-only state for split-view rendering, such as a throttled live canvas snapshot. This field is not saved into model JSON."
                        },
                        "model": {"type": "object", "description": "Optional draft model snapshot."},
                        "updatedAt": {"type": "string", "format": "date-time"},
                    },
                    "required": ["clientId", "operations"],
                },
                "ModelDraftListResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "modelName": {"type": "string", "example": "human.json"},
                        "drafts": {"type": "array", "items": {"$ref": "#/components/schemas/ModelDraft"}},
                    },
                    "required": ["ok", "modelName", "drafts"],
                },
                "ModelDraftResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "modelName": {"type": "string", "example": "human.json"},
                        "draft": {"$ref": "#/components/schemas/ModelDraft"},
                    },
                    "required": ["ok", "modelName", "draft"],
                },
                "ModelDraftDeleteResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "modelName": {"type": "string", "example": "human.json"},
                        "clientId": {"type": "string"},
                        "deleted": {"type": "boolean"},
                    },
                    "required": ["ok", "modelName", "clientId", "deleted"],
                },
                "ErrorResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": False},
                        "error": {
                            "type": "object",
                            "properties": {
                                "code": {"type": "string", "example": "invalid_model_name"},
                                "message": {"type": "string", "example": "Model file must end with .json"},
                            },
                            "required": ["code", "message"],
                        },
                    },
                    "required": ["ok", "error"],
                },
                "ConflictResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": False},
                        "error": {
                            "type": "object",
                            "properties": {
                                "code": {"type": "string", "example": "model_conflict"},
                                "message": {"type": "string"},
                                "modelName": {"type": "string", "example": "human.json"},
                                "attemptedRevision": {"type": "string"},
                                "currentRevision": {"type": "string"},
                                "metadata": {"$ref": "#/components/schemas/ModelMetadata"},
                            },
                            "required": ["code", "message", "currentRevision"],
                        },
                    },
                    "required": ["ok", "error"],
                },
            }
        },
}


class HBDSLocalServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.quiet = False
        self._event_lock = threading.Lock()
        self._event_sequence = 0
        self._event_subscribers: dict[queue.Queue, dict] = {}
        self._revision_lock = threading.Lock()
        self._revision_snapshots: dict[str, dict[str, dict]] = {}
        self._revision_order: dict[str, list[str]] = {}
        self._draft_lock = threading.Lock()
        self._drafts: dict[str, dict[str, dict]] = {}
        self._model_locks_guard = threading.Lock()
        self._model_locks: dict[str, threading.RLock] = {}

    def model_lock(self, model_name: str) -> threading.RLock:
        with self._model_locks_guard:
            lock = self._model_locks.get(model_name)
            if lock is None:
                lock = threading.RLock()
                self._model_locks[model_name] = lock
            return lock

    def add_event_subscriber(self, client_id: str = "", client_name: str = "") -> tuple[queue.Queue, dict]:
        subscriber: queue.Queue = queue.Queue(maxsize=100)
        clean_client_id = clean_client_text(client_id, fallback=f"client-{id(subscriber):x}")
        info = {
            "clientId": clean_client_id,
            "clientName": clean_client_text(client_name, max_length=MAX_CLIENT_NAME_LENGTH),
            "connectedAt": utc_now_iso(),
        }
        with self._event_lock:
            self._event_subscribers[subscriber] = info
            info = {**info, "subscriberCount": len(self._event_subscribers)}
        return subscriber, info

    def remove_event_subscriber(self, subscriber: queue.Queue) -> dict | None:
        with self._event_lock:
            info = self._event_subscribers.pop(subscriber, None)
            return {**info, "subscriberCount": len(self._event_subscribers)} if info else None

    def publish_event(self, event_type: str, payload: dict) -> dict:
        with self._event_lock:
            self._event_sequence += 1
            event = {
                **payload,
                "type": event_type,
                "sequence": self._event_sequence,
                "timestamp": utc_now_iso(),
            }
            subscribers = list(self._event_subscribers.keys())

        stale_subscribers = []
        for subscriber in subscribers:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                stale_subscribers.append(subscriber)

        if stale_subscribers:
            with self._event_lock:
                for subscriber in stale_subscribers:
                    self._event_subscribers.pop(subscriber, None)
        return event

    def remember_model_revision(self, model_name: str, revision: str, model: dict) -> None:
        if not model_name or not revision:
            return
        with self._revision_lock:
            snapshots = self._revision_snapshots.setdefault(model_name, {})
            order = self._revision_order.setdefault(model_name, [])
            snapshots[revision] = copy.deepcopy(model_without_server_metadata(model))
            if revision in order:
                order.remove(revision)
            order.append(revision)
            while len(order) > MAX_REVISION_SNAPSHOTS_PER_MODEL:
                old_revision = order.pop(0)
                snapshots.pop(old_revision, None)

    def get_model_revision(self, model_name: str, revision: str) -> dict | None:
        with self._revision_lock:
            snapshot = self._revision_snapshots.get(model_name, {}).get(revision)
            return copy.deepcopy(snapshot) if snapshot is not None else None

    def set_model_draft(self, model_name: str, client_id: str, draft: dict) -> dict:
        updated = {
            **copy.deepcopy(draft),
            "modelName": model_name,
            "clientId": client_id,
            "updatedAt": utc_now_iso(),
        }
        with self._draft_lock:
            model_drafts = self._drafts.setdefault(model_name, {})
            model_drafts[client_id] = updated
            return copy.deepcopy(updated)

    def delete_model_draft(self, model_name: str, client_id: str) -> dict | None:
        with self._draft_lock:
            model_drafts = self._drafts.get(model_name, {})
            removed = model_drafts.pop(client_id, None)
            if not model_drafts:
                self._drafts.pop(model_name, None)
            return copy.deepcopy(removed) if removed is not None else None

    def delete_client_drafts(self, client_id: str) -> list[dict]:
        removed: list[dict] = []
        with self._draft_lock:
            for model_name in list(self._drafts.keys()):
                model_drafts = self._drafts.get(model_name, {})
                draft = model_drafts.pop(client_id, None)
                if draft is not None:
                    removed.append(copy.deepcopy(draft))
                if not model_drafts:
                    self._drafts.pop(model_name, None)
        return removed

    def list_model_drafts(self, model_name: str) -> list[dict]:
        with self._draft_lock:
            drafts = list(self._drafts.get(model_name, {}).values())
        return sorted((copy.deepcopy(draft) for draft in drafts), key=lambda item: item.get("updatedAt", ""))


class HBDSRequestHandler(SimpleHTTPRequestHandler):
    server_version = "HBDSLocalServer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        if self.is_allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, If-Match, X-Client-Id, X-Client-Name")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.handle_api_get(path)
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.handle_api_post(path)
            return
        self.json_error(HTTPStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "POST is only allowed for API endpoints")

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.handle_api_delete(path)
            return
        self.json_error(HTTPStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "DELETE is only allowed for API endpoints")

    def handle_api_get(self, path: str) -> None:
        try:
            if path == "/api/health":
                self.json_response({"ok": True, "status": "connected", "time": utc_now_iso()})
            elif path == "/api/models":
                self.json_response({"ok": True, "models": list_models()})
            elif path == "/api/events":
                self.event_stream()
            elif path == "/api/openapi.json":
                self.json_response(openapi_spec(self.headers.get("Host", "")))
            elif path == "/api/docs":
                self.swagger_docs()
            elif path.startswith("/api/model-files/"):
                self.load_scoped_model(path.removeprefix("/api/model-files/"))
            elif path.startswith("/api/drafts/"):
                self.list_scoped_model_drafts(path.removeprefix("/api/drafts/"))
            elif path.startswith("/api/models/") and path.endswith("/drafts"):
                self.list_model_drafts(path.removeprefix("/api/models/").removesuffix("/drafts"))
            elif path.startswith("/api/models/"):
                self.load_model(path.removeprefix("/api/models/"))
            else:
                self.json_error(HTTPStatus.NOT_FOUND, "not_found", "API endpoint not found")
        except Exception:
            self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "server_error", "Server error")

    def handle_api_post(self, path: str) -> None:
        try:
            if path.startswith("/api/model-files/"):
                self.save_scoped_model(path.removeprefix("/api/model-files/"))
            elif path.startswith("/api/drafts/") and "/clients/" in path:
                self.save_scoped_model_draft(path.removeprefix("/api/drafts/"))
            elif path.startswith("/api/models/") and "/drafts/" in path:
                self.save_model_draft(path.removeprefix("/api/models/"))
            elif path.startswith("/api/models/") and path.endswith("/ops"):
                self.apply_model_ops(path.removeprefix("/api/models/").removesuffix("/ops"))
            elif path.startswith("/api/models/"):
                self.save_model(path.removeprefix("/api/models/"))
            else:
                self.json_error(HTTPStatus.NOT_FOUND, "not_found", "API endpoint not found")
        except Exception:
            self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "server_error", "Server error")

    def handle_api_delete(self, path: str) -> None:
        try:
            if path.startswith("/api/drafts/") and "/clients/" in path:
                self.delete_scoped_model_draft(path.removeprefix("/api/drafts/"))
            elif path.startswith("/api/models/") and "/drafts/" in path:
                self.delete_model_draft(path.removeprefix("/api/models/"))
            else:
                self.json_error(HTTPStatus.NOT_FOUND, "not_found", "API endpoint not found")
        except Exception:
            self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "server_error", "Server error")

    def read_json_request_payload(self) -> dict | None:
        length_header = self.headers.get("Content-Length")
        try:
            length = int(length_header or "0")
        except ValueError:
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_length", "Invalid Content-Length")
            return None
        if length <= 0:
            self.json_error(HTTPStatus.BAD_REQUEST, "empty_body", "Request body is required")
            return None
        if length > MAX_JSON_BYTES:
            self.json_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "payload_too_large", "Model payload is too large")
            return None
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_json", "Request body must be valid JSON")
            return None
        if not isinstance(payload, dict):
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_json", "Request body must be a JSON object")
            return None
        return payload

    def load_model(self, raw_name: str) -> None:
        name, error = validate_model_name(raw_name)
        if error:
            self.json_error(HTTPStatus.BAD_REQUEST, error["code"], error["message"])
            return
        with self.server.model_lock(name):
            target = MODELS_DIR / name
            if not target.exists():
                self.json_error(HTTPStatus.NOT_FOUND, "model_not_found", "Model not found")
                return
            try:
                with target.open("r", encoding="utf-8") as handle:
                    model = json.load(handle)
            except json.JSONDecodeError:
                self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "invalid_stored_model", "Stored model JSON is invalid")
                return
            metadata = model_metadata(target)
            self.remember_model_revision(name, metadata["revision"], model)
            response = {"ok": True, "model": model_with_server_metadata(model, metadata), "metadata": metadata}
        self.json_response(response)

    def save_model(self, raw_name: str) -> None:
        name, error = validate_model_name(raw_name)
        if error:
            self.json_error(HTTPStatus.BAD_REQUEST, error["code"], error["message"])
            return
        payload = self.read_json_request_payload()
        if payload is None:
            return
        validation_error = validate_model_payload(payload)
        if validation_error:
            self.json_error(HTTPStatus.BAD_REQUEST, validation_error["code"], validation_error["message"])
            return

        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        with self.server.model_lock(name):
            target = MODELS_DIR / name
            if target.exists():
                current_metadata = model_metadata(target)
                current_revision = current_metadata["revision"]
                client_revision = client_revision_from_request(self.headers, payload)
                if not client_revision:
                    self.json_error(
                        HTTPStatus.CONFLICT,
                        "missing_revision",
                        "Model already exists. Reload it before saving so the server can prevent overwrites.",
                        modelName=name,
                        currentRevision=current_revision,
                        metadata=current_metadata,
                    )
                    return
                if client_revision != current_revision:
                    self.json_error(
                        HTTPStatus.CONFLICT,
                        "model_conflict",
                        "Model has changed on the server. Reload before saving or merge your changes.",
                        modelName=name,
                        attemptedRevision=client_revision,
                        currentRevision=current_revision,
                        metadata=current_metadata,
                    )
                    return

            backup_name = write_model_payload(target, payload)
            metadata = model_metadata(target)
            self.remember_model_revision(target.name, metadata["revision"], payload)
            response = {
                "ok": True,
                "saved": target.name,
                "backup": backup_name,
                "metadata": metadata,
            }
        self.publish_model_updated(target.name, metadata, backup_name)
        self.json_response(response)

    def load_scoped_model(self, raw_path: str) -> None:
        parsed = self.parse_scoped_model_path(raw_path, require_exists=True)
        if parsed is None:
            return
        _scope, name, target, model_key = parsed
        with self.server.model_lock(model_key):
            if not target.exists():
                self.json_error(HTTPStatus.NOT_FOUND, "model_not_found", "Model not found")
                return
            try:
                with target.open("r", encoding="utf-8") as handle:
                    model = json.load(handle)
            except json.JSONDecodeError:
                self.json_error(HTTPStatus.BAD_REQUEST, "invalid_json", "Model file is not valid JSON")
                return
            metadata = model_metadata(target)
            self.remember_model_revision(model_key, metadata["revision"], model)
            response = {
                "ok": True,
                "modelName": model_key,
                "saved": name,
                "model": model_with_server_metadata(model, metadata),
                "metadata": metadata,
            }
        self.json_response(response)

    def save_scoped_model(self, raw_path: str) -> None:
        parsed = self.parse_scoped_model_path(raw_path, require_exists=False)
        if parsed is None:
            return
        scope, name, target, model_key = parsed
        if scope != "test_models":
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_model_scope", "Scoped save is only enabled for test_models")
            return
        payload = self.read_json_request_payload()
        if payload is None:
            return
        validation_error = validate_model_payload(payload)
        if validation_error:
            self.json_error(HTTPStatus.BAD_REQUEST, validation_error["code"], validation_error["message"])
            return

        with self.server.model_lock(model_key):
            backup_name = write_model_payload(target, payload)
            metadata = model_metadata(target)
            self.remember_model_revision(model_key, metadata["revision"], payload)
            response = {
                "ok": True,
                "saved": name,
                "modelName": model_key,
                "backup": backup_name,
                "metadata": metadata,
            }
        self.publish_model_updated(model_key, metadata, backup_name, client_id=self.headers.get("X-Client-Id", ""))
        self.json_response(response)

    def apply_model_ops(self, raw_name: str) -> None:
        name, error = validate_model_name(raw_name)
        if error:
            self.json_error(HTTPStatus.BAD_REQUEST, error["code"], error["message"])
            return
        target = MODELS_DIR / name

        payload = self.read_json_request_payload()
        if payload is None:
            return

        with self.server.model_lock(name):
            if not target.exists():
                self.json_error(HTTPStatus.NOT_FOUND, "model_not_found", "Model not found")
                return

            current_metadata = model_metadata(target)
            current_revision = current_metadata["revision"]
            client_revision = client_revision_from_request(self.headers, payload)
            if not client_revision:
                self.json_error(
                    HTTPStatus.CONFLICT,
                    "missing_revision",
                    "Operation request must include baseModelRevision or If-Match.",
                    modelName=name,
                    currentRevision=current_revision,
                    metadata=current_metadata,
                )
                return
            try:
                model = read_stored_model(target)
            except json.JSONDecodeError:
                self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "invalid_stored_model", "Stored model JSON is invalid")
                return
            self.remember_model_revision(name, current_revision, model)

            merged_from_stale_revision = False
            if client_revision != current_revision:
                base_model = self.get_model_revision(name, client_revision)
                if base_model is None:
                    self.json_error(
                        HTTPStatus.CONFLICT,
                        "base_revision_unavailable",
                        "Base revision is no longer available for automatic merge. Reload before applying operations.",
                        modelName=name,
                        attemptedRevision=client_revision,
                        currentRevision=current_revision,
                        metadata=current_metadata,
                    )
                    return
                try:
                    ensure_operations_can_merge(base_model, model, payload.get("operations"))
                except OperationError as operation_error:
                    self.json_error(
                        operation_error.status,
                        operation_error.code,
                        operation_error.message,
                        modelName=name,
                        attemptedRevision=client_revision,
                        currentRevision=current_revision,
                        **operation_error.details,
                    )
                    return
                merged_from_stale_revision = True

            try:
                applied_operations = apply_model_operations(model, payload.get("operations"))
            except OperationError as operation_error:
                self.json_error(
                    operation_error.status,
                    operation_error.code,
                    operation_error.message,
                    modelName=name,
                    currentRevision=current_revision,
                    **operation_error.details,
                )
                return

            backup_name = write_model_payload(target, model)
            metadata = model_metadata(target)
            self.remember_model_revision(target.name, metadata["revision"], model)
            response = {
                "ok": True,
                "saved": target.name,
                "backup": backup_name,
                "metadata": metadata,
                "operations": applied_operations,
                "merged": merged_from_stale_revision,
            }
        self.publish_model_updated(
            target.name,
            metadata,
            backup_name,
            operations=applied_operations,
            client_id=payload.get("clientId"),
        )
        self.json_response(response)

    def list_model_drafts(self, raw_name: str) -> None:
        name, error = validate_model_name(raw_name)
        if error:
            self.json_error(HTTPStatus.BAD_REQUEST, error["code"], error["message"])
            return
        if not (MODELS_DIR / name).exists():
            self.json_error(HTTPStatus.NOT_FOUND, "model_not_found", "Model not found")
            return
        drafts = self.server.list_model_drafts(name) if hasattr(self.server, "list_model_drafts") else []
        self.json_response({"ok": True, "modelName": name, "drafts": drafts})

    def list_scoped_model_drafts(self, raw_path: str) -> None:
        model_name = self.parse_scoped_draft_collection_path(raw_path)
        if not model_name:
            return
        drafts = self.server.list_model_drafts(model_name) if hasattr(self.server, "list_model_drafts") else []
        self.json_response({"ok": True, "modelName": model_name, "drafts": drafts})

    def save_model_draft(self, raw_path: str) -> None:
        name, client_id = self.parse_draft_path(raw_path)
        if not name or not client_id:
            return
        if not (MODELS_DIR / name).exists():
            self.json_error(HTTPStatus.NOT_FOUND, "model_not_found", "Model not found")
            return
        payload = self.read_json_request_payload()
        if payload is None:
            return
        draft = self.normalize_draft_payload(name, client_id, payload)
        if draft is None:
            return
        stored = self.server.set_model_draft(name, client_id, draft) if hasattr(self.server, "set_model_draft") else draft
        self.publish_server_event("draft.updated", stored)
        self.json_response({"ok": True, "modelName": name, "draft": stored})

    def save_scoped_model_draft(self, raw_path: str) -> None:
        model_name, client_id = self.parse_scoped_draft_client_path(raw_path)
        if not model_name or not client_id:
            return
        payload = self.read_json_request_payload()
        if payload is None:
            return
        draft = self.normalize_draft_payload(model_name, client_id, payload)
        if draft is None:
            return
        stored = self.server.set_model_draft(model_name, client_id, draft) if hasattr(self.server, "set_model_draft") else draft
        self.publish_server_event("draft.updated", stored)
        self.json_response({"ok": True, "modelName": model_name, "draft": stored})

    def delete_model_draft(self, raw_path: str) -> None:
        name, client_id = self.parse_draft_path(raw_path)
        if not name or not client_id:
            return
        removed = self.server.delete_model_draft(name, client_id) if hasattr(self.server, "delete_model_draft") else None
        event = {
            "modelName": name,
            "clientId": client_id,
            "clientName": (removed or {}).get("clientName", ""),
            "clearedAt": utc_now_iso(),
        }
        self.publish_server_event("draft.cleared", event)
        self.json_response({"ok": True, "modelName": name, "clientId": client_id, "deleted": removed is not None})

    def delete_scoped_model_draft(self, raw_path: str) -> None:
        model_name, client_id = self.parse_scoped_draft_client_path(raw_path)
        if not model_name or not client_id:
            return
        removed = self.server.delete_model_draft(model_name, client_id) if hasattr(self.server, "delete_model_draft") else None
        event = {
            "modelName": model_name,
            "clientId": client_id,
            "clientName": (removed or {}).get("clientName", ""),
            "clearedAt": utc_now_iso(),
        }
        self.publish_server_event("draft.cleared", event)
        self.json_response({"ok": True, "modelName": model_name, "clientId": client_id, "deleted": removed is not None})

    def parse_draft_path(self, raw_path: str) -> tuple[str | None, str | None]:
        parts = raw_path.split("/", 2)
        if len(parts) != 3 or parts[1] != "drafts":
            self.json_error(HTTPStatus.NOT_FOUND, "not_found", "Draft endpoint not found")
            return None, None
        name, error = validate_model_name(parts[0])
        if error:
            self.json_error(HTTPStatus.BAD_REQUEST, error["code"], error["message"])
            return None, None
        client_id = clean_client_text(unquote(parts[2]), max_length=MAX_CLIENT_ID_LENGTH)
        if not client_id:
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_client_id", "Draft client id is required")
            return None, None
        return name, client_id

    def parse_scoped_model_path(self, raw_path: str, *, require_exists: bool) -> tuple[str, str, Path, str] | None:
        parts = raw_path.split("/", 1)
        if len(parts) != 2:
            self.json_error(HTTPStatus.NOT_FOUND, "not_found", "Scoped model endpoint not found")
            return None
        scope, name, target, model_key, error = validate_scoped_model_path(
            parts[0],
            parts[1],
            require_exists=require_exists,
        )
        if error:
            status = HTTPStatus.NOT_FOUND if error["code"] == "model_not_found" else HTTPStatus.BAD_REQUEST
            self.json_error(status, error["code"], error["message"])
            return None
        return scope, name, target, model_key

    def parse_scoped_draft_collection_path(self, raw_path: str) -> str | None:
        parts = raw_path.split("/", 1)
        if len(parts) != 2:
            self.json_error(HTTPStatus.NOT_FOUND, "not_found", "Draft endpoint not found")
            return None
        model_name, error = validate_scoped_draft_model(parts[0], parts[1])
        if error:
            status = HTTPStatus.NOT_FOUND if error["code"] == "model_not_found" else HTTPStatus.BAD_REQUEST
            self.json_error(status, error["code"], error["message"])
            return None
        return model_name

    def parse_scoped_draft_client_path(self, raw_path: str) -> tuple[str | None, str | None]:
        parts = raw_path.split("/", 3)
        if len(parts) != 4 or parts[2] != "clients":
            self.json_error(HTTPStatus.NOT_FOUND, "not_found", "Draft endpoint not found")
            return None, None
        model_name, error = validate_scoped_draft_model(parts[0], parts[1])
        if error:
            status = HTTPStatus.NOT_FOUND if error["code"] == "model_not_found" else HTTPStatus.BAD_REQUEST
            self.json_error(status, error["code"], error["message"])
            return None, None
        client_id = clean_client_text(unquote(parts[3]), max_length=MAX_CLIENT_ID_LENGTH)
        if not client_id:
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_client_id", "Draft client id is required")
            return None, None
        return model_name, client_id

    def normalize_draft_payload(self, model_name: str, client_id: str, payload: dict) -> dict | None:
        operations = payload.get("operations", [])
        if operations is None:
            operations = []
        if not isinstance(operations, list):
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_draft", "Draft operations must be an array")
            return None
        draft = {
            "modelName": model_name,
            "clientId": client_id,
            "clientName": clean_client_text(
                payload.get("clientName") or self.headers.get("X-Client-Name", ""),
                max_length=MAX_CLIENT_NAME_LENGTH,
            ),
            "baseModelRevision": normalize_revision_token(
                payload.get("baseModelRevision") or payload.get("revision") or payload.get("modelRevision")
            ),
            "operations": copy.deepcopy(operations),
        }
        for key in ("mode", "dirty", "isDirty", "selection", "cursor", "viewport", "preview", "summary", "status", "model", "diagram"):
            if key in payload:
                draft[key] = copy.deepcopy(payload[key])
        return draft

    def remember_model_revision(self, model_name: str, revision: str, model: dict) -> None:
        if hasattr(self.server, "remember_model_revision"):
            self.server.remember_model_revision(model_name, revision, model)

    def get_model_revision(self, model_name: str, revision: str) -> dict | None:
        if not hasattr(self.server, "get_model_revision"):
            return None
        return self.server.get_model_revision(model_name, revision)

    def event_stream(self) -> None:
        if not hasattr(self.server, "add_event_subscriber"):
            self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "events_unavailable", "Event stream is unavailable")
            return
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        subscriber, client_info = self.server.add_event_subscriber(
            first_query_value(query, "clientId"),
            first_query_value(query, "clientName"),
        )
        try:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            self.publish_server_event("client.joined", client_info)
            while True:
                try:
                    event = subscriber.get(timeout=EVENT_HEARTBEAT_SECONDS)
                    self.wfile.write(format_sse_event(event))
                except queue.Empty:
                    self.wfile.write(b": heartbeat\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            departed = self.server.remove_event_subscriber(subscriber)
            if departed:
                if hasattr(self.server, "delete_client_drafts"):
                    for removed in self.server.delete_client_drafts(departed.get("clientId", "")):
                        self.publish_server_event("draft.cleared", {
                            "modelName": removed.get("modelName", ""),
                            "clientId": removed.get("clientId", departed.get("clientId", "")),
                            "clientName": removed.get("clientName", departed.get("clientName", "")),
                            "clearedAt": utc_now_iso(),
                        })
                self.publish_server_event("client.left", departed)

    def publish_server_event(self, event_type: str, payload: dict) -> None:
        if hasattr(self.server, "publish_event"):
            self.server.publish_event(event_type, payload)

    def publish_model_updated(
        self,
        model_name: str,
        metadata: dict,
        backup_name: str | None,
        *,
        operations: list[dict] | None = None,
        client_id: object = None,
    ) -> None:
        if not hasattr(self.server, "publish_event"):
            return
        event_client_id = str(client_id if client_id is not None else self.headers.get("X-Client-Id", "")).strip()
        event = {
            "modelName": model_name,
            "modelRevision": metadata["revision"],
            "revision": metadata["revision"],
            "metadata": metadata,
            "backup": backup_name,
            "clientId": event_client_id,
        }
        if operations is not None:
            event["operations"] = operations
        self.server.publish_event("model.updated", event)

    def swagger_docs(self) -> None:
        body = b"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HBDS API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    html,
    body {
      margin: 0;
      min-height: 100%;
      background: #f7f7f7;
    }

    body {
      font-family: Arial, sans-serif;
    }

    .swagger-ui .topbar {
      display: none;
    }

    #fallback {
      display: none;
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px 16px 48px;
      color: #1f2937;
    }

    .fallback-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding: 22px 0 26px;
      border-bottom: 1px solid #d1d5db;
    }

    .fallback-header h1 {
      margin: 0 0 8px;
      font-size: 32px;
      font-weight: 700;
    }

    .fallback-header p {
      margin: 0;
      max-width: 720px;
      color: #4b5563;
      line-height: 1.5;
    }

    .tag-block {
      margin-top: 28px;
    }

    .tag-title {
      margin: 0 0 12px;
      font-size: 24px;
      font-weight: 700;
    }

    .operation {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 10px 0;
      border: 1px solid;
      border-radius: 4px;
      padding: 6px;
      font-size: 14px;
    }

    .method {
      min-width: 68px;
      border-radius: 3px;
      color: white;
      font-size: 13px;
      font-weight: 700;
      line-height: 32px;
      text-align: center;
      text-transform: uppercase;
    }

    .path {
      font-family: Consolas, monospace;
      font-size: 15px;
      font-weight: 700;
      color: #111827;
    }

    .summary {
      color: #4b5563;
    }

    .get {
      background: #eff6ff;
      border-color: #60a5fa;
    }

    .get .method {
      background: #3b82f6;
    }

    .post {
      background: #ecfdf5;
      border-color: #34d399;
    }

    .post .method {
      background: #10b981;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <main id="fallback"></main>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    const specUrl = '/api/openapi.json';
    const fallback = document.getElementById('fallback');

    function text(value) {
      return value == null ? '' : String(value);
    }

    function escapeHtml(value) {
      return text(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function renderFallback(spec) {
      const operationsByTag = {};
      const paths = spec.paths || {};
      Object.keys(paths).forEach((path) => {
        const pathItem = paths[path] || {};
        Object.keys(pathItem).forEach((method) => {
          const operation = pathItem[method] || {};
          const tag = (operation.tags && operation.tags[0]) || 'API';
          operationsByTag[tag] = operationsByTag[tag] || [];
          operationsByTag[tag].push({
            method,
            path,
            summary: operation.summary || operation.description || ''
          });
        });
      });

      const tagNames = (spec.tags || []).map((tag) => tag.name)
        .filter((tag) => operationsByTag[tag]);
      Object.keys(operationsByTag).forEach((tag) => {
        if (!tagNames.includes(tag)) {
          tagNames.push(tag);
        }
      });

      fallback.innerHTML = `
        <section class="fallback-header">
          <div>
            <h1>${escapeHtml(spec.info && spec.info.title || 'API Documentation')}</h1>
            <p>${escapeHtml(spec.info && spec.info.description || '')}</p>
          </div>
        </section>
        ${tagNames.map((tag) => `
          <section class="tag-block">
            <h2 class="tag-title">${escapeHtml(tag)}</h2>
            ${operationsByTag[tag].map((operation) => `
              <div class="operation ${escapeHtml(operation.method)}">
                <span class="method">${escapeHtml(operation.method)}</span>
                <span class="path">${escapeHtml(operation.path)}</span>
                <span class="summary">${escapeHtml(operation.summary)}</span>
              </div>
            `).join('')}
          </section>
        `).join('')}
      `;
      fallback.style.display = 'block';
    }

    function showFallback() {
      fetch(specUrl)
        .then((response) => response.json())
        .then(renderFallback)
        .catch(() => {
          fallback.innerHTML = '<section class="fallback-header"><div><h1>HBDS API Documentation</h1><p>Unable to load the OpenAPI specification.</p></div></section>';
          fallback.style.display = 'block';
        });
    }

    if (window.SwaggerUIBundle) {
      try {
        window.SwaggerUIBundle({
          url: specUrl,
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            window.SwaggerUIBundle.presets.apis
          ],
          layout: 'BaseLayout'
        });
      } catch (error) {
        showFallback();
      }
    } else {
      showFallback();
    }
  </script>
</body>
</html>"""
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def json_response(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def json_error(self, status: HTTPStatus, code: str, message: str, **details) -> None:
        self.json_response({"ok": False, "error": error_payload(code, message, **details)}, status)

    @staticmethod
    def is_allowed_origin(origin: str) -> bool:
        if not origin:
            return False
        if origin == "null":
            return True
        return origin in LOCAL_ORIGINS or origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")

    def log_message(self, format: str, *args) -> None:
        if getattr(self.server, "quiet", False):
            return
        super().log_message(format, *args)


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve HBDS UI and model API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    refresh_model_manifests()
    httpd = HBDSLocalServer((args.host, args.port), HBDSRequestHandler)
    httpd.quiet = args.quiet
    print(f"Serving HBDS on http://{args.host}:{args.port}")
    print("Open http://127.0.0.1:%d/index.html" % args.port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
