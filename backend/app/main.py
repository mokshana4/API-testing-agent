"""
Thin FastAPI wrapper around the pipeline.

  GET  /                      run page (paste a spec URL or upload a file)
  POST /api/run               run the agent, returns summary + report links
  GET  /reports/<run>/...     generated reports (static)

Run:  uvicorn app.main:app --port 8000
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from agent.pipeline import RunConfig, run_pipeline
from agent.reporter import jinja_env

REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "reports")).resolve()
UPLOADS_DIR = REPORTS_DIR / "_uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="API Testing Agent", version="1.0.0")
app.mount("/reports", StaticFiles(directory=REPORTS_DIR, html=True), name="reports")


def _recent_runs(limit: int = 6) -> list[dict]:
    runs = []
    for d in sorted((p for p in REPORTS_DIR.iterdir() if p.is_dir() and p.name not in ("latest", "_uploads")),
                    reverse=True)[:limit]:
        try:
            report = json.loads((d / "report.json").read_text("utf-8"))
        except (OSError, ValueError):
            continue
        runs.append({"id": d.name, "title": report["meta"]["title"], **report["summary"]})
    return runs


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return jinja_env().get_template("index.html.j2").render(runs=_recent_runs())


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/run")
async def run(
    spec_url: str | None = Form(None),
    base_url: str | None = Form(None),
    use_llm: bool = Form(True),
    auth_header: str | None = Form(None, description="Optional 'Name: value' header sent with every request"),
    spec_file: UploadFile | None = File(None),
):
    if spec_file is not None and spec_file.filename:
        target = UPLOADS_DIR / f"{uuid.uuid4().hex[:8]}_{Path(spec_file.filename).name}"
        target.write_bytes(await spec_file.read())
        source = str(target)
    elif spec_url and spec_url.strip():
        source = spec_url.strip()
    else:
        raise HTTPException(400, "Provide a spec URL or upload a spec file.")

    headers = {}
    if auth_header and ":" in auth_header:
        name, value = auth_header.split(":", 1)
        headers[name.strip()] = value.strip()

    cfg = RunConfig(spec=source, base_url=(base_url or "").strip() or None, output_dir=str(REPORTS_DIR),
                    use_llm=use_llm, headers=headers)
    try:
        out = await run_in_threadpool(run_pipeline, cfg)
    except Exception as exc:  # surface spec/connection problems to the page
        raise HTTPException(422, f"{type(exc).__name__}: {exc}") from exc

    run_id = out["paths"]["run_id"]
    return {
        "run_id": run_id,
        "summary": out["report"]["summary"],
        "report_url": f"/reports/{run_id}/report.html",
        "json_url": f"/reports/{run_id}/report.json",
        "cases_url": f"/reports/{run_id}/test_cases.json",
    }
