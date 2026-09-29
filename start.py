"""
Start everything for local development with one command:

    python start.py             # sample API :8001 + backend :8000 + frontend :3000
    python start.py --no-sample # skip the demo API

Ctrl+C stops all processes. Works on Windows, macOS and Linux.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-sample", action="store_true", help="don't start the demo API on :8001")
    args = parser.parse_args()

    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        sys.exit("npm not found. Install Node.js 18.18+ (https://nodejs.org).")
    if not (FRONTEND / "node_modules").exists():
        print("Installing frontend dependencies (first run)...")
        subprocess.run([npm, "install"], cwd=FRONTEND, check=True)

    py = sys.executable
    procs: list[tuple[str, subprocess.Popen]] = []
    if not args.no_sample:
        procs.append(("sample API :8001", subprocess.Popen(
            [py, "-m", "uvicorn", "sample_api.main:app", "--port", "8001", "--log-level", "warning"], cwd=BACKEND)))
    procs.append(("backend    :8000", subprocess.Popen(
        [py, "-m", "uvicorn", "app.main:app", "--port", "8000", "--log-level", "warning"], cwd=BACKEND)))
    procs.append(("frontend   :3000", subprocess.Popen(
        [npm, "run", "dev"], cwd=FRONTEND, env={**os.environ, "NEXT_TELEMETRY_DISABLED": "1"})))

    print("\n  API Testing Agent")
    for name, _ in procs:
        print(f"   - {name}")
    print("\n  Open http://localhost:3000   (Ctrl+C to stop)\n")

    try:
        while all(p.poll() is None for _, p in procs):
            time.sleep(0.5)
        for name, p in procs:
            if p.poll() is not None:
                print(f"\n  {name.strip()} exited with code {p.returncode}; stopping the rest.")
    except KeyboardInterrupt:
        print("\n  Stopping...")
    finally:
        for _, p in procs:
            if p.poll() is None:
                p.terminate()
        for _, p in procs:
            try:
                p.wait(timeout=8)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    main()
