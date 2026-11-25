"""Project helpers: validation of requirements, DB <-> schema conversion, engine input construction."""
import math
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from ..models.models import Constraint, Layout, OptimizationJob, Project, Relationship, Room
from ..schemas.schemas import ConstraintsIn, ProjectIn

CONSTRAINT_KEYS = {  # snake_case (DB / API)  ->  camelCase (engine)
    "min_corridor_width": "minCorridorWidth", "door_width": "doorWidth", "area_tolerance": "areaTolerance",
    "max_aspect": "maxAspect", "separate_distance": "separateDistance", "max_expansion": "maxExpansion",
    "open_space_ratio": "openSpaceRatio", "require_connectivity": "requireConnectivity",
}


def validate_requirements(data: ProjectIn) -> List[str]:
    """Reject impossible requirements before a project is stored (mirrors the engine pre-check)."""
    errors: List[str] = []
    if not data.rooms:
        errors.append("Add at least one room.")
    names = [r.name for r in data.rooms]
    for n in set(names):
        if names.count(n) > 1:
            errors.append(f"Duplicate room name: {n}")
    known = set(names) | {"ENTRANCE"}
    for rel in data.relationships:
        if rel.room_a not in known or rel.room_b not in known:
            errors.append(f"Relationship '{rel.room_a} / {rel.room_b}' refers to an unknown room.")
        if rel.room_a == rel.room_b:
            errors.append(f"Relationship cannot link '{rel.room_a}' to itself.")
    tol = data.constraints.area_tolerance
    need = 0.0
    for r in data.rooms:
        fits = (r.min_width <= data.plot_width and r.min_height <= data.plot_height) or \
               (r.min_height <= data.plot_width and r.min_width <= data.plot_height)
        if not fits:
            errors.append(f"{r.name}: minimum size {r.min_width} x {r.min_height} m does not fit in the {data.plot_width} x {data.plot_height} m plot.")
        need += max(r.required_area * (1 - tol), r.min_width * r.min_height)
    avail = data.plot_width * data.plot_height * (1 - data.constraints.open_space_ratio)
    if need > avail + 1e-9:
        errors.append(f"Total required room area ({need:.1f} m2) exceeds the available plot area ({avail:.1f} m2): the requirements are impossible.")
    return errors


def constraints_dict(p: Project) -> Dict[str, float]:
    base = ConstraintsIn().model_dump()
    for c in p.constraints:
        if c.key in base:
            base[c.key] = bool(c.value) if isinstance(base[c.key], bool) else c.value
    return base


def apply_project_data(db: Session, p: Project, data: ProjectIn) -> None:
    p.name, p.project_type, p.description = data.name.strip(), data.project_type, data.description
    p.plot_width, p.plot_height = data.plot_width, data.plot_height
    p.entrance_side, p.entrance_offset = data.entrance_side, data.entrance_offset
    p.rooms.clear()
    p.relationships.clear()
    p.constraints.clear()
    db.flush()
    for r in data.rooms:
        p.rooms.append(Room(name=r.name, room_type=r.room_type, required_area=r.required_area, min_width=r.min_width,
                            min_height=r.min_height, pref_width=r.pref_width or r.min_width,
                            pref_height=r.pref_height or r.min_height, priority=r.priority))
    for rel in data.relationships:
        p.relationships.append(Relationship(room_a=rel.room_a, room_b=rel.room_b, rel_type=rel.rel_type, weight=rel.weight))
    for k, v in data.constraints.model_dump().items():
        p.constraints.append(Constraint(key=k, value=float(v)))


def project_out(p: Project) -> Dict[str, Any]:
    return {
        "id": p.id, "name": p.name, "project_type": p.project_type, "description": p.description or "",
        "plot_width": p.plot_width, "plot_height": p.plot_height, "entrance_side": p.entrance_side,
        "entrance_offset": p.entrance_offset, "sample_key": p.sample_key, "created_at": p.created_at.isoformat(),
        "rooms": [{"id": r.id, "name": r.name, "room_type": r.room_type, "required_area": r.required_area,
                   "min_width": r.min_width, "min_height": r.min_height, "pref_width": r.pref_width or 0,
                   "pref_height": r.pref_height or 0, "priority": r.priority or 2} for r in p.rooms],
        "relationships": [{"id": x.id, "room_a": x.room_a, "room_b": x.room_b, "rel_type": x.rel_type, "weight": x.weight} for x in p.relationships],
        "constraints": constraints_dict(p),
    }


def project_summary(db: Session, p: Project) -> Dict[str, Any]:
    layouts = db.query(Layout).filter(Layout.project_id == p.id).all()
    jobs = db.query(OptimizationJob).filter(OptimizationJob.project_id == p.id).order_by(OptimizationJob.created_at.desc()).all()
    status = "not_optimized"
    last_mode = None
    if jobs:
        j = jobs[0]
        status = {"queued": "running", "running": "running", "completed": "optimized"}.get(j.status, "failed")
        if j.status == "cancelled":
            status = "not_optimized"
        last_mode = j.mode if j.status == "completed" else None
    if status == "failed" and layouts:
        status = "optimized"
    return {"id": p.id, "name": p.name, "project_type": p.project_type, "description": p.description or "",
            "plot_width": p.plot_width, "plot_height": p.plot_height, "plot_area": round(p.plot_width * p.plot_height, 2),
            "room_count": len(p.rooms), "layout_count": len(layouts), "sample_key": p.sample_key,
            "created_at": p.created_at.isoformat(), "optimization_status": status, "last_result_mode": last_mode}


def engine_input(p: Project) -> Dict[str, Any]:
    c = constraints_dict(p)
    return {
        "plot": {"width": p.plot_width, "height": p.plot_height},
        "entrance": {"side": p.entrance_side, "offset": p.entrance_offset},
        "rooms": [{"name": r.name, "type": r.room_type, "requiredArea": r.required_area, "minWidth": r.min_width,
                   "minHeight": r.min_height, "prefWidth": r.pref_width or 0, "prefHeight": r.pref_height or 0,
                   "priority": r.priority or 2} for r in p.rooms],
        "relationships": [{"a": x.room_a, "b": x.room_b, "type": x.rel_type, "weight": x.weight} for x in p.relationships],
        "constraints": {CONSTRAINT_KEYS[k]: v for k, v in c.items()},
    }


def matches_sample(p: Project, sample: Dict[str, Any]) -> bool:
    """True only if the stored project still has exactly the sample's plot/rooms (so demo layouts are truthful)."""
    if not sample or abs(p.plot_width - sample["plot"]["width"]) > 1e-9 or abs(p.plot_height - sample["plot"]["height"]) > 1e-9:
        return False
    if p.entrance_side != sample["entrance"]["side"] or abs(p.entrance_offset - sample["entrance"]["offset"]) > 1e-9:
        return False
    mine = {r.name: (round(r.required_area, 6), round(r.min_width, 6), round(r.min_height, 6)) for r in p.rooms}
    theirs = {r["name"]: (round(r["requiredArea"], 6), round(r["minWidth"], 6), round(r["minHeight"], 6)) for r in sample["rooms"]}
    return mine == theirs


def shelf_pack(p: Project) -> List[Dict[str, Any]]:
    """Simple starting arrangement for the manual editor (may be invalid; the validator will say so)."""
    snap = lambda v: round(v * 10) / 10.0
    rooms = sorted(p.rooms, key=lambda r: -r.required_area)
    x = y = row_h = 0.0
    out = []
    for r in rooms:
        w = max(r.min_width, math.sqrt(r.required_area))
        h = max(r.min_height, r.required_area / w)
        w, h = snap(w + 0.05), snap(h + 0.05)
        if x + w > p.plot_width + 1e-9 and x > 0:
            x, y, row_h = 0.0, y + row_h, 0.0
        out.append({"name": r.name, "type": r.room_type, "x": snap(x), "y": snap(y), "width": w, "height": h, "isFree": False})
        x += w
        row_h = max(row_h, h)
    return out
