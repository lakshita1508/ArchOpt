import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..database.session import get_db
from ..models.models import Layout, Project
from ..schemas.schemas import LayoutOut, LayoutUpdate, ManualLayoutRequest
from ..services import export
from ..services.engine_runner import EngineError, EngineUnavailable
from ..services.layout_service import create_manual_layout, layout_out, reanalyze
from ..services.project_service import project_out
from .deps import current_user, get_layout_or_404, get_project_or_404

router = APIRouter(prefix="/api", tags=["layouts"], dependencies=[Depends(current_user)])


@router.get("/projects/{project_id}/layouts", response_model=List[LayoutOut])
def list_layouts(p: Project = Depends(get_project_or_404), db: Session = Depends(get_db)):
    return [layout_out(l) for l in db.query(Layout).filter(Layout.project_id == p.id).order_by(Layout.id).all()]


@router.post("/projects/{project_id}/layouts/manual", response_model=LayoutOut, status_code=201)
def manual_layout(body: ManualLayoutRequest, p: Project = Depends(get_project_or_404), db: Session = Depends(get_db)):
    try:
        l = create_manual_layout(db, p, body.rooms)
    except (EngineUnavailable, EngineError) as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"The C++ engine is needed to validate manual layouts: {exc}")
    db.commit()
    return layout_out(l)


@router.post("/projects/{project_id}/validate-rooms")
def validate_rooms(body: ManualLayoutRequest, p: Project = Depends(get_project_or_404)):
    """Validate (without saving) the geometry currently shown in the editor, using the C++ engine."""
    from ..services.engine_runner import run_engine
    from ..services.project_service import engine_input
    if not body.rooms:
        raise HTTPException(status_code=422, detail="rooms are required")
    payload = engine_input(p)
    payload["layout"] = {"rooms": body.rooms}
    try:
        data = run_engine("analyze", payload)
    except (EngineUnavailable, EngineError) as exc:
        raise HTTPException(status_code=503, detail=f"The C++ engine is unavailable: {exc}")
    return {"is_valid": bool(data["metrics"]["feasible"]) and data["metrics"]["violations"] == 0, "metrics": data["metrics"],
            "validation": data["validation"], "circulation": data.get("circulation", {})}


@router.get("/layouts/{layout_id}", response_model=LayoutOut)
def get_layout(l: Layout = Depends(get_layout_or_404)):
    return layout_out(l)


@router.put("/layouts/{layout_id}", response_model=LayoutOut)
def update_layout(body: LayoutUpdate, l: Layout = Depends(get_layout_or_404), db: Session = Depends(get_db)):
    if body.name is not None:
        l.name = body.name.strip()[:120] or l.label
    if body.is_selected is not None:
        if body.is_selected:
            db.query(Layout).filter(Layout.project_id == l.project_id).update({Layout.is_selected: False})
        l.is_selected = body.is_selected
    if body.rooms is not None:
        p = db.get(Project, l.project_id)
        try:
            reanalyze(db, p, l, body.rooms)  # geometry re-validated by the C++ engine; invalid => is_valid False
        except (EngineUnavailable, EngineError) as exc:
            db.rollback()
            raise HTTPException(status_code=503, detail=f"Cannot validate the edited layout because the C++ engine is unavailable: {exc}")
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=422, detail=str(exc))
        if l.source != "manual":
            l.source = "manual"  # an edited generated layout is no longer a pure live/demo result
            l.name = (l.name or l.label) + " (edited)"
    db.commit()
    return layout_out(l)


@router.delete("/layouts/{layout_id}", status_code=204)
def delete_layout(l: Layout = Depends(get_layout_or_404), db: Session = Depends(get_db)):
    db.delete(l)
    db.commit()


def _ctx(l: Layout, db: Session):
    return project_out(db.get(Project, l.project_id)), layout_out(l)


@router.get("/layouts/{layout_id}/export/svg")
def export_svg(l: Layout = Depends(get_layout_or_404), db: Session = Depends(get_db)):
    p, lo = _ctx(l, db)
    return Response(export.layout_to_svg(p, lo), media_type="image/svg+xml",
                    headers={"Content-Disposition": f'attachment; filename="{p["name"]}_{l.label}.svg"'.replace(" ", "_")})


@router.get("/layouts/{layout_id}/export/pdf")
def export_pdf(l: Layout = Depends(get_layout_or_404), db: Session = Depends(get_db)):
    p, lo = _ctx(l, db)
    return Response(export.layout_to_pdf(p, lo), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{p["name"]}_{l.label}.pdf"'.replace(" ", "_")})


@router.get("/layouts/{layout_id}/export/report")
def export_report(l: Layout = Depends(get_layout_or_404), db: Session = Depends(get_db)):
    p, lo = _ctx(l, db)
    return Response(json.dumps(export.metrics_report(p, lo), indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{p["name"]}_{l.label}_metrics.json"'.replace(" ", "_")})
