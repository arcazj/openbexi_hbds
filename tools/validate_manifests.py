#!/usr/bin/env python3
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]


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
    return errors


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
    if all_errors:
        print("Manifest validation failed:")
        for err in all_errors:
            print(f"- {err}")
        return 1
    print("Manifest validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

