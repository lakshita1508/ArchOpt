from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database.session import get_db
from ..models.models import Layout, LayoutMetric, OptimizationJob, Project
from ..services.project_service import project_summary
from .deps import current_user

router = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(current_user)])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    layouts = db.query(Layout).count()
    eff = [m.area_efficiency for m in db.query(LayoutMetric).all()]
    jobs = db.query(OptimizationJob).order_by(OptimizationJob.created_at.desc()).all()
    names = {p.id: p.name for p in projects}
    per_project = []
    for p in projects:
        ms = [l.metrics.area_efficiency for l in p.layouts if l.metrics]
        per_project.append({"project": p.name, "layouts": len(p.layouts), "avg_efficiency": round(sum(ms) / len(ms), 1) if ms else 0})
    by_alg = {}
    for j in jobs:
        by_alg[j.algorithm] = by_alg.get(j.algorithm, 0) + 1
    return {
        "total_projects": len(projects), "generated_layouts": layouts,
        "avg_area_efficiency": round(sum(eff) / len(eff), 1) if eff else 0,
        "completed_optimizations": sum(1 for j in jobs if j.status == "completed"),
        "recent_projects": [project_summary(db, p) for p in projects[:5]],
        "recent_activity": [{"job_id": j.id, "project_id": j.project_id, "project": names.get(j.project_id, "(deleted)"),
                             "algorithm": j.algorithm, "status": j.status, "mode": j.mode, "message": j.message,
                             "created_at": j.created_at.isoformat(), "execution_ms": j.execution_ms} for j in jobs[:8]],
        "per_project": per_project, "jobs_by_algorithm": [{"algorithm": k, "count": v} for k, v in by_alg.items()],
        "data_source": "SQLite database records",
    }
