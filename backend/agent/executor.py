"""Stage 3 - execute test cases over HTTP and check status codes + response schemas."""
from __future__ import annotations

import time
from typing import Any
from urllib.parse import quote

import httpx

from .models import TestCase, TestResult
from .schema_utils import validate_against_schema


def status_matches(actual: int, expected: list[str]) -> bool:
    code = str(actual)
    for e in expected:
        e = str(e).upper()
        if e == code or (len(e) == 3 and e.endswith("XX") and e[0] == code[0]) or e == "DEFAULT":
            return True
    return False


class TestExecutor:
    __test__ = False

    def __init__(self, base_url: str, response_schemas: dict[str, dict[str, Any]] | None = None,
                 default_headers: dict[str, str] | None = None, timeout: float = 10.0,
                 client: httpx.Client | None = None):
        self.base_url = base_url.rstrip("/")
        self.response_schemas = response_schemas or {}
        self.default_headers = default_headers or {}
        self.client = client or httpx.Client(timeout=timeout, follow_redirects=False)

    def build_url(self, case: TestCase) -> str:
        path = case.path
        for name, value in case.path_params.items():
            path = path.replace("{" + name + "}", quote(str(value), safe=""))
        return self.base_url + path

    def _schema_for(self, operation_id: str, status: int) -> dict | None:
        responses = self.response_schemas.get(operation_id, {})
        for key in (str(status), f"{str(status)[0]}XX", "default"):
            if key in responses:
                return responses[key]
        return None

    def run(self, case: TestCase) -> TestResult:
        url = self.build_url(case)
        headers = {**(self.default_headers if case.use_default_headers else {}),
                   **{k: str(v) for k, v in case.headers.items()}}
        kwargs: dict[str, Any] = {
            "params": {k: v for k, v in case.query_params.items() if v is not None},
            "headers": headers,
        }
        if case.raw_body is not None:
            kwargs["content"] = case.raw_body.encode()
            headers.setdefault("Content-Type", "application/json")
        elif case.send_body:
            kwargs["json"] = case.body

        start = time.perf_counter()
        try:
            try:
                response = self.client.request(case.method.upper(), url, **kwargs)
            except (httpx.RemoteProtocolError, httpx.ReadError, httpx.WriteError):
                # A server that crashed on the previous request may close the pooled
                # keep-alive connection; retry once on a fresh one before reporting.
                start = time.perf_counter()
                response = self.client.request(case.method.upper(), url, **kwargs)
        except httpx.HTTPError as exc:
            return TestResult(case=case, passed=False, actual_status=None,
                              duration_ms=round((time.perf_counter() - start) * 1000, 1), url=url,
                              errors=[f"Request failed: {type(exc).__name__}: {exc}"])
        duration = round((time.perf_counter() - start) * 1000, 1)

        try:
            body: Any = response.json()
            is_json = True
        except ValueError:
            body, is_json = (response.text[:2000] or None), False

        errors: list[str] = []
        schema_errors: list[str] = []
        status_ok = status_matches(response.status_code, case.expected_status)
        if not status_ok:
            errors.append(f"Expected status {' or '.join(case.expected_status)}, got {response.status_code}")
        else:
            schema = self._schema_for(case.operation_id, response.status_code)
            if schema and is_json:
                schema_errors = validate_against_schema(body, schema)
                if schema_errors:
                    errors.append(f"Response body violates the documented schema ({len(schema_errors)} issue(s))")

        return TestResult(case=case, passed=status_ok and not schema_errors, actual_status=response.status_code,
                          duration_ms=duration, url=str(response.request.url), response_body=body,
                          errors=errors, schema_errors=schema_errors)

    def close(self) -> None:
        self.client.close()
