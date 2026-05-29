#!/usr/bin/python3
"""Browser-level regression for HBDS collaboration responsiveness.

This script intentionally uses only the Python standard library. It starts the
local HBDS server, launches Edge/Chrome in headless CDP mode, opens two real
dynamic-layout clients, and verifies that collaboration draft updates render
quickly and accurately in the remote operations UI.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import select
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT_DIR / "models"
TEST_MODELS_DIR = ROOT_DIR / "test_models"
TEMP_MODEL_NAME = f"_collab_browser_{os.getpid()}.json"
TEMP_PROFILE_DIR = ROOT_DIR / f".tmp-collab-browser-profile-{os.getpid()}"
HUMAN_AND_CAR_LINKS_MODEL_NAME = "human_and_car_links.json"
HUMAN_AND_CAR_LINKS_SELECTION_MAX_MS = 250.0
SOURCE_MODEL_CANDIDATES = [
    MODELS_DIR / "bridge_road_links.json",
    MODELS_DIR / "satellite_world_complete_structure.json",
    TEST_MODELS_DIR / "stress_022_large_performance.json",
]
BROWSER_CANDIDATES = [
    Path(os.environ.get("HBDS_BROWSER", "")) if os.environ.get("HBDS_BROWSER") else None,
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
]
SIGNIFICANT_ERROR_LIMIT = 12


class BrowserRegressionError(AssertionError):
    """Raised when the browser collaboration regression fails."""


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
    timeout: float = 5.0,
) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request_headers = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{base_url}{path}", data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
            text = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        status = error.code
        text = error.read().decode("utf-8")
    if status not in expected:
        raise BrowserRegressionError(f"{method} {path} returned {status}, expected {expected}: {text[:400]}")
    return json.loads(text) if text.strip() else {}


def start_server(port: int) -> subprocess.Popen:
    return subprocess.Popen(
        [
            sys.executable,
            str(ROOT_DIR / "server.py"),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--quiet",
        ],
        cwd=str(ROOT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def wait_for_health(base_url: str, process: subprocess.Popen) -> None:
    last_error = None
    for _ in range(80):
        if process.poll() is not None:
            stdout, stderr = process.communicate(timeout=1)
            raise BrowserRegressionError(
                f"Server exited early with {process.returncode}\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}"
            )
        try:
            health = request_json(base_url, "/api/health", timeout=1)
            if health.get("ok") is True and health.get("status") == "connected":
                return
        except Exception as error:  # noqa: BLE001 - include last startup failure in the timeout.
            last_error = error
        time.sleep(0.1)
    raise BrowserRegressionError(f"Server health check did not become ready: {last_error}")


def source_model() -> tuple[Path, dict]:
    for path in SOURCE_MODEL_CANDIDATES:
        if path.exists():
            model = json.loads(path.read_text(encoding="utf-8"))
            model.setdefault("metadata", {})["collaborationBrowserRegression"] = {
                "source": path.name,
                "pid": os.getpid(),
            }
            return path, model
    raise BrowserRegressionError("No source model was available for the browser collaboration regression")


def save_temp_server_model(base_url: str) -> tuple[Path, dict]:
    path, model = source_model()
    result = request_json(
        base_url,
        f"/api/models/{urllib.parse.quote(TEMP_MODEL_NAME)}",
        method="POST",
        payload=model,
        timeout=10,
    )
    if result.get("ok") is not True:
        raise BrowserRegressionError(f"Could not save temporary model {TEMP_MODEL_NAME}: {result}")
    loaded = request_json(base_url, f"/api/models/{urllib.parse.quote(TEMP_MODEL_NAME)}", timeout=8)
    if not loaded.get("model", {}).get("hypergraph", {}).get("class"):
        raise BrowserRegressionError("Temporary model loaded without classes")
    return path, loaded


def cleanup_temp_model() -> None:
    target = MODELS_DIR / TEMP_MODEL_NAME
    if target.exists():
        target.unlink()
    backup_dir = MODELS_DIR / ".backups"
    if backup_dir.exists():
        for backup in backup_dir.glob(f"{Path(TEMP_MODEL_NAME).stem}.*.bak.json"):
            backup.unlink()
    try:
        root = str(ROOT_DIR)
        if root not in sys.path:
            sys.path.insert(0, root)
        import server as hbds_server  # pylint: disable=import-error,import-outside-toplevel

        hbds_server.refresh_model_manifests()
    except Exception as error:  # noqa: BLE001 - cleanup should not hide the primary result.
        print(f"WARN could not refresh manifests during cleanup: {error}", file=sys.stderr)


def browser_executable() -> Path:
    for candidate in BROWSER_CANDIDATES:
        if candidate and candidate.exists():
            return candidate
    raise BrowserRegressionError(
        "No Chromium browser was found. Set HBDS_BROWSER to Edge or Chrome to run the browser regression."
    )


def launch_browser(debug_port: int) -> subprocess.Popen:
    if TEMP_PROFILE_DIR.exists():
        shutil.rmtree(TEMP_PROFILE_DIR)
    TEMP_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    executable = browser_executable()
    args = [
        str(executable),
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion",
        "--no-first-run",
        "--no-default-browser-check",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={TEMP_PROFILE_DIR}",
        "about:blank",
    ]
    return subprocess.Popen(
        args,
        cwd=str(ROOT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def wait_for_browser(debug_port: int, process: subprocess.Popen) -> dict:
    version_url = f"http://127.0.0.1:{debug_port}/json/version"
    last_error = None
    for _ in range(100):
        if process.poll() is not None:
            stdout, stderr = process.communicate(timeout=1)
            raise BrowserRegressionError(
                f"Browser exited early with {process.returncode}\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}"
            )
        try:
            with urllib.request.urlopen(version_url, timeout=1) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001 - include last startup failure in the timeout.
            last_error = error
        time.sleep(0.1)
    raise BrowserRegressionError(f"Browser debugging endpoint did not become ready: {last_error}")


def create_target(debug_port: int, url: str = "about:blank") -> dict:
    encoded = urllib.parse.quote(url, safe="")
    endpoint = f"http://127.0.0.1:{debug_port}/json/new?{encoded}"
    for method in ("PUT", "GET"):
        request = urllib.request.Request(endpoint, method=method)
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code in (405, 404) and method == "PUT":
                continue
            raise
    raise BrowserRegressionError("Could not create a browser target")


class CDPConnection:
    def __init__(self, websocket_url: str):
        self.sock = self._connect(websocket_url)
        self.next_id = 1
        self.events: list[dict] = []
        self.console_entries: list[str] = []
        self.browser_errors: list[str] = []

    def _connect(self, websocket_url: str) -> socket.socket:
        parsed = urllib.parse.urlparse(websocket_url)
        port = parsed.port or (443 if parsed.scheme == "wss" else 80)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        sock = socket.create_connection((parsed.hostname or "127.0.0.1", port), timeout=5)
        key = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {parsed.hostname}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode("ascii")
        sock.sendall(request)
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk
        header = response.decode("iso-8859-1", errors="replace")
        if " 101 " not in header.split("\r\n", 1)[0]:
            raise BrowserRegressionError(f"WebSocket upgrade failed: {header[:300]}")
        expected_accept = base64.b64encode(
            hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")).digest()
        ).decode("ascii")
        if expected_accept not in header:
            raise BrowserRegressionError("WebSocket upgrade returned an invalid Sec-WebSocket-Accept header")
        sock.settimeout(5)
        return sock

    def close(self) -> None:
        try:
            self._send_frame(b"", opcode=8)
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass

    def send(self, method: str, params: dict | None = None, *, timeout: float = 20.0) -> dict:
        message_id = self.next_id
        self.next_id += 1
        self._send_json({"id": message_id, "method": method, "params": params or {}})
        deadline = time.time() + timeout
        while time.time() < deadline:
            message = self._recv_json(timeout=max(0.05, min(1.0, deadline - time.time())))
            if message is None:
                continue
            if message.get("id") == message_id:
                if "error" in message:
                    raise BrowserRegressionError(f"CDP {method} failed: {message['error']}")
                return message
            self._handle_event(message)
        raise BrowserRegressionError(f"Timed out waiting for CDP response to {method}")

    def drain(self, timeout: float = 0.05) -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            message = self._recv_json(timeout=max(0.01, min(0.05, deadline - time.time())))
            if message is None:
                return
            self._handle_event(message)

    def _handle_event(self, message: dict) -> None:
        self.events.append(message)
        method = message.get("method")
        params = message.get("params", {})
        if method == "Runtime.consoleAPICalled":
            entry_type = params.get("type", "")
            args = params.get("args", [])
            text = " ".join(
                str(arg.get("value", arg.get("description", "")))
                for arg in args
                if arg.get("value", arg.get("description", "")) is not None
            ).strip()
            if text:
                entry = f"console.{entry_type}: {text}"
                self.console_entries.append(entry)
                if entry_type in {"error", "assert"}:
                    self.browser_errors.append(entry)
        elif method == "Runtime.exceptionThrown":
            details = params.get("exceptionDetails", {})
            text = details.get("text") or details.get("exception", {}).get("description") or json.dumps(details)[:300]
            self.browser_errors.append(f"exception: {text}")
        elif method == "Log.entryAdded":
            entry = params.get("entry", {})
            level = entry.get("level", "")
            text = entry.get("text", "")
            url = entry.get("url", "")
            if text or url:
                rendered = f"log.{level}: {text} {url}".strip()
                self.console_entries.append(rendered)
                if level == "error":
                    self.browser_errors.append(rendered)

    def _send_json(self, payload: dict) -> None:
        self._send_frame(json.dumps(payload, separators=(",", ":")).encode("utf-8"), opcode=1)

    def _send_frame(self, payload: bytes, *, opcode: int = 1) -> None:
        first = 0x80 | (opcode & 0x0F)
        length = len(payload)
        mask_bit = 0x80
        if length < 126:
            header = struct.pack("!BB", first, mask_bit | length)
        elif length < (1 << 16):
            header = struct.pack("!BBH", first, mask_bit | 126, length)
        else:
            header = struct.pack("!BBQ", first, mask_bit | 127, length)
        mask = secrets.token_bytes(4)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.sock.sendall(header + mask + masked)

    def _recv_json(self, *, timeout: float = 1.0) -> dict | None:
        readable, _, _ = select.select([self.sock], [], [], max(0.0, timeout))
        if not readable:
            return None
        previous_timeout = self.sock.gettimeout()
        self.sock.settimeout(10)
        try:
            payload = self._recv_frame()
        finally:
            self.sock.settimeout(previous_timeout)
        if payload is None:
            return None
        return json.loads(payload.decode("utf-8"))

    def _recv_frame(self) -> bytes | None:
        header = self._read_exact(2)
        if not header:
            return None
        first, second = header
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", self._read_exact(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self._read_exact(8))[0]
        mask = self._read_exact(4) if masked else b""
        payload = self._read_exact(length) if length else b""
        if masked:
            payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        if opcode == 8:
            raise BrowserRegressionError("Browser closed the CDP WebSocket")
        if opcode == 9:
            self._send_frame(payload, opcode=10)
            return self._recv_frame()
        if opcode == 10:
            return self._recv_frame()
        if opcode != 1:
            return self._recv_frame()
        return payload

    def _read_exact(self, size: int) -> bytes:
        chunks = bytearray()
        while len(chunks) < size:
            chunk = self.sock.recv(size - len(chunks))
            if not chunk:
                raise BrowserRegressionError("CDP WebSocket closed unexpectedly")
            chunks.extend(chunk)
        return bytes(chunks)


class BrowserPage:
    def __init__(self, target: dict):
        self.target = target
        self.cdp = CDPConnection(target["webSocketDebuggerUrl"])
        self.cdp.send("Page.enable")
        self.cdp.send("Runtime.enable")
        self.cdp.send("Log.enable")
        self.cdp.send("Emulation.setDeviceMetricsOverride", {
            "width": 1600,
            "height": 1000,
            "deviceScaleFactor": 1,
            "mobile": False,
        })

    def close(self) -> None:
        self.cdp.close()

    def navigate(self, url: str) -> None:
        start_index = len(self.cdp.events)
        self.cdp.send("Page.navigate", {"url": url}, timeout=10)
        self.wait_for_load(start_index=start_index)

    def wait_for_load(self, *, start_index: int | None = None, timeout: float = 25.0) -> None:
        event_start = len(self.cdp.events) if start_index is None else start_index
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.cdp.drain(0.2)
            if any(
                event.get("method") in {"Page.loadEventFired", "Page.frameStoppedLoading"}
                for event in self.cdp.events[event_start:]
            ):
                return
            time.sleep(0.05)
        raise BrowserRegressionError("Timed out waiting for page load event")

    def bring_to_front(self) -> None:
        self.cdp.send("Page.bringToFront", timeout=5)

    def evaluate(self, expression: str, *, timeout: float = 20.0) -> object:
        response = self.cdp.send(
            "Runtime.evaluate",
            {
                "expression": expression,
                "awaitPromise": True,
                "returnByValue": True,
                "userGesture": True,
            },
            timeout=timeout,
        )
        result = response.get("result", {})
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            text = details.get("text") or details.get("exception", {}).get("description") or json.dumps(details)[:500]
            raise BrowserRegressionError(f"Runtime.evaluate exception: {text}")
        remote = result.get("result", {})
        if "value" in remote:
            return remote["value"]
        if "unserializableValue" in remote:
            return remote["unserializableValue"]
        return None

    def dispatch_mouse(self, event_type: str, x: float, y: float, *, button: str = "left", buttons: int = 0) -> None:
        params = {
            "type": event_type,
            "x": float(x),
            "y": float(y),
            "button": button,
            "buttons": buttons,
            "clickCount": 1,
        }
        self.cdp.send("Input.dispatchMouseEvent", params, timeout=5)

    def click(self, selector: str) -> None:
        expression = f"""
(() => {{
  const element = document.querySelector({json.dumps(selector)});
  if (!element) return false;
  element.scrollIntoView?.({{ block: 'center', inline: 'center' }});
  element.click();
  return true;
}})()
"""
        if self.evaluate(expression) is not True:
            raise BrowserRegressionError(f"Could not click missing element {selector}")

    def significant_errors(self) -> list[str]:
        self.cdp.drain(0.2)
        return [entry for entry in self.cdp.browser_errors if is_significant_browser_error(entry)]


def is_significant_browser_error(entry: str) -> bool:
    text = entry.lower()
    ignored_fragments = [
        "favicon.ico",
        "/icons/",
        "\\icons\\",
        "/images/",
        "\\images\\",
        "generated_icons_manifest",
    ]
    return not any(fragment in text for fragment in ignored_fragments)


def js_async(body: str) -> str:
    return f"(async () => {{\n{body}\n}})()"


def wait_for(page: BrowserPage, body: str, label: str, *, timeout: float = 20.0, interval: float = 0.15) -> object:
    deadline = time.time() + timeout
    last_value = None
    last_error = None
    while time.time() < deadline:
        try:
            last_value = page.evaluate(js_async(body), timeout=15)
            if last_value:
                return last_value
        except Exception as error:  # noqa: BLE001 - retry until timeout, then report last failure.
            last_error = error
        page.cdp.drain(0.05)
        time.sleep(interval)
    errors = page.significant_errors()
    detail = f" Last value: {last_value!r}."
    if last_error:
        detail += f" Last error: {last_error}."
    if errors:
        detail += "\nBrowser errors:\n" + "\n".join(errors[:SIGNIFICANT_ERROR_LIMIT])
    raise BrowserRegressionError(f"Timed out waiting for {label}.{detail}")


def wait_for_server_model_name(base_url: str, model_name: str, class_id: str, expected_name: str, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    last_name = None
    while time.time() < deadline:
        loaded = request_json(base_url, f"/api/models/{urllib.parse.quote(model_name)}", timeout=4)
        for node in loaded.get("model", {}).get("hypergraph", {}).get("class", []):
            if str(node.get("id")) == str(class_id):
                last_name = node.get("name")
                if last_name == expected_name:
                    return
        time.sleep(0.15)
    raise BrowserRegressionError(f"Server model did not contain merged class name {expected_name!r}; last name was {last_name!r}")


def wait_for_server_draft(base_url: str, model_name: str, expected_text: str, timeout: float = 15.0) -> dict:
    deadline = time.time() + timeout
    last_drafts: list[dict] = []
    while time.time() < deadline:
        result = request_json(base_url, f"/api/models/{urllib.parse.quote(model_name)}/drafts", timeout=4)
        last_drafts = result.get("drafts", [])
        for draft in last_drafts:
            if expected_text in json.dumps(draft):
                return draft
        time.sleep(0.2)
    summary = [
        {
            "clientId": draft.get("clientId"),
            "mode": draft.get("mode"),
            "dirty": draft.get("dirty"),
            "operations": [operation.get("type") for operation in draft.get("operations", [])],
            "status": draft.get("status"),
        }
        for draft in last_drafts
    ]
    raise BrowserRegressionError(f"Server did not receive expected draft text {expected_text!r}; drafts={summary}")


def wait_for_pages_loaded(pages: list[BrowserPage], model_name: str) -> None:
    for index, page in enumerate(pages, start=1):
        page.bring_to_front()
        wait_for(
            page,
            f"""
return Boolean(
  window.__hbdsDynamicTest &&
  document.querySelector('#test-model-select')?.value?.includes({json.dumps(model_name)}) &&
  window.__hbdsDynamicTest.getState().serverConnected === true &&
  window.__hbdsDynamicTest.getState().counts.nodes > 0 &&
  document.querySelector('#save-status')?.textContent?.includes('Saved')
);
""",
            f"page {index} to load temporary server model",
            timeout=35,
        )


def dynamic_layout_url(base_url: str, shared_model: str | None = None) -> str:
    params = {"modelsPath": "models/"}
    if shared_model:
        params["sharedModel"] = shared_model
    return f"{base_url}/test_dynamic_hbds_layout.html?{urllib.parse.urlencode(params)}"


def wait_for_page_ready(page: BrowserPage, label: str, *, timeout: float = 35.0) -> None:
    wait_for(
        page,
        """
return Boolean(
  window.__hbdsDynamicTest &&
  window.__hbdsDynamicTest.getState().serverConnected === true &&
  document.querySelector('#test-model-select')?.options?.length > 1
);
""",
        label,
        timeout=timeout,
    )


def set_page_edit_mode(page: BrowserPage, mode: str = "full") -> None:
    result = page.evaluate(
        f"""
(() => {{
  const api = window.__hbdsDynamicTest;
  const select = document.querySelector('#edit-mode-select');
  if (select) {{
    select.value = {json.dumps(mode)};
    select.dispatchEvent(new Event('change', {{ bubbles: true }}));
  }} else if (api?.setEditMode) {{
    api.setEditMode({json.dumps(mode)});
  }} else {{
    return {{ ok: false, reason: 'edit mode control unavailable' }};
  }}
  return {{ ok: true, mode: api?.getState?.().editMode || '' }};
}})()
""",
        timeout=8,
    )
    if not isinstance(result, dict) or result.get("ok") is not True or result.get("mode") != mode:
        raise BrowserRegressionError(f"Could not set edit mode to {mode}: {result}")


def wait_for_model_loaded(page: BrowserPage, model_name: str, label: str, *, timeout: float = 35.0) -> None:
    wait_for(
        page,
        f"""
const select = document.querySelector('#test-model-select');
const state = window.__hbdsDynamicTest?.getState?.();
return Boolean(
  select?.value?.includes({json.dumps(model_name)}) &&
  state?.counts?.nodes > 0 &&
  document.querySelector('#save-status')?.textContent?.includes('Saved')
);
""",
        label,
        timeout=timeout,
    )


def assert_model_tree_canvas_space(page: BrowserPage) -> None:
    metrics = page.evaluate(
        """
(() => {
  const container = document.querySelector('#container').getBoundingClientRect();
  const panel = document.querySelector('#dynamic-test-panel').getBoundingClientRect();
  const tree = document.querySelector('#model-tree-sidebar').getBoundingClientRect();
  return {
    bodyClass: document.body.className,
    collapsed: document.body.classList.contains('model-tree-collapsed'),
    containerLeft: container.left,
    containerRightGap: window.innerWidth - container.right,
    containerWidth: container.width,
    containerComputedLeft: getComputedStyle(document.querySelector('#container')).left,
    containerComputedInset: getComputedStyle(document.querySelector('#container')).inset,
    containerStyle: document.querySelector('#container').getAttribute('style') || '',
    panelWidth: panel.width,
    treeWidth: tree.width,
    treeComputedWidth: getComputedStyle(document.querySelector('#model-tree-sidebar')).width,
    treeStyle: document.querySelector('#model-tree-sidebar').getAttribute('style') || '',
    viewportWidth: window.innerWidth,
    dynamicCssHref: document.querySelector('link[href*="test_dynamic_hbds_layout.css"]')?.href || '',
    collapsedRules: [...document.styleSheets].flatMap(sheet => {
      try { return [...sheet.cssRules].map(rule => rule.cssText || ''); }
      catch { return []; }
    }).filter(text => text.includes('model-tree-collapsed') && text.includes('#container')).slice(0, 4)
  };
})()
""",
        timeout=5,
    )
    if not isinstance(metrics, dict):
        raise BrowserRegressionError("Could not read canvas metrics")
    if not metrics.get("collapsed"):
        raise BrowserRegressionError(f"Model tree should be hidden by default: {metrics}")
    if abs(float(metrics.get("containerLeft", 999))) > 1.5:
        raise BrowserRegressionError(f"Collapsed model tree still reserves left canvas space: {metrics}")
    expected_gap = float(metrics.get("panelWidth", 0))
    actual_gap = float(metrics.get("containerRightGap", -1))
    if abs(actual_gap - expected_gap) > 3:
        raise BrowserRegressionError(f"Canvas right gap does not match the control panel only: {metrics}")


def rename_first_class(page: BrowserPage, new_name: str) -> tuple[str, str]:
    result = page.evaluate(
        f"""
(() => {{
const data = window.__hbdsDynamicTest.getData();
const node = (data.hypergraph?.class || []).find(item => item.type !== 'hyperclass') || (data.hypergraph?.class || [])[0];
if (!node) throw new Error('No class available to rename');
const select = document.querySelector('#selected-element-select');
select.value = String(node.id);
select.dispatchEvent(new Event('change', {{ bubbles: true }}));
const input = document.querySelector('#selected-name-input');
input.value = {json.dumps(new_name)};
input.dispatchEvent(new Event('change', {{ bubbles: true }}));
return {{ id: String(node.id), originalName: String(node.name || '') }};
}})()
""",
        timeout=10,
    )
    if not isinstance(result, dict) or not result.get("id"):
        raise BrowserRegressionError(f"Rename action did not return a class id: {result}")
    wait_for(
        page,
        f"""
const node = (window.__hbdsDynamicTest.getData().hypergraph?.class || [])
  .find(item => String(item.id) === {json.dumps(result["id"])});
return node?.name === {json.dumps(new_name)};
""",
        "local UI rename to update page data",
        timeout=10,
    )
    return str(result["id"]), str(result.get("originalName", ""))


def remote_operations_text(page: BrowserPage) -> str:
    value = page.evaluate(
        """
(() => document.querySelector('#collaboration-preview')?.innerText || '')()
""",
        timeout=5,
    )
    return str(value or "")


def wait_for_remote_text(page: BrowserPage, required_fragments: list[str], label: str, timeout: float = 20.0) -> str:
    required = [fragment.lower() for fragment in required_fragments]
    deadline = time.time() + timeout
    last_text = ""
    last_panel_state = None
    while time.time() < deadline:
        result = page.evaluate(
            f"""
(() => {{
  const panel = document.querySelector('#collaboration-split');
  const text = document.querySelector('#collaboration-preview')?.innerText || '';
  return {{
    hidden: panel ? panel.hidden : true,
    text,
    client: document.querySelector('#collaboration-client-select')?.value || ''
  }};
}})()
""",
            timeout=5,
        )
        if isinstance(result, dict):
            last_text = str(result.get("text") or "")
            last_panel_state = result
            lower = last_text.lower()
            if not result.get("hidden") and all(fragment in lower for fragment in required) and "no diagram differences detected" not in lower:
                return last_text
        page.cdp.drain(0.05)
        time.sleep(0.15)
    errors = page.significant_errors()
    detail = f"Last panel state: {last_panel_state!r}. Last text: {last_text[:1000]!r}."
    if errors:
        detail += "\nBrowser errors:\n" + "\n".join(errors[:SIGNIFICANT_ERROR_LIMIT])
    raise BrowserRegressionError(f"Timed out waiting for {label}. {detail}")



def assert_no_wait_popup(page: BrowserPage) -> None:
    result = page.evaluate(
        """
(() => {
  const candidates = [...document.querySelectorAll('[role="dialog"], .modal, .popup, .wait-popup, .loading-overlay, .blocking-overlay')];
  return candidates
    .filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    })
    .map(element => element.innerText || element.textContent || '')
    .filter(text => /wait|waiting/i.test(text));
})()
""",
        timeout=5,
    )
    if result:
        raise BrowserRegressionError(f"Normal collaboration update showed a wait popup/dialog: {result}")


def collaboration_status_state(page: BrowserPage) -> dict:
    result = page.evaluate(
        """
(() => {
  const element = document.querySelector('#canvas-collaboration-status');
  if (!element) return { exists: false, visible: false, text: '', pointerEvents: '' };
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    exists: true,
    visible: !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
    text: element.innerText || element.textContent || '',
    pointerEvents: style.pointerEvents
  };
})()
""",
        timeout=5,
    )
    return result if isinstance(result, dict) else {}


def assert_no_collaboration_status(page: BrowserPage, label: str) -> None:
    state = collaboration_status_state(page)
    if state.get("visible"):
        raise BrowserRegressionError(f"{label} showed collaboration progress status during a normal update: {state}")


def wait_for_no_collaboration_status(page: BrowserPage, label: str, *, timeout: float = 6.0) -> None:
    wait_for(
        page,
        """
const element = document.querySelector('#canvas-collaboration-status');
if (!element) return true;
const style = getComputedStyle(element);
const rect = element.getBoundingClientRect();
return element.hidden || style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0;
""",
        label,
        timeout=timeout,
        interval=0.1,
    )


def assert_collaboration_status_indicator(page: BrowserPage) -> None:
    result = page.evaluate(
        """
(async () => {
  const api = window.__hbdsDynamicTest;
  if (!api?.triggerCollaborationStatusForTest) return { supported: false };
  return await api.triggerCollaborationStatusForTest('preview', 80, { showAfterMs: 20 });
})()
""",
        timeout=10,
    )
    if not isinstance(result, dict) or result.get("supported") is False:
        raise BrowserRegressionError("Collaboration status debug hook is unavailable")
    shown = result.get("shown") or {}
    text = str(shown.get("text") or "")
    if shown.get("visible") is not True or "Generating collaboration preview" not in text:
        raise BrowserRegressionError(f"Long-running collaboration status did not become visible: {result}")
    if shown.get("pointerEvents") != "none" or result.get("centerHitsStatus") is True:
        raise BrowserRegressionError(f"Collaboration status blocks canvas pointer interaction: {result}")
    if result.get("hiddenAfterFinish") is not True:
        raise BrowserRegressionError(f"Collaboration status did not hide after work finished: {result}")


def assert_edit_mode_responsive(page: BrowserPage, label: str, max_ms: float = 180.0) -> float:
    result = page.evaluate(
        """
(() => {
  const select = document.querySelector('#edit-mode-select');
  const api = window.__hbdsDynamicTest;
  if (!select && !api?.setEditMode) return { supported: false, reason: 'missing edit-mode control and debug hook' };
  const original = select?.value || api?.getState?.().editMode || 'full';
  const timings = [];
  for (const mode of ['readonly', 'structure', 'full']) {
    const started = performance.now();
    if (select) {
      select.value = mode;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      api.setEditMode(mode);
    }
    timings.push({
      mode,
      elapsedMs: performance.now() - started,
      state: api?.getState?.().editMode || ''
    });
  }
  if (select) {
    select.value = original;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    api.setEditMode(original);
  }
  return {
    supported: true,
    timings,
    maxMs: Math.max(...timings.map(item => item.elapsedMs))
  };
})()
""",
        timeout=8,
    )
    if not isinstance(result, dict) or result.get("supported") is not True:
        raise BrowserRegressionError(f"{label} edit-mode responsiveness check is unavailable: {result}")
    max_observed = float(result.get("maxMs") or 0)
    bad_states = [item for item in result.get("timings", []) if item.get("mode") != item.get("state")]
    if bad_states:
        raise BrowserRegressionError(f"{label} edit-mode state did not update immediately: {result}")
    if max_observed > max_ms:
        raise BrowserRegressionError(f"{label} edit-mode dispatch took {max_observed:.2f}ms > {max_ms}ms: {result}")
    return max_observed


def assert_model_selection_controls_responsive(page: BrowserPage, model_name: str, max_ms: float = 250.0) -> dict:
    result = page.evaluate(
        """
(() => {
  const modelSelect = document.querySelector('#test-model-select');
  const editSelect = document.querySelector('#edit-mode-select');
  const api = window.__hbdsDynamicTest;
  if (!modelSelect || (!editSelect && !api?.setEditMode)) return { supported: false, reason: 'missing model or edit controls' };
  const original = modelSelect.value;
  if (!original) return { supported: false, reason: 'no selected model to restore' };

  const blankStarted = performance.now();
  modelSelect.value = '';
  modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
  const blankDispatchMs = performance.now() - blankStarted;

  const editStarted = performance.now();
  if (editSelect) {
    editSelect.value = 'structure';
    editSelect.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    api.setEditMode('structure');
  }
  const editDuringModelChangeMs = performance.now() - editStarted;

  const restoreStarted = performance.now();
  modelSelect.value = original;
  modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
  const restoreDispatchMs = performance.now() - restoreStarted;

  return {
    supported: true,
    original,
    selectedAfterRestore: modelSelect.value,
    editMode: window.__hbdsDynamicTest?.getState?.().editMode || '',
    blankDispatchMs,
    editDuringModelChangeMs,
    restoreDispatchMs,
    maxMs: Math.max(blankDispatchMs, editDuringModelChangeMs, restoreDispatchMs)
  };
})()
""",
        timeout=10,
    )
    if not isinstance(result, dict) or result.get("supported") is not True:
        raise BrowserRegressionError(f"Model-selection responsiveness check is unavailable: {result}")
    if result.get("selectedAfterRestore") != result.get("original"):
        raise BrowserRegressionError(f"Model select did not restore synchronously: {result}")
    max_observed = float(result.get("maxMs") or 0)
    if max_observed > max_ms:
        raise BrowserRegressionError(f"Model selection controls took {max_observed:.2f}ms > {max_ms}ms: {result}")
    wait_for(
        page,
        f"""
return Boolean(
  document.querySelector('#test-model-select')?.value?.includes({json.dumps(model_name)}) &&
  window.__hbdsDynamicTest?.getState?.().counts.nodes > 0 &&
  document.querySelector('#save-status')?.textContent?.includes('Saved')
);
""",
        "model selection to restore without stale load",
        timeout=25,
    )
    return result


def assert_select_model_without_latency(page: BrowserPage, model_name: str, max_ms: float) -> dict:
    result = page.evaluate(
        f"""
(() => {{
  const modelSelect = document.querySelector('#test-model-select');
  if (!modelSelect) return {{ ok: false, reason: 'missing model select' }};
  const requested = {json.dumps(model_name)};
  const requestedStem = requested.replace(/\\.json$/i, '').toLowerCase();
  const options = [...modelSelect.options];
  const match = options.find(option => {{
    const value = String(option.value || '');
    const text = String(option.textContent || '').trim().toLowerCase();
    const valueFile = value.split(':').pop().split('/').pop().toLowerCase();
    return value === requested ||
      value.endsWith('/' + requested) ||
      valueFile === requested.toLowerCase() ||
      text === requestedStem.replace(/[_-]+/g, ' ');
  }});
  if (!match) {{
    return {{
      ok: false,
      reason: 'model option not found',
      options: options.map(option => ({{ value: option.value, text: option.textContent }})).slice(0, 20)
    }};
  }}
  const started = performance.now();
  modelSelect.value = match.value;
  modelSelect.dispatchEvent(new Event('change', {{ bubbles: true }}));
  const dispatchMs = performance.now() - started;
  return {{
    ok: true,
    selectedValue: modelSelect.value,
    selectedText: match.textContent,
    dispatchMs
  }};
}})()
""",
        timeout=10,
    )
    if not isinstance(result, dict) or result.get("ok") is not True:
        raise BrowserRegressionError(f"Could not select {model_name}: {result}")
    observed = float(result.get("dispatchMs") or 0)
    if observed > max_ms:
        raise BrowserRegressionError(f"{model_name} selection dispatch took {observed:.2f}ms > {max_ms}ms: {result}")
    wait_for_model_loaded(page, model_name, f"{model_name} to load after second-page selection", timeout=35)
    return result


def read_diagnostics(page: BrowserPage) -> dict:
    text = page.evaluate(
        """
(() => document.querySelector('#collaboration-performance-diagnostics')?.textContent || '{}')()
""",
        timeout=5,
    )
    try:
        return json.loads(str(text or "{}"))
    except json.JSONDecodeError as error:
        raise BrowserRegressionError(f"Invalid collaboration diagnostics JSON: {text}") from error


def assert_performance_metric(diagnostics: dict, metric_name: str, max_ms: float, *, required: bool = True) -> None:
    metrics = diagnostics.get("metrics", {}) if isinstance(diagnostics, dict) else {}
    metric = metrics.get(metric_name)
    if not metric:
        if required:
            raise BrowserRegressionError(f"Missing collaboration performance metric {metric_name}: {diagnostics}")
        return
    observed = float(metric.get("maxMs", 0))
    if observed > max_ms:
        raise BrowserRegressionError(f"{metric_name} was too slow: max {observed}ms > {max_ms}ms")


def clear_draft(base_url: str, model_name: str, client_id: str) -> None:
    if not client_id:
        return
    request_json(
        base_url,
        f"/api/models/{urllib.parse.quote(model_name)}/drafts/{urllib.parse.quote(client_id, safe='')}",
        method="DELETE",
        expected=(200,),
        timeout=4,
    )


def operation_context(loaded: dict, class_id: str) -> dict:
    model = loaded.get("model", {})
    classes = model.get("hypergraph", {}).get("class", [])
    links = model.get("hypergraph", {}).get("link", [])
    if not classes:
        raise BrowserRegressionError("Operation regression model has no classes")
    first_link = links[0] if links else {"id": "missing-link", "sourceClassId": class_id, "targetClassId": class_id}
    target_class = next((node for node in classes if str(node.get("id")) == str(class_id)), classes[0])
    return {
        "model": model,
        "classes": classes,
        "links": links,
        "firstLink": first_link,
        "targetClass": target_class,
        "revision": model.get("metadata", {}).get("revision") or loaded.get("metadata", {}).get("revision", ""),
        "summary": {
            "classes": len([node for node in classes if node.get("type") != "hyperclass"]),
            "hyperclasses": len([node for node in classes if node.get("type") == "hyperclass"]),
            "links": len(links),
            "attributes": sum(len(node.get("attributes") or []) for node in classes),
        },
    }


def publish_operations_draft(
    base_url: str,
    model_name: str,
    loaded: dict,
    class_id: str,
    *,
    client_id: str,
    client_name: str,
    status: str,
    operations: list[dict],
) -> str:
    context = operation_context(loaded, class_id)
    payload = {
        "clientName": client_name,
        "baseModelRevision": context["revision"],
        "mode": "editing",
        "dirty": True,
        "isDirty": True,
        "modelOmitted": True,
        "previewOmitted": True,
        "preview": {"kind": "model-preview", "label": "Model Preview"},
        "selection": {"classId": class_id, "selectedElementId": class_id},
        "summary": context["summary"],
        "status": status,
        "operations": operations,
    }
    request_json(
        base_url,
        f"/api/models/{urllib.parse.quote(model_name)}/drafts/{urllib.parse.quote(client_id, safe='')}",
        method="POST",
        payload=payload,
        headers={"X-Client-Id": client_id, "X-Client-Name": client_name},
        timeout=5,
    )
    return client_id


def publish_operation_matrix(base_url: str, model_name: str, loaded: dict, class_id: str) -> str:
    context = operation_context(loaded, class_id)
    first_link = context["firstLink"]
    target_class = context["targetClass"]
    client_id = f"browser-operation-matrix-{os.getpid()}"
    return publish_operations_draft(
        base_url,
        model_name,
        loaded,
        class_id,
        client_id=client_id,
        client_name="Browser Operation Matrix",
        status="Operation matrix",
        operations=[
            {
                "opId": "browser-op-update-name",
                "type": "updateClass",
                "targetId": class_id,
                "patch": {"name": "Matrix Class Name"},
            },
            {
                "opId": "browser-op-update-rendering",
                "type": "updateClass",
                "targetId": class_id,
                "patch": {
                    "rendering": {
                        "class": {"color": "#0ea5e9", "opacity": 0.67},
                        "attributes": {"shape": "circle"},
                    }
                },
            },
            {
                "opId": "browser-op-move-class",
                "type": "updateClass",
                "targetId": class_id,
                "patch": {"position": {"x": 42, "y": -7, "z": 0}},
            },
            {
                "opId": "browser-op-layout",
                "type": "updateLayout",
                "targetId": "model",
                "patch": {"layout": {"algorithm": "radial"}},
                "mergeable": False,
            },
            {
                "opId": "browser-op-font",
                "type": "updateFont",
                "targetId": "model",
                "patch": {"font": {"family": "Matrix Font", "size": 17}},
                "mergeable": False,
            },
            {
                "opId": "browser-op-scene",
                "type": "updateScene",
                "targetId": "model",
                "patch": {"sceneSettings": {"background": "#ccddee"}},
                "mergeable": False,
            },
            {
                "opId": "browser-op-view",
                "type": "updateView",
                "targetId": "model",
                "patch": {"viewport": {"mode": "matrix-view", "zoom": 1.1}},
                "mergeable": False,
            },
            {
                "opId": "browser-op-create-class",
                "type": "createClass",
                "targetId": "browser_matrix_class",
                "class": {
                    "id": "browser_matrix_class",
                    "name": "Browser Matrix Class",
                    "attributes": [],
                    "parentClassId": target_class.get("parentClassId"),
                    "position": {"x": 1, "y": 2, "z": 0},
                },
            },
            {
                "opId": "browser-op-delete-class",
                "type": "deleteClass",
                "targetId": class_id,
            },
            {
                "opId": "browser-op-update-link",
                "type": "updateLink",
                "targetId": first_link.get("id"),
                "patch": {"rendering": {"labelText": "Matrix Link Label"}},
            },
            {
                "opId": "browser-op-create-link",
                "type": "createLink",
                "targetId": "browser_matrix_link",
                "link": {
                    "id": "browser_matrix_link",
                    "name": "Browser Matrix Link",
                    "sourceClassId": first_link.get("sourceClassId") or class_id,
                    "targetClassId": first_link.get("targetClassId") or class_id,
                    "rendering": {"labelText": "Browser Matrix Link"},
                },
            },
            {
                "opId": "browser-op-delete-link",
                "type": "deleteLink",
                "targetId": first_link.get("id"),
            },
        ],
    )


def assert_remote_operations_update_realtime(page: BrowserPage, base_url: str, model_name: str, loaded: dict, class_id: str) -> list[float]:
    context = operation_context(loaded, class_id)
    first_link = context["firstLink"]
    parent_candidate = next(
        (node for node in context["classes"] if str(node.get("id")) != str(class_id)),
        context["targetClass"],
    )
    parent_class_id = str(parent_candidate.get("id") or class_id)
    client_id = f"browser-realtime-ops-{os.getpid()}"
    timings: list[float] = []
    previous_text = ""
    previous_markers: list[str] = []

    def publish_and_wait(
        status: str,
        operations: list[dict],
        fragments: list[str],
        *,
        marker: str,
        merge_enabled: bool | None = None,
        forbidden: list[str] | None = None,
    ) -> str:
        nonlocal previous_text
        wait_for_no_collaboration_status(page, f"{status} pre-existing collaboration status to clear")
        started = time.perf_counter()
        publish_operations_draft(
            base_url,
            model_name,
            loaded,
            class_id,
            client_id=client_id,
            client_name="Browser Realtime Operations",
            status=status,
            operations=operations,
        )
        text = wait_for_remote_text(page, fragments, status, timeout=8)
        elapsed = time.perf_counter() - started
        if elapsed > 6:
            raise BrowserRegressionError(f"{status} took {elapsed:.2f}s to appear in Remote operations")
        lower = text.lower()
        for fragment in forbidden or []:
            if fragment.lower() in lower:
                raise BrowserRegressionError(f"{status} left stale Remote operations text {fragment!r}: {text}")
        if previous_text and text == previous_text:
            raise BrowserRegressionError(f"{status} did not change the Remote operations list")
        previous_text = text
        timings.append(elapsed)
        assert_no_wait_popup(page)
        assert_no_collaboration_status(page, status)
        if merge_enabled is not None:
            expected = "false" if merge_enabled else "true"
            wait_for(
                page,
                f"return document.querySelector('#collaboration-merge-button')?.disabled === {expected};",
                f"{status} merge policy",
                timeout=5,
            )
        if marker:
            previous_markers.append(marker)
        return text

    realtime_name = f"Realtime Operation Alpha {os.getpid()}"
    publish_and_wait(
        "Realtime rename operation",
        [
            {
                "opId": "browser-realtime-rename",
                "type": "updateClass",
                "targetId": class_id,
                "patch": {"name": realtime_name},
            }
        ],
        ["remote operations", "update class", realtime_name],
        marker=realtime_name,
        merge_enabled=True,
    )
    publish_and_wait(
        "Realtime move operation",
        [
            {
                "opId": "browser-realtime-move",
                "type": "updateClass",
                "targetId": class_id,
                "patch": {"position": {"x": 3.75, "y": -2.5, "z": 0}},
            }
        ],
        ["remote operations", "update class", "position", "x=3.75"],
        marker="x=3.75",
        merge_enabled=True,
        forbidden=previous_markers,
    )

    complex_name = f"Realtime Complex Class {os.getpid()}"
    complex_attribute = f"Realtime Attribute {os.getpid()}"
    complex_color = "#123abc"
    publish_and_wait(
        "Realtime complex class operation",
        [
            {
                "opId": "browser-realtime-class-complex",
                "type": "updateClass",
                "targetId": class_id,
                "patch": {
                    "name": complex_name,
                    "parentClassId": parent_class_id,
                    "position": {"x": 13.25, "y": -4.5, "z": 0},
                    "attributes": [{"name": complex_attribute, "type": "string"}, "Traffic"],
                    "rendering": {
                        "class": {
                            "color": complex_color,
                            "borderColor": "#456def",
                            "cornerRadius": 0.24,
                        },
                        "textColor": "#101820",
                    },
                },
            }
        ],
        [
            "remote operations",
            "update class",
            complex_name,
            "position",
            "x=13.25",
            "attributes 2",
            "parent hyperclass",
            parent_class_id,
            "class fill color",
            complex_color,
        ],
        marker=complex_name,
        merge_enabled=True,
        forbidden=previous_markers,
    )

    publish_and_wait(
        "Realtime rendering operation",
        [
            {
                "opId": "browser-realtime-rendering",
                "type": "updateClass",
                "targetId": class_id,
                "patch": {
                    "rendering": {
                        "class": {"material": "browser-material", "opacity": 0.72},
                        "attributes": {"shape": "diamond", "size": {"width": 0.18, "height": 0.11}},
                        "connections": {"lineColor": "#0f766e", "lineWidth": 0.03},
                        "font": {"size": 16, "family": f"BrowserRenderFont{os.getpid()}"},
                    }
                },
            }
        ],
        [
            "remote operations",
            "update class",
            "class material",
            "browser-material",
            "attribute shape",
            "diamond",
            "attribute width",
            "0.18",
            "font family",
            f"BrowserRenderFont{os.getpid()}",
        ],
        marker="browser-material",
        merge_enabled=True,
        forbidden=previous_markers,
    )

    publish_and_wait(
        "Realtime layout operation",
        [
            {
                "opId": "browser-realtime-layout",
                "type": "updateLayout",
                "targetId": "model",
                "patch": {"layout": {"algorithm": f"browser-radial-{os.getpid()}", "spacing": 1.75}},
                "mergeable": False,
            }
        ],
        ["remote operations", "update layout", "layout algorithm", f"browser-radial-{os.getpid()}", "layout spacing", "1.75"],
        marker=f"browser-radial-{os.getpid()}",
        merge_enabled=False,
        forbidden=previous_markers,
    )

    font_family = f"BrowserFont{os.getpid()}"
    publish_and_wait(
        "Realtime font operation",
        [
            {
                "opId": "browser-realtime-font",
                "type": "updateFont",
                "targetId": "model",
                "patch": {"font": {"size": 18, "family": font_family, "bold": True, "italic": True}},
                "mergeable": False,
            }
        ],
        ["remote operations", "update font", "font size", "18", "font family", font_family, "font bold", "true"],
        marker=font_family,
        merge_enabled=False,
        forbidden=previous_markers,
    )

    scene_background = f"#{os.getpid() % 0xFFFFFF:06x}"
    publish_and_wait(
        "Realtime scene operation",
        [
            {
                "opId": "browser-realtime-scene",
                "type": "updateScene",
                "targetId": "model",
                "patch": {"sceneSettings": {"background": scene_background, "ambient": 0.42}},
                "mergeable": False,
            }
        ],
        ["remote operations", "update scene", "scene settings background", scene_background, "scene settings ambient", "0.42"],
        marker=scene_background,
        merge_enabled=False,
        forbidden=previous_markers,
    )

    view_mode = f"browser-view-{os.getpid()}"
    publish_and_wait(
        "Realtime view operation",
        [
            {
                "opId": "browser-realtime-view",
                "type": "updateView",
                "targetId": "model",
                "patch": {"viewport": {"mode": view_mode, "zoom": 1.25, "pan": {"x": 12, "y": -9}}},
                "mergeable": False,
            }
        ],
        ["remote operations", "update view", "viewport mode", view_mode, "viewport zoom", "1.25"],
        marker=view_mode,
        merge_enabled=False,
        forbidden=previous_markers,
    )

    publish_and_wait(
        "Realtime link operation",
        [
            {
                "opId": "browser-realtime-link",
                "type": "updateLink",
                "targetId": first_link.get("id"),
                "patch": {
                    "name": f"Realtime Link Name {os.getpid()}",
                    "rendering": {
                        "labelText": f"Realtime Link Label {os.getpid()}",
                        "lineColor": "#ff00aa",
                        "lineWidth": 0.07,
                        "arrowheadType": "diamond",
                    },
                },
            }
        ],
        [
            "remote operations",
            "update link",
            f"Realtime Link Name {os.getpid()}",
            "realtime link label",
            "line color",
            "#ff00aa",
            "arrowhead type",
            "diamond",
        ],
        marker=f"Realtime Link Label {os.getpid()}",
        merge_enabled=True,
        forbidden=previous_markers,
    )

    created_class_id = f"browser_realtime_class_{os.getpid()}"
    created_class_name = f"Realtime Created Class {os.getpid()}"
    publish_and_wait(
        "Realtime create class operation",
        [
            {
                "opId": "browser-realtime-create-class",
                "type": "createClass",
                "targetId": created_class_id,
                "class": {
                    "id": created_class_id,
                    "name": created_class_name,
                    "attributes": [{"name": "Created Attribute"}, "Created Flag"],
                    "parentClassId": parent_class_id,
                    "position": {"x": -8.5, "y": 6.25, "z": 0},
                    "rendering": {"class": {"color": "#22c55e"}},
                },
            }
        ],
        [
            "remote operations",
            "create class",
            created_class_name,
            "2 attributes",
            "parent hyperclass",
            parent_class_id,
            "position",
            "x=-8.5",
        ],
        marker=created_class_name,
        merge_enabled=True,
        forbidden=previous_markers,
    )

    publish_and_wait(
        "Realtime delete class operation",
        [
            {
                "opId": "browser-realtime-delete-class",
                "type": "deleteClass",
                "targetId": created_class_id,
            }
        ],
        ["remote operations", "delete class", created_class_id],
        marker=created_class_id,
        merge_enabled=True,
        forbidden=previous_markers,
    )

    created_link_id = f"browser_realtime_link_{os.getpid()}"
    created_link_name = f"Realtime Created Link {os.getpid()}"
    publish_and_wait(
        "Realtime create link operation",
        [
            {
                "opId": "browser-realtime-create-link",
                "type": "createLink",
                "targetId": created_link_id,
                "link": {
                    "id": created_link_id,
                    "name": created_link_name,
                    "sourceClassId": first_link.get("sourceClassId") or class_id,
                    "targetClassId": first_link.get("targetClassId") or class_id,
                    "rendering": {"labelText": created_link_name, "lineColor": "#2563eb"},
                },
            }
        ],
        [
            "remote operations",
            "create link",
            created_link_name,
            "source",
            str(first_link.get("sourceClassId") or class_id),
            "target",
            str(first_link.get("targetClassId") or class_id),
        ],
        marker=created_link_name,
        merge_enabled=True,
        forbidden=previous_markers,
    )

    publish_and_wait(
        "Realtime delete link operation",
        [
            {
                "opId": "browser-realtime-delete-link",
                "type": "deleteLink",
                "targetId": first_link.get("id"),
            }
        ],
        ["remote operations", "delete link", str(first_link.get("id"))],
        marker=str(first_link.get("id")),
        merge_enabled=True,
        forbidden=previous_markers,
    )
    clear_draft(base_url, model_name, client_id)
    return timings


def assert_browser_errors(pages: list[BrowserPage]) -> None:
    errors: list[str] = []
    for page in pages:
        errors.extend(page.significant_errors())
    if errors:
        rendered = "\n".join(errors[:SIGNIFICANT_ERROR_LIMIT])
        raise BrowserRegressionError(f"Browser reported significant errors:\n{rendered}")


def run_human_and_car_second_page_selection_regression(base_url: str, debug_port: int) -> None:
    model_path = MODELS_DIR / HUMAN_AND_CAR_LINKS_MODEL_NAME
    if not model_path.exists():
        raise BrowserRegressionError(f"Required model is missing: {model_path.relative_to(ROOT_DIR)}")

    page_a = BrowserPage(create_target(debug_port))
    page_b = BrowserPage(create_target(debug_port))
    pages = [page_a, page_b]
    try:
        page_a.navigate(dynamic_layout_url(base_url, HUMAN_AND_CAR_LINKS_MODEL_NAME))
        wait_for_page_ready(page_a, "first human_and_car_links collaboration page")
        wait_for_model_loaded(page_a, HUMAN_AND_CAR_LINKS_MODEL_NAME, "first page human_and_car_links load")
        set_page_edit_mode(page_a, "full")

        page_b.navigate(dynamic_layout_url(base_url))
        wait_for_page_ready(page_b, "second blank collaboration page")
        set_page_edit_mode(page_b, "full")

        page_b.bring_to_front()
        selection = assert_select_model_without_latency(
            page_b,
            HUMAN_AND_CAR_LINKS_MODEL_NAME,
            HUMAN_AND_CAR_LINKS_SELECTION_MAX_MS,
        )
        assert_no_wait_popup(page_b)
        assert_no_collaboration_status(page_b, "human_and_car_links second-page selection")

        page_a.bring_to_front()
        wait_for(
            page_a,
            """
const panel = document.querySelector('#collaboration-split');
const text = document.querySelector('#collaboration-count')?.innerText || '';
return Boolean(panel && panel.hidden === false && /user/.test(text));
""",
            "first page collaboration panel after second page selects human_and_car_links",
            timeout=12,
        )
        assert_no_wait_popup(page_a)
        assert_browser_errors(pages)
        print(
            "PASS human_and_car_links second-page selection "
            f"dispatch={float(selection['dispatchMs']):.2f}ms "
            f"value={selection['selectedValue']}"
        )
    finally:
        for page in pages:
            page.close()


def run_regression(base_url: str, debug_port: int, loaded_model: dict) -> None:
    url = dynamic_layout_url(base_url, TEMP_MODEL_NAME)
    page_a = BrowserPage(create_target(debug_port))
    page_b = BrowserPage(create_target(debug_port))
    pages = [page_a, page_b]
    try:
        page_a.navigate(url)
        page_b.navigate(url)
        wait_for_pages_loaded(pages, TEMP_MODEL_NAME)
        client_ids = [
            str(page.evaluate("(() => window.__hbdsDynamicTest.getState().serverClientId || '')()", timeout=5))
            for page in pages
        ]
        if not all(client_ids) or client_ids[0] == client_ids[1]:
            raise BrowserRegressionError(f"Browser pages did not get distinct collaboration client IDs: {client_ids}")
        assert_model_tree_canvas_space(page_a)
        assert_collaboration_status_indicator(page_a)

        new_name = f"Browser Rename {os.getpid()}"
        class_id, _original_name = rename_first_class(page_b, new_name)
        server_draft = wait_for_server_draft(base_url, TEMP_MODEL_NAME, new_name, timeout=18)
        page_a.bring_to_front()
        remote_started_at = time.perf_counter()
        rename_text = wait_for_remote_text(page_a, ["remote operations", "update class", new_name], "real UI draft update")
        remote_update_seconds = time.perf_counter() - remote_started_at
        if remote_update_seconds > 20:
            raise BrowserRegressionError(f"Real UI draft update took {remote_update_seconds:.2f}s")
        assert_no_wait_popup(page_a)
        assert_no_collaboration_status(page_a, "real UI draft update")
        edit_mode_max_ms = assert_edit_mode_responsive(page_a, "collaboration panel")
        remote_client_id = str(page_a.evaluate("(() => document.querySelector('#collaboration-client-select')?.value || '')()")) or str(server_draft.get("clientId") or "")
        wait_for(
            page_a,
            "return document.querySelector('#collaboration-merge-button')?.disabled === false;",
            "operation-only merge button to be enabled",
            timeout=8,
        )
        page_a.click("#collaboration-merge-button")
        wait_for_server_model_name(base_url, TEMP_MODEL_NAME, class_id, new_name, timeout=12)
        clear_draft(base_url, TEMP_MODEL_NAME, remote_client_id)

        merged_loaded = request_json(base_url, f"/api/models/{urllib.parse.quote(TEMP_MODEL_NAME)}", timeout=6)
        realtime_timings = assert_remote_operations_update_realtime(page_a, base_url, TEMP_MODEL_NAME, merged_loaded, class_id)
        matrix_client_id = publish_operation_matrix(base_url, TEMP_MODEL_NAME, merged_loaded, class_id)
        matrix_text = wait_for_remote_text(
            page_a,
            [
                "remote operations",
                "update class",
                "class fill color",
                "position",
                "update layout",
                "update font",
                "update scene",
                "update view",
                "create class",
                "delete class",
                "update link",
                "create link",
                "delete link",
            ],
            "remote operation matrix rendering",
            timeout=12,
        )
        if "no diagram differences detected" in matrix_text.lower():
            raise BrowserRegressionError("Remote operation matrix incorrectly reported no diagram differences")
        wait_for(
            page_a,
            "return document.querySelector('#collaboration-merge-button')?.disabled === true;",
            "mixed non-mergeable operation matrix to disable merge",
            timeout=5,
        )
        assert_no_wait_popup(page_a)
        clear_draft(base_url, TEMP_MODEL_NAME, matrix_client_id)
        model_select_latency = assert_model_selection_controls_responsive(page_a, TEMP_MODEL_NAME)

        wait_for(page_a, "return Boolean(document.querySelector('#collaboration-performance-diagnostics')?.textContent);", "panel diagnostics", timeout=5)
        wait_for(page_b, "return Boolean(document.querySelector('#collaboration-performance-diagnostics')?.textContent);", "draft diagnostics", timeout=5)
        page_a_diagnostics = read_diagnostics(page_a)
        page_b_diagnostics = read_diagnostics(page_b)
        assert_performance_metric(page_a_diagnostics, "panel.render", 1000)
        assert_performance_metric(page_a_diagnostics, "ui.edit_mode", 180)
        assert_performance_metric(page_b_diagnostics, "draft.publish", 10000)
        assert_performance_metric(page_b_diagnostics, "draft.build.dirty", 10000)
        assert_browser_errors(pages)

        print(f"PASS browser collaboration model={TEMP_MODEL_NAME}")
        print(f"PASS real draft update {remote_update_seconds:.2f}s")
        print(f"PASS edit-mode dispatch max={edit_mode_max_ms:.2f}ms")
        print(f"PASS model-select dispatch max={float(model_select_latency['maxMs']):.2f}ms")
        print(f"PASS realtime remote operations updates max={max(realtime_timings):.2f}s count={len(realtime_timings)}")
        print(f"PASS remote operations UI text sample: {rename_text.splitlines()[-1][:120]}")
        print(f"PASS diagnostics panel.render={page_a_diagnostics['metrics']['panel.render']['maxMs']}ms draft.publish={page_b_diagnostics['metrics']['draft.publish']['maxMs']}ms")
    finally:
        for page in pages:
            page.close()


def terminate_process(process: subprocess.Popen | None, name: str) -> None:
    if not process or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    if process.returncode not in (0, None):
        try:
            stderr = process.stderr.read() if process.stderr else ""
        except Exception:
            stderr = ""
        if stderr.strip():
            print(f"WARN {name} stderr:\n{stderr[-1200:]}", file=sys.stderr)


def main() -> int:
    server_process: subprocess.Popen | None = None
    browser_process: subprocess.Popen | None = None
    base_url = ""
    try:
        server_port = get_free_port()
        debug_port = get_free_port()
        base_url = f"http://127.0.0.1:{server_port}"
        server_process = start_server(server_port)
        wait_for_health(base_url, server_process)
        source_path, loaded_model = save_temp_server_model(base_url)
        print(f"PASS temp model saved from {source_path.relative_to(ROOT_DIR)} as {TEMP_MODEL_NAME}")

        browser_process = launch_browser(debug_port)
        wait_for_browser(debug_port, browser_process)
        run_human_and_car_second_page_selection_regression(base_url, debug_port)
        run_regression(base_url, debug_port, loaded_model)
        return 0
    finally:
        terminate_process(browser_process, "browser")
        terminate_process(server_process, "server")
        cleanup_temp_model()
        if TEMP_PROFILE_DIR.exists():
            shutil.rmtree(TEMP_PROFILE_DIR, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
