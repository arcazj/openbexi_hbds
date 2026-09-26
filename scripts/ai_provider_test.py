#!/usr/bin/env python3
"""Offline provider contracts, error handling, and selection safeguards."""
from __future__ import annotations

import copy
import io
import json
import sys
import unittest
import tempfile
from contextlib import nullcontext
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from hbds_ai_contract import build_response_schema, constrain_proposal, remove_optional_nulls


def model():
    return {"metadata": {"name": "Example", "custom": {"keep": [1, 2]}}, "hypergraph": {
        "class": [
            {"id": "a", "type": "class", "name": "A", "attributes": [{"id": "attr", "name": "Count", "value": None}], "position": {"x": 1, "y": 2, "z": 3}},
            {"id": "b", "type": "class", "name": "B", "attributes": [], "position": {"x": 4, "y": 5, "z": 6}},
        ], "link": [{"id": "ab", "sourceClassId": "a", "targetClassId": "b"}],
    }}


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.openai = server.ai_provider_by_id("openai")
        self.payload = {"providerId": "openai", "modelName": "gpt-5.5", "apiKey": "unit-test-key", "operationMode": "generate", "requestText": "Generate a model"}
        self.environment = patch.dict(server.os.environ, {"OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": "", "HBDS_AI_ENABLED": "0"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.network = patch.object(server, "open_ai_provider_request", side_effect=AssertionError("Unexpected network access"))
        self.network.start()
        self.addCleanup(self.network.stop)

    def reply(self, value=None, **choice):
        return {"choices": [{"message": {"content": json.dumps(value or {"explanation": "Done", "model": model()})}, **choice}]}

    def test_shared_catalog_has_no_secrets(self):
        public = server.ai_provider_capabilities()
        self.assertEqual({item["id"] for item in public}, {"openai", "anthropic", "ollama", "custom-openai", "chatgpt-manual"})
        self.assertNotIn("API_KEY", json.dumps(public))
        self.assertNotIn("unit-test-key", json.dumps(public))

    def test_structured_openai_and_model_specific_reasoning(self):
        with patch.object(server, "json_post", return_value=self.reply()) as post:
            result = server.call_ai_provider(self.openai, {**self.payload, "reasoningEffort": "high"}, "prompt")
        body = post.call_args.args[1]
        self.assertEqual(body["response_format"]["type"], "json_schema")
        self.assertTrue(body["response_format"]["json_schema"]["strict"])
        self.assertEqual(body["reasoning_effort"], "high")
        self.assertNotIn("temperature", body)
        self.assertTrue(result["validation"]["valid"])
        self.assertEqual(result["model"]["hypergraph"]["class"][0]["attributes"][0]["value"], None)

    def test_unsupported_reasoning_fails_before_paid_call(self):
        with patch.object(server, "json_post") as post, self.assertRaises(server.OperationError) as error:
            server.call_ai_provider(self.openai, {**self.payload, "modelName": "gpt-4.1", "reasoningEffort": "high"}, "prompt")
        self.assertEqual(error.exception.code, "ai_unsupported_reasoning")
        post.assert_not_called()

    def test_unknown_models_omit_unverified_parameters(self):
        with patch.object(server, "json_post", return_value=self.reply()) as post:
            server.call_ai_provider(self.openai, {**self.payload, "modelName": "future-model"}, "prompt")
        body = post.call_args.args[1]
        self.assertEqual(set(body), {"model", "messages"})

    def test_custom_base_with_v1_and_explicit_format(self):
        provider = server.ai_provider_by_id("custom-openai")
        with patch.object(server, "json_post", return_value=self.reply()) as post:
            server.call_ai_provider(provider, {**self.payload, "baseUrl": "https://example.com/v1", "outputMode": "schema"}, "prompt")
        self.assertEqual(post.call_args.args[0], "https://example.com/v1/chat/completions")
        self.assertEqual(post.call_args.args[1]["response_format"]["type"], "json_schema")

    def test_claude_structured_output_and_free_connection_probe(self):
        provider = server.ai_provider_by_id("anthropic")
        payload = {**self.payload, "modelName": provider["defaultModel"]}
        with patch.object(server, "json_post", return_value={"content": [{"type": "text", "text": json.dumps(model())}]}) as post:
            server.call_ai_provider(provider, payload, "prompt")
        self.assertEqual(post.call_args.args[1]["output_config"]["format"]["type"], "json_schema")
        with patch.object(server, "json_get", return_value={"id": provider["defaultModel"]}) as get, patch.object(server, "json_post") as post:
            server.validate_anthropic_connection(provider, payload)
        self.assertIn("/v1/models/", get.call_args.args[0])
        post.assert_not_called()

    def test_ollama_schema_and_exact_model_tags(self):
        provider = server.ai_provider_by_id("ollama")
        payload = {**self.payload, "modelName": "llama3.1:8b"}
        with patch.object(server, "json_post", return_value={"message": {"content": json.dumps(model())}}) as post:
            server.call_ai_provider(provider, payload, "prompt")
        self.assertIsInstance(post.call_args.args[1]["format"], dict)
        for names in ([], [{"name": "llama3.1:70b"}]):
            with patch.object(server, "json_get", return_value={"models": names}), self.assertRaises(server.OperationError):
                server.validate_ollama_connection(provider, payload)
        with patch.object(server, "json_get", return_value={"models": [{"name": "llama3.1:8b"}]}):
            self.assertTrue(server.validate_ollama_connection(provider, payload)["connected"])

    def test_refusal_truncation_and_malformed_replies(self):
        cases = [
            ({"choices": [{"message": {"refusal": "declined"}}]}, "ai_provider_refusal"),
            (self.reply(finish_reason="length"), "ai_provider_incomplete"),
            ({"choices": []}, "ai_provider_invalid_response"),
            ({"choices": [{"message": {"content": "not json"}}]}, "ai_provider_invalid_response"),
            ({"choices": [{"message": {"content": "{}"}}]}, "ai_provider_invalid_response"),
        ]
        for response, code in cases:
            with self.subTest(code=code), patch.object(server, "json_post", return_value=response) as post, self.assertRaises(server.OperationError) as error:
                server.call_ai_provider(self.openai, self.payload, "prompt")
            self.assertEqual(error.exception.code, code)
            self.assertEqual(post.call_count, 1)

    def test_http_errors_are_actionable_and_do_not_echo_private_content(self):
        cases = {400: "ai_provider_invalid_request", 401: "ai_provider_authentication", 403: "ai_provider_permission", 404: "ai_provider_model_unavailable", 429: "ai_provider_rate_limit", 503: "ai_provider_unavailable"}
        for status, code in cases.items():
            error = HTTPError("https://example.com", status, "error", {"Retry-After": "20"}, io.BytesIO(b'{"error":{"message":"unit-test-key PRIVATE_MODEL"}}'))
            with self.subTest(status=status), patch.object(server, "open_ai_provider_request", side_effect=error), self.assertRaises(server.OperationError) as raised:
                server.json_post("https://example.com", {}, {})
            self.assertEqual(raised.exception.code, code)
            self.assertEqual(raised.exception.details["retryAfterSeconds"], 20)
            self.assertNotIn("unit-test-key", str(raised.exception) + json.dumps(raised.exception.details))

    def test_wrapped_timeout_is_timeout(self):
        with patch.object(server, "open_ai_provider_request", side_effect=URLError(TimeoutError())), self.assertRaises(server.OperationError) as raised:
            server.json_get("https://example.com", {})
        self.assertEqual(raised.exception.code, "ai_provider_timeout")

    def test_non_object_transport_response_is_rejected(self):
        response = io.BytesIO(b'[]')
        response.headers = {}
        with patch.object(server, "open_ai_provider_request", return_value=response), self.assertRaises(server.OperationError) as raised:
            server.json_get("https://example.com", {})
        self.assertEqual(raised.exception.code, "ai_provider_invalid_response")

    def test_invalid_model_is_never_marked_valid(self):
        broken = model()
        broken["hypergraph"]["link"][0]["targetClassId"] = "missing"
        with patch.object(server, "json_post", return_value=self.reply({"model": broken})):
            result = server.call_ai_provider(self.openai, self.payload, "prompt")
        self.assertFalse(result["validation"]["valid"])

    def test_discovery_is_get_only_and_preserves_exact_ids(self):
        with patch.object(server, "json_get", return_value={"data": [{"id": "gpt-5.5"}, {"id": "unknown-model"}]}) as get, patch.object(server, "json_post") as post:
            models = server.discover_provider_models(self.openai, self.payload)
        self.assertEqual([item["id"] for item in models], ["gpt-5.5", "unknown-model"])
        self.assertNotIn("supportsReasoningEffort", models[1])
        self.assertTrue(get.call_args.args[0].endswith("/v1/models"))
        post.assert_not_called()

    def test_claude_discovery_pagination(self):
        pages = [{"data": [{"id": "first"}], "has_more": True, "last_id": "first"}, {"data": [{"id": "second"}], "has_more": False}]
        with patch.object(server, "json_get", side_effect=pages) as get:
            models = server.discover_provider_models(server.ai_provider_by_id("anthropic"), self.payload)
        self.assertEqual(len(models), 2)
        self.assertIn("after_id=first", get.call_args.args[0])

    def test_focus_preserves_unselected_entities_and_positions(self):
        original = model()
        proposal = copy.deepcopy(original)
        proposal["metadata"]["name"] = "Unrelated"
        proposal["hypergraph"]["class"][0]["name"] = "Improved A"
        proposal["hypergraph"]["class"][0]["position"]["x"] = 999
        proposal["hypergraph"]["class"][1]["name"] = "Unrelated B"
        proposal["hypergraph"]["link"] = []
        result = constrain_proposal(proposal, {"currentModel": original, "operationMode": "improve-selection", "selectionIds": ["a"]})
        expected = copy.deepcopy(original)
        expected["hypergraph"]["class"][0]["name"] = "Improved A"
        self.assertEqual(result, expected)
        self.assertEqual(original, model())

    def test_explanation_cannot_apply_a_model(self):
        with patch.object(server, "json_post", return_value=self.reply({"explanation": "A connects to B", "model": model()})):
            result = server.call_ai_provider(self.openai, {**self.payload, "operationMode": "explain-selection"}, "prompt")
        self.assertIsNone(result["model"])
        self.assertEqual(result["explanation"], "A connects to B")

    def test_focused_request_requires_real_selection_and_repairs_include_findings(self):
        payload = {**self.payload, "operationMode": "improve-selection", "currentModel": model(), "selectionIds": ["missing"]}
        self.assertEqual(server.validate_ai_prompt_payload(payload)["code"], "invalid_ai_selection")
        payload["selectionIds"] = ["a"]
        self.assertIsNone(server.validate_ai_prompt_payload(payload))
        payload.update(operationMode="repair", validationFindings=["Broken unit annotation"])
        self.assertIn("Broken unit annotation", server.build_hbds_ai_prompt(payload))

    def test_schema_retains_custom_fields_and_uses_supported_subset(self):
        schema = build_response_schema({"currentModel": model(), "operationMode": "improve"})
        self.assertIn('"custom"', json.dumps(schema))
        def walk(value):
            if isinstance(value, dict):
                if value.get("type") == "object":
                    self.assertFalse(value["additionalProperties"])
                    self.assertEqual(set(value["required"]), set(value["properties"]))
                self.assertNotIn("$ref", value)
                for child in value.values(): walk(child)
            elif isinstance(value, list):
                for child in value: walk(child)
        walk(schema)
        cleaned = remove_optional_nulls({"metadata": {"name": "Test", "font": None}, "value": None})
        self.assertEqual(cleaned, {"metadata": {"name": "Test"}, "value": None})

    def test_new_model_name_collision_never_overwrites_existing_file(self):
        with tempfile.TemporaryDirectory(prefix="hbds-ai-collision-") as directory:
            root = Path(directory).resolve()
            self.assertEqual(root.parent, Path(tempfile.gettempdir()).resolve())
            target = root / "collision.json"
            contents = json.dumps(model()).encode("utf-8")
            target.write_bytes(contents)
            handler = object.__new__(server.HBDSRequestHandler)
            handler.headers = {}
            handler.server = SimpleNamespace(model_lock=lambda _name: nullcontext())
            handler.read_json_request_payload = lambda: {"scope": "models", "saveMode": "new", "operationMode": "generate", "model": model()}
            handler.json_error = Mock()
            handler.json_response = Mock()
            with patch.object(server, "MODELS_DIR", root), patch.object(server, "unique_model_file_name", return_value=target.name):
                handler.ai_apply_model()
            self.assertEqual(target.read_bytes(), contents)
            self.assertEqual(handler.json_error.call_args.args[0], 409)
            handler.json_response.assert_not_called()

    def test_explanation_apply_route_rejects_mutation(self):
        handler = object.__new__(server.HBDSRequestHandler)
        handler.read_json_request_payload = lambda: {"scope": "models", "operationMode": "explain-selection", "model": model()}
        handler.json_error = Mock()
        handler.save_model_to_scope = Mock()
        handler.ai_apply_model()
        self.assertEqual(handler.json_error.call_args.args[0], 400)
        handler.save_model_to_scope.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
