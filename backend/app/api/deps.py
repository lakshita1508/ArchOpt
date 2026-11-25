from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..core.security import verify_token
from ..database.session import get_db
from ..models.models import Layout, Project


def current_user(authorization: str = Header(default="")) -> str:
    token = authorization[7:] if authorization.lower().startswith("bearer ") else ""
    user = verify_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")
    return user


def get_project_or_404(project_id: int, db: Session = Depends(get_db)) -> Project:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    return p


def get_layout_or_404(layout_id: int, db: Session = Depends(get_db)) -> Layout:
    l = db.get(Layout, layout_id)
    if not l:
        raise HTTPException(status_code=404, detail=f"Layout {layout_id} not found")
    return l
