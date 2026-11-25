"""Background optimisation jobs with live engine + Demo-Mode fallback."""
import datetime as dt
import json, threading, uuid
from typing import Any, Dict, List

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database.session import SessionLocal
from ..models.models import Layout, OptimizationJob, Project
from . import demo_service
from .engine_runner import EngineCancelled, EngineError, EngineUnavailable, cancelled, run_engine
from .layout_service import save_layout
from .project_service import engine_input, matches_sample

DEMO_NOTICE = ("Demo Mode: Displaying predefined, verified sample optimization results because the live optimization "
               "engine is currently unavailable.")


def suggest_samples(p: Project) -> List[Dict[str, Any]]:
    out = []
    for s in demo_service.list_samples():
        score = (s["project_type"] == p.project_type) * 2 + (abs(s["plot_area"] - p.plot_width * p.plot_height) < 0.35 * s["plot_area"])
        out.append((score, {"key": s["key"], "name": s["name"], "project_type": s["project_type"],
                            "plot": f'{s["plot_width"]} x {s["plot_height"]} m'}))
    out.sort(key=lambda t: -t[0])
    return [o for _, o in out[:2]]


def start_job(db: Session, p: Project, req: Dict[str, Any]) -> OptimizationJob:
    job = OptimizationJob(id=str(uuid.uuid4()), project_id=p.id, algorithm=req["algorithm"], params_json=json.dumps(req), status="queued")
    db.add(job)
    db.commit()
    threading.Thread(target=_worker, args=(job.id, p.id, req), daemon=True).start()
    return job


def _finish(db: Session, job: OptimizationJob, status: str, message: str, mode: str = "none", reasons=None) -> None:
    job.status, job.message, job.mode = status, message, mode
    job.reasons_json = json.dumps(reasons or [])
    job.finished_at = dt.datetime.utcnow()
    db.commit()


def _replace_generated(db: Session, project_id: int, keep_job: str) -> None:
    for l in db.query(Layout).filter(Layout.project_id == project_id, Layout.source.in_(["live", "demo"]), or_(Layout.job_id.is_(None), Layout.job_id != keep_job)).all():
        db.delete(l)
    db.flush()


def _worker(job_id: str, project_id: int, req: Dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        job = db.get(OptimizationJob, job_id)
        p = db.get(Project, project_id)
        if not job or not p:
            return
        job.status, job.started_at = "running", dt.datetime.utcnow()
        db.commit()
        payload = engine_input(p)
        payload["options"] = {"algorithm": req["algorithm"], "candidates": req["candidates"], "maxIterations": req["max_iterations"],
                              "seed": req["seed"], "priority": req["priority"], "weights": req["weights"]}
        try:
            res = run_engine("optimize", payload, job_id=job_id)
        except EngineCancelled:
            _finish(db, job, "cancelled", "Optimisation was cancelled.")
            return
        except (EngineUnavailable, EngineError) as exc:
            if cancelled(job_id):
                _finish(db, job, "cancelled", "Optimisation was cancelled.")
                return
            _fallback(db, job, p, req, str(exc))
            return

        job.candidates_evaluated = int(res.get("candidatesEvaluated", 0))
        job.feasible_found = int(res.get("feasibleFound", 0))
        job.execution_ms = float(res.get("executionMs", 0))
        job.best_cost = res.get("bestCost") if res.get("layouts") else None
        status = res.get("status")
        if status == "success" and res.get("layouts"):
            if req.get("replace_existing", True):
                _replace_generated(db, p.id, job_id)
            for k, lay in enumerate(res["layouts"], 1):
                save_layout(db, p.id, job_id, f"L{k}", "live", req["algorithm"], lay)
            _finish(db, job, "completed", f"Live optimisation finished: {len(res['layouts'])} feasible layouts found.", "live")
        elif status == "infeasible":
            _finish(db, job, "infeasible", "No feasible layout could be generated.", "none", res.get("reasons", []))
        else:
            _finish(db, job, "failed", "The engine rejected the request.", "none", res.get("reasons", []))
    except Exception as exc:  # never leave a job stuck in 'running'
        db.rollback()
        job = db.get(OptimizationJob, job_id)
        if job:
            _finish(db, job, "failed", f"Unexpected error: {exc}", "none")
    finally:
        db.close()


def _fallback(db: Session, job: OptimizationJob, p: Project, req: Dict[str, Any], engine_error: str) -> None:
    sample = demo_service.get_sample(p.sample_key) if p.sample_key else None
    demo = demo_service.load_demo_layouts(p.sample_key) if sample else None
    if sample and demo and matches_sample(p, sample):
        _replace_generated(db, p.id, job.id)
        for k, lay in enumerate(demo["layouts"], 1):
            save_layout(db, p.id, job.id, f"L{k}", "demo", demo.get("algorithm", ""), lay)
        job.candidates_evaluated, job.feasible_found, job.execution_ms, job.best_cost = 0, 0, 0.0, None
        _finish(db, job, "completed", DEMO_NOTICE, "demo", [f"Engine error: {engine_error}"])
        return
    job.reasons_json = json.dumps([f"Engine error: {engine_error}"])
    reason = ("Live optimisation is unavailable and this project has no matching predefined results."
              if not p.sample_key else "Live optimisation is unavailable and the project no longer matches its predefined sample.")
    _finish(db, job, "failed", reason + " Build the C++ engine (scripts\\build_engine.bat) or load a compatible sample project.",
            "none", [f"Engine error: {engine_error}"])


def job_out(db: Session, job: OptimizationJob, p: Project) -> Dict[str, Any]:
    ids = [l.id for l in db.query(Layout).filter(Layout.job_id == job.id).order_by(Layout.id).all()]
    suggested = suggest_samples(p) if (job.status == "failed" and not p.sample_key) else []
    return {"id": job.id, "project_id": job.project_id, "algorithm": job.algorithm, "status": job.status, "mode": job.mode,
            "message": job.message or "", "reasons": json.loads(job.reasons_json or "[]"),
            "candidates_evaluated": job.candidates_evaluated or 0, "feasible_found": job.feasible_found or 0,
            "execution_ms": job.execution_ms or 0.0, "best_cost": job.best_cost, "created_at": job.created_at.isoformat(),
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None, "layout_ids": ids,
            "suggested_samples": suggested}
