"""
Lightweight run-history logger. Each pipeline stage (backfill, feature_pipeline,
train_pipeline) calls `log_run_start` / `log_run_end` around its work, so the
web dashboard's "Pipeline Runs" view shows a REAL history instead of invented
demo data. Stored as a simple JSON array under ./data/pipeline_runs.json.
"""
import json
import time
import uuid
from datetime import datetime, timezone

import config

RUNS_FILE = config.DATA_DIR / "pipeline_runs.json"
MAX_RUNS_KEPT = 200


def _read_runs() -> list:
    if not RUNS_FILE.exists():
        return []
    try:
        return json.loads(RUNS_FILE.read_text())
    except Exception:  # noqa: BLE001
        return []


def _write_runs(runs: list):
    runs = runs[-MAX_RUNS_KEPT:]
    RUNS_FILE.write_text(json.dumps(runs, indent=2))


def log_run_start(name: str, run_type: str, triggered_by: str = "manual") -> dict:
    run = {
        "id": f"run-{uuid.uuid4().hex[:8]}",
        "name": name,
        "type": run_type,  # "feature_ingestion" | "model_training" | "backfill"
        "status": "running",
        "startTime": datetime.now(timezone.utc).isoformat(),
        "_start_perf": time.perf_counter(),
        "durationSeconds": 0,
        "recordsProcessed": 0,
        "triggeredBy": triggered_by,
        "logs": [f"Started: {name}"],
    }
    runs = _read_runs()
    runs.append(run)
    _write_runs(runs)
    return run


def log_run_end(run: dict, status: str = "success", records_processed: int = 0, extra_logs=None):
    duration = round(time.perf_counter() - run.pop("_start_perf", time.perf_counter()), 2)
    run["status"] = status
    run["durationSeconds"] = duration
    run["recordsProcessed"] = records_processed
    if extra_logs:
        run["logs"].extend(extra_logs)
    run["logs"].append(f"Finished with status={status} in {duration}s")

    runs = _read_runs()
    for i, r in enumerate(runs):
        if r["id"] == run["id"]:
            runs[i] = run
            break
    else:
        runs.append(run)
    _write_runs(runs)
    return run


def get_runs(limit: int = 50) -> list:
    runs = _read_runs()
    return list(reversed(runs))[:limit]
