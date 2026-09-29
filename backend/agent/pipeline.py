"""Orchestrates: Spec -> Generate -> Execute -> Analyze -> Edge cases -> Report."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

from .analyzer import FailureAnalyzer
from .edge_cases import EdgeCaseFinder
from .executor import TestExecutor
from .fixtures import provision
from .generator import LLMGenerator, RuleBasedGenerator
from .llm import LLMClient
from .models import TestCase
from .reporter import build_report, write_reports
from .spec_parser import load_spec, parse_spec


@dataclass
class RunConfig:
    spec: str                                   # URL or file path
    base_url: str | None = None                 # overrides servers[0].url
    output_dir: str = "reports"
    use_llm: bool = True
    headers: dict[str, str] = field(default_factory=dict)  # e.g. auth headers
    timeout: float = 10.0
    max_llm_cases_per_operation: int = 5
    provision: bool = True                      # create live resources for path ids first


def _log(step: str, message: str) -> None:
    print(f"  \033[36m{step:>4}\033[0m  {message}", flush=True)


def run_pipeline(cfg: RunConfig, *, raw_spec: dict | None = None, client: httpx.Client | None = None,
                 llm: LLMClient | None = None, log: Callable[[str, str], None] = _log) -> dict[str, Any]:
    started = time.perf_counter()

    log("1/6", f"Parsing API specification  {cfg.spec}")
    api = parse_spec(raw_spec if raw_spec is not None else load_spec(cfg.spec), source=cfg.spec)
    base_url = cfg.base_url or api.base_url
    if not base_url:
        raise ValueError("No base URL: the spec has no servers entry. Pass --base-url.")
    llm = llm or (LLMClient.from_env() if cfg.use_llm else LLMClient.disabled())
    log("", f"{api.title} v{api.version} - {len(api.operations)} operations - "
            f"LLM: {llm.provider + ' / ' + str(llm.model) if llm.enabled else 'off (rule-based only)'}")

    schemas = {op.operation_id: op.response_schemas() for op in api.operations}
    executor = TestExecutor(base_url, schemas, cfg.headers, cfg.timeout, client=client)
    live_ids, notes = provision(api, executor) if cfg.provision else ({}, [])
    for note in notes:
        log("", f"Provisioned {note}")

    log("2/6", "Generating test cases")
    rules = RuleBasedGenerator(live_ids)
    ai = LLMGenerator(llm, cfg.max_llm_cases_per_operation, live_ids)
    cases: list[TestCase] = []
    for op in api.operations:
        generated = rules.generate(op)
        generated += ai.generate(op, generated)
        cases.extend(generated)
    # Destructive calls last so they don't remove data other tests rely on.
    cases.sort(key=lambda c: c.method == "delete")
    for i, case in enumerate(cases, 1):
        case.id = f"TC-{i:03d}"
    log("", f"{len(cases)} cases ({sum(c.source == 'llm' for c in cases)} from LLM)")

    log("3/6", f"Executing tests against {base_url}")
    try:
        results = [executor.run(c) for c in cases]
    finally:
        if client is None:
            executor.close()
    failed = sum(not r.passed for r in results)
    log("", f"{len(results) - failed} passed, {failed} failed")

    log("4/6", "Analyzing failures")
    analyses = FailureAnalyzer(llm).analyze(results)

    log("5/6", "Identifying uncovered edge cases")
    gaps = EdgeCaseFinder(llm).find(api.operations, results)
    log("", f"{len(gaps)} gaps / suggestions")

    log("6/6", "Writing report")
    report = build_report(api=api, spec_source=cfg.spec, base_url=base_url, results=results, analyses=analyses,
                          gaps=gaps, llm_info=llm.describe(), duration_s=time.perf_counter() - started)
    report["meta"]["provisioned"] = notes
    paths = write_reports(report, cases, schemas, cfg.output_dir)
    log("", f"HTML  {paths['html']}")
    log("", f"JSON  {paths['json']}")
    return {"report": report, "paths": paths, "results": results}
