"""Provider-independent AI response schemas and proposal safeguards.

Schemas include existing extension fields, so structured responses can retain
custom HBDS data. Very deep/large extension schemas fall back to JSON mode;
the normal HBDS validators still run before an AI result can be saved.
"""

from __future__ import annotations

import copy
import json


COLLECTIONS = ("class", "link", "object", "objectLink", "membership", "inheritance")
OPERATIONS = {"generate", "validate", "improve", "repair", "explain-selection", "improve-selection"}


def _object(properties: dict) -> dict:
    return {"type": "object", "properties": properties,
            "required": list(properties), "additionalProperties": False}


def _infer_schema(samples: list, budget: list[int], depth: int = 0) -> dict:
    if depth > 12 or budget[0] > 1000:
        raise ValueError("Model extensions exceed the structured-output schema budget")
    alternatives = []
    objects = [value for value in samples if isinstance(value, dict)]
    if objects:
        keys = sorted({key for value in objects for key in value})
        budget[0] += len(keys)
        alternatives.append(_object({
            key: _infer_schema([value.get(key) for value in objects], budget, depth + 1)
            for key in keys
        }))
    arrays = [value for value in samples if isinstance(value, list)]
    if arrays:
        items = [item for value in arrays for item in value]
        alternatives.append({"type": "array", "items": _infer_schema(items or [""], budget, depth + 1)})
    for kind, matches in (
        ("string", lambda x: isinstance(x, str)),
        ("boolean", lambda x: isinstance(x, bool)),
        ("number", lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)),
        ("null", lambda x: x is None),
    ):
        if any(matches(value) for value in samples):
            alternatives.append({"type": kind})
    return alternatives[0] if len(alternatives) == 1 else {"anyOf": alternatives}


def build_response_schema(payload: dict) -> dict | None:
    """Use the subset shared by OpenAI, Claude, and Ollama (no recursive refs)."""
    if payload.get("operationMode") == "explain-selection":
        return _object({"explanation": {"type": "string"}})
    scalar_values = [None, "", 0, False]
    template = {
        "metadata": {"name": "", "description": "", "layout": {"algorithm": "none"}, "semanticVersion": 1},
        "hypergraph": {
            "class": [{"id": "", "type": "class", "name": "", "position": {"x": 0, "y": 0, "z": 0},
                       "attributes": [{"id": "", "name": "", "value": value} for value in scalar_values]}],
            "link": [{"id": "", "name": "", "sourceClassId": "", "targetClassId": ""}],
            "object": [{"id": "", "classId": "", "attributeValues": [
                {"attributeId": "", "value": value} for value in scalar_values]}],
            "objectLink": [{"id": "", "classLinkId": "", "sourceObjectId": "", "targetObjectId": ""}],
            "membership": [{"id": "", "classId": "", "hyperclassId": ""}],
            "inheritance": [{"id": "", "subClassId": "", "superClassId": ""}],
        },
    }
    samples = [template]
    if isinstance(payload.get("currentModel"), dict):
        samples.append(payload["currentModel"])
    try:
        model_schema = _infer_schema(samples, [0])
        schema = _object({"explanation": {"type": "string"}, "model": {"anyOf": [model_schema, {"type": "null"}]}})
        return schema if len(json.dumps(schema)) < 100_000 else None
    except (ValueError, RecursionError):
        return None


def remove_optional_nulls(value, previous=None):
    """Null fills optional schema properties; actual attribute values keep null."""
    if isinstance(value, dict):
        previous = previous if isinstance(previous, dict) else {}
        return {key: remove_optional_nulls(item, previous.get(key))
                for key, item in value.items()
                if item is not None or key == "value" or (key in previous and previous[key] is None)}
    if isinstance(value, list):
        previous = previous if isinstance(previous, list) else []
        by_id = {item.get("id"): item for item in previous if isinstance(item, dict) and item.get("id")}
        return [remove_optional_nulls(item, by_id.get(item.get("id")) if isinstance(item, dict) else None)
                for item in value]
    return value


def constrain_proposal(model: dict, payload: dict) -> dict:
    """Focused edits cannot change unrelated entities, IDs, containment, or layout."""
    current = payload.get("currentModel")
    if not isinstance(current, dict) or payload.get("operationMode") == "generate":
        return model
    proposed = copy.deepcopy(model)
    old_classes = {str(node.get("id")): node for node in current.get("hypergraph", {}).get("class", []) if isinstance(node, dict)}
    for node in proposed.get("hypergraph", {}).get("class", []):
        previous = old_classes.get(str(node.get("id"))) if isinstance(node, dict) else None
        if previous and "position" in previous:
            node["position"] = copy.deepcopy(previous["position"])
    if payload.get("operationMode") != "improve-selection":
        return proposed
    result = copy.deepcopy(current)
    selected = set(payload.get("selectionIds") or [])
    for collection in ("class", "link"):
        by_id = {str(item.get("id")): item for item in proposed.get("hypergraph", {}).get(collection, []) if isinstance(item, dict)}
        for index, previous in enumerate(current.get("hypergraph", {}).get(collection, [])):
            entity_id = str(previous.get("id"))
            if entity_id not in selected or entity_id not in by_id:
                continue
            replacement = copy.deepcopy(by_id[entity_id])
            if collection == "class":
                for key in ("position", "parentClassId", "children", "type"):
                    if key in previous:
                        replacement[key] = copy.deepcopy(previous[key])
                    else:
                        replacement.pop(key, None)
            result["hypergraph"][collection][index] = replacement
    return result
