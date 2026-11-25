from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database.session import get_db
from ..models.models import OptimizationJob, Project
from ..schemas.schemas import JobOut, OptimizeRequest, ProjectIn
from ..services import optimization_service as svc
from ..services.engine_runner import cancel_engine, engine_status
from ..services.project_service import project_out, validate_requirements
from .deps import current_user, get_project_or_404

router = APIRouter(prefix="/api", tags=["optimization"], dependencies=[Depends(current_user)])


@router.post("/projects/{project_id}/optimize", response_model=JobOut, status_code=202)
def optimize(body: OptimizeRequest, p: Project = Depends(get_project_or_404), db: Session = Depends(get_db)):
    errors = validate_requirements(ProjectIn(**{k: v for k, v in project_out(p).items() if k not in ("id", "created_at", "sample_key")}))
    if errors:
        raise HTTPException(status_code=422, detail={"message": "Project requirements are invalid; fix them before optimising.", "errors": errors})
    job = svc.start_job(db, p, body.model_dump())
    return svc.job_out(db, job, p)


@router.get("/optimization/{job_id}", response_model=JobOut)
def job_status(job_id: str, db: Session = Depends(get_db)):
    job = db.get(OptimizationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.refresh(job)
    return svc.job_out(db, job, db.get(Project, job.project_id))


@router.post("/optimization/{job_id}/cancel", response_model=JobOut)
def cancel(job_id: str, db: Session = Depends(get_db)):
    job = db.get(OptimizationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in ("queued", "running"):
        cancel_engine(job_id)
    db.refresh(job)
    return svc.job_out(db, job, db.get(Project, job.project_id))


@router.get("/projects/{project_id}/jobs")
def project_jobs(p: Project = Depends(get_project_or_404), db: Session = Depends(get_db)):
    return [svc.job_out(db, j, p) for j in sorted(p.jobs, key=lambda j: j.created_at, reverse=True)]


@router.get("/system/status")
def system_status():
    from ..services.ai_brief import ai_available
    st = engine_status()
    return {"engine": st, "ai_available": ai_available(), "database": "sqlite", "mode": "live" if st["available"] else "demo-fallback"}
