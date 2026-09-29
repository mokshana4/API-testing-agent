"""Stage 4 - explain failures: rule-based triage, optionally enriched by the LLM."""
from __future__ import annotations

import json
import logging

from .llm import LLMClient
from .models import FailureAnalysis, TestResult

log = logging.getLogger("agent.analyzer")

ANALYZER_SYSTEM = (
    "You are a senior SDET triaging failed API tests. For each failure give the most likely root cause "
    "in the server implementation or the spec, and one concrete fix. Be specific and brief. Output JSON only."
)


def classify(result: TestResult) -> FailureAnalysis:
    case, actual = result.case, result.actual_status
    expected = [str(e).upper() for e in case.expected_status]
    expects_4xx = all(e.startswith("4") for e in expected)
    expects_2xx = all(e.startswith("2") for e in expected)
    where = f"{case.method.upper()} {case.path}"

    def make(kind: str, severity: str, summary: str, cause: str, fix: str) -> FailureAnalysis:
        return FailureAnalysis(case.id, kind, severity, summary, cause, fix)

    if actual is None:
        return make("Connectivity error", "critical", f"{where} did not respond: {result.errors[0] if result.errors else ''}",
                    "The service is down, the base URL is wrong, or the request timed out.",
                    "Check the base URL and that the service is running; raise --timeout for slow endpoints.")
    if actual >= 500:
        return make("Server error (5xx)", "critical", f"{where} crashed with {actual} on: {case.name}",
                    "Unhandled exception: this input reaches code that does not validate or sanitize it.",
                    "Validate or escape this input and return a 4xx with a clear message. "
                    "Keep this payload as a regression test.")
    if expected == ["404"] and 200 <= actual < 300:
        return make("Missing not-found handling", "high",
                    f"{where} returned {actual} for a resource that does not exist",
                    "The handler does not check that the resource exists and reports success anyway.",
                    "Look the resource up first and return the documented 404.")
    if expects_4xx and 200 <= actual < 300:
        return make("Missing validation", "high", f"{where} accepted invalid input ({case.name}) with {actual}",
                    "The server does not enforce a constraint the spec declares, or the spec over-declares it.",
                    "Enforce the constraint server-side, or correct the spec so contract and code agree.")
    if expects_2xx and actual in (401, 403):
        return make("Authorization required", "medium", f"{where} returned {actual} for a valid request",
                    "The endpoint needs credentials the run did not provide.",
                    "Pass auth with --header 'Authorization: Bearer <token>' or document the security scheme.")
    if expects_2xx and actual == 404:
        return make("Resource not found", "medium", f"Valid request to {where} returned 404",
                    "Test data does not exist - state changed during the run (e.g. deleted earlier) "
                    "or the example id in the spec is not seeded.",
                    "Seed the resource or create it in a setup step; keep spec examples pointing at real data.")
    if expects_2xx and 400 <= actual < 500:
        return make("Valid request rejected", "high", f"{where} rejected a spec-valid request with {actual}",
                    "The implementation is stricter than the spec (undocumented rule) or the sample data "
                    "violates a rule the spec does not express.",
                    "Compare the error body with the spec; document the extra rule or relax validation.")
    if result.schema_errors:
        return make("Response schema mismatch", "medium",
                    f"{where} response does not match the documented schema: {result.schema_errors[0]}",
                    "Contract drift: the handler serializes fields with a different type/shape than the spec.",
                    "Fix the response model/serializer, or update the schema if the new shape is intended.")
    return make("Unexpected status code", "medium",
                f"{where} returned {actual}, expected {' or '.join(expected)}",
                "The implementation returns a different (possibly undocumented) status code.",
                "Align the status code with the spec, or document the actual behaviour.")


class FailureAnalyzer:
    def __init__(self, llm: LLMClient, batch_size: int = 20):
        self.llm = llm
        self.batch_size = batch_size

    def analyze(self, results: list[TestResult]) -> list[FailureAnalysis]:
        failures = [r for r in results if not r.passed]
        analyses = {r.case.id: classify(r) for r in failures}
        if self.llm.enabled and failures:
            for i in range(0, len(failures), self.batch_size):
                self._enrich(failures[i:i + self.batch_size], analyses)
        return list(analyses.values())

    def _enrich(self, batch: list[TestResult], analyses: dict[str, FailureAnalysis]) -> None:
        items = []
        for r in batch:
            c = r.case
            items.append({
                "id": c.id, "test": c.name, "endpoint": f"{c.method.upper()} {c.path}", "category": c.category,
                "request": {"path_params": c.path_params, "query": c.query_params,
                            "body": c.raw_body if c.raw_body is not None else c.body},
                "expected_status": c.expected_status, "actual_status": r.actual_status,
                "errors": r.errors + r.schema_errors[:3],
                "response_excerpt": json.dumps(r.response_body, default=str)[:400],
                "rule_based_guess": analyses[c.id].failure_type,
            })
        prompt = ("Failed API tests:\n" + json.dumps(items, indent=1, default=str) +
                  '\n\nReturn a JSON array: [{"id": "...", "likely_cause": "...", "suggestion": "...", '
                  '"severity": "critical|high|medium|low"}]')
        data = self.llm.complete_json(ANALYZER_SYSTEM, prompt)
        if not isinstance(data, list):
            return
        for item in data:
            if not isinstance(item, dict) or item.get("id") not in analyses:
                continue
            a = analyses[item["id"]]
            a.likely_cause = str(item.get("likely_cause") or a.likely_cause)[:600]
            a.suggestion = str(item.get("suggestion") or a.suggestion)[:600]
            if item.get("severity") in ("critical", "high", "medium", "low"):
                a.severity = item["severity"]
            a.analyzed_by = "ai"
