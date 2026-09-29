"""Unit + in-process end-to-end tests for the agent itself (no network needed)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from agent.executor import status_matches
from agent.generator import LLMGenerator, RuleBasedGenerator
from agent.llm import LLMClient, extract_json
from agent.pipeline import RunConfig, run_pipeline
from agent.schema_utils import boundary_cases, normalize, sample_value, validate_against_schema
from agent.spec_parser import parse_spec
from sample_api.main import app, reset_db


@pytest.fixture()
def api():
    return parse_spec(app.openapi())


def op(api, method, path):
    return next(o for o in api.operations if o.method == method and o.path == path)


def test_parser_extracts_operations(api):
    assert api.title == "Quantum PM API"
    create = op(api, "post", "/projects")
    assert create.request_body_required
    assert set(normalize(create.request_body_schema)["required"]) == {"name", "budget", "team_size"}
    assert "201" in create.responses and create.responses["201"]["schema"]["type"] == "object"
    assert op(api, "get", "/projects/{project_id}").parameters[0].location == "path"


def test_swagger2_parsing():
    spec = {"swagger": "2.0", "info": {"title": "Pets", "version": "1"}, "host": "api.test", "basePath": "/v1",
            "paths": {"/pets": {"post": {"parameters": [{"in": "body", "name": "b", "required": True,
                      "schema": {"$ref": "#/definitions/Pet"}}], "responses": {"201": {"description": "ok"}}}}},
            "definitions": {"Pet": {"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}}}}}
    parsed = parse_spec(spec)
    assert parsed.base_url == "https://api.test/v1"
    assert parsed.operations[0].request_body_schema["required"] == ["name"]


def test_sample_value_respects_constraints():
    assert sample_value({"type": "integer", "minimum": 5, "maximum": 9}) == 5
    assert len(sample_value({"type": "string", "minLength": 12})) >= 12
    assert sample_value({"type": "string", "format": "email"}).count("@") == 1
    assert sample_value({"anyOf": [{"type": "number", "exclusiveMinimum": 0}, {"type": "null"}]}) > 0


def test_boundary_cases():
    cases = {label: (value, valid) for label, value, valid in boundary_cases({"type": "integer", "minimum": 1, "maximum": 10})}
    assert cases["at minimum (1)"] == (1, True) and cases["above maximum (11)"] == (11, False)


def test_status_matching():
    assert status_matches(201, ["2XX"]) and status_matches(422, ["4XX"]) and status_matches(404, ["404"])
    assert not status_matches(500, ["2XX", "4XX"])


def test_schema_validation_reports_type_errors():
    errors = validate_against_schema({"n": "5"}, {"type": "object", "properties": {"n": {"type": "number"}}})
    assert errors and errors[0].startswith("n:")


def test_rule_generator_covers_all_categories(api):
    cases = RuleBasedGenerator().generate(op(api, "post", "/projects"))
    assert {c.category for c in cases} == {"positive", "negative", "validation", "boundary", "edge"}


def test_extract_json_handles_fences():
    assert extract_json('Sure!\n```json\n[{"a": 1}]\n```') == [{"a": 1}]
    assert extract_json('noise {"x": 2} trailing') == {"x": 2}


class FakeLLM(LLMClient):
    def __init__(self, payload):
        super().__init__("fake", "fake-model", "key")
        self.payload = payload

    def complete_json(self, system, user, max_tokens=4000):
        self.calls += 1
        return self.payload


def test_llm_generator_merges_and_sanitizes(api):
    fake = FakeLLM([{"name": "Budget with 3 decimals", "category": "weird", "body": {"name": "abc", "budget": 1.234,
                     "team_size": 2}, "expected_status": ["201"]}, {"bogus": True}])
    cases = LLMGenerator(fake).generate(op(api, "post", "/projects"), [])
    assert len(cases) == 1 and cases[0].source == "llm" and cases[0].category == "edge" and cases[0].send_body


def test_end_to_end_finds_planted_bugs(tmp_path):
    reset_db()
    client = TestClient(app, raise_server_exceptions=False)
    out = run_pipeline(RunConfig(spec="sample", base_url="http://testserver", output_dir=str(tmp_path), use_llm=False),
                       raw_spec=app.openapi(), client=client, log=lambda *a: None)
    types = {(f["path"], f["analysis"]["failure_type"]) for f in out["report"]["failures"]}
    assert ("/projects/{project_id}/stats", "Response schema mismatch") in types
    assert ("/tasks/search", "Server error (5xx)") in types
    assert ("/projects/{project_id}", "Missing not-found handling") in types
    assert out["paths"]["html"].exists() and out["report"]["edge_cases"]
