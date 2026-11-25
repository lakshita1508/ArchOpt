"""Service-level tests (no web server needed). Engine-dependent tests are skipped if the engine is not built."""
import json
from pathlib import Path

import pytest

from app.core.config import DEMO_DIR, find_engine_path
from app.core.security import hash_password, make_token, verify_password, verify_token
from app.schemas.schemas import ProjectIn
from app.services import demo_service, export
from app.services.engine_runner import EngineUnavailable, run_engine
from app.services.project_service import matches_sample, shelf_pack, validate_requirements

needs_engine = pytest.mark.skipif(find_engine_path() is None, reason="C++ engine not built")


def sample_in(key="community-centre"):
    return ProjectIn(**demo_service.sample_to_project_in(demo_service.get_sample(key)))


def test_password_and_token():
    h = hash_password("12345678")
    assert verify_password("12345678", h) and not verify_password("wrong", h)
    t = make_token("vikramgupta")
    assert verify_token(t) == "vikramgupta"
    assert verify_token(t + "x") is None and verify_token("garbage") is None


def test_all_samples_valid_and_have_three_verified_layouts():
    keys = [s["key"] for s in demo_service.list_samples()]
    assert len(keys) >= 4
    for k in keys:
        assert validate_requirements(sample_in(k)) == []
        lays = demo_service.load_demo_layouts(k)["layouts"]
        assert len(lays) >= 3
        for l in lays:
            assert l["verified"] is True and l["metrics"]["feasible"] and l["metrics"]["violations"] == 0


def test_impossible_requirements_rejected():
    d = sample_in()
    d.plot_width, d.plot_height = 10, 10
    errs = validate_requirements(d)
    assert any("impossible" in e for e in errs)
    d2 = sample_in()
    d2.rooms[0].name = d2.rooms[1].name
    assert any("Duplicate" in e for e in validate_requirements(d2))
    d3 = sample_in()
    d3.relationships[0].room_b = "Nope"
    assert any("unknown room" in e for e in validate_requirements(d3))


def test_shelf_pack_returns_all_rooms():
    class R:  # lightweight stand-ins for ORM rows
        def __init__(s, n, a): s.name, s.room_type, s.required_area, s.min_width, s.min_height = n, "Office", a, 2, 2
    class P: plot_width, plot_height, rooms = 20, 20, [R("A", 30), R("B", 20), R("C", 10)]
    out = shelf_pack(P)
    assert {r["name"] for r in out} == {"A", "B", "C"}


def test_exports_render():
    s = demo_service.get_sample("office-workspace")
    lay = demo_service.load_demo_layouts("office-workspace")["layouts"][0]
    project = {"name": s["name"], "project_type": s["projectType"], "plot_width": 30, "plot_height": 20}
    layout = {"id": 1, "label": "L1", "name": "L1", "algorithm": "x", "result_badge": "DEMO RESULT", "source": "demo", "rooms": lay["rooms"],
              "metrics": lay["metrics"], "validation": lay["validation"], "circulation": lay["circulation"], "is_valid": True}
    svg = export.layout_to_svg(project, layout)
    assert svg.startswith("<svg") and "DEMO RESULT" in svg and "Reception" in svg
    assert export.layout_to_pdf(project, layout)[:5] == b"%PDF-"
    rep = export.metrics_report(project, layout)
    assert rep["layout"]["result_badge"] == "DEMO RESULT" and "not newly calculated" in rep["note"]


@needs_engine
def test_engine_runner_optimize_and_analyze_roundtrip():
    s = demo_service.get_sample("community-centre")
    res = run_engine("optimize", {**s, "options": {"algorithm": "simulated_annealing", "candidates": 3, "maxIterations": 3000, "seed": 5}})
    assert res["status"] == "success" and len(res["layouts"]) >= 1
    lay = res["layouts"][0]
    chk = run_engine("analyze", {**s, "layout": {"rooms": lay["rooms"]}})
    assert chk["metrics"]["feasible"] is True
    # break the layout: move a room so that it overlaps -> engine must flag it
    broken = json.loads(json.dumps(lay["rooms"]))
    broken[0]["x"], broken[0]["y"] = broken[1]["x"], broken[1]["y"]
    bad = run_engine("analyze", {**s, "layout": {"rooms": broken}})
    assert bad["metrics"]["feasible"] is False and bad["metrics"]["violations"] > 0
    assert any(c["id"] == "overlap" and c["status"] == "failed" for c in bad["validation"])


@needs_engine
def test_engine_reports_infeasible_with_reason():
    s = demo_service.get_sample("community-centre")
    s = {**s, "plot": {"width": 10, "height": 10}}
    res = run_engine("optimize", {**s, "options": {"algorithm": "genetic", "maxIterations": 20}})
    assert res["status"] == "infeasible" and res["reasons"] and res["layouts"] == []


def test_engine_unavailable_is_reported(monkeypatch):
    import app.services.engine_runner as er
    monkeypatch.setattr(er, "find_engine_path", lambda: None)
    with pytest.raises(EngineUnavailable):
        er.run_engine("optimize", {})
    assert er.engine_status()["available"] is False
