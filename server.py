#!/usr/bin/python3
"""Local HBDS static file and model API server."""

from __future__ import annotations

import argparse
import copy
import datetime as _dt
import errno
import hashlib
import html
import ipaddress
import json
import os
import queue
import shutil
import socket
import sys
import tempfile
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import TextIO
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import parse_qs, quote, unquote, urlparse


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


def is_loopback_bind_host(host: str) -> bool:
    clean_host = str(host or "").strip().split("%", 1)[0]
    if not clean_host:
        return False
    try:
        address = ipaddress.ip_address(clean_host)
        if address.is_loopback:
            return True
        return bool(address.version == 6 and address.ipv4_mapped and address.ipv4_mapped.is_loopback)
    except ValueError:
        try:
            resolved = socket.getaddrinfo(clean_host, None, type=socket.SOCK_STREAM)
        except socket.gaierror:
            return False
        addresses = {
            ipaddress.ip_address(item[4][0].split("%", 1)[0])
            for item in resolved
        }
        return bool(addresses) and all(
            address.is_loopback
            or bool(address.version == 6 and address.ipv4_mapped and address.ipv4_mapped.is_loopback)
            for address in addresses
        )


def connected_bind_requires_remote_acknowledgement(
    host: str,
    *,
    static_only: bool,
    allow_remote: bool,
) -> bool:
    return not static_only and not allow_remote and not is_loopback_bind_host(host)


ROOT_DIR = Path(__file__).resolve().parent
MODELS_DIR = (ROOT_DIR / "models").resolve()
TEST_MODELS_DIR = (ROOT_DIR / "test_models").resolve()
MODELS_MANIFEST_PATH = MODELS_DIR / "models_manifest.json"
TEST_MODELS_MANIFEST_PATH = TEST_MODELS_DIR / "test_models_manifest.json"
BACKUP_DIR = MODELS_DIR / ".backups"
DEBUG_LOG_DIR = ROOT_DIR / "debug_logs"
SERVER_STDOUT_LOG_PATH = ROOT_DIR / ".codex_server_out.log"
SERVER_STDERR_LOG_PATH = ROOT_DIR / ".codex_server_err.log"
SERVER_ACCESS_LOG_PATH = ROOT_DIR / ".codex_server_access.log"
MAX_JSON_BYTES = 5 * 1024 * 1024
MAX_AI_REQUEST_BYTES = env_int("HBDS_AI_REQUEST_MAX_BYTES", 512 * 1024)
MAX_AI_RESPONSE_BYTES = env_int("HBDS_AI_RESPONSE_MAX_BYTES", 8 * 1024 * 1024)
MAX_AI_ERROR_BYTES = env_int("HBDS_AI_ERROR_MAX_BYTES", 64 * 1024)
AI_PROVIDER_TIMEOUT_SECONDS = env_int("HBDS_AI_TIMEOUT_SECONDS", 60)
HBDS_AI_PROMPT_TEMPLATE_VERSION = "hbds-ai-prompt-v1"
MAX_DEBUG_BATCH_EVENTS = 100
SERVER_LOG_ROTATION_BYTES = env_int("HBDS_SERVER_LOG_MAX_BYTES", 1024 * 1024)
SERVER_LOG_ROTATION_BACKUPS = env_int("HBDS_SERVER_LOG_BACKUPS", 3)
EVENT_HEARTBEAT_SECONDS = 15
MAX_REVISION_SNAPSHOTS_PER_MODEL = 20
MAX_CLIENT_ID_LENGTH = 120
MAX_CLIENT_NAME_LENGTH = 160
CLIENT_DISCONNECT_ERRNOS = {
    errno.EPIPE,
    errno.ECONNRESET,
    getattr(errno, "ECONNABORTED", 103),
}
CLIENT_DISCONNECT_WINERRORS = {10053, 10054, 10058}
LOCAL_ORIGINS = {
    "http://127.0.0.1",
    "http://127.0.0.1:8010",
    "http://localhost",
    "http://localhost:8010",
}
PROTECTED_MODEL_FILE_NAMES = {
    "hyperclass_mail_carrier_with_links.json",
    "models.json",
    "transportation_links.json",
}
PUBLIC_ROOT_FILES = {
    "index.html",
    "index_models.html",
    "test_dynamic_hbds_layout.html",
}
PUBLIC_STATIC_EXTENSIONS = {
    "css": {".css"},
    "js": {".js"},
    "icons": {".json", ".png", ".svg"},
    "images": {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"},
    "pictures": {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"},
    "models": {".json"},
    "schemas": {".json"},
    "test_models": {".json"},
}
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' http://127.0.0.1:* http://localhost:*; "
        "font-src 'self' data:; object-src 'none'; base-uri 'self'; "
        "frame-ancestors 'self'; form-action 'self'; worker-src 'self' blob:"
    ),
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Permitted-Cross-Domain-Policies": "none",
}

AI_PROVIDER_DEFINITIONS = [
    {
        "id": "openai",
        "label": "ChatGPT/OpenAI",
        "defaultModel": "gpt-5.5",
        "models": [
            {"id": "gpt-5.5", "label": "GPT-5.5", "supportsReasoningEffort": True, "defaultReasoningEffort": "medium"},
            {"id": "gpt-5.4", "label": "GPT-5.4", "supportsReasoningEffort": True, "defaultReasoningEffort": "medium"},
            {"id": "gpt-5.4-mini", "label": "GPT-5.4 Mini", "supportsReasoningEffort": True, "defaultReasoningEffort": "low"},
            {"id": "gpt-4.1", "label": "GPT-4.1", "supportsReasoningEffort": False},
        ],
        "requiresKey": True,
        "allowsUserKey": True,
        "requiresBaseUrl": False,
        "supportsCustomBaseUrl": False,
        "supportsJsonMode": True,
        "supportsReasoningEffort": True,
        "serverEnvKey": "OPENAI_API_KEY",
    },
    {
        "id": "chatgpt-manual",
        "label": "ChatGPT Pro / Manual",
        "defaultModel": "",
        "models": [],
        "requiresKey": False,
        "allowsUserKey": False,
        "requiresBaseUrl": False,
        "supportsCustomBaseUrl": False,
        "supportsJsonMode": True,
        "manualWorkflow": True,
        "serverEnvKey": "",
    },
    {
        "id": "anthropic",
        "label": "Claude/Anthropic",
        "defaultModel": "claude-3-5-sonnet-latest",
        "models": [
            {"id": "claude-3-5-sonnet-latest", "label": "Claude 3.5 Sonnet"},
            {"id": "claude-3-5-haiku-latest", "label": "Claude 3.5 Haiku"},
            {"id": "claude-3-opus-latest", "label": "Claude 3 Opus"},
        ],
        "requiresKey": True,
        "allowsUserKey": True,
        "requiresBaseUrl": False,
        "supportsCustomBaseUrl": False,
        "supportsJsonMode": True,
        "serverEnvKey": "ANTHROPIC_API_KEY",
    },
    {
        "id": "ollama",
        "label": "Local/Ollama",
        "defaultModel": "llama3.1",
        "models": [
            {"id": "llama3.1", "label": "Llama 3.1"},
            {"id": "llama3.2", "label": "Llama 3.2"},
            {"id": "qwen2.5", "label": "Qwen 2.5"},
            {"id": "mistral", "label": "Mistral"},
        ],
        "requiresKey": False,
        "allowsUserKey": False,
        "requiresBaseUrl": True,
        "defaultBaseUrl": "http://127.0.0.1:11434",
        "supportsCustomBaseUrl": True,
        "supportsJsonMode": False,
        "serverEnvKey": "",
    },
    {
        "id": "custom-openai",
        "label": "Custom OpenAI-compatible",
        "defaultModel": "",
        "models": [],
        "supportsReasoningEffort": True,
        "requiresKey": False,
        "allowsUserKey": True,
        "requiresBaseUrl": True,
        "defaultBaseUrl": "",
        "supportsCustomBaseUrl": True,
        "supportsJsonMode": True,
        "serverEnvKey": "HBDS_AI_CUSTOM_API_KEY",
    },
]


def utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def debug_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def reset_startup_logs() -> TextIO | None:
    visible_stdout = sys.stdout
    if os.environ.get("HBDS_KEEP_SERVER_LOGS") == "1":
        return visible_stdout
    for log_path in (SERVER_STDOUT_LOG_PATH, SERVER_STDERR_LOG_PATH, SERVER_ACCESS_LOG_PATH):
        rotate_log_file(log_path)
    if sys.stdout and not sys.stdout.isatty():
        sys.stdout = SERVER_STDOUT_LOG_PATH.open("w", encoding="utf-8", buffering=1)
    else:
        SERVER_STDOUT_LOG_PATH.write_text("", encoding="utf-8")
    if sys.stderr and not sys.stderr.isatty():
        sys.stderr = SERVER_STDERR_LOG_PATH.open("w", encoding="utf-8", buffering=1)
    else:
        SERVER_STDERR_LOG_PATH.write_text("", encoding="utf-8")
    SERVER_ACCESS_LOG_PATH.write_text("", encoding="utf-8")
    DEBUG_LOG_DIR.mkdir(parents=True, exist_ok=True)
    for log_path in DEBUG_LOG_DIR.glob("*.jsonl"):
        try:
            log_path.unlink()
        except OSError:
            pass
    return visible_stdout


def print_startup_message(message: str, visible_stdout: TextIO | None) -> None:
    print(message, flush=True)
    if visible_stdout and visible_stdout is not sys.stdout:
        try:
            print(message, file=visible_stdout, flush=True)
        except (OSError, ValueError):
            pass


ACCESS_LOG_LOCK = threading.Lock()


def rotated_log_path(path: Path, index: int) -> Path:
    return path.with_name(f"{path.name}.{index}")


def rotate_log_file(path: Path) -> None:
    if SERVER_LOG_ROTATION_BYTES <= 0 or SERVER_LOG_ROTATION_BACKUPS <= 0:
        return
    try:
        if not path.exists() or path.stat().st_size < SERVER_LOG_ROTATION_BYTES:
            return
        oldest = rotated_log_path(path, SERVER_LOG_ROTATION_BACKUPS)
        if oldest.exists():
            oldest.unlink()
        for index in range(SERVER_LOG_ROTATION_BACKUPS - 1, 0, -1):
            source = rotated_log_path(path, index)
            if source.exists():
                os.replace(source, rotated_log_path(path, index + 1))
        os.replace(path, rotated_log_path(path, 1))
    except OSError:
        pass


def is_client_disconnect(error: BaseException) -> bool:
    if isinstance(error, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
        return True
    if not isinstance(error, OSError):
        return False
    return (
        getattr(error, "errno", None) in CLIENT_DISCONNECT_ERRNOS
        or getattr(error, "winerror", None) in CLIENT_DISCONNECT_WINERRORS
    )


class ClientDisconnected(ConnectionError):
    """Raised internally when a browser closes the connection mid-response."""



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


def clean_debug_log_token(value: object, fallback: str = "unknown") -> str:
    clean = "".join(
        char if char.isalnum() or char in ("-", "_", ".") else "_"
        for char in str(value or "").strip()
    ).strip("._")
    return (clean or fallback)[:MAX_CLIENT_ID_LENGTH]


def debug_event_payload(event_type: str, client_id: str, ui_name: str = "", **details) -> dict:
    return {
        **details,
        "timestamp": debug_now_iso(),
        "type": event_type,
        "clientId": clean_client_text(client_id, max_length=MAX_CLIENT_ID_LENGTH),
        "uiName": clean_client_text(ui_name, max_length=MAX_CLIENT_NAME_LENGTH),
    }


def public_static_request_path(path: str) -> str | None:
    """Return a canonical public path or None when the repository path is private."""
    raw_path = urlparse(path).path
    try:
        decoded_path = unquote(raw_path, errors="strict")
    except UnicodeDecodeError:
        return None
    if decoded_path == "/":
        return "/index.html"
    if not decoded_path.startswith("/") or decoded_path.endswith("/"):
        return None
    if "\\" in decoded_path or any(ord(char) < 32 for char in decoded_path):
        return None

    parts = decoded_path[1:].split("/")
    if not parts or any(
        not part
        or part in {".", ".."}
        or part.startswith(".")
        or ":" in part
        or "?" in part
        or "#" in part
        for part in parts
    ):
        return None

    if len(parts) == 1:
        if parts[0] not in PUBLIC_ROOT_FILES:
            return None
        public_base = ROOT_DIR
    else:
        public_base = (ROOT_DIR / parts[0]).resolve()
        allowed_extensions = PUBLIC_STATIC_EXTENSIONS.get(parts[0])
        if not allowed_extensions or Path(parts[-1]).suffix.lower() not in allowed_extensions:
            return None

    try:
        public_base.relative_to(ROOT_DIR)
        requested = (ROOT_DIR.joinpath(*parts)).resolve()
        requested.relative_to(public_base)
    except (OSError, ValueError):
        return None
    if requested.is_dir():
        return None
    return "/" + "/".join(parts)


def missing_icon_svg(path: str) -> bytes:
    stem = Path(unquote(urlparse(path).path)).stem
    label = " ".join(stem.replace("_", " ").replace("-", " ").split()) or "Icon"
    initials = "".join(part[0] for part in label.split()[:2]).upper() or "?"
    hue = int(hashlib.sha1(stem.encode("utf-8")).hexdigest()[:6], 16) % 360
    safe_label = html.escape(label.title())
    safe_initials = html.escape(initials[:3])
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="{safe_label}">
  <title>{safe_label}</title>
  <rect x="10" y="10" width="76" height="76" rx="18" fill="hsl({hue} 72% 93%)" stroke="hsl({hue} 58% 38%)" stroke-width="5"/>
  <circle cx="48" cy="38" r="13" fill="none" stroke="#0f172a" stroke-width="5" opacity=".88"/>
  <path d="M26 68c8-12 18-18 22-18s14 6 22 18" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round" opacity=".88"/>
  <text x="48" y="86" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="hsl({hue} 58% 30%)">{safe_initials}</text>
</svg>
"""
    return svg.encode("utf-8")


def is_missing_svg_icon_request(path: str) -> bool:
    parsed_path = unquote(urlparse(path).path)
    if not parsed_path.startswith("/icons/") or not parsed_path.lower().endswith(".svg"):
        return False
    requested = (ROOT_DIR / parsed_path.lstrip("/")).resolve()
    try:
        requested.relative_to((ROOT_DIR / "icons").resolve())
    except ValueError:
        return False
    return not requested.exists()


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


def model_scope_dir(scope: str) -> Path:
    return MODELS_DIR if scope == "models" else TEST_MODELS_DIR


def normalize_model_scope(raw_scope: object) -> tuple[str | None, dict | None]:
    scope = str(raw_scope or "models").strip().strip("/")
    if scope in {"models", "test_models"}:
        return scope, None
    return None, error_payload("invalid_model_scope", "Model scope must be models or test_models")


def model_key_for_scope(scope: str, name: str) -> str:
    return name if scope == "models" else f"{scope}/{name}"


def sanitize_model_file_name(seed: object, fallback: str = "ai_model") -> str:
    text = str(seed or fallback).strip().lower()
    stem = []
    previous_separator = False
    for char in text:
        if char.isalnum():
            stem.append(char)
            previous_separator = False
        elif not previous_separator:
            stem.append("_")
            previous_separator = True
    clean = "".join(stem).strip("_") or fallback
    if clean.endswith("_json"):
        clean = clean[:-5]
    return f"{clean[:80].strip('_') or fallback}.json"


def unique_model_file_name(scope: str, requested_name: str) -> str:
    base_name, error = validate_model_name(requested_name)
    if error:
        base_name = sanitize_model_file_name(requested_name)
    base_dir = model_scope_dir(scope)
    stem = Path(base_name).stem
    suffix = Path(base_name).suffix or ".json"
    candidate = f"{stem}{suffix}"
    index = 1
    while (base_dir / candidate).exists():
        candidate = f"{stem}_{index}{suffix}"
        index += 1
    return candidate


def requested_ai_model_file_name(model: dict, requested_name: object = "") -> str:
    metadata = model.get("metadata") if isinstance(model.get("metadata"), dict) else {}
    seed = requested_name or metadata.get("name") or metadata.get("id") or "ai_model"
    return sanitize_model_file_name(seed)


def is_protected_model_file(scope: str, name: str, model: dict | None = None) -> bool:
    clean = name.lower()
    if clean in PROTECTED_MODEL_FILE_NAMES:
        return True
    if model and isinstance(model.get("metadata"), dict):
        source = str(model["metadata"].get("source") or "").strip().lower()
        if source == "ai":
            return False
    return False


def prepare_ai_model_for_save(model: dict, operation_mode: str, *, save_as_new: bool = False) -> dict:
    prepared = normalize_ai_hbds_model_response(model)
    metadata = prepared.setdefault("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}
        prepared["metadata"] = metadata
    now = utc_now_iso()
    if not metadata.get("name"):
        metadata["name"] = "AI Model"
    if not metadata.get("id"):
        metadata["id"] = Path(sanitize_model_file_name(metadata.get("name"))).stem
    metadata["source"] = "ai"
    metadata["aiOperationMode"] = operation_mode or "generate"
    metadata.setdefault("createdAt", now)
    metadata["modifiedAt"] = now
    layout = metadata.setdefault("layout", {})
    if isinstance(layout, dict):
        layout.setdefault("algorithm", "none")
    else:
        metadata["layout"] = {"algorithm": "none"}
    if save_as_new:
        metadata.pop("revision", None)
        metadata.pop("contentHash", None)
        metadata.pop("modified", None)
        metadata.pop("modifiedIso", None)
    return prepared


def validate_model_payload(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return error_payload("invalid_model", "Model JSON must be an object")
    semantic_version = payload.get("metadata", {}).get("semanticVersion") if isinstance(payload.get("metadata"), dict) else None
    if semantic_version is not None and semantic_version != 1:
        return error_payload("invalid_model", "metadata.semanticVersion must be 1 when provided")
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
    semantic_collections: dict[str, list] = {}
    for collection_name in ("object", "objectLink", "membership", "inheritance"):
        collection = hypergraph.get(collection_name, [])
        if not isinstance(collection, list):
            return error_payload(
                "invalid_model",
                f"Model hypergraph.{collection_name} must be an array when provided",
            )
        semantic_collections[collection_name] = collection

    seen_ids: dict[str, list[str]] = {}
    class_ids: set[str] = set()
    class_types: dict[str, str] = {}
    attribute_ids_by_class: dict[str, set[str]] = {}

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
        class_types[node_id] = clean_id(node.get("type"))

        attributes = node.get("attributes", [])
        if not isinstance(attributes, list):
            return error_payload("invalid_model", f"class {node_id} attributes must be an array")
        attribute_ids_by_class[node_id] = set()
        for attr_index, attribute in enumerate(attributes):
            attr_owner = f"class[{node_id}].attributes[{attr_index}]"
            if not isinstance(attribute, dict):
                continue
            validation_error = register_id(attribute.get("id"), attr_owner)
            if validation_error:
                return validation_error
            attribute_ids_by_class[node_id].add(clean_id(attribute.get("id")))

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

    links_by_id: dict[str, dict] = {}
    for link_index, link in enumerate(links):
        owner = f"link[{link_index}]"
        if not isinstance(link, dict):
            return error_payload("invalid_model", f"{owner} must be an object")
        validation_error = register_id(link.get("id"), owner)
        if validation_error:
            return validation_error
        link_id = clean_id(link.get("id"))
        links_by_id[link_id] = link
        source_id = clean_id(link.get("sourceClassId"))
        target_id = clean_id(link.get("targetClassId"))
        if not source_id or source_id not in class_ids:
            return error_payload("invalid_model", f"link {link_id} sourceClassId must reference an existing class")
        if not target_id or target_id not in class_ids:
            return error_payload("invalid_model", f"link {link_id} targetClassId must reference an existing class")

    semantic_memberships: dict[str, set[str]] = {}
    membership_pairs: set[tuple[str, str]] = set()
    for membership_index, membership in enumerate(semantic_collections["membership"]):
        owner = f"membership[{membership_index}]"
        if not isinstance(membership, dict):
            return error_payload("invalid_model", f"{owner} must be an object")
        validation_error = register_id(membership.get("id"), owner)
        if validation_error:
            return validation_error
        member_id = clean_id(membership.get("classId", membership.get("memberClassId")))
        hyperclass_id = clean_id(membership.get("hyperclassId"))
        if member_id not in class_ids:
            return error_payload("invalid_model", f"{owner} classId must reference an existing class")
        if hyperclass_id not in class_ids or class_types.get(hyperclass_id) != "hyperclass":
            return error_payload("invalid_model", f"{owner} hyperclassId must reference an existing hyperclass")
        if member_id == hyperclass_id:
            return error_payload("invalid_model", f"{owner} cannot make a hyperclass a member of itself")
        pair = (member_id, hyperclass_id)
        if pair in membership_pairs:
            return error_payload("invalid_model", f"Duplicate semantic membership {member_id} -> {hyperclass_id}")
        membership_pairs.add(pair)
        semantic_memberships.setdefault(member_id, set()).add(hyperclass_id)

    active_memberships: set[str] = set()
    resolved_memberships: set[str] = set()

    def validate_membership_acyclic(class_id: str) -> bool:
        if class_id in resolved_memberships:
            return True
        if class_id in active_memberships:
            return False
        active_memberships.add(class_id)
        for hyperclass_id in semantic_memberships.get(class_id, set()):
            if not validate_membership_acyclic(hyperclass_id):
                return False
        active_memberships.remove(class_id)
        resolved_memberships.add(class_id)
        return True

    for class_id in sorted(class_ids):
        if not validate_membership_acyclic(class_id):
            return error_payload("invalid_model", "Semantic memberships must not contain cycles")

    inheritance_parents: dict[str, set[str]] = {}
    inheritance_pairs: set[tuple[str, str]] = set()
    for inheritance_index, inheritance in enumerate(semantic_collections["inheritance"]):
        owner = f"inheritance[{inheritance_index}]"
        if not isinstance(inheritance, dict):
            return error_payload("invalid_model", f"{owner} must be an object")
        validation_error = register_id(inheritance.get("id"), owner)
        if validation_error:
            return validation_error
        subclass_id = clean_id(inheritance.get("subClassId"))
        superclass_id = clean_id(inheritance.get("superClassId"))
        if subclass_id not in class_ids or class_types.get(subclass_id) == "hyperclass":
            return error_payload("invalid_model", f"{owner} subClassId must reference an existing regular class")
        if superclass_id not in class_ids or class_types.get(superclass_id) == "hyperclass":
            return error_payload("invalid_model", f"{owner} superClassId must reference an existing regular class")
        if subclass_id == superclass_id:
            return error_payload("invalid_model", f"{owner} cannot make a class inherit from itself")
        pair = (subclass_id, superclass_id)
        if pair in inheritance_pairs:
            return error_payload("invalid_model", f"Duplicate inheritance {subclass_id} -> {superclass_id}")
        inheritance_pairs.add(pair)
        inheritance_parents.setdefault(subclass_id, set()).add(superclass_id)

    active_inheritance: set[str] = set()
    resolved_inheritance: set[str] = set()

    def validate_inheritance_acyclic(class_id: str) -> bool:
        if class_id in resolved_inheritance:
            return True
        if class_id in active_inheritance:
            return False
        active_inheritance.add(class_id)
        for parent_id in inheritance_parents.get(class_id, set()):
            if not validate_inheritance_acyclic(parent_id):
                return False
        active_inheritance.remove(class_id)
        resolved_inheritance.add(class_id)
        return True

    for class_id in sorted(class_ids):
        if not validate_inheritance_acyclic(class_id):
            return error_payload("invalid_model", "Semantic inheritance must not contain cycles")

    semantic_ancestors_cache: dict[str, set[str]] = {}

    def semantic_ancestors(class_id: str) -> set[str]:
        if class_id in semantic_ancestors_cache:
            return semantic_ancestors_cache[class_id]
        ancestors: set[str] = set()
        for parent_id in inheritance_parents.get(class_id, set()):
            ancestors.add(parent_id)
            ancestors.update(semantic_ancestors(parent_id))
        semantic_ancestors_cache[class_id] = ancestors
        return ancestors

    def effective_attribute_ids(class_id: str) -> set[str]:
        result = set(attribute_ids_by_class.get(class_id, set()))
        for ancestor_id in semantic_ancestors(class_id):
            result.update(attribute_ids_by_class.get(ancestor_id, set()))
        return result

    def semantic_classifications(class_id: str) -> set[str]:
        classifications: set[str] = set()
        pending = [class_id]
        visited: set[str] = set()
        while pending:
            candidate_id = pending.pop()
            if candidate_id in visited:
                continue
            visited.add(candidate_id)
            related_ids = set(semantic_ancestors(candidate_id))
            related_ids.update(semantic_memberships.get(candidate_id, set()))
            for related_id in related_ids:
                if related_id != class_id:
                    classifications.add(related_id)
                if related_id not in visited:
                    pending.append(related_id)
        return classifications

    objects_by_id: dict[str, dict] = {}
    for object_index, object_value in enumerate(semantic_collections["object"]):
        owner = f"object[{object_index}]"
        if not isinstance(object_value, dict):
            return error_payload("invalid_model", f"{owner} must be an object")
        validation_error = register_id(object_value.get("id"), owner)
        if validation_error:
            return validation_error
        object_id = clean_id(object_value.get("id"))
        class_id = clean_id(object_value.get("classId"))
        if class_id not in class_ids or class_types.get(class_id) == "hyperclass":
            return error_payload("invalid_model", f"object {object_id} classId must reference an existing non-hyperclass")
        objects_by_id[object_id] = object_value
        valid_attribute_ids = effective_attribute_ids(class_id)
        attribute_values = object_value.get("attributeValues", object_value.get("values", []))
        if attribute_values is None:
            attribute_values = []
        if isinstance(attribute_values, dict):
            attribute_values = [
                {"attributeId": attribute_id, "value": value}
                for attribute_id, value in attribute_values.items()
            ]
        if not isinstance(attribute_values, list):
            return error_payload("invalid_model", f"object {object_id} attributeValues must be an array")
        seen_attribute_values: set[str] = set()
        for value_index, attribute_value in enumerate(attribute_values):
            if not isinstance(attribute_value, dict):
                return error_payload(
                    "invalid_model",
                    f"object {object_id} attributeValues[{value_index}] must be an object",
                )
            attribute_id = clean_id(attribute_value.get("attributeId"))
            if attribute_id not in valid_attribute_ids:
                return error_payload(
                    "invalid_model",
                    f"object {object_id} attributeId {attribute_id} must reference an effective class attribute",
                )
            if attribute_id in seen_attribute_values:
                return error_payload("invalid_model", f"object {object_id} has duplicate attributeId {attribute_id}")
            seen_attribute_values.add(attribute_id)
        object_attributes = object_value.get("attributes")
        if object_attributes is not None:
            if not isinstance(object_attributes, list):
                return error_payload("invalid_model", f"object {object_id} attributes must be an array")
            seen_object_attributes: set[str] = set()
            for value_index, attribute_value in enumerate(object_attributes):
                if not isinstance(attribute_value, dict):
                    return error_payload(
                        "invalid_model",
                        f"object {object_id} attributes[{value_index}] must be an object",
                    )
                attribute_id = clean_id(attribute_value.get("attributeId"))
                if attribute_id not in valid_attribute_ids:
                    return error_payload(
                        "invalid_model",
                        f"object {object_id} attributeId {attribute_id} must reference an effective class attribute",
                    )
                if attribute_id in seen_object_attributes:
                    return error_payload("invalid_model", f"object {object_id} has duplicate attributeId {attribute_id}")
                seen_object_attributes.add(attribute_id)

    def object_matches_class(object_value: dict, required_class_id: str) -> bool:
        object_class_id = clean_id(object_value.get("classId"))
        return object_class_id == required_class_id or required_class_id in semantic_classifications(object_class_id)

    for object_link_index, object_link in enumerate(semantic_collections["objectLink"]):
        owner = f"objectLink[{object_link_index}]"
        if not isinstance(object_link, dict):
            return error_payload("invalid_model", f"{owner} must be an object")
        validation_error = register_id(object_link.get("id"), owner)
        if validation_error:
            return validation_error
        object_link_id = clean_id(object_link.get("id"))
        link_id = clean_id(object_link.get("classLinkId", object_link.get("linkId")))
        link = links_by_id.get(link_id)
        if not link:
            return error_payload("invalid_model", f"objectLink {object_link_id} classLinkId must reference an existing link")
        source_object_id = clean_id(object_link.get("sourceObjectId"))
        target_object_id = clean_id(object_link.get("targetObjectId"))
        source_object = objects_by_id.get(source_object_id)
        target_object = objects_by_id.get(target_object_id)
        if not source_object:
            return error_payload("invalid_model", f"objectLink {object_link_id} sourceObjectId must reference an existing object")
        if not target_object:
            return error_payload("invalid_model", f"objectLink {object_link_id} targetObjectId must reference an existing object")
        if source_object_id == target_object_id and link.get("allowSelfLink") is False:
            return error_payload("invalid_model", f"objectLink {object_link_id} uses a link that disallows self-links")
        if not object_matches_class(source_object, clean_id(link.get("sourceClassId"))):
            return error_payload("invalid_model", f"objectLink {object_link_id} source object is incompatible with its link")
        if not object_matches_class(target_object, clean_id(link.get("targetClassId"))):
            return error_payload("invalid_model", f"objectLink {object_link_id} target object is incompatible with its link")

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


def ai_backend_enabled() -> bool:
    return os.environ.get("HBDS_AI_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def ai_provider_capabilities() -> list[dict]:
    providers = []
    for provider in AI_PROVIDER_DEFINITIONS:
        env_key = provider.get("serverEnvKey") or ""
        configured = bool(env_key and os.environ.get(env_key))
        public_provider = {
            key: value
            for key, value in provider.items()
            if key != "serverEnvKey"
        }
        public_provider["configuredOnServer"] = configured
        public_provider["credentialStatus"] = (
            "configured_on_server"
            if configured
            else ("key_required" if provider.get("requiresKey") else "no_key_required")
        )
        providers.append(public_provider)
    return providers


def ai_provider_by_id(provider_id: object) -> dict | None:
    clean = str(provider_id or "").strip()
    return next((provider for provider in AI_PROVIDER_DEFINITIONS if provider["id"] == clean), None)


def build_hbds_ai_prompt(payload: dict) -> str:
    operation = str(payload.get("operationMode") or "generate").strip() or "generate"
    request_text = str(payload.get("requestText") or "").strip()
    provider_id = str(payload.get("providerId") or "").strip()
    model_name = str(payload.get("modelName") or "").strip()
    reasoning_effort = str(payload.get("reasoningEffort") or "").strip()
    current_model = payload.get("currentModel")

    lines = [
        f"HBDS AI prompt template: {HBDS_AI_PROMPT_TEMPLATE_VERSION}",
        "",
        "You are assisting the HBDS Graphic Simulator.",
        "The user request is limited to HBDS model generation, validation, improvement, or correction.",
        "Return JSON only. Do not use Markdown fences, prose, comments, or explanations.",
        "",
        "Required HBDS output:",
        "- Return one valid JSON object.",
        "- The object must be an HBDS model with a top-level metadata object and hypergraph object.",
        "- hypergraph.class must be an array. Hyperclasses and classes both belong in hypergraph.class.",
        "- hypergraph.link must be an array.",
        "- For each hypergraph.class item, use type = \"hyperclass\" or type = \"class\". Do not use kind.",
        "- For each class or hyperclass, put attributes in an attributes array. Do not use attribute.",
        "- For each link, use sourceClassId and targetClassId. Do not use source or target.",
        "- Link rendering may include arrowType, arrowDirection, lineStyle, lineWidth, lineColor, arrowColor, and labelFontSize.",
        "- Valid arrowType values are triangle, outline, chevron, double-chevron, triple-chevron, filled-triangle, hollow-triangle, dotted, bar-arrow, double-bar-arrow, cone, diamond, and none.",
        "- Valid arrowDirection values are source-to-target, target-to-source, bidirectional, and none.",
        "- Valid lineStyle values are solid, dashed, dotted, thick, and thin.",
        "- Position objects must include numeric x, y, and z values.",
        "- Every class, hyperclass, attribute, and link must have a stable unique id.",
        "- For the optional semantic object layer, set metadata.semanticVersion = 1 and use hypergraph.object, objectLink, membership, and inheritance arrays.",
        "- Semantic objects use id, classId, and attributeValues entries with attributeId and value.",
        "- Object links use id, classLinkId, sourceObjectId, and targetObjectId.",
        "- Semantic memberships use id, classId, and hyperclassId; they are independent of visual parentClassId containment.",
        "- Semantic inheritance uses id, subClassId, and superClassId and must be acyclic.",
        "- Optional semantic profiles are enabled only through metadata.semanticProfiles.",
        "- Use metadata.layout.algorithm = \"none\" or metadata.layout.layout = \"none\".",
        "- Optional metadata.font may include size, family, bold, italic, underline, classSize, hyperclassSize, attributeSize, and linkSize; per-type sizes override the overall size for that text category.",
        "- Even with layout set to none, calculate explicit positions for every class and hyperclass so the model opens well-positioned in the HBDS renderer.",
        "- Keep coordinates readable, non-overlapping, and centered around the origin when possible.",
        "- Do not include scripts, HTML, event handlers, Markdown, or executable content in names, descriptions, attributes, or metadata.",
        "- If validating a model, return a JSON object with validation findings and, when possible, a corrected HBDS model.",
        "- If improving a model, preserve existing ids when entities still represent the same concept.",
        "",
        f"Operation mode: {operation}",
        f"Provider id: {provider_id or 'unspecified'}",
        f"Requested provider model: {model_name or 'unspecified'}",
        f"Reasoning effort: {reasoning_effort or 'provider default'}",
        "",
        "User HBDS request:",
        request_text,
    ]
    if isinstance(current_model, dict):
        lines.extend([
            "",
            "Current HBDS model JSON:",
            json.dumps(current_model, ensure_ascii=False, separators=(",", ":")),
        ])
    return "\n".join(lines)


def validate_ai_prompt_payload(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return error_payload("invalid_ai_request", "AI request body must be a JSON object")
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(encoded) > MAX_AI_REQUEST_BYTES:
        return error_payload("ai_request_too_large", "AI request payload is too large", maxBytes=MAX_AI_REQUEST_BYTES)
    request_text = str(payload.get("requestText") or "").strip()
    if not request_text:
        return error_payload("invalid_ai_request", "AI request text is required")
    operation = str(payload.get("operationMode") or "").strip()
    if operation not in {"generate", "validate", "improve", "repair"}:
        return error_payload("invalid_ai_operation", "AI operation must be generate, validate, improve, or repair")
    reasoning_effort = str(payload.get("reasoningEffort") or "").strip()
    if reasoning_effort and reasoning_effort not in {"none", "low", "medium", "high", "xhigh"}:
        return error_payload("invalid_ai_reasoning_effort", "AI reasoning effort must be none, low, medium, high, or xhigh")
    provider = ai_provider_by_id(payload.get("providerId"))
    if provider is None:
        return error_payload("invalid_ai_provider", "AI provider is not supported")
    if provider.get("requiresBaseUrl") and not str(payload.get("baseUrl") or provider.get("defaultBaseUrl") or "").strip():
        return error_payload("invalid_ai_provider_config", "Base URL is required for this AI provider")
    current_model = payload.get("currentModel")
    if operation in {"validate", "improve"} and current_model is not None and not isinstance(current_model, dict):
        return error_payload("invalid_ai_request", "Current model must be a JSON object")
    return None


def validate_ai_connection_payload(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return error_payload("invalid_ai_request", "AI connection request body must be a JSON object")
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(encoded) > MAX_AI_REQUEST_BYTES:
        return error_payload("ai_request_too_large", "AI connection request payload is too large", maxBytes=MAX_AI_REQUEST_BYTES)
    reasoning_effort = str(payload.get("reasoningEffort") or "").strip()
    if reasoning_effort and reasoning_effort not in {"none", "low", "medium", "high", "xhigh"}:
        return error_payload("invalid_ai_reasoning_effort", "AI reasoning effort must be none, low, medium, high, or xhigh")
    provider = ai_provider_by_id(payload.get("providerId"))
    if provider is None:
        return error_payload("invalid_ai_provider", "AI provider is not supported")
    if provider.get("requiresBaseUrl") and not str(payload.get("baseUrl") or provider.get("defaultBaseUrl") or "").strip():
        return error_payload("invalid_ai_provider_config", "Base URL is required for this AI provider")
    return None


def ai_provider_key(provider: dict, payload: dict) -> str:
    env_key = str(provider.get("serverEnvKey") or "")
    if env_key:
        value = os.environ.get(env_key, "").strip()
        if value:
            return value
    if provider.get("allowsUserKey"):
        return str(payload.get("apiKey") or "").strip()
    return ""


def ai_provider_base_url(provider: dict, payload: dict) -> str:
    if provider.get("supportsCustomBaseUrl") or provider.get("requiresBaseUrl"):
        return str(payload.get("baseUrl") or provider.get("defaultBaseUrl") or "").strip().rstrip("/")
    return str(provider.get("defaultBaseUrl") or "").strip().rstrip("/")


def ai_provider_model(provider: dict, payload: dict) -> str:
    return str(payload.get("modelName") or provider.get("defaultModel") or "").strip()


def provider_model_option(provider: dict, model: str) -> dict | None:
    clean = str(model or "").strip()
    for option in provider.get("models", []) or []:
        if isinstance(option, dict) and str(option.get("id") or "").strip() == clean:
            return option
    return None


def provider_model_supports_reasoning_effort(provider: dict, model: str) -> bool:
    option = provider_model_option(provider, model)
    if option is not None and "supportsReasoningEffort" in option:
        return bool(option.get("supportsReasoningEffort"))
    return bool(provider.get("supportsReasoningEffort"))


def ai_user_key_present(provider: dict, payload: dict) -> bool:
    return bool(provider.get("allowsUserKey") and str(payload.get("apiKey") or "").strip())


def ai_provider_call_enabled(provider: dict, payload: dict) -> bool:
    if provider.get("manualWorkflow"):
        return False
    if ai_backend_enabled():
        return True
    return ai_user_key_present(provider, payload)


def ai_private_provider_urls_enabled() -> bool:
    return os.environ.get("HBDS_AI_ALLOW_PRIVATE_URLS", "").strip().lower() in {"1", "true", "yes", "on"}


def ai_provider_request_options(provider: dict) -> dict:
    allow_private = ai_private_provider_urls_enabled()
    return {
        "allow_loopback": provider.get("id") == "ollama" or allow_private,
        "allow_private": allow_private,
    }


def validate_ai_provider_url(
    url: str,
    *,
    allow_loopback: bool = False,
    allow_private: bool = False,
) -> None:
    """Reject non-HTTP and unsafe provider destinations before opening a socket."""
    try:
        parsed = urlparse(url)
        port = parsed.port
    except ValueError as exc:
        raise OperationError(
            "ai_provider_invalid_url",
            "AI provider URL is invalid.",
            HTTPStatus.BAD_REQUEST,
        ) from exc
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise OperationError(
            "ai_provider_invalid_url",
            "AI provider URL must be an HTTP(S) URL without credentials, query parameters, or fragments.",
            HTTPStatus.BAD_REQUEST,
        )

    hostname = parsed.hostname.rstrip(".").lower()
    try:
        addresses = {ipaddress.ip_address(hostname)}
    except ValueError:
        try:
            resolved = socket.getaddrinfo(
                hostname,
                port or (443 if parsed.scheme.lower() == "https" else 80),
                type=socket.SOCK_STREAM,
            )
        except socket.gaierror as exc:
            raise OperationError(
                "ai_provider_invalid_url",
                "AI provider hostname could not be resolved.",
                HTTPStatus.BAD_REQUEST,
            ) from exc
        addresses = {ipaddress.ip_address(item[4][0].split("%", 1)[0]) for item in resolved}

    if parsed.scheme.lower() == "http" and any(not address.is_loopback for address in addresses):
        raise OperationError(
            "ai_provider_invalid_url",
            "Plain HTTP AI provider URLs are allowed only on the loopback interface.",
            HTTPStatus.BAD_REQUEST,
        )

    for address in addresses:
        if address.is_unspecified or address.is_multicast or address.is_link_local or address.is_reserved:
            raise OperationError(
                "ai_provider_invalid_url",
                "AI provider URL resolves to a prohibited network address.",
                HTTPStatus.BAD_REQUEST,
            )
        if address.is_loopback:
            if allow_loopback:
                continue
            raise OperationError(
                "ai_provider_invalid_url",
                "AI provider loopback URLs are not allowed for this provider.",
                HTTPStatus.BAD_REQUEST,
            )
        if address.is_private and not allow_private:
            raise OperationError(
                "ai_provider_invalid_url",
                "AI provider private-network URLs require explicit server opt-in.",
                HTTPStatus.BAD_REQUEST,
            )


class ValidatedAiRedirectHandler(urlrequest.HTTPRedirectHandler):
    def __init__(self, *, allow_loopback: bool, allow_private: bool):
        super().__init__()
        self.allow_loopback = allow_loopback
        self.allow_private = allow_private

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_ai_provider_url(
            newurl,
            allow_loopback=self.allow_loopback,
            allow_private=self.allow_private,
        )
        old_url = urlparse(req.full_url)
        new_url = urlparse(newurl)
        old_origin = (old_url.scheme.lower(), old_url.hostname, old_url.port or (443 if old_url.scheme == "https" else 80))
        new_origin = (new_url.scheme.lower(), new_url.hostname, new_url.port or (443 if new_url.scheme == "https" else 80))
        if old_origin != new_origin:
            raise OperationError(
                "ai_provider_redirect_blocked",
                "AI provider redirected to a different origin.",
                HTTPStatus.BAD_GATEWAY,
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def open_ai_provider_request(
    request: urlrequest.Request,
    *,
    timeout: int,
    allow_loopback: bool,
    allow_private: bool,
):
    validate_ai_provider_url(
        request.full_url,
        allow_loopback=allow_loopback,
        allow_private=allow_private,
    )
    opener = urlrequest.build_opener(
        ValidatedAiRedirectHandler(allow_loopback=allow_loopback, allow_private=allow_private)
    )
    return opener.open(request, timeout=timeout)


def read_ai_provider_response(response) -> str:
    limit = max(1024, MAX_AI_RESPONSE_BYTES)
    content_length = response.headers.get("Content-Length", "")
    try:
        declared_length = int(content_length)
    except (TypeError, ValueError):
        declared_length = 0
    if declared_length > limit:
        raise OperationError(
            "ai_provider_response_too_large",
            "AI provider response exceeded the configured size limit.",
            HTTPStatus.BAD_GATEWAY,
        )
    body = response.read(limit + 1)
    if len(body) > limit:
        raise OperationError(
            "ai_provider_response_too_large",
            "AI provider response exceeded the configured size limit.",
            HTTPStatus.BAD_GATEWAY,
        )
    return body.decode("utf-8", errors="replace")


def provider_http_error_message(exc: urlerror.HTTPError) -> tuple[str, dict]:
    details = {"providerStatus": exc.code}
    body = ""
    try:
        limit = max(1024, MAX_AI_ERROR_BYTES)
        body_bytes = exc.read(limit + 1)
        body = body_bytes[:limit].decode("utf-8", errors="replace").strip()
        if len(body_bytes) > limit:
            details["providerErrorTruncated"] = True
    except Exception:
        body = ""

    provider_message = ""
    if body:
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = None
        error_obj = parsed.get("error") if isinstance(parsed, dict) else None
        if isinstance(error_obj, dict):
            provider_message = str(error_obj.get("message") or "").strip()
            details["providerErrorType"] = error_obj.get("type")
            details["providerErrorCode"] = error_obj.get("code")
            details["providerErrorParam"] = error_obj.get("param")
        elif isinstance(parsed, dict):
            provider_message = str(parsed.get("message") or parsed.get("error") or "").strip()
        if not provider_message:
            provider_message = body[:500]

    message = f"AI provider returned HTTP {exc.code}"
    if provider_message:
        message = f"{message}: {provider_message}"
        details["providerErrorMessage"] = provider_message[:500]
    return message, details


def json_post(
    url: str,
    payload: dict,
    headers: dict,
    timeout: int = AI_PROVIDER_TIMEOUT_SECONDS,
    *,
    allow_loopback: bool = False,
    allow_private: bool = False,
) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urlrequest.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            **headers,
        },
        method="POST",
    )
    try:
        with open_ai_provider_request(
            request,
            timeout=timeout,
            allow_loopback=allow_loopback,
            allow_private=allow_private,
        ) as response:
            body = read_ai_provider_response(response)
    except urlerror.HTTPError as exc:
        message, details = provider_http_error_message(exc)
        raise OperationError("ai_provider_error", message, HTTPStatus.BAD_GATEWAY, **details) from exc
    except urlerror.URLError as exc:
        raise OperationError("ai_provider_unreachable", f"AI provider is unreachable: {exc.reason}", HTTPStatus.BAD_GATEWAY) from exc
    except TimeoutError as exc:
        raise OperationError("ai_provider_timeout", "AI provider request timed out", HTTPStatus.GATEWAY_TIMEOUT) from exc
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise OperationError("ai_provider_invalid_response", "AI provider returned non-JSON response", HTTPStatus.BAD_GATEWAY) from exc


def json_get(
    url: str,
    headers: dict,
    timeout: int = AI_PROVIDER_TIMEOUT_SECONDS,
    *,
    allow_loopback: bool = False,
    allow_private: bool = False,
) -> dict:
    request = urlrequest.Request(
        url,
        headers={
            "Accept": "application/json",
            **headers,
        },
        method="GET",
    )
    try:
        with open_ai_provider_request(
            request,
            timeout=timeout,
            allow_loopback=allow_loopback,
            allow_private=allow_private,
        ) as response:
            body = read_ai_provider_response(response)
    except urlerror.HTTPError as exc:
        message, details = provider_http_error_message(exc)
        raise OperationError("ai_provider_error", message, HTTPStatus.BAD_GATEWAY, **details) from exc
    except urlerror.URLError as exc:
        raise OperationError("ai_provider_unreachable", f"AI provider is unreachable: {exc.reason}", HTTPStatus.BAD_GATEWAY) from exc
    except TimeoutError as exc:
        raise OperationError("ai_provider_timeout", "AI provider request timed out", HTTPStatus.GATEWAY_TIMEOUT) from exc
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise OperationError("ai_provider_invalid_response", "AI provider returned non-JSON response", HTTPStatus.BAD_GATEWAY) from exc


def parse_ai_json_response(text: str) -> dict | None:
    clean = str(text or "").strip()
    if clean.startswith("```"):
        lines = clean.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        clean = "\n".join(lines).strip()
    try:
        parsed = json.loads(clean)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def normalize_ai_attribute_list(value: object) -> list:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [value]
    return []


def normalize_ai_position(value: object) -> dict:
    position = dict(value) if isinstance(value, dict) else {}
    for axis in ("x", "y", "z"):
        raw = position.get(axis, 0)
        try:
            position[axis] = float(raw)
        except (TypeError, ValueError):
            position[axis] = 0
    return position


def normalize_ai_hbds_model_response(model: dict) -> dict:
    normalized = copy.deepcopy(model)
    hypergraph = normalized.get("hypergraph")
    if not isinstance(hypergraph, dict):
        return normalized

    if "class" not in hypergraph and isinstance(hypergraph.get("classes"), list):
        hypergraph["class"] = hypergraph.get("classes")
    if "link" not in hypergraph and isinstance(hypergraph.get("links"), list):
        hypergraph["link"] = hypergraph.get("links")

    classes = hypergraph.get("class")
    if isinstance(classes, list):
        for node in classes:
            if not isinstance(node, dict):
                continue
            if not node.get("type") and node.get("kind"):
                node["type"] = node.get("kind")
            if "attributes" not in node:
                node["attributes"] = normalize_ai_attribute_list(node.get("attribute"))
            elif not isinstance(node.get("attributes"), list):
                node["attributes"] = normalize_ai_attribute_list(node.get("attributes"))
            node["position"] = normalize_ai_position(node.get("position"))

    links = hypergraph.get("link")
    if isinstance(links, list):
        for link in links:
            if not isinstance(link, dict):
                continue
            if not link.get("sourceClassId") and link.get("source"):
                link["sourceClassId"] = link.get("source")
            if not link.get("targetClassId") and link.get("target"):
                link["targetClassId"] = link.get("target")
    return normalized


def extract_ai_model_response(text: str) -> dict | None:
    parsed = parse_ai_json_response(text)
    if not parsed:
        return None
    if isinstance(parsed.get("hypergraph"), dict):
        return normalize_ai_hbds_model_response(parsed)
    nested = parsed.get("model")
    if isinstance(nested, dict) and isinstance(nested.get("hypergraph"), dict):
        return normalize_ai_hbds_model_response(nested)
    corrected = parsed.get("correctedModel")
    if isinstance(corrected, dict) and isinstance(corrected.get("hypergraph"), dict):
        return normalize_ai_hbds_model_response(corrected)
    return None


def validate_openai_compatible_connection(provider: dict, payload: dict) -> dict:
    api_key = ai_provider_key(provider, payload)
    if provider.get("requiresKey") and not api_key:
        raise OperationError("ai_provider_key_required", "API key is required for this provider", HTTPStatus.BAD_REQUEST)
    base_url = ai_provider_base_url(provider, payload) or "https://api.openai.com"
    model = ai_provider_model(provider, payload)
    if not model:
        raise OperationError("ai_provider_model_required", "AI provider model is required", HTTPStatus.BAD_REQUEST)
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    json_get(
        f"{base_url}/v1/models/{quote(model, safe='')}",
        headers,
        timeout=20,
        **ai_provider_request_options(provider),
    )
    return {
        "providerId": provider.get("id"),
        "modelName": model,
        "connected": True,
        "message": f"{provider.get('label') or 'AI provider'} connection is valid for {model}.",
    }


def validate_anthropic_connection(provider: dict, payload: dict) -> dict:
    api_key = ai_provider_key(provider, payload)
    if not api_key:
        raise OperationError("ai_provider_key_required", "API key is required for this provider", HTTPStatus.BAD_REQUEST)
    model = ai_provider_model(provider, payload)
    if not model:
        raise OperationError("ai_provider_model_required", "AI provider model is required", HTTPStatus.BAD_REQUEST)
    json_post(
        "https://api.anthropic.com/v1/messages",
        {
            "model": model,
            "max_tokens": 1,
            "system": "Connection validation only.",
            "messages": [{"role": "user", "content": "Reply OK."}],
        },
        {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        timeout=20,
    )
    return {
        "providerId": provider.get("id"),
        "modelName": model,
        "connected": True,
        "message": f"{provider.get('label') or 'AI provider'} connection is valid for {model}.",
    }


def validate_ollama_connection(provider: dict, payload: dict) -> dict:
    base_url = ai_provider_base_url(provider, payload)
    model = ai_provider_model(provider, payload)
    if not base_url:
        raise OperationError("ai_provider_config_required", "Base URL is required for this AI provider", HTTPStatus.BAD_REQUEST)
    if not model:
        raise OperationError("ai_provider_model_required", "AI provider model is required", HTTPStatus.BAD_REQUEST)
    data = json_get(
        f"{base_url}/api/tags",
        {},
        timeout=8,
        **ai_provider_request_options(provider),
    )
    models = data.get("models") if isinstance(data, dict) else None
    names = {
        str(item.get("name") or "").split(":", 1)[0]
        for item in models or []
        if isinstance(item, dict)
    }
    if names and model.split(":", 1)[0] not in names:
        raise OperationError("ai_provider_model_unavailable", f"Ollama model {model} was not found at {base_url}", HTTPStatus.BAD_GATEWAY)
    return {
        "providerId": provider.get("id"),
        "modelName": model,
        "connected": True,
        "message": f"{provider.get('label') or 'AI provider'} connection is valid for {model}.",
    }


def validate_ai_provider_connection(provider: dict, payload: dict) -> dict:
    if provider.get("manualWorkflow") or provider.get("id") == "chatgpt-manual":
        return {
            "providerId": provider.get("id"),
            "modelName": "",
            "connected": True,
            "manualWorkflow": True,
            "message": "Manual ChatGPT mode is ready; no provider connection is required.",
        }
    if not ai_provider_call_enabled(provider, payload):
        raise OperationError(
            "ai_backend_disabled",
            "AI provider calls are disabled until the server is configured or a transient user key is supplied.",
            HTTPStatus.BAD_REQUEST,
        )
    provider_id = provider.get("id")
    if provider_id == "anthropic":
        return validate_anthropic_connection(provider, payload)
    if provider_id == "ollama":
        return validate_ollama_connection(provider, payload)
    if provider_id in {"openai", "custom-openai"}:
        return validate_openai_compatible_connection(provider, payload)
    raise OperationError("invalid_ai_provider", "AI provider is not supported", HTTPStatus.BAD_REQUEST)


def call_openai_compatible_provider(provider: dict, payload: dict, prompt: str) -> str:
    api_key = ai_provider_key(provider, payload)
    if provider.get("requiresKey") and not api_key:
        raise OperationError("ai_provider_key_required", "API key is required for this provider", HTTPStatus.BAD_REQUEST)
    base_url = ai_provider_base_url(provider, payload) or "https://api.openai.com"
    model = ai_provider_model(provider, payload)
    if not model:
        raise OperationError("ai_provider_model_required", "AI provider model is required", HTTPStatus.BAD_REQUEST)
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    is_openai_reasoning_model = provider.get("id") == "openai" and provider_model_supports_reasoning_effort(provider, model)
    instruction_role = "developer" if is_openai_reasoning_model else "system"
    body = {
        "model": model,
        "messages": [
            {"role": instruction_role, "content": "Return only valid JSON for the HBDS Graphic Simulator."},
            {"role": "user", "content": prompt},
        ]
    }
    if provider.get("supportsJsonMode"):
        body["response_format"] = {"type": "json_object"}
    reasoning_effort = str(payload.get("reasoningEffort") or "").strip()
    if reasoning_effort and provider.get("supportsReasoningEffort"):
        body["reasoning_effort"] = reasoning_effort
    if not is_openai_reasoning_model and not reasoning_effort:
        body["temperature"] = 0.2
    response = json_post(
        f"{base_url}/v1/chat/completions",
        body,
        headers,
        **ai_provider_request_options(provider),
    )
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise OperationError("ai_provider_invalid_response", "AI provider response did not include choices", HTTPStatus.BAD_GATEWAY)
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise OperationError("ai_provider_invalid_response", "AI provider response did not include text content", HTTPStatus.BAD_GATEWAY)
    return content


def call_anthropic_provider(provider: dict, payload: dict, prompt: str) -> str:
    api_key = ai_provider_key(provider, payload)
    if not api_key:
        raise OperationError("ai_provider_key_required", "API key is required for this provider", HTTPStatus.BAD_REQUEST)
    model = ai_provider_model(provider, payload)
    if not model:
        raise OperationError("ai_provider_model_required", "AI provider model is required", HTTPStatus.BAD_REQUEST)
    response = json_post(
        "https://api.anthropic.com/v1/messages",
        {
            "model": model,
            "max_tokens": env_int("HBDS_AI_MAX_TOKENS", 4096),
            "system": "Return only valid JSON for the HBDS Graphic Simulator.",
            "messages": [{"role": "user", "content": prompt}],
        },
        {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    content = response.get("content")
    if not isinstance(content, list):
        raise OperationError("ai_provider_invalid_response", "AI provider response did not include content", HTTPStatus.BAD_GATEWAY)
    text_parts = [item.get("text") for item in content if isinstance(item, dict) and item.get("type") == "text"]
    text = "\n".join(part for part in text_parts if isinstance(part, str)).strip()
    if not text:
        raise OperationError("ai_provider_invalid_response", "AI provider response did not include text content", HTTPStatus.BAD_GATEWAY)
    return text


def call_ollama_provider(provider: dict, payload: dict, prompt: str) -> str:
    base_url = ai_provider_base_url(provider, payload)
    model = ai_provider_model(provider, payload)
    if not base_url:
        raise OperationError("ai_provider_config_required", "Base URL is required for this AI provider", HTTPStatus.BAD_REQUEST)
    if not model:
        raise OperationError("ai_provider_model_required", "AI provider model is required", HTTPStatus.BAD_REQUEST)
    response = json_post(
        f"{base_url}/api/chat",
        {
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": "Return only valid JSON for the HBDS Graphic Simulator."},
                {"role": "user", "content": prompt},
            ],
        },
        {},
        **ai_provider_request_options(provider),
    )
    message = response.get("message")
    content = message.get("content") if isinstance(message, dict) else response.get("response")
    if not isinstance(content, str) or not content.strip():
        raise OperationError("ai_provider_invalid_response", "AI provider response did not include text content", HTTPStatus.BAD_GATEWAY)
    return content


def call_ai_provider(provider: dict, payload: dict, prompt: str) -> dict:
    provider_id = provider.get("id")
    if provider.get("manualWorkflow") or provider_id == "chatgpt-manual":
        raise OperationError("manual_ai_provider", "Manual ChatGPT mode does not call an AI provider", HTTPStatus.BAD_REQUEST)
    if provider_id == "anthropic":
        text = call_anthropic_provider(provider, payload, prompt)
    elif provider_id == "ollama":
        text = call_ollama_provider(provider, payload, prompt)
    elif provider_id in {"openai", "custom-openai"}:
        text = call_openai_compatible_provider(provider, payload, prompt)
    else:
        raise OperationError("invalid_ai_provider", "AI provider is not supported", HTTPStatus.BAD_REQUEST)
    model = extract_ai_model_response(text)
    return {
        "text": text,
        "model": model,
    }


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


def query_flag(query: dict[str, list[str]], name: str, default: bool = False) -> bool:
    value = first_query_value(query, name).strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


def copy_draft_for_response(draft: dict, *, include_model: bool = True) -> dict:
    response = copy.deepcopy(draft)
    if include_model:
        return response
    response.pop("model", None)
    response.pop("diagram", None)
    preview = response.get("preview")
    if isinstance(preview, dict) and isinstance(preview.get("dataUrl"), str):
        compact_preview = copy.deepcopy(preview)
        compact_preview.pop("dataUrl", None)
        compact_preview["dataUrlOmitted"] = True
        response["preview"] = compact_preview
    return response


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
    removed_link_ids = {
        str(link.get("id"))
        for link in model["hypergraph"]["link"]
        if ids_equal(link.get("sourceClassId"), target_id) or ids_equal(link.get("targetClassId"), target_id)
    }
    model["hypergraph"]["link"] = [
        link for link in model["hypergraph"]["link"]
        if not ids_equal(link.get("sourceClassId"), target_id) and not ids_equal(link.get("targetClassId"), target_id)
    ]
    removed_object_ids = {
        str(item.get("id"))
        for item in model["hypergraph"].get("object", [])
        if ids_equal(item.get("classId"), target_id)
    }
    if "object" in model["hypergraph"]:
        model["hypergraph"]["object"] = [
            item for item in model["hypergraph"]["object"]
            if not ids_equal(item.get("classId"), target_id)
        ]
    if "objectLink" in model["hypergraph"]:
        model["hypergraph"]["objectLink"] = [
            item for item in model["hypergraph"]["objectLink"]
            if str(item.get("sourceObjectId")) not in removed_object_ids
            and str(item.get("targetObjectId")) not in removed_object_ids
            and str(item.get("classLinkId", item.get("linkId"))) not in removed_link_ids
        ]
    if "membership" in model["hypergraph"]:
        model["hypergraph"]["membership"] = [
            item for item in model["hypergraph"]["membership"]
            if not ids_equal(item.get("classId", item.get("memberClassId")), target_id)
            and not ids_equal(item.get("hyperclassId"), target_id)
        ]
    if "inheritance" in model["hypergraph"]:
        model["hypergraph"]["inheritance"] = [
            item for item in model["hypergraph"]["inheritance"]
            if not ids_equal(item.get("subClassId"), target_id)
            and not ids_equal(item.get("superClassId"), target_id)
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
    if "objectLink" in model["hypergraph"]:
        model["hypergraph"]["objectLink"] = [
            item for item in model["hypergraph"]["objectLink"]
            if not ids_equal(item.get("classLinkId", item.get("linkId")), target_id)
        ]


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
    models = []
    for path in sorted(MODELS_DIR.glob("*.json"), key=lambda item: item.name.lower()):
        if path.name.startswith(".") or path.name.lower().endswith("manifest.json"):
            continue
        try:
            models.append(model_metadata(path))
        except FileNotFoundError:
            continue
    return models


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
            "version": "1.1.0",
            "description": "Local API for HBDS model listing, loading, and saving.",
        },
        "servers": [{"url": server_url}],
        "tags": [
            {"name": "Server", "description": "Local server status and API documentation."},
            {"name": "Models", "description": "List, load, and save HBDS model JSON files."},
            {"name": "Collaboration", "description": "Presence and live draft state used by collaborative editing UI."},
            {"name": "AI", "description": "HBDS-scoped AI provider capability discovery and prompt preparation."},
            {"name": "Debug", "description": "Per-UI debug logging and function timing controls."},
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
            "/api/debug": {
                "get": {
                    "tags": ["Debug"],
                    "summary": "Return debug state for one UI client",
                    "parameters": [
                        {
                            "name": "clientId",
                            "in": "query",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Client id to inspect. X-Client-Id may also be used.",
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Debug status",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/DebugStatusResponse"}}},
                        }
                    },
                },
                "post": {
                    "tags": ["Debug"],
                    "summary": "Enable or disable debug logging for one UI client",
                    "parameters": [
                        {
                            "name": "X-Client-Id",
                            "in": "header",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Client id. Request body clientId may also be used.",
                        },
                        {
                            "name": "X-Client-Name",
                            "in": "header",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "UI name used to split logs by open UI.",
                        },
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/DebugConfigureRequest"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Debug mode updated",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/DebugConfigureResponse"}}},
                        },
                        "400": {"description": "Missing client id", "content": {"application/json": {"schema": error_schema}}},
                    },
                },
            },
            "/api/debug/logs": {
                "post": {
                    "tags": ["Debug"],
                    "summary": "Record one or more client-side debug events",
                    "description": "Writes JSONL entries when debug is enabled for the supplied client id.",
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {
                            "oneOf": [
                                {"$ref": "#/components/schemas/DebugLogEntry"},
                                {"type": "array", "items": {"$ref": "#/components/schemas/DebugLogEntry"}},
                            ]
                        }}},
                    },
                    "responses": {
                        "200": {
                            "description": "Log event accepted",
                            "content": {"application/json": {"schema": {"type": "object"}}},
                        },
                        "400": {"description": "Missing client id", "content": {"application/json": {"schema": error_schema}}},
                    },
                }
            },
            "/api/ai/providers": {
                "get": {
                    "tags": ["AI"],
                    "summary": "List AI provider capabilities without exposing secrets",
                    "responses": {
                        "200": {
                            "description": "AI provider capability list",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiProviderListResponse"}}},
                        }
                    },
                }
            },
            "/api/ai/connection": {
                "post": {
                    "tags": ["AI"],
                    "summary": "Validate an AI provider credential and model",
                    "description": "Checks the selected provider with a server environment key or a transient user key. Keys are never returned by the API.",
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiConnectionRequest"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Provider connection validated",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiConnectionResponse"}}},
                        },
                        "400": {"description": "Invalid AI connection request", "content": {"application/json": {"schema": error_schema}}},
                        "502": {"description": "Provider rejected the credential, model, or connection", "content": {"application/json": {"schema": error_schema}}},
                    },
                }
            },
            "/api/ai/apply": {
                "post": {
                    "tags": ["AI"],
                    "summary": "Apply and save an AI-generated HBDS model",
                    "description": "Normalizes and validates an AI model, saves it into models or test_models, refreshes manifests, and returns the saved model. API keys are not part of this request.",
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiApplyRequest"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "AI model applied and saved",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiApplyResponse"}}},
                        },
                        "400": {"description": "Invalid AI model or save request", "content": {"application/json": {"schema": error_schema}}},
                        "409": {"description": "Save conflict", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ConflictResponse"}}}},
                    },
                }
            },
            "/api/ai/rollback": {
                "post": {
                    "tags": ["AI"],
                    "summary": "Rollback the last AI apply by saving a previous HBDS snapshot",
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiRollbackRequest"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Rollback snapshot saved",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiApplyResponse"}}},
                        },
                        "400": {"description": "Invalid rollback request", "content": {"application/json": {"schema": error_schema}}},
                        "409": {"description": "Rollback conflict", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ConflictResponse"}}}},
                    },
                }
            },
            "/api/ai/prompt": {
                "post": {
                    "tags": ["AI"],
                    "summary": "Prepare a deterministic HBDS AI prompt",
                    "description": "Builds the server-side HBDS prompt. The server sends the prompt to the selected API provider when HBDS_AI_ENABLED is true or when a transient user key is supplied. Manual providers only prepare prompts and never call an external provider.",
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiPromptRequest"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Prompt prepared",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AiPromptResponse"}}},
                        },
                        "400": {"description": "Invalid AI request", "content": {"application/json": {"schema": error_schema}}},
                        "413": {"description": "AI request too large", "content": {"application/json": {"schema": error_schema}}},
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
                "delete": {
                    "tags": ["Models"],
                    "summary": "Delete one HBDS model from models after confirmation",
                    "parameters": [model_name_param],
                    "requestBody": {
                        "required": False,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDeleteRequest"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Model moved to .backups and manifests refreshed",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDeleteResponse"}}},
                        },
                        "400": {"description": "Invalid model name", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                        "409": {"description": "Protected/default model", "content": {"application/json": {"schema": error_schema}}},
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
                "delete": {
                    "tags": ["Models"],
                    "summary": "Delete one HBDS model from a named file scope after confirmation",
                    "parameters": [draft_scope_param, model_name_param],
                    "requestBody": {
                        "required": False,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDeleteRequest"}}},
                    },
                    "responses": {
                        "200": {
                            "description": "Scoped model moved to .backups and manifests refreshed",
                            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ModelDeleteResponse"}}},
                        },
                        "400": {"description": "Invalid scope or model name", "content": {"application/json": {"schema": error_schema}}},
                        "404": {"description": "Model not found", "content": {"application/json": {"schema": error_schema}}},
                        "409": {"description": "Protected/default model", "content": {"application/json": {"schema": error_schema}}},
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
                "AiProvider": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "example": "openai"},
                        "label": {"type": "string", "example": "ChatGPT/OpenAI"},
                        "defaultModel": {"type": "string", "example": "gpt-5.5"},
                        "models": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string"},
                                    "label": {"type": "string"},
                                    "supportsReasoningEffort": {"type": "boolean"},
                                    "defaultReasoningEffort": {"type": "string", "enum": ["none", "low", "medium", "high", "xhigh"]},
                                },
                            },
                        },
                        "requiresKey": {"type": "boolean"},
                        "allowsUserKey": {"type": "boolean"},
                        "requiresBaseUrl": {"type": "boolean"},
                        "defaultBaseUrl": {"type": "string"},
                        "supportsCustomBaseUrl": {"type": "boolean"},
                        "supportsJsonMode": {"type": "boolean"},
                        "supportsReasoningEffort": {"type": "boolean"},
                        "manualWorkflow": {"type": "boolean", "description": "True for copy/paste-only providers such as ChatGPT Pro / Manual."},
                        "configuredOnServer": {"type": "boolean"},
                        "credentialStatus": {"type": "string", "example": "key_required"},
                    },
                    "required": ["id", "label", "requiresKey", "requiresBaseUrl", "configuredOnServer"],
                },
                "AiProviderListResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "enabled": {"type": "boolean", "description": "True when real AI calls are enabled by server configuration."},
                        "promptTemplateVersion": {"type": "string", "example": "hbds-ai-prompt-v1"},
                        "requestMaxBytes": {"type": "integer"},
                        "providers": {"type": "array", "items": {"$ref": "#/components/schemas/AiProvider"}},
                    },
                    "required": ["ok", "enabled", "providers"],
                },
                "AiPromptRequest": {
                    "type": "object",
                    "properties": {
                        "providerId": {"type": "string", "example": "openai"},
                        "modelName": {"type": "string", "example": "gpt-5.5"},
                        "reasoningEffort": {"type": "string", "enum": ["none", "low", "medium", "high", "xhigh"]},
                        "baseUrl": {"type": "string"},
                        "apiKey": {"type": "string", "format": "password", "description": "Optional transient user key. It is never returned by the API."},
                        "operationMode": {"type": "string", "enum": ["generate", "validate", "improve", "repair"]},
                        "requestText": {"type": "string", "description": "HBDS-scoped user request."},
                        "currentModel": {"type": "object", "description": "Optional current HBDS model supplied only for validate/improve operations."},
                        "promptTemplateVersion": {"type": "string", "example": "hbds-ai-prompt-v1"},
                    },
                    "required": ["providerId", "operationMode", "requestText"],
                },
                "AiConnectionRequest": {
                    "type": "object",
                    "properties": {
                        "providerId": {"type": "string", "example": "openai"},
                        "modelName": {"type": "string", "example": "gpt-5.5"},
                        "reasoningEffort": {"type": "string", "enum": ["none", "low", "medium", "high", "xhigh"]},
                        "baseUrl": {"type": "string"},
                        "apiKey": {"type": "string", "format": "password", "description": "Optional transient user key. It is never returned by the API."},
                    },
                    "required": ["providerId"],
                },
                "AiConnectionResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "enabled": {"type": "boolean"},
                        "connected": {"type": "boolean"},
                        "manualWorkflow": {"type": "boolean"},
                        "providerId": {"type": "string"},
                        "modelName": {"type": "string"},
                        "message": {"type": "string"},
                    },
                    "required": ["ok", "connected", "providerId", "message"],
                },
                "AiApplyRequest": {
                    "type": "object",
                    "properties": {
                        "scope": {"type": "string", "enum": ["models", "test_models"], "description": "Target model directory."},
                        "modelName": {"type": "string", "example": "mushroom_model.json", "description": "Existing filename for same-file save, or preferred filename for save-as-new."},
                        "requestedName": {"type": "string", "example": "Mushroom Model"},
                        "operationMode": {"type": "string", "enum": ["generate", "validate", "improve", "repair"]},
                        "saveMode": {"type": "string", "enum": ["same", "new"], "description": "same overwrites modelName with revision checks; new creates a unique filename."},
                        "expectedRevision": {"type": "string", "description": "Optional current file revision for conflict protection."},
                        "clientId": {"type": "string"},
                        "model": {"type": "object", "description": "Normalized or AI-returned HBDS model. Common AI aliases are normalized before validation."},
                    },
                    "required": ["scope", "operationMode", "saveMode", "model"],
                },
                "AiRollbackRequest": {
                    "type": "object",
                    "properties": {
                        "scope": {"type": "string", "enum": ["models", "test_models"]},
                        "modelName": {"type": "string", "example": "bridge_road_links.json"},
                        "expectedRevision": {"type": "string"},
                        "clientId": {"type": "string"},
                        "model": {"type": "object", "description": "Pre-AI HBDS snapshot to restore."},
                    },
                    "required": ["scope", "modelName", "model"],
                },
                "AiApplyResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "scope": {"type": "string"},
                        "saveMode": {"type": "string"},
                        "rollback": {"type": "boolean"},
                        "saved": {"type": "string"},
                        "modelName": {"type": "string"},
                        "backup": {"type": "string", "nullable": True},
                        "manifestRefreshed": {"type": "boolean"},
                        "metadata": {"$ref": "#/components/schemas/ModelMetadata"},
                        "model": {"type": "object"},
                    },
                    "required": ["ok", "scope", "saved", "modelName", "model"],
                },
                "AiPromptResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "enabled": {"type": "boolean"},
                        "aiCallEnabled": {"type": "boolean", "description": "True when the backend attempted a provider call."},
                        "manualWorkflow": {"type": "boolean"},
                        "providerId": {"type": "string"},
                        "modelName": {"type": "string"},
                        "reasoningEffort": {"type": "string"},
                        "operationMode": {"type": "string"},
                        "promptTemplateVersion": {"type": "string"},
                        "enhancedPrompt": {"type": "string"},
                        "providerResponse": {"type": "string", "description": "Raw provider text when AI calls are enabled."},
                        "model": {"type": "object", "description": "Parsed HBDS model when the provider returned an applyable model."},
                        "message": {"type": "string"},
                    },
                    "required": ["ok", "aiCallEnabled", "enhancedPrompt"],
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
                "ModelDeleteRequest": {
                    "type": "object",
                    "properties": {
                        "clientId": {"type": "string"},
                        "allowProtected": {"type": "boolean", "description": "Reserved for explicit admin-style deletion of protected/default models."},
                    },
                },
                "ModelDeleteResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "scope": {"type": "string"},
                        "deleted": {"type": "string", "example": "mushroom_model.json"},
                        "modelName": {"type": "string"},
                        "backup": {"type": "string", "description": "Backup filename under .backups."},
                        "manifestRefreshed": {"type": "boolean"},
                    },
                    "required": ["ok", "scope", "deleted", "modelName", "backup"],
                },
                "HBDSFontSettings": {
                    "type": "object",
                    "description": "Model-level font settings. Per-type sizes override size for their own label class; null or omission falls back to the overall size. Element-level font-size fields can still override these values until the UI reset-all action clears them.",
                    "properties": {
                        "size": {"type": "number", "example": 13},
                        "family": {"type": "string", "example": "Arial, sans-serif"},
                        "bold": {"type": "boolean"},
                        "italic": {"type": "boolean"},
                        "underline": {"type": "boolean"},
                        "classSize": {"type": "number", "nullable": True, "description": "Class title font size override."},
                        "hyperclassSize": {"type": "number", "nullable": True, "description": "Hyperclass title font size override."},
                        "attributeSize": {"type": "number", "nullable": True, "description": "Attribute label font size override."},
                        "linkSize": {"type": "number", "nullable": True, "description": "Link label font size override."},
                    },
                },
                "LinkRendering": {
                    "type": "object",
                    "description": "Optional visual rendering fields for HBDS links. Unknown fields are preserved for forward compatibility.",
                    "properties": {
                        "labelText": {"type": "string", "description": "Visible link label."},
                        "lineColor": {"type": "string", "example": "#334155"},
                        "lineWidth": {"type": "number", "example": 2},
                        "lineStyle": {"type": "string", "enum": ["solid", "dashed", "dotted", "thick", "thin"]},
                        "arrowType": {
                            "type": "string",
                            "enum": [
                                "triangle",
                                "outline",
                                "chevron",
                                "double-chevron",
                                "triple-chevron",
                                "filled-triangle",
                                "hollow-triangle",
                                "dotted",
                                "bar-arrow",
                                "double-bar-arrow",
                                "cone",
                                "diamond",
                                "none",
                            ],
                            "description": "Preferred arrow head style. Legacy arrowheadType is still accepted.",
                        },
                        "arrowheadType": {"type": "string", "description": "Legacy alias for arrowType."},
                        "arrowDirection": {"type": "string", "enum": ["source-to-target", "target-to-source", "bidirectional", "none"]},
                        "arrowColor": {"type": "string", "example": "#334155"},
                        "arrowheadVisibility": {"type": "boolean"},
                        "arrowheadSize": {"type": "number"},
                        "arrowheadScale": {"type": "number"},
                        "maxArrowheadSize": {"type": "number"},
                        "labelFontSize": {"type": "number"},
                        "labelColor": {"type": "string"},
                        "labelBackgroundColor": {"type": "string"},
                        "labelPositionAlongPath": {"type": "number", "minimum": 0, "maximum": 1},
                        "labelOffsetFromPath": {"type": "number"},
                        "orthogonalStyle": {"type": "string", "enum": ["auto", "horizontal", "vertical"]},
                        "sourcePortSide": {"type": "string", "enum": ["top", "right", "bottom", "left"]},
                        "targetPortSide": {"type": "string", "enum": ["top", "right", "bottom", "left"]},
                    },
                },
                "HBDSLink": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "sourceClassId": {"type": "string"},
                        "targetClassId": {"type": "string"},
                        "type": {"type": "string"},
                        "allowSelfLink": {"type": "boolean"},
                        "visible": {"type": "boolean"},
                        "rendering": {"$ref": "#/components/schemas/LinkRendering"},
                    },
                    "required": ["id", "sourceClassId", "targetClassId"],
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
                        "link": {"$ref": "#/components/schemas/HBDSLink"},
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
                "DebugSession": {
                    "type": "object",
                    "properties": {
                        "clientId": {"type": "string", "example": "ui-lx9ad3-tab-q4x5"},
                        "uiName": {"type": "string", "example": "edit-ui"},
                        "enabled": {"type": "boolean"},
                        "enabledAt": {"type": "string", "format": "date-time"},
                        "disabledAt": {"type": "string", "format": "date-time"},
                    },
                },
                "DebugStatusResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "clientId": {"type": "string"},
                        "debug": {"type": "boolean"},
                        "session": {"$ref": "#/components/schemas/DebugSession"},
                    },
                    "required": ["ok", "clientId", "debug", "session"],
                },
                "DebugConfigureRequest": {
                    "type": "object",
                    "properties": {
                        "enabled": {"type": "boolean"},
                        "clientId": {"type": "string"},
                        "uiName": {"type": "string", "example": "models-ui"},
                    },
                    "required": ["enabled"],
                },
                "DebugConfigureResponse": {
                    "type": "object",
                    "properties": {
                        "ok": {"type": "boolean", "example": True},
                        "debug": {"type": "boolean"},
                        "session": {"$ref": "#/components/schemas/DebugSession"},
                    },
                    "required": ["ok", "debug", "session"],
                },
                "DebugLogEntry": {
                    "type": "object",
                    "properties": {
                        "timestamp": {"type": "string", "format": "date-time"},
                        "type": {"type": "string", "example": "client.user-action"},
                        "source": {"type": "string", "example": "client"},
                        "clientId": {"type": "string"},
                        "uiName": {"type": "string"},
                        "functionName": {"type": "string"},
                        "action": {"type": "string"},
                        "durationMs": {"type": "number"},
                    },
                    "required": ["type", "clientId"],
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
    request_queue_size = 128

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
        self._debug_lock = threading.Lock()
        self._debug_sessions: dict[str, dict] = {}

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

    def clear_model_drafts(self, model_name: str) -> list[dict]:
        with self._draft_lock:
            model_drafts = self._drafts.pop(model_name, {})
            return [copy.deepcopy(draft) for draft in model_drafts.values()]

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

    def list_model_drafts(
        self,
        model_name: str,
        *,
        include_model: bool = True,
        exclude_client_id: str = "",
    ) -> list[dict]:
        with self._draft_lock:
            drafts = [
                draft
                for draft in self._drafts.get(model_name, {}).values()
                if not exclude_client_id or draft.get("clientId") != exclude_client_id
            ]
        return sorted(
            (copy_draft_for_response(draft, include_model=include_model) for draft in drafts),
            key=lambda item: item.get("updatedAt", ""),
        )

    def set_debug_session(self, client_id: str, enabled: bool, ui_name: str = "") -> dict:
        clean_client_id = clean_client_text(client_id, max_length=MAX_CLIENT_ID_LENGTH)
        if not clean_client_id:
            clean_client_id = f"client-{id(self):x}"
        clean_ui_name = clean_client_text(ui_name, max_length=MAX_CLIENT_NAME_LENGTH)
        with self._debug_lock:
            if enabled:
                session = {
                    "clientId": clean_client_id,
                    "uiName": clean_ui_name,
                    "enabled": True,
                    "enabledAt": debug_now_iso(),
                }
                self._debug_sessions[clean_client_id] = session
            else:
                previous = self._debug_sessions.pop(clean_client_id, None) or {
                    "clientId": clean_client_id,
                    "uiName": clean_ui_name,
                }
                session = {
                    **previous,
                    "uiName": clean_ui_name or previous.get("uiName", ""),
                    "enabled": False,
                    "disabledAt": debug_now_iso(),
                }
        self.write_debug_log(debug_event_payload(
            "server.debug-toggle",
            clean_client_id,
            session.get("uiName", ""),
            enabled=enabled,
        ), force=True)
        return copy.deepcopy(session)

    def debug_session(self, client_id: str) -> dict | None:
        clean_client_id = clean_client_text(client_id, max_length=MAX_CLIENT_ID_LENGTH)
        if not clean_client_id:
            return None
        with self._debug_lock:
            session = self._debug_sessions.get(clean_client_id)
            return copy.deepcopy(session) if session else None

    def debug_enabled(self, client_id: str) -> bool:
        return self.debug_session(client_id) is not None

    def write_debug_log(self, payload: dict, *, force: bool = False) -> None:
        client_id = clean_client_text(payload.get("clientId"), max_length=MAX_CLIENT_ID_LENGTH)
        if not client_id:
            return
        session = self.debug_session(client_id)
        if not force and session is None:
            return
        entry = {
            **payload,
            "clientId": client_id,
            "uiName": payload.get("uiName") or (session or {}).get("uiName", ""),
        }
        DEBUG_LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_path = DEBUG_LOG_DIR / f"{clean_debug_log_token(client_id)}.jsonl"
        with self._debug_lock:
            rotate_log_file(log_path)
            with log_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, ensure_ascii=False, sort_keys=True))
                handle.write("\n")


class HBDSRequestHandler(SimpleHTTPRequestHandler):
    server_version = "HBDSLocalServer/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def handle(self) -> None:
        try:
            super().handle()
        except ClientDisconnected:
            self.close_connection = True
        except OSError as error:
            if is_client_disconnect(error):
                self.close_connection = True
                return
            raise

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        if self.is_allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, If-Match, X-Client-Id, X-Client-Name")
        self.send_header("X-Content-Type-Options", "nosniff")
        for header, value in SECURITY_HEADERS.items():
            self.send_header(header, value)
        static_path = urlparse(self.path).path
        if static_path == "/" or static_path.endswith((".html", ".js", ".css")):
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        if urlparse(self.path).path.startswith("/api/") and not self.api_requests_enabled():
            self.api_disabled()
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def api_requests_enabled(self) -> bool:
        return bool(getattr(self.server, "api_enabled", True))

    def api_disabled(self) -> None:
        self.json_error(HTTPStatus.NOT_FOUND, "api_disabled", "API endpoints are disabled in static-only mode")

    def reject_private_static_path(self) -> None:
        self.send_error(HTTPStatus.NOT_FOUND, "File not found")

    def serve_favicon(self, path: str) -> bool:
        if path != "/favicon.ico":
            return False
        try:
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Content-Length", "0")
            self.end_headers()
        except OSError as error:
            if is_client_disconnect(error):
                self.close_connection = True
                return True
            raise
        return True

    def serve_missing_icon(self, path: str) -> bool:
        if not is_missing_svg_icon_request(path):
            return False
        body = missing_icon_svg(path)
        try:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except OSError as error:
            if is_client_disconnect(error):
                self.close_connection = True
                return True
            raise
        return True

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            if not self.api_requests_enabled():
                self.api_disabled()
                return
            self.handle_api_get(path)
            return
        if self.serve_favicon(path):
            return
        public_path = public_static_request_path(self.path)
        if public_path is None:
            self.reject_private_static_path()
            return
        self.path = public_path
        if self.serve_missing_icon(public_path):
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        path = urlparse(self.path).path
        if self.serve_favicon(path):
            return
        public_path = public_static_request_path(self.path)
        if public_path is None:
            self.reject_private_static_path()
            return
        self.path = public_path
        super().do_HEAD()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            if not self.api_requests_enabled():
                self.api_disabled()
                return
            self.handle_api_post(path)
            return
        self.json_error(HTTPStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "POST is only allowed for API endpoints")

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            if not self.api_requests_enabled():
                self.api_disabled()
                return
            self.handle_api_delete(path)
            return
        self.json_error(HTTPStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "DELETE is only allowed for API endpoints")

    def debug_client_id(self, payload: dict | None = None) -> str:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        return clean_client_text(
            self.headers.get("X-Client-Id")
            or (payload or {}).get("clientId")
            or first_query_value(query, "clientId"),
            max_length=MAX_CLIENT_ID_LENGTH,
        )

    def debug_ui_name(self, payload: dict | None = None) -> str:
        return clean_client_text(
            self.headers.get("X-Client-Name") or (payload or {}).get("uiName") or "",
            max_length=MAX_CLIENT_NAME_LENGTH,
        )

    def debug_log(self, event_type: str, payload: dict | None = None, *, force: bool = False, **details) -> None:
        if not hasattr(self.server, "write_debug_log"):
            return
        client_id = self.debug_client_id(payload)
        if not client_id:
            return
        self.server.write_debug_log(debug_event_payload(
            event_type,
            client_id,
            self.debug_ui_name(payload),
            **details,
        ), force=force)

    def debug_timed_call(self, function_name: str, callback, **details):
        client_id = self.debug_client_id()
        ui_name = self.debug_ui_name()
        start_perf = time.perf_counter()
        start_iso = debug_now_iso()
        status = "ok"
        is_stream = details.get("stream") is True
        try:
            return callback()
        except Exception as error:
            status = "error"
            details = {**details, "error": str(error)}
            raise
        finally:
            if client_id and hasattr(self.server, "write_debug_log"):
                self.server.write_debug_log(debug_event_payload(
                    "server.stream-timing" if is_stream else "server.function-timing",
                    client_id,
                    ui_name,
                    functionName=function_name,
                    method=self.command,
                    path=urlparse(self.path).path,
                    startTime=start_iso,
                    endTime=debug_now_iso(),
                    durationMs=round((time.perf_counter() - start_perf) * 1000, 3),
                    status=status,
                    **details,
                ))

    def debug_request_timing(self, method: str, path: str, start_iso: str, start_perf: float, status: str) -> None:
        is_stream = path == "/api/events"
        self.debug_log(
            "server.stream-timing" if is_stream else "server.request-timing",
            method=method,
            path=path,
            startTime=start_iso,
            endTime=debug_now_iso(),
            durationMs=round((time.perf_counter() - start_perf) * 1000, 3),
            status=status,
            stream=is_stream,
        )

    def handle_api_get(self, path: str) -> None:
        request_start = time.perf_counter()
        request_start_iso = debug_now_iso()
        request_status = "ok"
        try:
            if path == "/api/health":
                self.debug_timed_call("health", lambda: self.json_response({"ok": True, "status": "connected", "time": utc_now_iso()}))
            elif path == "/api/debug":
                self.debug_timed_call("debug_status", self.debug_status)
            elif path == "/api/ai/providers":
                self.debug_timed_call("ai_providers", self.list_ai_providers)
            elif path == "/api/models":
                self.debug_timed_call("list_models", lambda: self.json_response({"ok": True, "models": list_models()}))
            elif path == "/api/events":
                self.debug_timed_call("event_stream", self.event_stream, stream=True)
            elif path == "/api/openapi.json":
                self.debug_timed_call("openapi_spec", lambda: self.json_response(openapi_spec(self.headers.get("Host", ""))))
            elif path == "/api/docs":
                self.debug_timed_call("swagger_docs", self.swagger_docs)
            elif path.startswith("/api/model-files/"):
                self.debug_timed_call("load_scoped_model", lambda: self.load_scoped_model(path.removeprefix("/api/model-files/")))
            elif path.startswith("/api/drafts/"):
                self.debug_timed_call("list_scoped_model_drafts", lambda: self.list_scoped_model_drafts(path.removeprefix("/api/drafts/")))
            elif path.startswith("/api/models/") and path.endswith("/drafts"):
                self.debug_timed_call("list_model_drafts", lambda: self.list_model_drafts(path.removeprefix("/api/models/").removesuffix("/drafts")))
            elif path.startswith("/api/models/"):
                self.debug_timed_call("load_model", lambda: self.load_model(path.removeprefix("/api/models/")))
            else:
                self.json_error(HTTPStatus.NOT_FOUND, "not_found", "API endpoint not found")
        except ClientDisconnected:
            request_status = "client_disconnected"
        except Exception:
            request_status = "error"
            try:
                self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "server_error", "Server error")
            except ClientDisconnected:
                request_status = "client_disconnected"
        finally:
            self.debug_request_timing("GET", path, request_start_iso, request_start, request_status)

    def handle_api_post(self, path: str) -> None:
        request_start = time.perf_counter()
        request_start_iso = debug_now_iso()
        request_status = "ok"
        try:
            if path == "/api/debug":
                self.debug_timed_call("configure_debug", self.configure_debug)
            elif path == "/api/debug/logs":
                self.debug_timed_call("record_client_debug_log", self.record_client_debug_log)
            elif path == "/api/ai/connection":
                self.debug_timed_call("validate_ai_connection", self.validate_ai_connection)
            elif path == "/api/ai/apply":
                self.debug_timed_call("ai_apply_model", self.ai_apply_model)
            elif path == "/api/ai/rollback":
                self.debug_timed_call("ai_rollback_model", self.ai_rollback_model)
            elif path == "/api/ai/prompt":
                self.debug_timed_call("prepare_ai_prompt", self.prepare_ai_prompt)
            elif path.startswith("/api/model-files/"):
                self.debug_timed_call("save_scoped_model", lambda: self.save_scoped_model(path.removeprefix("/api/model-files/")))
            elif path.startswith("/api/drafts/") and "/clients/" in path:
                self.debug_timed_call("save_scoped_model_draft", lambda: self.save_scoped_model_draft(path.removeprefix("/api/drafts/")))
            elif path.startswith("/api/models/") and "/drafts/" in path:
                self.debug_timed_call("save_model_draft", lambda: self.save_model_draft(path.removeprefix("/api/models/")))
            elif path.startswith("/api/models/") and path.endswith("/ops"):
                self.debug_timed_call("apply_model_ops", lambda: self.apply_model_ops(path.removeprefix("/api/models/").removesuffix("/ops")))
            elif path.startswith("/api/models/"):
                self.debug_timed_call("save_model", lambda: self.save_model(path.removeprefix("/api/models/")))
            else:
                self.json_error(HTTPStatus.NOT_FOUND, "not_found", "API endpoint not found")
        except ClientDisconnected:
            request_status = "client_disconnected"
        except OperationError as operation_error:
            request_status = "error"
            try:
                self.json_error(
                    operation_error.status,
                    operation_error.code,
                    operation_error.message,
                    **operation_error.details,
                )
            except ClientDisconnected:
                request_status = "client_disconnected"
        except Exception:
            request_status = "error"
            try:
                self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "server_error", "Server error")
            except ClientDisconnected:
                request_status = "client_disconnected"
        finally:
            self.debug_request_timing("POST", path, request_start_iso, request_start, request_status)

    def handle_api_delete(self, path: str) -> None:
        request_start = time.perf_counter()
        request_start_iso = debug_now_iso()
        request_status = "ok"
        try:
            if path.startswith("/api/model-files/"):
                raw = path.removeprefix("/api/model-files/")
                if "/" not in raw:
                    self.json_error(HTTPStatus.NOT_FOUND, "not_found", "API endpoint not found")
                else:
                    scope, name = raw.split("/", 1)
                    self.debug_timed_call("delete_model_file", lambda: self.delete_model_file(scope, name))
            elif path.startswith("/api/models/") and "/drafts/" not in path:
                self.debug_timed_call("delete_model_file", lambda: self.delete_model_file("models", path.removeprefix("/api/models/")))
            elif path.startswith("/api/drafts/") and "/clients/" in path:
                self.debug_timed_call("delete_scoped_model_draft", lambda: self.delete_scoped_model_draft(path.removeprefix("/api/drafts/")))
            elif path.startswith("/api/models/") and "/drafts/" in path:
                self.debug_timed_call("delete_model_draft", lambda: self.delete_model_draft(path.removeprefix("/api/models/")))
            else:
                self.json_error(HTTPStatus.NOT_FOUND, "not_found", "API endpoint not found")
        except ClientDisconnected:
            request_status = "client_disconnected"
        except Exception:
            request_status = "error"
            try:
                self.json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "server_error", "Server error")
            except ClientDisconnected:
                request_status = "client_disconnected"
        finally:
            self.debug_request_timing("DELETE", path, request_start_iso, request_start, request_status)

    def list_ai_providers(self) -> None:
        self.json_response({
            "ok": True,
            "enabled": ai_backend_enabled(),
            "promptTemplateVersion": HBDS_AI_PROMPT_TEMPLATE_VERSION,
            "requestMaxBytes": MAX_AI_REQUEST_BYTES,
            "providers": ai_provider_capabilities(),
        })

    def prepare_ai_prompt(self) -> None:
        payload = self.read_json_request_payload()
        if payload is None:
            return
        validation_error = validate_ai_prompt_payload(payload)
        if validation_error:
            status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE if validation_error["code"] == "ai_request_too_large" else HTTPStatus.BAD_REQUEST
            self.json_error(status, validation_error["code"], validation_error["message"], **{
                key: value for key, value in validation_error.items() if key not in {"code", "message"}
            })
            return
        provider = ai_provider_by_id(payload.get("providerId")) or {}
        enhanced_prompt = build_hbds_ai_prompt(payload)
        enabled = ai_backend_enabled()
        manual_workflow = bool(provider.get("manualWorkflow"))
        ai_call_enabled = ai_provider_call_enabled(provider, payload)
        response = {
            "ok": True,
            "enabled": enabled,
            "aiCallEnabled": ai_call_enabled,
            "manualWorkflow": manual_workflow,
            "providerId": provider.get("id", ""),
            "modelName": str(payload.get("modelName") or provider.get("defaultModel") or ""),
            "reasoningEffort": str(payload.get("reasoningEffort") or ""),
            "operationMode": str(payload.get("operationMode") or "generate"),
            "promptTemplateVersion": HBDS_AI_PROMPT_TEMPLATE_VERSION,
            "enhancedPrompt": enhanced_prompt,
            "message": (
                "Manual ChatGPT prompt prepared; copy it to ChatGPT and paste JSON back into HBDS."
                if manual_workflow
                else "HBDS prompt prepared; AI backend disabled so no provider call was made."
            ),
        }
        if ai_call_enabled:
            provider_result = call_ai_provider(provider, payload, enhanced_prompt)
            response["providerResponse"] = provider_result["text"]
            response["model"] = provider_result["model"]
            response["message"] = "AI provider response received and parsed."
        self.json_response(response)

    def validate_ai_connection(self) -> None:
        payload = self.read_json_request_payload()
        if payload is None:
            return
        validation_error = validate_ai_connection_payload(payload)
        if validation_error:
            status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE if validation_error["code"] == "ai_request_too_large" else HTTPStatus.BAD_REQUEST
            self.json_error(status, validation_error["code"], validation_error["message"], **{
                key: value for key, value in validation_error.items() if key not in {"code", "message"}
            })
            return
        provider = ai_provider_by_id(payload.get("providerId")) or {}
        result = validate_ai_provider_connection(provider, payload)
        self.json_response({
            "ok": True,
            "enabled": ai_backend_enabled(),
            **result,
        })

    def debug_status(self) -> None:
        client_id = self.debug_client_id()
        session = self.server.debug_session(client_id) if hasattr(self.server, "debug_session") else None
        self.json_response({
            "ok": True,
            "clientId": client_id,
            "debug": bool(session),
            "session": session or {},
        })

    def configure_debug(self) -> None:
        payload = self.read_json_request_payload()
        if payload is None:
            return
        client_id = self.debug_client_id(payload)
        if not client_id:
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_client_id", "Debug client id is required")
            return
        enabled = bool(payload.get("enabled"))
        ui_name = self.debug_ui_name(payload)
        session = self.server.set_debug_session(client_id, enabled, ui_name) if hasattr(self.server, "set_debug_session") else {
            "clientId": client_id,
            "uiName": ui_name,
            "enabled": enabled,
        }
        self.json_response({"ok": True, "debug": enabled, "session": session})

    def record_client_debug_log(self) -> None:
        payload = self.read_json_request_payload(allow_array=True)
        if payload is None:
            return
        entries = payload if isinstance(payload, list) else [payload]
        if len(entries) > MAX_DEBUG_BATCH_EVENTS:
            self.json_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "debug_batch_too_large", "Debug batch contains too many events")
            return
        if not all(isinstance(entry, dict) for entry in entries):
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_debug_event", "Debug log entries must be JSON objects")
            return
        recorded = 0
        if hasattr(self.server, "write_debug_log"):
            for entry in entries:
                client_id = self.debug_client_id(entry)
                if not client_id:
                    self.json_error(HTTPStatus.BAD_REQUEST, "invalid_client_id", "Debug client id is required")
                    return
                event = {
                    **entry,
                    "timestamp": entry.get("timestamp") or debug_now_iso(),
                    "clientId": client_id,
                    "uiName": self.debug_ui_name(entry),
                }
                self.server.write_debug_log(event)
                recorded += 1
        self.json_response({"ok": True, "recorded": recorded})

    def read_json_request_payload(self, *, allow_array: bool = False) -> dict | list | None:
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
        if not isinstance(payload, dict) and not (allow_array and isinstance(payload, list)):
            expected = "a JSON object or array" if allow_array else "a JSON object"
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_json", f"Request body must be {expected}")
            return None
        return payload

    def read_optional_json_request_payload(self) -> dict | None:
        length_header = self.headers.get("Content-Length")
        try:
            length = int(length_header or "0")
        except ValueError:
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_length", "Invalid Content-Length")
            return None
        if length <= 0:
            return {}
        payload = self.read_json_request_payload()
        return payload if isinstance(payload, dict) else None

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

    def save_model_to_scope(
        self,
        scope: str,
        name: str,
        payload: dict,
        *,
        expected_revision: object = None,
        client_id: object = None,
        enforce_revision: bool = False,
    ) -> dict:
        base_dir = model_scope_dir(scope)
        target = (base_dir / name).resolve()
        if target.parent != base_dir:
            raise OperationError("invalid_model_name", "Model file must stay inside its model scope directory")
        validation_error = validate_model_payload(payload)
        if validation_error:
            raise OperationError(validation_error["code"], validation_error["message"], HTTPStatus.BAD_REQUEST)
        model_key = model_key_for_scope(scope, name)
        with self.server.model_lock(model_key):
            if target.exists() and enforce_revision:
                current_metadata = model_metadata(target)
                current_revision = current_metadata["revision"]
                if not expected_revision:
                    raise OperationError(
                        "missing_revision",
                        "Model already exists. Reload it before saving so the server can prevent overwrites.",
                        HTTPStatus.CONFLICT,
                        modelName=name,
                        currentRevision=current_revision,
                        metadata=current_metadata,
                    )
                if str(expected_revision) != str(current_revision):
                    raise OperationError(
                        "model_conflict",
                        "Model has changed on the server. Reload before saving or use Save As New.",
                        HTTPStatus.CONFLICT,
                        modelName=name,
                        attemptedRevision=expected_revision,
                        currentRevision=current_revision,
                        metadata=current_metadata,
                    )
            backup_name = write_model_payload(target, payload)
            metadata = model_metadata(target)
            self.remember_model_revision(model_key, metadata["revision"], payload)
            refresh_model_manifests()
        self.publish_model_updated(model_key, metadata, backup_name, client_id=client_id)
        return {
            "saved": name,
            "modelName": model_key,
            "backup": backup_name,
            "metadata": metadata,
            "model": model_with_server_metadata(payload, metadata),
        }

    def ai_apply_model(self) -> None:
        payload = self.read_json_request_payload()
        if payload is None:
            return
        scope, scope_error = normalize_model_scope(payload.get("scope"))
        if scope_error:
            self.json_error(HTTPStatus.BAD_REQUEST, scope_error["code"], scope_error["message"])
            return
        model = payload.get("model")
        if not isinstance(model, dict):
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_ai_model", "AI apply requires a model object")
            return
        operation_mode = str(payload.get("operationMode") or "generate").strip() or "generate"
        save_mode = str(payload.get("saveMode") or ("new" if operation_mode == "generate" else "same")).strip()
        save_as_new = save_mode not in {"same", "overwrite"}
        prepared_model = prepare_ai_model_for_save(model, operation_mode, save_as_new=save_as_new)
        requested_name = str(payload.get("modelName") or "").strip()
        if save_as_new or not requested_name:
            requested_name = requested_ai_model_file_name(prepared_model, payload.get("requestedName"))
            name = unique_model_file_name(scope, requested_name)
            enforce_revision = False
        else:
            name, name_error = validate_model_name(requested_name)
            if name_error:
                self.json_error(HTTPStatus.BAD_REQUEST, name_error["code"], name_error["message"])
                return
            enforce_revision = bool(payload.get("expectedRevision"))
        try:
            saved = self.save_model_to_scope(
                scope,
                name,
                prepared_model,
                expected_revision=payload.get("expectedRevision"),
                client_id=payload.get("clientId") or self.headers.get("X-Client-Id", ""),
                enforce_revision=enforce_revision,
            )
        except OperationError as error:
            self.json_error(error.status, error.code, error.message, **error.details)
            return
        self.json_response({
            "ok": True,
            "scope": scope,
            "saveMode": "new" if save_as_new else "same",
            "manifestRefreshed": True,
            **saved,
        })

    def ai_rollback_model(self) -> None:
        payload = self.read_json_request_payload()
        if payload is None:
            return
        scope, scope_error = normalize_model_scope(payload.get("scope"))
        if scope_error:
            self.json_error(HTTPStatus.BAD_REQUEST, scope_error["code"], scope_error["message"])
            return
        name, name_error = validate_model_name(payload.get("modelName"))
        if name_error:
            self.json_error(HTTPStatus.BAD_REQUEST, name_error["code"], name_error["message"])
            return
        model = payload.get("model")
        if not isinstance(model, dict):
            self.json_error(HTTPStatus.BAD_REQUEST, "rollback_unavailable", "Rollback requires a model snapshot")
            return
        prepared_model = normalize_ai_hbds_model_response(model)
        try:
            saved = self.save_model_to_scope(
                scope,
                name,
                prepared_model,
                expected_revision=payload.get("expectedRevision"),
                client_id=payload.get("clientId") or self.headers.get("X-Client-Id", ""),
                enforce_revision=False,
            )
        except OperationError as error:
            self.json_error(error.status, error.code, error.message, **error.details)
            return
        self.json_response({
            "ok": True,
            "scope": scope,
            "rollback": True,
            "manifestRefreshed": True,
            **saved,
        })

    def delete_model_file(self, raw_scope: str, raw_name: str) -> None:
        payload = self.read_optional_json_request_payload()
        if payload is None:
            return
        scope, scope_error = normalize_model_scope(raw_scope)
        if scope_error:
            self.json_error(HTTPStatus.BAD_REQUEST, scope_error["code"], scope_error["message"])
            return
        name, name_error = validate_model_name(raw_name)
        if name_error:
            self.json_error(HTTPStatus.BAD_REQUEST, name_error["code"], name_error["message"])
            return
        base_dir = model_scope_dir(scope)
        target = (base_dir / name).resolve()
        if target.parent != base_dir:
            self.json_error(HTTPStatus.BAD_REQUEST, "invalid_model_name", "Model file must stay inside its model scope directory")
            return
        if not target.exists():
            self.json_error(HTTPStatus.NOT_FOUND, "model_not_found", "Model not found")
            return
        try:
            stored_model = read_stored_model(target)
        except json.JSONDecodeError:
            stored_model = None
        if is_protected_model_file(scope, name, stored_model) and not bool(payload.get("allowProtected")):
            self.json_error(HTTPStatus.CONFLICT, "protected_model", "This protected/default model cannot be deleted from the UI", modelName=name, scope=scope)
            return
        model_key = model_key_for_scope(scope, name)
        with self.server.model_lock(model_key):
            backup_dir = target.parent / ".backups"
            backup_dir.mkdir(parents=True, exist_ok=True)
            timestamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup_path = backup_dir / f"{target.stem}.deleted.{timestamp}.bak.json"
            shutil.move(str(target), str(backup_path))
            refresh_model_manifests()
            if hasattr(self.server, "clear_model_drafts"):
                self.server.clear_model_drafts(model_key)
        self.publish_model_updated(
            model_key,
            {
                "name": name,
                "label": label_from_model_name(name),
                "revision": "",
                "contentHash": "",
                "deleted": True,
            },
            backup_path.name,
            client_id=payload.get("clientId") or self.headers.get("X-Client-Id", ""),
        )
        self.json_response({
            "ok": True,
            "scope": scope,
            "deleted": name,
            "modelName": model_key,
            "backup": backup_path.name,
            "manifestRefreshed": True,
        })

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
            refresh_model_manifests()
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
            refresh_model_manifests()
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
        include_model, exclude_client_id = self.draft_list_response_options()
        drafts = self.server.list_model_drafts(
            name,
            include_model=include_model,
            exclude_client_id=exclude_client_id,
        ) if hasattr(self.server, "list_model_drafts") else []
        self.json_response({"ok": True, "modelName": name, "drafts": drafts})

    def list_scoped_model_drafts(self, raw_path: str) -> None:
        model_name = self.parse_scoped_draft_collection_path(raw_path)
        if not model_name:
            return
        include_model, exclude_client_id = self.draft_list_response_options()
        drafts = self.server.list_model_drafts(
            model_name,
            include_model=include_model,
            exclude_client_id=exclude_client_id,
        ) if hasattr(self.server, "list_model_drafts") else []
        self.json_response({"ok": True, "modelName": model_name, "drafts": drafts})

    def draft_list_response_options(self) -> tuple[bool, str]:
        query = parse_qs(urlparse(self.path).query)
        compact = query_flag(query, "compact", False)
        include_model = query_flag(query, "includeModel", not compact)
        exclude_client_id = clean_client_text(
            first_query_value(query, "excludeClientId"),
            max_length=MAX_CLIENT_ID_LENGTH,
        )
        return include_model, exclude_client_id

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
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except OSError as error:
            if is_client_disconnect(error):
                self.close_connection = True
                raise ClientDisconnected() from error
            raise

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
        try:
            message = format % args
        except (TypeError, ValueError):
            message = format
        line = f"{self.address_string()} - - [{self.log_date_time_string()}] {message}\n"
        try:
            with ACCESS_LOG_LOCK:
                rotate_log_file(SERVER_ACCESS_LOG_PATH)
                with SERVER_ACCESS_LOG_PATH.open("a", encoding="utf-8") as handle:
                    handle.write(line)
        except OSError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve HBDS UI and model API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--static-only", action="store_true", help="Serve public UI assets without enabling model APIs")
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="Acknowledge that connected mode has no authentication before binding beyond loopback",
    )
    args = parser.parse_args()

    if connected_bind_requires_remote_acknowledgement(
        args.host,
        static_only=args.static_only,
        allow_remote=args.allow_remote,
    ):
        parser.error(
            "connected mode has no authentication and refuses non-loopback binds without --allow-remote; "
            "use --static-only for read-only remote serving"
        )

    visible_stdout = sys.stdout if args.static_only else reset_startup_logs()
    if not args.static_only:
        refresh_model_manifests()
    httpd = HBDSLocalServer((args.host, args.port), HBDSRequestHandler)
    httpd.quiet = args.quiet or args.static_only
    httpd.api_enabled = not args.static_only
    print_startup_message(f"Serving HBDS on http://{args.host}:{args.port}", visible_stdout)
    if args.static_only:
        print_startup_message("Static-only mode: API endpoints are disabled", visible_stdout)
    elif not is_loopback_bind_host(args.host):
        print_startup_message("WARNING: remote connected mode is enabled without authentication", visible_stdout)
    print_startup_message("Open http://127.0.0.1:%d/index.html" % args.port, visible_stdout)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
