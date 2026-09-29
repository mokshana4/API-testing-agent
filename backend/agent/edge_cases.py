"""Stage 5 - find what the run did NOT cover and suggest the next tests to write."""
from __future__ import annotations

import json
import logging
from collections import defaultdict

from .executor import status_matches
from .llm import LLMClient
from .models import EdgeCaseGap, Operation, TestResult
from .schema_utils import normalize

log = logging.getLogger("agent.edge_cases")

EDGE_SYSTEM = (
    "You are a senior SDET reviewing an API test run for coverage gaps. You know the classic API bug classes: "
    "state & ordering, concurrency, idempotency, pagination, auth/authorization (IDOR), mass assignment, "
    "encoding, time zones, numeric precision, large payloads, rate limits. Output JSON only."
)

STATUS_HINTS = {
    "400": "Send a semantically invalid request (conflicting fields, wrong combination of params).",
    "401": "Call the endpoint without credentials and with an expired/garbage token.",
    "403": "Call with a valid token that lacks permission for this resource (another user's id).",
    "404": "Request a resource id that never existed, and one that was deleted.",
    "409": "Create the same resource twice / update with a stale version.",
    "413": "Send a payload larger than the server limit (e.g. 5 MB).",
    "415": "Send the body with Content-Type: text/plain.",
    "422": "Send a well-formed body that breaks a field constraint.",
    "429": "Burst 50+ requests in a second to trigger rate limiting.",
    "500": "Simulate a dependency failure (DB down) and check the error contract.",
    "503": "Simulate downstream unavailability; check Retry-After.",
}


class EdgeCaseFinder:
    def __init__(self, llm: LLMClient, max_ai_items: int = 12):
        self.llm = llm
        self.max_ai_items = max_ai_items

    def find(self, operations: list[Operation], results: list[TestResult]) -> list[EdgeCaseGap]:
        gaps = self._rule_based(operations, results)
        if self.llm.enabled:
            seen = {g.title.lower() for g in gaps}
            for gap in self._ai(operations, results):
                if gap.title.lower() not in seen:
                    gaps.append(gap)
                    seen.add(gap.title.lower())
        order = {"high": 0, "medium": 1, "low": 2}
        return sorted(gaps, key=lambda g: order.get(g.priority, 1))

    # ------------------------------------------------------------ heuristics
    def _rule_based(self, operations: list[Operation], results: list[TestResult]) -> list[EdgeCaseGap]:
        gaps: list[EdgeCaseGap] = []
        by_op: dict[str, list[TestResult]] = defaultdict(list)
        for r in results:
            by_op[r.case.operation_id].append(r)
        paths_with_delete = {op.path for op in operations if op.method == "delete"}
        seen_read_after_delete: set[str] = set()

        for op in operations:
            rs = by_op.get(op.operation_id, [])
            observed = {r.actual_status for r in rs if r.actual_status}
            label = op.label

            # 1. documented responses never triggered
            for code, resp in op.responses.items():
                if code == "default" or any(status_matches(o, [code]) for o in observed):
                    continue
                gaps.append(EdgeCaseGap(
                    label, f"Documented {code} response never observed",
                    f"The spec promises a {code} ({resp.get('description') or 'no description'}) "
                    f"but no generated test produced it.",
                    STATUS_HINTS.get(code, f"Design a request that should yield {code}."),
                    "medium" if code.startswith(("4", "2")) else "low"))

            # 2. behaviour the spec does not document
            for code in sorted(observed):
                if not any(status_matches(code, [doc]) for doc in op.responses):
                    gaps.append(EdgeCaseGap(
                        label, f"Undocumented {code} response returned",
                        f"The API returned {code}, which the spec does not declare for this operation.",
                        f"Document {code} in the spec or fix the handler; add a contract test pinning it.",
                        "high" if code >= 500 else "medium"))

            # 3. inputs without constraints -> boundaries can't be derived
            unconstrained = []
            inputs = [(p.name, p.schema) for p in op.parameters]
            body = normalize(op.request_body_schema) if op.request_body_schema else {}
            inputs += list(body.get("properties", {}).items())
            for name, schema in inputs:
                s = normalize(schema)
                t = s.get("type")
                if t in ("integer", "number") and not any(k in s for k in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum")):
                    unconstrained.append(name)
                elif t == "string" and not s.get("enum") and not s.get("format") and "maxLength" not in s:
                    unconstrained.append(name)
            if unconstrained:
                gaps.append(EdgeCaseGap(
                    label, "Inputs without declared limits",
                    "No min/max or maxLength for: " + ", ".join(unconstrained) +
                    ". Boundary tests cannot be derived and the server's real limits are unknown.",
                    "Add constraints to the spec, then test negative, zero, huge and 1 MB+ values.", "low"))

            # 4. pagination
            names = {p.name.lower() for p in op.parameters}
            if names & {"limit", "offset", "page", "size", "per_page", "page_size", "cursor"}:
                gaps.append(EdgeCaseGap(
                    label, "Pagination consistency",
                    "Single-request tests cannot prove pages are complete and non-overlapping.",
                    "Create N items, walk every page, assert no duplicates/missing items; "
                    "request an offset beyond the total and expect an empty list.", "medium"))

            # 5. stateful: read after delete
            if op.method == "get" and op.path in paths_with_delete and op.path not in seen_read_after_delete:
                seen_read_after_delete.add(op.path)
                gaps.append(EdgeCaseGap(
                    label, "Read after delete",
                    "Tests run independently, so the delete -> read lifecycle is never checked.",
                    f"Create a resource, DELETE {op.path}, then GET it and expect 404; "
                    f"DELETE it again and check idempotency.", "high"))

            # 6. duplicates / idempotency
            if op.method == "post" and op.request_body_schema is not None and "409" not in op.responses:
                gaps.append(EdgeCaseGap(
                    label, "Duplicate creation",
                    "Nothing defines what happens when the same payload is sent twice.",
                    "POST the identical body twice; decide between 409 Conflict and two records, then pin it.", "medium"))
            if op.method in ("put", "patch"):
                gaps.append(EdgeCaseGap(
                    label, "Concurrent updates",
                    "Lost-update scenarios are not covered by single-request tests.",
                    "Send two updates in parallel with different values; verify the final state "
                    "and whether ETag/If-Match is supported.", "low"))

            # 7. content type
            if op.request_body_schema is not None:
                gaps.append(EdgeCaseGap(
                    label, "Unsupported Content-Type",
                    "Only JSON bodies were sent.",
                    "Send the body as text/plain and as XML; expect 415 or 4xx, never 5xx.", "low"))

        if operations and not any(op.security for op in operations):
            writes = [op.label for op in operations if op.method in ("post", "put", "patch", "delete")]
            if writes:
                gaps.append(EdgeCaseGap(
                    "API-wide", "No authentication declared",
                    f"{len(writes)} write operation(s) have no security requirement in the spec.",
                    "Confirm the API is meant to be public; otherwise add a security scheme and test "
                    "401/403 plus access to other users' resources (IDOR).", "high"))
        return gaps

    # --------------------------------------------------------------------- AI
    def _ai(self, operations: list[Operation], results: list[TestResult]) -> list[EdgeCaseGap]:
        by_op: dict[str, list[str]] = defaultdict(list)
        failed: dict[str, list[str]] = defaultdict(list)
        for r in results:
            by_op[r.case.operation_id].append(r.case.name)
            if not r.passed:
                failed[r.case.operation_id].append(r.case.name)
        summary = [{"endpoint": op.label, "summary": op.summary,
                    "params": [p.name for p in op.parameters],
                    "body_fields": list(normalize(op.request_body_schema).get("properties", {}).keys())
                    if op.request_body_schema else [],
                    "responses": list(op.responses), "tests_run": by_op[op.operation_id][:40],
                    "failed": failed[op.operation_id][:10]} for op in operations]
        prompt = ("API test run summary:\n" + json.dumps(summary, indent=1)[:14000] +
                  f"\n\nList up to {self.max_ai_items} important edge cases NOT covered by the tests above. "
                  'Return a JSON array: [{"operation": "METHOD /path or API-wide", "title": "...", '
                  '"detail": "why it matters", "suggested_test": "concrete steps + expected result", '
                  '"priority": "high|medium|low"}]')
        data = self.llm.complete_json(EDGE_SYSTEM, prompt)
        if not isinstance(data, list):
            return []
        out = []
        for item in data[: self.max_ai_items]:
            if isinstance(item, dict) and item.get("title"):
                out.append(EdgeCaseGap(
                    str(item.get("operation", "API-wide")), str(item["title"])[:140],
                    str(item.get("detail", ""))[:500], str(item.get("suggested_test", ""))[:500],
                    item.get("priority") if item.get("priority") in ("high", "medium", "low") else "medium", "ai"))
        return out
