"""Stage 6 - assemble the report (JSON + themed HTML)."""
from __future__ import annotations

import json
import math
import shutil
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader

from .models import ApiSpec, EdgeCaseGap, FailureAnalysis, TestCase, TestResult

TEMPLATES = Path(__file__).parent / "templates"
CATEGORY_ORDER = ["positive", "negative", "validation", "boundary", "edge"]


def _pretty(value: Any, limit: int = 4000) -> str:
    if value is None:
        return "-"
    text = json.dumps(value, indent=2, ensure_ascii=False, default=str) if isinstance(value, (dict, list)) else str(value)
    return text if len(text) <= limit else text[:limit] + "\n... (truncated)"


def jinja_env() -> Environment:
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True, trim_blocks=True, lstrip_blocks=True)
    env.filters["pretty"] = _pretty
    return env


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, math.ceil(pct / 100 * len(ordered)) - 1))
    return ordered[k]


def _sparkline(values: list[float], width: int = 520, height: int = 150, pad: int = 10) -> dict[str, str]:
    if not values:
        return {"line": "", "area": ""}
    top = max(values) or 1
    step = (width - 2 * pad) / max(len(values) - 1, 1)
    pts = [(pad + i * step, height - pad - (v / top) * (height - 2 * pad)) for i, v in enumerate(values)]
    line = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    area = f"M{pts[0][0]:.1f},{height - pad} L" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + \
           f" L{pts[-1][0]:.1f},{height - pad} Z"
    return {"line": line, "area": area}


def build_report(*, api: ApiSpec, spec_source: str, base_url: str, results: list[TestResult],
                 analyses: list[FailureAnalysis], gaps: list[EdgeCaseGap], llm_info: dict[str, Any],
                 duration_s: float) -> dict[str, Any]:
    total = len(results)
    passed = sum(r.passed for r in results)
    analysis_by_id = {a.case_id: a for a in analyses}

    cat_stats: dict[str, Counter] = defaultdict(Counter)
    for r in results:
        cat_stats[r.case.category]["total"] += 1
        cat_stats[r.case.category]["passed" if r.passed else "failed"] += 1
    max_cat = max((c["total"] for c in cat_stats.values()), default=1) or 1
    categories = []
    for name in CATEGORY_ORDER + sorted(set(cat_stats) - set(CATEGORY_ORDER)):
        c = cat_stats.get(name, Counter())
        t = c["total"]
        categories.append({
            "name": name, "total": t, "passed": c["passed"], "failed": c["failed"],
            "height": round(t / max_cat * 100, 1),
            "pass_pct": round(c["passed"] / t * 100, 1) if t else 0,
            "fail_pct": round(c["failed"] / t * 100, 1) if t else 0,
        })

    endpoints = []
    by_op: dict[str, list[TestResult]] = defaultdict(list)
    for r in results:
        by_op[r.case.operation_id].append(r)
    for op in api.operations:
        rs = by_op.get(op.operation_id, [])
        ok = sum(r.passed for r in rs)
        endpoints.append({
            "operation_id": op.operation_id, "method": op.method, "path": op.path, "summary": op.summary,
            "params": len(op.parameters), "has_body": op.request_body_schema is not None,
            "documented": sorted(op.responses), "total": len(rs), "passed": ok, "failed": len(rs) - ok,
            "pass_pct": round(ok / len(rs) * 100, 1) if rs else 0,
        })

    durations = [r.duration_ms for r in sorted(results, key=lambda r: r.case.id)]
    result_rows = []
    for r in sorted(results, key=lambda r: r.case.id):
        c = r.case
        result_rows.append({
            "id": c.id, "name": c.name, "category": c.category, "source": c.source, "method": c.method,
            "path": c.path, "operation_id": c.operation_id, "description": c.description,
            "expected": c.expected_status, "actual": r.actual_status, "passed": r.passed,
            "duration_ms": r.duration_ms, "url": r.url,
            "request": {"path_params": c.path_params, "query_params": c.query_params, "headers": c.headers,
                        "body": c.raw_body if c.raw_body is not None else (c.body if c.send_body else None)},
            "response_body": r.response_body, "errors": r.errors, "schema_errors": r.schema_errors,
        })
    rows_by_id = {row["id"]: row for row in result_rows}

    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    failures = sorted(
        ({**rows_by_id[a.case_id], "analysis": asdict(a)} for a in analyses if a.case_id in rows_by_id),
        key=lambda f: (severity_rank.get(f["analysis"]["severity"], 9), f["id"]),
    )
    failure_types = Counter(a.failure_type for a in analyses)
    severities = Counter(a.severity for a in analyses)
    now = datetime.now(timezone.utc)

    return {
        "meta": {
            "title": api.title, "version": api.version, "openapi_version": api.openapi_version,
            "spec_source": spec_source, "base_url": base_url,
            "generated_at": now.isoformat(timespec="seconds"),
            "generated_at_human": now.strftime("%d %b %Y, %H:%M UTC"),
            "duration_s": round(duration_s, 2), "llm": llm_info,
        },
        "summary": {
            "total": total, "passed": passed, "failed": total - passed,
            "pass_rate": round(passed / total * 100, 1) if total else 0.0,
            "endpoints": len(api.operations), "by_category": categories,
            "by_source": dict(Counter(r.case.source for r in results)),
            "failure_types": dict(failure_types.most_common()),
            "severities": {k: severities.get(k, 0) for k in ("critical", "high", "medium", "low")},
            "avg_ms": round(sum(durations) / len(durations), 1) if durations else 0,
            "p95_ms": round(_percentile(durations, 95), 1), "max_ms": round(max(durations, default=0), 1),
            "edge_cases": len(gaps),
        },
        "charts": {"donut_dash": round(2 * math.pi * 54 * (passed / total if total else 0), 2),
                   "donut_circ": round(2 * math.pi * 54, 2), "latency": _sparkline(durations)},
        "endpoints": endpoints,
        "results": result_rows,
        "failures": failures,
        "edge_cases": [asdict(g) for g in gaps],
    }


def write_reports(report: dict[str, Any], cases: list[TestCase], response_schemas: dict[str, Any],
                  output_dir: str | Path) -> dict[str, Path]:
    out = Path(output_dir)
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = out / run_id
    suffix = 1
    while run_dir.exists():
        suffix += 1
        run_dir = out / f"{run_id}-{suffix}"
    run_dir.mkdir(parents=True)
    report["meta"]["run_id"] = run_dir.name

    (run_dir / "report.json").write_text(json.dumps(report, indent=2, default=str, ensure_ascii=False), "utf-8")
    (run_dir / "test_cases.json").write_text(json.dumps({
        "base_url": report["meta"]["base_url"], "response_schemas": response_schemas,
        "cases": [c.to_dict() for c in cases],
    }, indent=2, default=str, ensure_ascii=False), "utf-8")
    html = jinja_env().get_template("report.html.j2").render(**report, s=report["summary"])
    (run_dir / "report.html").write_text(html, "utf-8")

    latest = out / "latest"
    if latest.exists():
        shutil.rmtree(latest)
    shutil.copytree(run_dir, latest)
    return {"run_dir": run_dir, "html": run_dir / "report.html", "json": run_dir / "report.json",
            "cases": run_dir / "test_cases.json", "run_id": run_dir.name}
