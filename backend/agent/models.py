"""Plain dataclasses shared by every stage of the pipeline."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
from typing import Any


@dataclass
class Parameter:
    name: str
    location: str  # path | query | header | cookie
    required: bool
    schema: dict[str, Any]
    description: str = ""


@dataclass
class Operation:
    operation_id: str
    method: str
    path: str
    summary: str = ""
    description: str = ""
    parameters: list[Parameter] = field(default_factory=list)
    request_body_schema: dict[str, Any] | None = None
    request_body_required: bool = False
    content_type: str | None = None
    responses: dict[str, dict[str, Any]] = field(default_factory=dict)  # "200" -> {description, schema}
    tags: list[str] = field(default_factory=list)
    security: bool = False

    @property
    def label(self) -> str:
        return f"{self.method.upper()} {self.path}"

    def response_schemas(self) -> dict[str, Any]:
        return {code: r.get("schema") for code, r in self.responses.items()}


@dataclass
class ApiSpec:
    title: str
    version: str
    openapi_version: str
    description: str
    base_url: str | None
    operations: list[Operation]


@dataclass
class TestCase:
    __test__ = False  # stop pytest from trying to collect this class

    id: str
    operation_id: str
    method: str
    path: str
    name: str
    category: str  # positive | negative | validation | boundary | edge
    description: str
    expected_status: list[str]  # e.g. ["201"], ["4XX"], ["2XX", "4XX"]
    path_params: dict[str, Any] = field(default_factory=dict)
    query_params: dict[str, Any] = field(default_factory=dict)
    headers: dict[str, Any] = field(default_factory=dict)
    body: Any = None
    send_body: bool = False
    raw_body: str | None = None  # used for malformed-payload tests
    use_default_headers: bool = True
    source: str = "rules"  # rules | llm

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TestCase":
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in names})


@dataclass
class TestResult:
    __test__ = False

    case: TestCase
    passed: bool
    actual_status: int | None
    duration_ms: float
    url: str
    response_body: Any = None
    errors: list[str] = field(default_factory=list)
    schema_errors: list[str] = field(default_factory=list)


@dataclass
class FailureAnalysis:
    case_id: str
    failure_type: str
    severity: str  # critical | high | medium | low
    summary: str
    likely_cause: str
    suggestion: str
    analyzed_by: str = "rules"  # rules | ai


@dataclass
class EdgeCaseGap:
    operation: str  # "GET /path" or "API-wide"
    title: str
    detail: str
    suggested_test: str
    priority: str = "medium"  # high | medium | low
    source: str = "rules"  # rules | ai
