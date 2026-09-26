#!/usr/bin/env python3
"""Run project checks in an isolated copy, preserving local models and keys."""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-browser", action="store_true", help="Run all checks except the real-browser suite")
    parser.add_argument("--browser-only", action="store_true", help="Run only the real-browser suite")
    parser.add_argument("--browser-suite", choices=("all", "ai"), default="all")
    args = parser.parse_args()
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUNBUFFERED": "1", "HBDS_AI_ENABLED": "0"}
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HBDS_AI_CUSTOM_API_KEY"):
        env.pop(key, None)
    with tempfile.TemporaryDirectory(prefix="hbds-project-check-") as temporary:
        workspace = Path(temporary).resolve()
        if workspace.parent != Path(tempfile.gettempdir()).resolve():
            raise RuntimeError("Unexpected temporary workspace location")
        for name in ("server.py", "hbds_ai_contract.py", "index.html", "index_models.html", "test_dynamic_hbds_layout.html", "functor_queries.html", "license.html"):
            shutil.copy2(ROOT / name, workspace / name)
        for name in ("scripts", "tools", "js", "css", "models", "test_models", "schemas", "icons", "images", "pictures"):
            shutil.copytree(ROOT / name, workspace / name, ignore=shutil.ignore_patterns(".backups", "__pycache__"))

        def run(command, timeout=180):
            print("CHECK " + " ".join(command), flush=True)
            subprocess.run(command, cwd=workspace, env=env, timeout=timeout, check=True)

        if not args.browser_only:
            for script in sorted((workspace / "scripts").glob("*_test.mjs")):
                run(["node", str(script.relative_to(workspace))])
            for script in sorted((workspace / "js").glob("*.js")):
                run(["node", "--check", str(script.relative_to(workspace))])
            run([sys.executable, "-B", "scripts/ai_provider_test.py"])
            for script in ("validate_manifests", "validate_models", "validate_test_models", "lint_model_naming"):
                run([sys.executable, "-B", f"tools/{script}.py"])
            run([sys.executable, "-B", "scripts/smoke_server.py"], timeout=300)
        if not args.skip_browser:
            run([sys.executable, "-B", "scripts/collaboration_browser_regression.py", "--suite", args.browser_suite], timeout=900)
    print("Project checks passed; temporary workspace removed.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
