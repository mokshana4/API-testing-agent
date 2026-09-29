"""Stage 2 - generate test cases.

RuleBasedGenerator  deterministic, spec-driven coverage (works offline, no LLM).
LLMGenerator        asks the LLM for extra business-logic / edge scenarios on top.
"""
from __future__ import annotations

import copy
import json
import logging
from typing import Any

from .llm import LLMClient
from .models import Operation, TestCase
from .schema_utils import (
    MISSING, boundary_cases, fit_length, invalid_enum_value, is_free_text, is_nullable,
    nonexistent_value, normalize, sample_value, wrong_type_value,
)
from .spec_parser import operation_summary

log = logging.getLogger("agent.generator")

CATEGORIES = ("positive", "negative", "validation", "boundary", "edge")
CLIENT_ERROR = ["4XX"]
NOT_5XX = ["2XX", "4XX"]  # "anything but a crash"
UNICODE_SAMPLE = "Ünïcødé ✓ 🚀 测试 ñ"
SPECIAL_SAMPLE = "'\"<script>alert(1)</script>;%&()[]{}\\ OR 1=1--"
LOC_KEY = {"path": "path_params", "query": "query_params", "header": "headers"}


def _short(value: Any, limit: int = 40) -> str:
    text = json.dumps(value, ensure_ascii=False, default=str)
    return text if len(text) <= limit else text[:limit - 3] + "..."


class RuleBasedGenerator:
    def __init__(self, path_overrides: dict[str, Any] | None = None):
        # Live ids created during provisioning; they beat spec examples for path params.
        self.path_overrides = path_overrides or {}

    def generate(self, op: Operation) -> list[TestCase]:
        cases: list[TestCase] = []
        ok = self._success_codes(op)
        base = self._base_request(op, path_overrides=self.path_overrides)
        params = [p for p in op.parameters if p.location in LOC_KEY]

        body_schema = normalize(op.request_body_schema) if op.request_body_schema is not None else None
        props: dict[str, Any] = {}
        if body_schema and body_schema.get("type") == "object" and isinstance(base["body"], dict):
            props = {k: v for k, v in body_schema.get("properties", {}).items() if not normalize(v).get("readOnly")}
        required_fields = [f for f in (body_schema or {}).get("required", []) if f in props]

        def add(req: dict, name: str, category: str, description: str, expected: list[str]) -> None:
            cases.append(TestCase(
                id="", operation_id=op.operation_id, method=op.method, path=op.path, name=name,
                category=category, description=description, expected_status=list(expected),
                source="rules", **copy.deepcopy(req),
            ))

        def variant() -> dict:
            return copy.deepcopy(base)

        # ---------------------------------------------------------- positive
        add(base, "Valid request", "positive",
            f"Happy path with valid {'body and ' if op.request_body_schema is not None else ''}parameters.", ok)

        optional = [p for p in params if not p.required]
        if optional:
            add(self._base_request(op, include_optional=True, path_overrides=self.path_overrides),
                "Valid request with all optional parameters",
                "positive", "Also sends: " + ", ".join(p.name for p in optional) + ".", ok)

        optional_fields = [f for f in props if f not in required_fields]
        if props and optional_fields and required_fields:
            r = variant()
            r["body"] = {k: v for k, v in base["body"].items() if k in required_fields}
            add(r, "Valid body with required fields only", "positive",
                "Omits optional fields: " + ", ".join(optional_fields) + ".", ok)

        # ---------------------------------------------------------- negative
        for p in params:
            if p.required and p.location != "path":
                r = variant()
                r[LOC_KEY[p.location]].pop(p.name, None)
                add(r, f"Missing required {p.location} parameter '{p.name}'", "negative",
                    f"Omits the required {p.location} parameter.", CLIENT_ERROR)

        if op.request_body_schema is not None and op.request_body_required:
            r = variant()
            r["body"], r["send_body"] = None, False
            add(r, "Missing request body", "negative", "Sends no body although one is required.", CLIENT_ERROR)

        for f in required_fields:
            r = variant()
            r["body"].pop(f, None)
            add(r, f"Missing required field '{f}'", "negative", f"Body without the required field '{f}'.",
                CLIENT_ERROR)

        if op.request_body_schema is not None:
            r = variant()
            r["raw_body"], r["send_body"] = '{"name": "broken", "value": ', False
            add(r, "Malformed JSON body", "negative", "Body is truncated, syntactically invalid JSON.", CLIENT_ERROR)

        if "404" in op.responses:
            for p in params:
                if p.location == "path":
                    r = variant()
                    r["path_params"][p.name] = nonexistent_value(p.schema)
                    add(r, f"Non-existent resource ({p.name}={r['path_params'][p.name]})", "negative",
                        "References a resource that should not exist.", ["404"])

        if op.security:
            r = variant()
            r["use_default_headers"] = False
            add(r, "Request without credentials", "negative",
                "Drops the configured auth headers; a protected endpoint must refuse.", ["401", "403"])

        # -------------------------------------------------------- validation
        for p in params:
            wrong = wrong_type_value(p.schema, p.location)
            if wrong is not MISSING:
                r = variant()
                r[LOC_KEY[p.location]][p.name] = wrong
                add(r, f"Wrong type for {p.location} parameter '{p.name}'", "validation",
                    f"Sends {_short(wrong)} where {normalize(p.schema).get('type')} is expected.", CLIENT_ERROR)
            bad_enum = invalid_enum_value(p.schema)
            if bad_enum is not MISSING:
                r = variant()
                r[LOC_KEY[p.location]][p.name] = bad_enum
                add(r, f"Invalid enum value for '{p.name}'", "validation",
                    f"Value outside {normalize(p.schema).get('enum')}.", CLIENT_ERROR)

        for f, fs in props.items():
            wrong = wrong_type_value(fs, "body")
            if wrong is not MISSING:
                r = variant()
                r["body"][f] = wrong
                add(r, f"Wrong type for field '{f}'", "validation",
                    f"Sends {_short(wrong)} where {normalize(fs).get('type')} is expected.", CLIENT_ERROR)
            bad_enum = invalid_enum_value(fs)
            if bad_enum is not MISSING:
                r = variant()
                r["body"][f] = bad_enum
                add(r, f"Invalid enum value for field '{f}'", "validation",
                    f"Value outside {normalize(fs).get('enum')}.", CLIENT_ERROR)
            if f in required_fields and not is_nullable(fs):
                r = variant()
                r["body"][f] = None
                add(r, f"Null value for required field '{f}'", "validation",
                    "Required, non-nullable field set to null.", CLIENT_ERROR)

        # ---------------------------------------------------------- boundary
        for p in params:
            for label, value, valid in boundary_cases(p.schema):
                r = variant()
                r[LOC_KEY[p.location]][p.name] = value
                expected = ok + (["404"] if p.location == "path" and "404" in op.responses else []) \
                    if valid else CLIENT_ERROR
                add(r, f"'{p.name}' {label}", "boundary",
                    f"{'Valid' if valid else 'Invalid'} boundary value {_short(value)}.", expected)

        for f, fs in props.items():
            for label, value, valid in boundary_cases(fs):
                r = variant()
                r["body"][f] = value
                add(r, f"Field '{f}' {label}", "boundary",
                    f"{'Valid' if valid else 'Invalid'} boundary value {_short(value)}.", ok if valid else CLIENT_ERROR)

        # -------------------------------------------------------------- edge
        for p in params:
            if p.location not in ("query", "path"):
                continue
            s = normalize(p.schema)
            if is_free_text(s):
                for label, raw in (("special / injection characters", SPECIAL_SAMPLE), ("unicode & emoji", UNICODE_SAMPLE)):
                    r = variant()
                    r[LOC_KEY[p.location]][p.name] = fit_length(raw, s)
                    add(r, f"'{p.name}' with {label}", "edge",
                        "Must be handled gracefully: 2xx or 4xx, never a crash.", NOT_5XX)
                if s.get("maxLength") is None:
                    r = variant()
                    r[LOC_KEY[p.location]][p.name] = "x" * 5000
                    add(r, f"'{p.name}' very long value (5,000 chars)", "edge",
                        "No maxLength is declared; the server must not crash.", NOT_5XX)
            elif s.get("type") == "integer" and s.get("maximum") is None and s.get("exclusiveMaximum") is None:
                r = variant()
                r[LOC_KEY[p.location]][p.name] = 2 ** 63
                add(r, f"'{p.name}' larger than int64 (2^63)", "edge",
                    "Overflow check: must be rejected or handled, never a crash.", NOT_5XX)

        for f, fs in props.items():
            s = normalize(fs)
            if not is_free_text(s):
                continue
            for label, raw in (("special / injection characters", SPECIAL_SAMPLE), ("unicode & emoji", UNICODE_SAMPLE)):
                r = variant()
                r["body"][f] = fit_length(raw, s)
                add(r, f"Field '{f}' with {label}", "edge", "Must be stored or rejected cleanly, never crash.",
                    NOT_5XX)
            if s.get("maxLength") is None:
                r = variant()
                r["body"][f] = "x" * 10000
                add(r, f"Field '{f}' very long value (10,000 chars)", "edge",
                    "No maxLength is declared; the server must not crash.", NOT_5XX)
            if f in required_fields and not s.get("minLength"):
                r = variant()
                r["body"][f] = ""
                add(r, f"Empty string for required field '{f}'", "edge",
                    "No minLength is declared; check how empty values are treated.", NOT_5XX)

        if props:
            r = variant()
            r["body"]["unexpected_field_xyz"] = "surprise"
            add(r, "Unknown extra field in body", "edge",
                "Extra properties must be ignored or rejected, never crash.", NOT_5XX)

        return cases

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _success_codes(op: Operation) -> list[str]:
        codes = sorted(c for c in op.responses if c.startswith("2"))
        return codes or ["2XX"]

    @staticmethod
    def _base_request(op: Operation, include_optional: bool = False,
                      path_overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        req: dict[str, Any] = {"path_params": {}, "query_params": {}, "headers": {}, "body": None,
                               "send_body": False, "raw_body": None, "use_default_headers": True}
        overrides = path_overrides or {}
        for p in op.parameters:
            if p.location in LOC_KEY and (p.location == "path" or p.required or include_optional):
                if p.location == "path" and p.name in overrides:
                    req["path_params"][p.name] = overrides[p.name]
                else:
                    req[LOC_KEY[p.location]][p.name] = sample_value(p.schema, p.name)
        if op.request_body_schema is not None:
            req["body"], req["send_body"] = sample_value(op.request_body_schema, "body"), True
        return req


LLM_SYSTEM = (
    "You are a senior SDET designing API tests from an OpenAPI operation. "
    "You think about business rules, state, security, encoding and data edge cases that "
    "mechanical spec-based generation misses. You only output JSON."
)


class LLMGenerator:
    def __init__(self, llm: LLMClient, max_cases: int = 5, path_overrides: dict[str, Any] | None = None):
        self.llm = llm
        self.max_cases = max_cases
        self.path_overrides = path_overrides or {}

    def generate(self, op: Operation, existing: list[TestCase]) -> list[TestCase]:
        if not self.llm.enabled or self.max_cases <= 0:
            return []
        existing_names = "\n".join(f"- [{c.category}] {c.name}" for c in existing) or "- (none)"
        prompt = f"""OpenAPI operation:
{operation_summary(op)}

Tests that already exist (do NOT duplicate them):
{existing_names}

Propose up to {self.max_cases} ADDITIONAL high-value test cases for this operation.
Return a JSON array. Each item:
{{
  "name": "short title",
  "category": one of {list(CATEGORIES)},
  "description": "what it checks and why it matters",
  "path_params": {{}}, "query_params": {{}}, "headers": {{}},
  "body": <JSON value or null>, "send_body": true|false,
  "expected_status": ["200"] or ["4XX"] or ["2XX","4XX"]
}}
Use realistic values. Every path parameter in the path template must be present in path_params."""
        data = self.llm.complete_json(LLM_SYSTEM, prompt)
        if not isinstance(data, list):
            return []

        base = RuleBasedGenerator._base_request(op, path_overrides=self.path_overrides)
        out: list[TestCase] = []
        for item in data[: self.max_cases]:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            category = str(item.get("category", "edge")).lower()
            expected = [str(x).upper() for x in (item.get("expected_status") or [])] or NOT_5XX
            path_params = {**base["path_params"], **(item.get("path_params") or {})}
            body = item.get("body")
            out.append(TestCase(
                id="", operation_id=op.operation_id, method=op.method, path=op.path,
                name=str(item["name"])[:120], category=category if category in CATEGORIES else "edge",
                description=str(item.get("description", ""))[:400], expected_status=expected,
                path_params=path_params, query_params=item.get("query_params") or {},
                headers=item.get("headers") or {}, body=body,
                send_body=bool(item.get("send_body", body is not None)), source="llm",
            ))
        log.info("LLM added %d cases for %s", len(out), op.label)
        return out
