"""Provision real resources before the run so path IDs point at data that exists.

For a path like /projects/{project_id}/tasks, the agent looks for POST /projects,
creates one resource with a valid sample body and uses the returned id. This keeps
reruns stable even after an earlier run deleted the spec's example id.
"""
from __future__ import annotations

import logging
from typing import Any

from .executor import TestExecutor
from .models import ApiSpec, TestCase
from .schema_utils import sample_value

log = logging.getLogger("agent.fixtures")


def _id_from(body: Any, param: str) -> Any:
    if not isinstance(body, dict):
        return None
    candidates = [param, "id", param.removesuffix("_id"), param.removesuffix("Id"), "uuid", "key"]
    for key in candidates:
        if key in body and isinstance(body[key], (str, int)):
            return body[key]
    return None


def provision(api: ApiSpec, executor: TestExecutor) -> tuple[dict[str, Any], list[str]]:
    """Return ({path_param: live_value}, human-readable notes)."""
    creators = {op.path.rstrip("/"): op for op in api.operations
                if op.method == "post" and op.request_body_schema is not None}
    values: dict[str, Any] = {}
    notes: list[str] = []
    for op in api.operations:
        segments = op.path.split("/")
        for i, seg in enumerate(segments):
            if not (seg.startswith("{") and seg.endswith("}")):
                continue
            param = seg[1:-1]
            collection = "/".join(segments[:i]).rstrip("/")
            if param in values or collection not in creators or "{" in collection:
                continue  # only top-level collections: keeps the setup simple and predictable
            creator = creators[collection]
            case = TestCase(id="SETUP", operation_id=creator.operation_id, method="post", path=creator.path,
                            name="provision", category="setup", description="", expected_status=["2XX"],
                            body=sample_value(creator.request_body_schema, "body"), send_body=True)
            result = executor.run(case)
            value = _id_from(result.response_body, param) if result.actual_status and result.actual_status < 300 else None
            if value is not None:
                values[param] = value
                notes.append(f"{param}={value} via POST {creator.path}")
            else:
                log.info("Could not provision %s via POST %s (status %s)", param, creator.path, result.actual_status)
    return values, notes
