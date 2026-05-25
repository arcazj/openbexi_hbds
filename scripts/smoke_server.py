#!/usr/bin/env python3
"""Smoke-test the local HBDS Python server."""

from __future__ import annotations

import json
import os
import queue
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT_DIR / "models"
TEST_MODELS_DIR = ROOT_DIR / "test_models"
SMOKE_MODEL_NAME = f"_server_smoke_{os.getpid()}.json"
SMOKE_TEST_MODEL_NAME = f"_test_model_smoke_{os.getpid()}.json"
SMOKE_MANIFEST_MODEL_NAME = f"zz_manifest_model_smoke_{os.getpid()}.json"
SMOKE_MANIFEST_TEST_MODEL_NAME = f"zz_manifest_test_model_smoke_{os.getpid()}.json"
STALE_MODEL_MANIFEST_VALUE = "models/zz_deleted_manifest_stale.json"
STALE_TEST_MODEL_MANIFEST_VALUE = "test_models/zz_deleted_manifest_stale.json"


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request_json(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: object = None,
    headers: dict[str, str] | None = None,
    expected: tuple[int, ...] = (200,),
) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request_headers = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{base_url}{path}", data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            status = response.status
            text = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        status = error.code
        text = error.read().decode("utf-8")
    if status not in expected:
        raise AssertionError(f"{method} {path} returned {status}, expected {expected}: {text[:240]}")
    return json.loads(text) if text.strip() else {}


def start_server(port: int) -> subprocess.Popen:
    command = [
        sys.executable,
        str(ROOT_DIR / "server.py"),
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--quiet",
    ]
    return subprocess.Popen(
        command,
        cwd=str(ROOT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def wait_for_health(base_url: str, process: subprocess.Popen) -> None:
    last_error = None
    for _ in range(60):
        if process.poll() is not None:
            stdout, stderr = process.communicate(timeout=1)
            raise AssertionError(f"Server exited early with {process.returncode}\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}")
        try:
            health = request_json(base_url, "/api/health")
            if health.get("ok") is True and health.get("status") == "connected":
                return
        except Exception as error:
            last_error = error
        time.sleep(0.1)
    raise AssertionError(f"Server health check did not become ready: {last_error}")


def assert_disconnected(base_url: str) -> None:
    try:
        urllib.request.urlopen(f"{base_url}/api/health", timeout=1)
    except urllib.error.URLError:
        return
    raise AssertionError("Server health endpoint is still reachable after shutdown")


def import_hbds_server():
    root = str(ROOT_DIR)
    if root not in sys.path:
        sys.path.insert(0, root)
    import server as hbds_server

    return hbds_server


def minimal_model_payload(name: str) -> dict:
    return {
        "metadata": {"name": name},
        "hypergraph": {"class": [], "link": []},
    }


def write_minimal_model(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(minimal_model_payload(path.stem), indent=2) + "\n", encoding="utf-8")


def refresh_manifest_files() -> None:
    import_hbds_server().refresh_model_manifests()


def cleanup_smoke_model(*, refresh_manifests: bool = False) -> None:
    for base_dir, model_name in (
        (MODELS_DIR, SMOKE_MODEL_NAME),
        (TEST_MODELS_DIR, SMOKE_TEST_MODEL_NAME),
        (MODELS_DIR, SMOKE_MANIFEST_MODEL_NAME),
        (TEST_MODELS_DIR, SMOKE_MANIFEST_TEST_MODEL_NAME),
    ):
        target = base_dir / model_name
        if target.exists():
            target.unlink()
        backup_dir = base_dir / ".backups"
        if backup_dir.exists():
            for backup in backup_dir.glob(f"{Path(model_name).stem}.*.bak.json"):
                backup.unlink()
    if refresh_manifests:
        refresh_manifest_files()


def label_from_file_name(name: str) -> str:
    return " ".join(Path(name).stem.replace("_", " ").replace("-", " ").split())


def manifest_model_values(base_dir: Path, scope: str) -> list[str]:
    return [
        f"{scope}/{path.name}"
        for path in sorted(base_dir.glob("*.json"), key=lambda item: item.name.lower())
        if path.is_file() and not path.name.startswith(".") and not path.name.lower().endswith("manifest.json")
    ]


def append_stale_manifest_entry(manifest_path: Path, stale_value: str) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"models": []}
    models = manifest.setdefault("models", [])
    models.append({"value": stale_value, "label": "stale deleted manifest entry", "description": "stale deleted manifest entry"})
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def prepare_manifest_smoke_files() -> None:
    write_minimal_model(MODELS_DIR / SMOKE_MANIFEST_MODEL_NAME)
    write_minimal_model(TEST_MODELS_DIR / SMOKE_MANIFEST_TEST_MODEL_NAME)
    append_stale_manifest_entry(MODELS_DIR / "models_manifest.json", STALE_MODEL_MANIFEST_VALUE)
    append_stale_manifest_entry(TEST_MODELS_DIR / "test_models_manifest.json", STALE_TEST_MODEL_MANIFEST_VALUE)


def assert_manifest_file_matches_directory(manifest_path: Path, base_dir: Path, scope: str, stale_value: str) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    models = manifest.get("models")
    assert_ok(isinstance(models, list), f"{manifest_path.name} did not contain a models list")
    values = [item.get("value") for item in models]
    assert_ok(values == manifest_model_values(base_dir, scope), f"{manifest_path.name} did not match files in {scope}")
    assert_ok(stale_value not in values, f"{manifest_path.name} kept a deleted model entry")
    for item in models:
        value = item.get("value", "")
        expected_label = label_from_file_name(Path(value).name)
        assert_ok(item.get("label") == expected_label, f"Wrong label for {value}: {item.get('label')}")
        assert_ok(item.get("description") == expected_label, f"Wrong description for {value}: {item.get('description')}")


def assert_startup_manifest_sync() -> None:
    assert_manifest_file_matches_directory(MODELS_DIR / "models_manifest.json", MODELS_DIR, "models", STALE_MODEL_MANIFEST_VALUE)
    assert_manifest_file_matches_directory(
        TEST_MODELS_DIR / "test_models_manifest.json",
        TEST_MODELS_DIR,
        "test_models",
        STALE_TEST_MODEL_MANIFEST_VALUE,
    )


def assert_manifest_generation_helpers() -> None:
    hbds_server = import_hbds_server()
    with tempfile.TemporaryDirectory() as tmp_dir:
        temp_root = Path(tmp_dir)
        empty_manifest = hbds_server.build_model_manifest(temp_root / "empty_models", "models")
        assert_ok(empty_manifest == {"models": []}, "Empty model directory did not produce an empty manifest")

        model_dir = temp_root / "models"
        write_minimal_model(model_dir / "alpha_beta.json")
        write_minimal_model(model_dir / "TGV-fast_model.json")
        write_minimal_model(model_dir / ".hidden.json")
        (model_dir / "models_manifest.json").write_text('{"models":[]}\n', encoding="utf-8")
        (model_dir / "notes.txt").write_text("not a model\n", encoding="utf-8")

        manifest = hbds_server.build_model_manifest(model_dir, "models")
        by_value = {item["value"]: item for item in manifest["models"]}
        expected_values = {"models/alpha_beta.json", "models/TGV-fast_model.json"}
        assert_ok(set(by_value) == expected_values, "Manifest helper did not include exactly the visible JSON model files")
        assert_ok(by_value["models/alpha_beta.json"]["label"] == "alpha beta", "Underscore label conversion failed")
        assert_ok(by_value["models/TGV-fast_model.json"]["label"] == "TGV fast model", "Dash label conversion failed")
        assert_ok(
            by_value["models/TGV-fast_model.json"]["description"] == by_value["models/TGV-fast_model.json"]["label"],
            "Generated description did not match label",
        )

        manifest_path = temp_root / "models_manifest.json"
        manifest_path.write_text(
            json.dumps({"models": [{"value": "models/deleted.json", "label": "deleted", "description": "deleted"}]}, indent=2) + "\n",
            encoding="utf-8",
        )
        hbds_server.write_json_atomic(manifest_path, manifest)
        written_values = [item["value"] for item in json.loads(manifest_path.read_text(encoding="utf-8"))["models"]]
        assert_ok("models/deleted.json" not in written_values, "Regenerated manifest kept a deleted file entry")


def assert_ok(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def read_until_event(base_url: str, events: queue.Queue, target_type: str = "model.updated", query: str = "") -> None:
    request = urllib.request.Request(f"{base_url}/api/events{query}", headers={"Accept": "text/event-stream"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            content_type = response.headers.get("Content-Type", "")
            assert_ok("text/event-stream" in content_type, f"Unexpected event stream content type: {content_type}")
            data_lines: list[str] = []
            while True:
                raw_line = response.readline()
                if not raw_line:
                    return
                line = raw_line.decode("utf-8").rstrip("\r\n")
                if line == ": connected":
                    events.put({"type": "connected"})
                    continue
                if line.startswith(":"):
                    continue
                if not line:
                    if data_lines:
                        event = json.loads("\n".join(data_lines))
                        events.put(event)
                        if event.get("type") == target_type:
                            return
                    data_lines = []
                    continue
                if line.startswith("data:"):
                    data_lines.append(line[5:].lstrip())
    except Exception as error:
        events.put({"type": "stream_error", "error": str(error)})


def wait_for_event(events: queue.Queue, event_type: str, timeout: float = 5) -> dict:
    deadline = time.time() + timeout
    last_event = None
    while time.time() < deadline:
        try:
            event = events.get(timeout=max(0.1, deadline - time.time()))
        except queue.Empty:
            break
        last_event = event
        if event.get("type") == event_type:
            return event
        if event.get("type") == "stream_error":
            raise AssertionError(f"SSE stream failed: {event.get('error')}")
    raise AssertionError(f"Timed out waiting for {event_type}; last event was {last_event}")


def main() -> int:
    cleanup_smoke_model(refresh_manifests=True)
    assert_manifest_generation_helpers()
    print("PASS manifest generator")

    prepare_manifest_smoke_files()
    port = get_free_port()
    base_url = f"http://127.0.0.1:{port}"
    process = start_server(port)
    try:
        wait_for_health(base_url, process)
        print("PASS health")

        assert_startup_manifest_sync()
        print("PASS manifest startup sync")

        spec = request_json(base_url, "/api/openapi.json")
        assert_ok(spec.get("openapi", "").startswith("3."), "OpenAPI version missing")
        assert_ok("/api/models/{modelName}" in spec.get("paths", {}), "Model path missing from OpenAPI spec")
        assert_ok("/api/models/{modelName}/ops" in spec.get("paths", {}), "Model operations path missing from OpenAPI spec")
        assert_ok("/api/models/{modelName}/drafts" in spec.get("paths", {}), "Model drafts path missing from OpenAPI spec")
        assert_ok("/api/models/{modelName}/drafts/{clientId}" in spec.get("paths", {}), "Model draft client path missing from OpenAPI spec")
        assert_ok("/api/model-files/{scope}/{modelName}" in spec.get("paths", {}), "Scoped model file path missing from OpenAPI spec")
        assert_ok("/api/drafts/{scope}/{modelName}" in spec.get("paths", {}), "Scoped drafts path missing from OpenAPI spec")
        assert_ok("/api/drafts/{scope}/{modelName}/clients/{clientId}" in spec.get("paths", {}), "Scoped draft client path missing from OpenAPI spec")
        assert_ok("/api/events" in spec.get("paths", {}), "Events path missing from OpenAPI spec")
        print("PASS openapi")

        model_list = request_json(base_url, "/api/models")
        models = model_list.get("models", [])
        assert_ok(bool(models), "Expected at least one model from /api/models")
        first_model = models[0]["name"]
        print(f"PASS list ({len(models)} models)")

        loaded = request_json(base_url, f"/api/models/{urllib.parse.quote(first_model)}")
        model_payload = loaded.get("model")
        assert_ok(isinstance(model_payload, dict), "Loaded model payload is not an object")
        assert_ok(isinstance(model_payload.get("hypergraph", {}).get("class"), list), "Loaded model has no hypergraph.class array")
        assert_ok(bool(loaded.get("metadata", {}).get("revision")), "Loaded model metadata has no revision")
        assert_ok(model_payload.get("metadata", {}).get("revision") == loaded.get("metadata", {}).get("revision"), "Model payload revision did not match response metadata")
        print(f"PASS load {first_model}")

        bad_name = request_json(base_url, "/api/models/not_json.txt", expected=(400,))
        assert_ok(bad_name.get("ok") is False, "Bad model name was accepted")
        bad_payload = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}",
            method="POST",
            payload={"invalid": True},
            expected=(400,),
        )
        assert_ok(bad_payload.get("ok") is False, "Invalid model payload was accepted")
        print("PASS validation")

        saved_model = json.loads(json.dumps(model_payload))
        saved_model.setdefault("metadata", {})["serverSmokeTest"] = True
        saved = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}",
            method="POST",
            payload=saved_model,
        )
        assert_ok(saved.get("ok") is True and saved.get("saved") == SMOKE_MODEL_NAME, "Model save response was invalid")
        first_revision = saved.get("metadata", {}).get("revision")
        assert_ok(bool(first_revision), "Saved model response had no revision")
        reloaded = request_json(base_url, f"/api/models/{SMOKE_MODEL_NAME}")
        assert_ok(reloaded.get("model", {}).get("metadata", {}).get("serverSmokeTest") is True, "Saved model did not reload correctly")
        print(f"PASS save/load {SMOKE_MODEL_NAME}")

        updated_model = json.loads(json.dumps(reloaded["model"]))
        updated_model.setdefault("metadata", {})["serverSmokeTestRevision"] = "second-save"
        events: queue.Queue = queue.Queue()
        event_thread = threading.Thread(target=read_until_event, args=(base_url, events), daemon=True)
        event_thread.start()
        wait_for_event(events, "connected")
        updated = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}",
            method="POST",
            payload=updated_model,
            headers={"If-Match": first_revision},
        )
        second_revision = updated.get("metadata", {}).get("revision")
        assert_ok(bool(second_revision), "Updated model response had no revision")
        assert_ok(second_revision != first_revision, "Updated model revision did not change")
        print("PASS revision save")
        update_event = wait_for_event(events, "model.updated")
        assert_ok(update_event.get("modelName") == SMOKE_MODEL_NAME, "SSE model.updated had wrong model name")
        assert_ok(update_event.get("modelRevision") == second_revision, "SSE model.updated had wrong revision")
        assert_ok(isinstance(update_event.get("sequence"), int), "SSE model.updated had no sequence")
        event_thread.join(timeout=3)
        print("PASS event stream")

        presence_events: queue.Queue = queue.Queue()
        presence_query = "?" + urllib.parse.urlencode({"clientId": "smoke-presence", "clientName": "Smoke Presence"})
        presence_thread = threading.Thread(
            target=read_until_event,
            args=(base_url, presence_events, "client.joined", presence_query),
            daemon=True,
        )
        presence_thread.start()
        wait_for_event(presence_events, "connected")
        joined_event = wait_for_event(presence_events, "client.joined")
        assert_ok(joined_event.get("clientId") == "smoke-presence", "Presence join event had wrong client id")
        assert_ok(joined_event.get("clientName") == "Smoke Presence", "Presence join event had wrong client name")
        presence_thread.join(timeout=3)
        print("PASS presence stream")

        draft_class_id = updated_model["hypergraph"]["class"][0]["id"]
        draft_client_id = "smoke-draft-client"
        draft_events: queue.Queue = queue.Queue()
        draft_thread = threading.Thread(
            target=read_until_event,
            args=(base_url, draft_events, "draft.updated", "?clientId=smoke-draft-watcher"),
            daemon=True,
        )
        draft_thread.start()
        wait_for_event(draft_events, "connected")
        draft_payload = {
            "clientName": "Smoke Draft Client",
            "baseModelRevision": second_revision,
            "mode": "editing",
            "dirty": True,
            "isDirty": True,
            "operations": [
                {
                    "opId": "smoke-draft-update",
                    "type": "updateClass",
                    "targetId": draft_class_id,
                    "patch": {"name": "Smoke Draft Name"},
                }
            ],
            "selection": {"classId": draft_class_id},
            "preview": {
                "kind": "live-canvas-snapshot",
                "label": "Live Preview Snapshot",
                "mediaType": "image/png",
                "dataUrl": "data:image/png;base64,iVBORw0KGgo=",
                "width": 32,
                "height": 18,
            },
        }
        draft_result = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}/drafts/{urllib.parse.quote(draft_client_id)}",
            method="POST",
            payload=draft_payload,
            headers={"X-Client-Id": draft_client_id, "X-Client-Name": "Smoke Draft Client"},
        )
        assert_ok(draft_result.get("ok") is True, "Draft update response was not ok")
        draft_event = wait_for_event(draft_events, "draft.updated")
        assert_ok(draft_event.get("modelName") == SMOKE_MODEL_NAME, "Draft event had wrong model name")
        assert_ok(draft_event.get("clientId") == draft_client_id, "Draft event had wrong client id")
        assert_ok(draft_event.get("mode") == "editing", "Draft event did not preserve collaboration mode")
        assert_ok(draft_event.get("dirty") is True, "Draft event did not preserve dirty flag")
        assert_ok(draft_event.get("operations", [{}])[0].get("opId") == "smoke-draft-update", "Draft event did not include operation")
        assert_ok(draft_event.get("preview", {}).get("kind") == "live-canvas-snapshot", "Draft event did not preserve preview snapshot")
        draft_thread.join(timeout=3)
        draft_list = request_json(base_url, f"/api/models/{SMOKE_MODEL_NAME}/drafts")
        assert_ok(len(draft_list.get("drafts", [])) == 1, "Draft list did not contain saved draft")
        assert_ok(draft_list["drafts"][0].get("clientId") == draft_client_id, "Draft list had wrong client id")
        assert_ok(draft_list["drafts"][0].get("mode") == "editing", "Draft list did not preserve collaboration mode")
        assert_ok(draft_list["drafts"][0].get("preview", {}).get("dataUrl", "").startswith("data:image/png;base64,"), "Draft list did not preserve preview data")

        clear_events: queue.Queue = queue.Queue()
        clear_thread = threading.Thread(
            target=read_until_event,
            args=(base_url, clear_events, "draft.cleared", "?clientId=smoke-clear-watcher"),
            daemon=True,
        )
        clear_thread.start()
        wait_for_event(clear_events, "connected")
        cleared = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}/drafts/{urllib.parse.quote(draft_client_id)}",
            method="DELETE",
        )
        assert_ok(cleared.get("deleted") is True, "Draft delete response did not report deletion")
        cleared_event = wait_for_event(clear_events, "draft.cleared")
        assert_ok(cleared_event.get("clientId") == draft_client_id, "Draft cleared event had wrong client id")
        clear_thread.join(timeout=3)
        empty_drafts = request_json(base_url, f"/api/models/{SMOKE_MODEL_NAME}/drafts")
        assert_ok(empty_drafts.get("drafts") == [], "Draft list was not empty after delete")
        print("PASS draft state")

        test_model_names = [
            path.name
            for path in sorted(TEST_MODELS_DIR.glob("*.json"), key=lambda item: item.name.lower())
            if not path.name.startswith(".") and not path.name.lower().endswith("manifest.json")
        ]
        assert_ok(bool(test_model_names), "Expected at least one test model")
        test_model_name = test_model_names[0]
        scoped_client_id = "smoke-test-model-draft"
        scoped_key = f"test_models/{test_model_name}"
        scoped_events: queue.Queue = queue.Queue()
        scoped_thread = threading.Thread(
            target=read_until_event,
            args=(base_url, scoped_events, "draft.updated", "?clientId=smoke-scoped-draft-watcher"),
            daemon=True,
        )
        scoped_thread.start()
        wait_for_event(scoped_events, "connected")
        scoped_payload = {
            "clientName": "Smoke Test Model Draft",
            "mode": "editing",
            "dirty": True,
            "isDirty": True,
            "operations": [],
            "selection": {"classId": "smoke"},
            "model": {"hypergraph": {"class": [], "link": []}},
        }
        scoped_result = request_json(
            base_url,
            f"/api/drafts/test_models/{urllib.parse.quote(test_model_name, safe='')}/clients/{urllib.parse.quote(scoped_client_id, safe='')}",
            method="POST",
            payload=scoped_payload,
            headers={"X-Client-Id": scoped_client_id, "X-Client-Name": "Smoke Test Model Draft"},
        )
        assert_ok(scoped_result.get("ok") is True, "Scoped draft update response was not ok")
        assert_ok(scoped_result.get("modelName") == scoped_key, "Scoped draft response had wrong model name")
        scoped_event = wait_for_event(scoped_events, "draft.updated")
        assert_ok(scoped_event.get("modelName") == scoped_key, "Scoped draft event had wrong model name")
        assert_ok(scoped_event.get("clientId") == scoped_client_id, "Scoped draft event had wrong client id")
        scoped_thread.join(timeout=3)
        scoped_list = request_json(base_url, f"/api/drafts/test_models/{urllib.parse.quote(test_model_name, safe='')}")
        assert_ok(len(scoped_list.get("drafts", [])) == 1, "Scoped draft list did not contain saved draft")
        assert_ok(scoped_list["drafts"][0].get("modelName") == scoped_key, "Scoped draft list had wrong model name")
        scoped_cleared = request_json(
            base_url,
            f"/api/drafts/test_models/{urllib.parse.quote(test_model_name, safe='')}/clients/{urllib.parse.quote(scoped_client_id, safe='')}",
            method="DELETE",
        )
        assert_ok(scoped_cleared.get("deleted") is True, "Scoped draft delete response did not report deletion")
        scoped_empty = request_json(base_url, f"/api/drafts/test_models/{urllib.parse.quote(test_model_name, safe='')}")
        assert_ok(scoped_empty.get("drafts") == [], "Scoped draft list was not empty after delete")
        print("PASS scoped draft state")

        scoped_save_model = json.loads(json.dumps(model_payload))
        scoped_save_model.setdefault("metadata", {})["serverSmokeTestScope"] = "test_models"
        scoped_save = request_json(
            base_url,
            f"/api/model-files/test_models/{urllib.parse.quote(SMOKE_TEST_MODEL_NAME, safe='')}",
            method="POST",
            payload=scoped_save_model,
        )
        assert_ok(scoped_save.get("ok") is True, "Scoped test model save response was not ok")
        assert_ok(scoped_save.get("saved") == SMOKE_TEST_MODEL_NAME, "Scoped test model save used wrong file name")
        assert_ok(scoped_save.get("modelName") == f"test_models/{SMOKE_TEST_MODEL_NAME}", "Scoped test model save had wrong model key")
        assert_ok((TEST_MODELS_DIR / SMOKE_TEST_MODEL_NAME).exists(), "Scoped test model file was not written")
        scoped_loaded = request_json(base_url, f"/api/model-files/test_models/{urllib.parse.quote(SMOKE_TEST_MODEL_NAME, safe='')}")
        assert_ok(
            scoped_loaded.get("model", {}).get("metadata", {}).get("serverSmokeTestScope") == "test_models",
            "Scoped test model did not reload correctly",
        )
        print("PASS scoped test model save/load")

        ops_model = request_json(base_url, f"/api/models/{SMOKE_MODEL_NAME}")
        first_class_id = ops_model["model"]["hypergraph"]["class"][0]["id"]
        original_name = ops_model["model"]["hypergraph"]["class"][0].get("name")
        operation_name = f"{original_name or first_class_id} Smoke Ops"
        op_events: queue.Queue = queue.Queue()
        op_event_thread = threading.Thread(target=read_until_event, args=(base_url, op_events), daemon=True)
        op_event_thread.start()
        wait_for_event(op_events, "connected")
        ops_result = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}/ops",
            method="POST",
            payload={
                "clientId": "smoke-ops",
                "baseModelRevision": second_revision,
                "operations": [
                    {
                        "opId": "smoke-op-update-class",
                        "type": "updateClass",
                        "targetId": first_class_id,
                        "patch": {"name": operation_name},
                    }
                ],
            },
        )
        ops_revision = ops_result.get("metadata", {}).get("revision")
        assert_ok(bool(ops_revision), "Operations response had no revision")
        assert_ok(ops_revision != second_revision, "Operations did not change model revision")
        assert_ok(ops_result.get("operations", [{}])[0].get("opId") == "smoke-op-update-class", "Applied operation was not echoed")
        op_event = wait_for_event(op_events, "model.updated")
        assert_ok(op_event.get("modelName") == SMOKE_MODEL_NAME, "Operation event had wrong model name")
        assert_ok(op_event.get("modelRevision") == ops_revision, "Operation event had wrong revision")
        assert_ok(op_event.get("clientId") == "smoke-ops", "Operation event did not include client id")
        assert_ok(op_event.get("operations", [{}])[0].get("opId") == "smoke-op-update-class", "Operation event did not include operation")
        op_event_thread.join(timeout=3)
        op_loaded = request_json(base_url, f"/api/models/{SMOKE_MODEL_NAME}")
        assert_ok(op_loaded["model"]["hypergraph"]["class"][0].get("name") == operation_name, "Operation update did not persist")
        print("PASS operations update")

        current_position = op_loaded["model"]["hypergraph"]["class"][0].get("position") or {}
        merged_x = float(current_position.get("x", 0)) + 1.0
        merged_ops = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}/ops",
            method="POST",
            payload={
                "baseModelRevision": second_revision,
                "operations": [
                    {
                        "opId": "smoke-op-merge-position",
                        "type": "updateClass",
                        "targetId": first_class_id,
                        "patch": {"position": {"x": merged_x}},
                    }
                ],
            },
        )
        merge_revision = merged_ops.get("metadata", {}).get("revision")
        assert_ok(merged_ops.get("merged") is True, "Stale different-field operation was not marked as merged")
        assert_ok(bool(merge_revision) and merge_revision != ops_revision, "Merged operation did not change revision")
        merged_loaded = request_json(base_url, f"/api/models/{SMOKE_MODEL_NAME}")
        merged_class = merged_loaded["model"]["hypergraph"]["class"][0]
        assert_ok(merged_class.get("name") == operation_name, "Merged operation lost prior name change")
        assert_ok(float(merged_class.get("position", {}).get("x")) == merged_x, "Merged operation did not apply position change")
        print("PASS stale operations auto-merge")

        stale_ops = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}/ops",
            method="POST",
            payload={
                "baseModelRevision": second_revision,
                "operations": [
                    {
                        "opId": "smoke-op-stale",
                        "type": "updateClass",
                        "targetId": first_class_id,
                        "patch": {"name": "stale operation"},
                    }
                ],
            },
            expected=(409,),
        )
        assert_ok(stale_ops.get("error", {}).get("code") == "operation_conflict", "Stale same-field operation did not return operation_conflict")
        assert_ok(stale_ops.get("error", {}).get("currentRevision") == merge_revision, "Stale operations response did not include current revision")
        print("PASS stale operations conflict")

        stale_model = json.loads(json.dumps(updated_model))
        stale_model.setdefault("metadata", {})["serverSmokeTestRevision"] = "stale-save"
        stale = request_json(
            base_url,
            f"/api/models/{SMOKE_MODEL_NAME}",
            method="POST",
            payload=stale_model,
            headers={"If-Match": first_revision},
            expected=(409,),
        )
        assert_ok(stale.get("error", {}).get("code") == "model_conflict", "Stale save did not return model_conflict")
        assert_ok(stale.get("error", {}).get("currentRevision") == merge_revision, "Conflict response did not include current revision")
        print("PASS stale revision conflict")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        cleanup_smoke_model(refresh_manifests=True)

    assert_disconnected(base_url)
    print("PASS disconnected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
