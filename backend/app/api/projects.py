from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database.session import get_db
from ..models.models import Project
from ..schemas.schemas import ProjectIn, ProjectOut, ProjectSummary
from ..services import demo_service
from ..services.project_service import apply_project_data, project_out, project_summary, validate_requirements
from .deps import current_user, get_project_or_404

router = APIRouter(prefix="/api", tags=["projects"], dependencies=[Depends(current_user)])


def _validated(data: ProjectIn) -> None:
    errors = validate_requirements(data)
    if errors:
        raise HTTPException(status_code=422, detail={"message": "Project requirements are invalid.", "errors": errors})


@router.get("/projects", response_model=List[ProjectSummary])
def list_projects(db: Session = Depends(get_db)):
    return [project_summary(db, p) for p in db.query(Project).order_by(Project.created_at.desc()).all()]


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(data: ProjectIn, db: Session = Depends(get_db)):
    _validated(data)
    p = Project(name=data.name, plot_width=data.plot_width, plot_height=data.plot_height)
    db.add(p)
    apply_project_data(db, p, data)
    db.commit()
    return project_out(p)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(p: Project = Depends(get_project_or_404)):
    return project_out(p)


@router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(data: ProjectIn, p: Project = Depends(get_project_or_404), db: Session = Depends(get_db)):
    _validated(data)
    apply_project_data(db, p, data)
    db.commit()
    return project_out(p)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(p: Project = Depends(get_project_or_404), db: Session = Depends(get_db)):
    db.delete(p)  # cascades to rooms, relationships, constraints, jobs, layouts, metrics
    db.commit()


@router.get("/samples")
def samples():
    return demo_service.list_samples()


@router.post("/samples/{key}/load", response_model=ProjectOut, status_code=201)
def load_sample(key: str, db: Session = Depends(get_db)):
    sample = demo_service.get_sample(key)
    if not sample:
        raise HTTPException(status_code=404, detail="Unknown sample project")
    data = ProjectIn(**demo_service.sample_to_project_in(sample))
    _validated(data)
    existing = db.query(Project).filter(Project.sample_key == key).count()
    p = Project(name=data.name if not existing else f"{data.name} ({existing + 1})", plot_width=data.plot_width,
                plot_height=data.plot_height, sample_key=key)
    db.add(p)
    apply_project_data(db, p, data)
    p.name = data.name if not existing else f"{data.name} ({existing + 1})"
    db.commit()
    return project_out(p)
