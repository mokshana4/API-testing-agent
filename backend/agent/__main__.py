"""CLI:  python -m agent --spec http://localhost:8001/openapi.json"""
from __future__ import annotations

import argparse
import logging
import sys

from .pipeline import RunConfig, run_pipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m agent", description="AI-powered API Testing Agent")
    parser.add_argument("--spec", required=True, help="OpenAPI/Swagger URL or file (.json/.yaml)")
    parser.add_argument("--base-url", help="API base URL (defaults to servers[0] / spec origin)")
    parser.add_argument("--out", default="reports", help="Output directory (default: reports)")
    parser.add_argument("--no-llm", action="store_true", help="Rule-based only, no LLM calls")
    parser.add_argument("--header", action="append", default=[], metavar="'Name: value'",
                        help="Default header for every request (repeatable), e.g. auth")
    parser.add_argument("--timeout", type=float, default=10.0, help="Per-request timeout in seconds")
    parser.add_argument("--max-llm-cases", type=int, default=5, help="Extra LLM cases per operation")
    parser.add_argument("--no-provision", action="store_true",
                        help="Don't create resources via POST before the run; use spec examples for path ids")
    parser.add_argument("--fail-on-failure", action="store_true", help="Exit 1 if any test fails (for CI)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    headers = {}
    for h in args.header:
        if ":" not in h:
            parser.error(f"Invalid --header {h!r}, expected 'Name: value'")
        name, value = h.split(":", 1)
        headers[name.strip()] = value.strip()

    print("\n  API Testing Agent\n")
    out = run_pipeline(RunConfig(spec=args.spec, base_url=args.base_url, output_dir=args.out,
                                 use_llm=not args.no_llm, headers=headers, timeout=args.timeout,
                                 max_llm_cases_per_operation=args.max_llm_cases,
                                 provision=not args.no_provision))
    s = out["report"]["summary"]
    print(f"\n  {s['passed']}/{s['total']} passed ({s['pass_rate']}%), {s['failed']} failed, "
          f"{s['edge_cases']} uncovered edge cases\n")
    return 1 if args.fail_on_failure and s["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
