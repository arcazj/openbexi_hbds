#!/usr/bin/env python3
"""Smoke-test the local HBDS Python server."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT_DIR / "models"
SMOKE_MODEL_NAME = f"_server_smoke_{os.getpid()}.json"


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request_json(base_url: str, path: str, *, method: str = "GET", payload: object = None, expected: tuple[int, ...] = (200,)) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{base_url}{path}", data=body, headers=headers, method=method)
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


def cleanup_smoke_model() -> None:
    target = MODELS_DIR / SMOKE_MODEL_NAME
    if target.exists():
        target.unlink()
    backup_dir = MODELS_DIR / ".backups"
    if backup_dir.exists():
        for backup in backup_dir.glob(f"{Path(SMOKE_MODEL_NAME).stem}.*.bak.json"):
            backup.unlink()


def assert_ok(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    cleanup_smoke_model()
    port = get_free_port()
    base_url = f"http://127.0.0.1:{port}"
    process = start_server(port)
    try:
        wait_for_health(base_url, process)
        print("PASS health")

        spec = request_json(base_url, "/api/openapi.json")
        assert_ok(spec.get("openapi", "").startswith("3."), "OpenAPI version missing")
        assert_ok("/api/models/{modelName}" in spec.get("paths", {}), "Model path missing from OpenAPI spec")
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
        reloaded = request_json(base_url, f"/api/models/{SMOKE_MODEL_NAME}")
        assert_ok(reloaded.get("model", {}).get("metadata", {}).get("serverSmokeTest") is True, "Saved model did not reload correctly")
        print(f"PASS save/load {SMOKE_MODEL_NAME}")
    finally:
        cleanup_smoke_model()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

    assert_disconnected(base_url)
    print("PASS disconnected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
