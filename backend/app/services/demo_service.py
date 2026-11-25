"""Predefined sample projects + precomputed verified layouts (Demo Mode data)."""
import json
from typing import Any, Dict, List, Optional

from ..core.config import DEMO_DIR


def _read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def list_samples() -> List[Dict[str, Any]]:
    out = []
    for f in sorted((DEMO_DIR / "projects").glob("*.json")):
        p = _read(f)
        lay = DEMO_DIR / "layouts" / f.name
        out.append({
            "key": p["key"], "name": p["name"], "project_type": p["projectType"], "description": p["description"],
            "plot_width": p["plot"]["width"], "plot_height": p["plot"]["height"],
            "plot_area": p["plot"]["width"] * p["plot"]["height"],
            "rooms": p["rooms"], "relationships": p["relationships"], "constraints": p.get("constraints", {}),
            "recommended_algorithm": p.get("recommendedAlgorithm", "simulated_annealing"),
            "total_required_area": sum(r["requiredArea"] for r in p["rooms"]),
            "has_demo_layouts": lay.exists(),
            "demo_layout_count": len(_read(lay)["layouts"]) if lay.exists() else 0,
        })
    return out


def get_sample(key: str) -> Optional[Dict[str, Any]]:
    f = DEMO_DIR / "projects" / f"{key}.json"
    return _read(f) if f.exists() else None


def load_demo_layouts(key: str) -> Optional[Dict[str, Any]]:
    f = DEMO_DIR / "layouts" / f"{key}.json"
    return _read(f) if f.exists() else None


def sample_to_project_in(sample: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a sample definition into the ProjectIn schema shape."""
    c = sample.get("constraints", {})
    return {
        "name": sample["name"], "project_type": sample["projectType"], "description": sample["description"],
        "plot_width": sample["plot"]["width"], "plot_height": sample["plot"]["height"],
        "entrance_side": sample["entrance"]["side"], "entrance_offset": sample["entrance"]["offset"],
        "rooms": [{"name": r["name"], "room_type": r["type"], "required_area": r["requiredArea"], "min_width": r["minWidth"],
                   "min_height": r["minHeight"], "pref_width": r.get("prefWidth", r["minWidth"]),
                   "pref_height": r.get("prefHeight", r["minHeight"]), "priority": r.get("priority", 2)} for r in sample["rooms"]],
        "relationships": [{"room_a": r["a"], "room_b": r["b"], "rel_type": r["type"], "weight": r.get("weight", 1)} for r in sample["relationships"]],
        "constraints": {"min_corridor_width": c.get("minCorridorWidth", 1.2), "max_expansion": c.get("maxExpansion", 1.5),
                        "separate_distance": c.get("separateDistance", 4.0)},
    }
