#!/usr/bin/env python3
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    manifest = ROOT / "models" / "models_manifest.json"
    data = load_json(manifest)
    items = data.get("models", [])
    warnings = []
    errors = []

    for idx, item in enumerate(items):
        value = str(item.get("value", ""))
        label = str(item.get("label", ""))
        if " " in value:
            warnings.append(f"models[{idx}] value contains spaces: {value}")
        if re.search(r"\bHDBS\b", label, flags=re.IGNORECASE):
            warnings.append(f"models[{idx}] label uses HDBS; prefer HBDS: {label}")
        normalized = value if value.endswith(".json") else f"models/{value}.json"
        path = ROOT / normalized
        if not path.exists():
            errors.append(f"models[{idx}] points to missing file: {normalized}")

    if warnings:
        print("Naming warnings:")
        for warning in warnings:
            print(f"- {warning}")
    if errors:
        print("Naming errors:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Naming lint passed (warnings may still be present).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

