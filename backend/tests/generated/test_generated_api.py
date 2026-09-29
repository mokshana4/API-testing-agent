"""
Replays the agent's generated test cases as regular pytest tests (handy for CI).

    python -m agent --spec http://localhost:8001/openapi.json   # writes reports/latest/test_cases.json
    pytest tests/generated -v                                   # replay them

Env vars:
    CASES_FILE  path to test_cases.json   (default reports/latest/test_cases.json)
    BASE_URL    override the recorded base URL
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from agent.executor import TestExecutor
from agent.models import TestCase

CASES_FILE = Path(os.getenv("CASES_FILE", "reports/latest/test_cases.json"))
if not CASES_FILE.exists():
    pytest.skip(f"{CASES_FILE} not found - run the agent first", allow_module_level=True)

DATA = json.loads(CASES_FILE.read_text("utf-8"))
CASES = [TestCase.from_dict(c) for c in DATA["cases"]]


@pytest.fixture(scope="module")
def executor():
    ex = TestExecutor(os.getenv("BASE_URL", DATA["base_url"]), DATA["response_schemas"])
    yield ex
    ex.close()


@pytest.mark.parametrize("case", CASES, ids=[f"{c.id}-{c.method.upper()} {c.path} - {c.name}" for c in CASES])
def test_api(case: TestCase, executor: TestExecutor):
    result = executor.run(case)
    detail = "\n".join(result.errors + result.schema_errors)
    assert result.passed, f"{case.description}\n{detail}\nResponse: {str(result.response_body)[:500]}"
