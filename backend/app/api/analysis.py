import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database.session import get_db
from ..models.models import Layout, Project
from ..schemas.schemas import BriefRequest
from ..services import ai_brief
from ..services.engine_runner import EngineError, EngineUnavailable
from ..services.layout_service import layout_out, reanalyze
from .deps import current_user, get_layout_or_404

router = APIRouter(prefix="/api", tags=["analysis"], dependencies=[Depends(current_user)])


@router.post("/layouts/{layout_id}/validate")
def validate_layout(l: Layout = Depends(get_layout_or_404), db: Session = Depends(get_db)):
    """Re-run geometry validation. Uses the live engine; if unavailable, returns the stored report (clearly flagged)."""
    p = db.get(Project, l.project_id)
    try:
        reanalyze(db, p, l)
        db.commit()
        stale = False
    except (EngineUnavailable, EngineError) as exc:
        db.rollback()
        if l.source != "demo":
            raise HTTPException(status_code=503, detail=f"The C++ engine is unavailable: {exc}")
        stale = True  # demo layouts carry saved validation reports
    out = layout_out(l)
    return {"layout_id": l.id, "is_valid": out["is_valid"], "validation": out["validation"], "metrics": out["metrics"],
            "result_badge": out["result_badge"], "from_saved_report": stale}


@router.get("/layouts/{layout_id}/circulation")
def circulation(l: Layout = Depends(get_layout_or_404)):
    c = json.loads(l.circulation_json or "{}")
    if not c:
        raise HTTPException(status_code=404, detail="No circulation analysis stored for this layout. Validate it first.")
    return {"layout_id": l.id, "result_badge": layout_out(l)["result_badge"], "rooms": json.loads(l.rooms_json), "circulation": c}


@router.get("/layouts/{layout_id}/metrics")
def metrics(l: Layout = Depends(get_layout_or_404)):
    o = layout_out(l)
    return {"layout_id": l.id, "result_badge": o["result_badge"], "is_valid": o["is_valid"], "metrics": o["metrics"]}


@router.get("/requirements/status")
def parse_status():
    return {"available": ai_brief.ai_available()}


@router.post("/requirements/parse")
def parse_requirements(body: BriefRequest):
    try:
        return {"requirements": ai_brief.parse_brief(body.brief), "note": "Review and edit before creating the project."}
    except ai_brief.AIUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
