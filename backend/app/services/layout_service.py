"""Layout persistence + serialisation."""
import json
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.models import Layout, LayoutMetric, Project
from .engine_runner import run_engine
from .project_service import engine_input, shelf_pack

BADGES = {"live": "LIVE RESULT", "demo": "DEMO RESULT", "manual": "MANUAL EDIT"}


def metrics_dict(m: Optional[LayoutMetric], is_valid: bool) -> Dict[str, Any]:
    if not m:
        return {}
    return {"totalCost": m.total_cost, "areaEfficiency": m.area_efficiency, "adjacencySatisfaction": m.adjacency_satisfaction,
            "circulationScore": m.circulation_score, "accessibilityScore": m.accessibility_score, "usableArea": m.usable_area,
            "circulationArea": m.circulation_area, "unusedArea": m.unused_area, "avgWalk": m.avg_walk, "maxWalk": m.max_walk,
            "violations": m.violations, "costBreakdown": json.loads(m.cost_breakdown_json or "{}"), "feasible": is_valid}


def layout_out(l: Layout) -> Dict[str, Any]:
    return {"id": l.id, "project_id": l.project_id, "job_id": l.job_id, "label": l.label, "name": l.name or l.label,
            "source": l.source, "result_badge": BADGES.get(l.source, "LIVE RESULT"), "algorithm": l.algorithm or "",
            "rooms": json.loads(l.rooms_json), "metrics": metrics_dict(l.metrics, bool(l.is_valid)),
            "validation": json.loads(l.validation_json or "[]"), "circulation": json.loads(l.circulation_json or "{}"),
            "is_valid": bool(l.is_valid), "is_selected": bool(l.is_selected), "created_at": l.created_at.isoformat()}


def _apply_engine_data(l: Layout, data: Dict[str, Any]) -> None:
    m = data["metrics"]
    l.rooms_json = json.dumps(data["rooms"])
    l.validation_json = json.dumps(data.get("validation", []))
    l.circulation_json = json.dumps(data.get("circulation", {}))
    l.is_valid = bool(m.get("feasible")) and int(m.get("violations", 0)) == 0
    row = l.metrics or LayoutMetric()
    row.total_cost, row.area_efficiency = m["totalCost"], m["areaEfficiency"]
    row.adjacency_satisfaction, row.circulation_score = m["adjacencySatisfaction"], m["circulationScore"]
    row.accessibility_score, row.usable_area = m["accessibilityScore"], m["usableArea"]
    row.circulation_area, row.unused_area = m["circulationArea"], m["unusedArea"]
    row.avg_walk, row.max_walk, row.violations = m["avgWalk"], m["maxWalk"], int(m["violations"])
    row.cost_breakdown_json = json.dumps(m.get("costBreakdown", {}))
    l.metrics = row


def save_layout(db: Session, project_id: int, job_id: Optional[str], label: str, source: str, algorithm: str,
                data: Dict[str, Any], name: str = "") -> Layout:
    l = Layout(project_id=project_id, job_id=job_id, label=label, name=name or label, source=source, algorithm=algorithm, rooms_json="[]")
    _apply_engine_data(l, data)
    db.add(l)
    db.flush()
    return l


def reanalyze(db: Session, project: Project, layout: Layout, rooms: Optional[List[Dict[str, Any]]] = None) -> Layout:
    """Run the engine's `analyze` on (possibly edited) rooms; a layout is only marked valid if the engine says so."""
    rooms = rooms if rooms is not None else json.loads(layout.rooms_json)
    payload = engine_input(project)
    payload["layout"] = {"rooms": rooms}
    data = run_engine("analyze", payload)
    if data.get("status") == "invalid_input":
        raise ValueError("; ".join(data.get("reasons", ["invalid layout"])))
    _apply_engine_data(layout, data)
    db.flush()
    return layout


def create_manual_layout(db: Session, project: Project, rooms: Optional[List[Dict[str, Any]]]) -> Layout:
    rooms = rooms if rooms else shelf_pack(project)
    n = db.query(Layout).filter(Layout.project_id == project.id, Layout.source == "manual").count() + 1
    l = Layout(project_id=project.id, label=f"M{n}", name=f"Manual layout {n}", source="manual", algorithm="manual",
               rooms_json="[]")
    db.add(l)
    db.flush()
    reanalyze(db, project, l, rooms)
    return l
