"""
One-command demo: starts the sample Quantum PM API on :8001, runs the agent
against its live OpenAPI spec, and writes the report.

    python demo.py            # uses the LLM if a key is set in .env
    python demo.py --no-llm   # rule-based only
    python demo.py --open     # open the HTML report when done
"""
from __future__ import annotations

import argparse
import threading
import time
import webbrowser

import httpx
import uvicorn

from agent.pipeline import RunConfig, run_pipeline
from sample_api.main import app as sample_app, reset_db

HOST, PORT = "127.0.0.1", 8001


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-llm", action="store_true")
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()

    reset_db()
    # log_level=critical hides the tracebacks from the planted 500 bug
    server = uvicorn.Server(uvicorn.Config(sample_app, host=HOST, port=PORT, log_level="critical"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(50):
        try:
            if httpx.get(f"http://{HOST}:{PORT}/health", timeout=1).status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.1)
    else:
        raise SystemExit(f"Sample API did not start on port {PORT}")

    print(f"\n  API Testing Agent - demo against http://{HOST}:{PORT}\n")
    try:
        out = run_pipeline(RunConfig(spec=f"http://{HOST}:{PORT}/openapi.json", use_llm=not args.no_llm))
    finally:
        server.should_exit = True
        thread.join(timeout=5)

    s = out["report"]["summary"]
    print(f"\n  {s['passed']}/{s['total']} passed ({s['pass_rate']}%) - {s['failed']} failed - "
          f"{s['edge_cases']} uncovered edge cases")
    print(f"  Report: {out['paths']['html'].resolve()}\n")
    if args.open:
        webbrowser.open(out["paths"]["html"].resolve().as_uri())


if __name__ == "__main__":
    main()
