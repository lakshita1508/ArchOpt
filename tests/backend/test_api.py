"""REST API tests (need: pip install -r backend/requirements.txt). Run from repo root:  pytest tests/backend"""
import time

import pytest

from app.core.config import find_engine_path
from app.services import demo_service

needs_engine = pytest.mark.skipif(find_engine_path() is None, reason="C++ engine not built")


def new_project_payload(name="Test Plot"):
    return {"name": name, "project_type": "Office", "plot_width": 20, "plot_height": 15, "entrance_side": "south", "entrance_offset": 0.5,
            "rooms": [{"name": "Reception", "room_type": "Reception", "required_area": 20, "min_width": 3, "min_height": 3, "priority": 3},
                      {"name": "Office A", "room_type": "Office", "required_area": 25, "min_width": 4, "min_height": 4},
                      {"name": "Corridor", "room_type": "Corridor", "required_area": 25, "min_width": 1.5, "min_height": 1.5}],
            "relationships": [{"room_a": "Reception", "room_b": "ENTRANCE", "rel_type": "must_adjacent", "weight": 3}],
            "constraints": {"min_corridor_width": 1.5}}


def wait_job(client, auth, job_id, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/api/optimization/{job_id}", headers=auth).json()
        if j["status"] not in ("queued", "running"):
            return j
        time.sleep(0.3)
    raise AssertionError("job did not finish")


def test_login_errors_and_protection(client):
    assert client.post("/api/auth/login", json={"username": "demo", "password": "bad"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "", "password": ""}).status_code == 422
    assert client.get("/api/projects").status_code == 401
    assert client.get("/api/health").json() == {"status": "ok"}


def test_project_crud_and_persistence(client, auth):
    r = client.post("/api/projects", json=new_project_payload(), headers=auth)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert len(r.json()["rooms"]) == 3
    assert client.get(f"/api/projects/{pid}", headers=auth).json()["name"] == "Test Plot"
    upd = new_project_payload("Renamed")
    assert client.put(f"/api/projects/{pid}", json=upd, headers=auth).json()["name"] == "Renamed"
    summary = [p for p in client.get("/api/projects", headers=auth).json() if p["id"] == pid][0]
    assert summary["plot_area"] == 300 and summary["room_count"] == 3 and summary["layout_count"] == 0
    assert client.delete(f"/api/projects/{pid}", headers=auth).status_code == 204
    assert client.get(f"/api/projects/{pid}", headers=auth).status_code == 404


def test_validation_rejects_impossible_project(client, auth):
    bad = new_project_payload()
    bad["plot_width"], bad["plot_height"] = 5, 5
    r = client.post("/api/projects", json=bad, headers=auth)
    assert r.status_code == 422 and "impossible" in str(r.json())


def test_room_crud_and_rename_updates_relationships(client, auth):
    pid = client.post("/api/projects", json=new_project_payload("Rooms"), headers=auth).json()["id"]
    r = client.post(f"/api/projects/{pid}/rooms", json={"name": "Store", "room_type": "Storage", "required_area": 6, "min_width": 2, "min_height": 2}, headers=auth)
    assert r.status_code == 201
    assert client.post(f"/api/projects/{pid}/rooms", json={"name": "Store", "required_area": 6}, headers=auth).status_code == 409
    rid = [x for x in client.get(f"/api/projects/{pid}/rooms", headers=auth).json() if x["name"] == "Reception"][0]
    upd = client.put(f"/api/rooms/{rid['id']}", json={**{k: rid[k] for k in rid if k != 'id'}, "name": "Front Desk"}, headers=auth)
    assert upd.status_code == 200
    rels = client.get(f"/api/projects/{pid}", headers=auth).json()["relationships"]
    assert rels[0]["room_a"] == "Front Desk"
    assert client.delete(f"/api/rooms/{r.json()['id']}", headers=auth).status_code == 204


def test_sample_loading_creates_persistent_project(client, auth):
    assert len(client.get("/api/samples", headers=auth).json()) >= 4
    r = client.post("/api/samples/community-centre/load", headers=auth)
    assert r.status_code == 201 and len(r.json()["rooms"]) == 9
    assert client.post("/api/samples/nope/load", headers=auth).status_code == 404


@needs_engine
def test_live_optimization_saves_layouts_and_analysis(client, auth):
    pid = client.post("/api/samples/community-centre/load", headers=auth).json()["id"]
    job = client.post(f"/api/projects/{pid}/optimize", json={"algorithm": "simulated_annealing", "candidates": 3, "max_iterations": 3000, "seed": 1}, headers=auth).json()
    done = wait_job(client, auth, job["id"])
    assert done["status"] == "completed" and done["mode"] == "live" and done["candidates_evaluated"] > 0 and done["execution_ms"] > 0
    lays = client.get(f"/api/projects/{pid}/layouts", headers=auth).json()
    assert len(lays) >= 1 and all(l["result_badge"] == "LIVE RESULT" and l["is_valid"] for l in lays)
    lid = lays[0]["id"]
    assert client.post(f"/api/layouts/{lid}/validate", headers=auth).json()["is_valid"] is True
    circ = client.get(f"/api/layouts/{lid}/circulation", headers=auth).json()["circulation"]
    assert circ["fullyConnected"] and circ["paths"]
    assert client.get(f"/api/layouts/{lid}/metrics", headers=auth).json()["metrics"]["areaEfficiency"] > 0
    assert client.get(f"/api/layouts/{lid}/export/pdf", headers=auth).content[:5] == b"%PDF-"
    assert client.get(f"/api/layouts/{lid}/export/svg", headers=auth).text.startswith("<svg")
    # editing: overlapping rooms must NOT be saved as valid
    rooms = lays[0]["rooms"]
    rooms[0]["x"], rooms[0]["y"] = rooms[1]["x"], rooms[1]["y"]
    upd = client.put(f"/api/layouts/{lid}", json={"rooms": rooms}, headers=auth).json()
    assert upd["is_valid"] is False and upd["source"] == "manual"
    assert client.delete(f"/api/layouts/{lid}", headers=auth).status_code == 204


def test_demo_fallback_for_samples_and_error_for_custom(client, auth, monkeypatch):
    import app.services.engine_runner as er
    monkeypatch.setattr(er, "find_engine_path", lambda: None)  # simulate a missing/failed engine
    pid = client.post("/api/samples/office-workspace/load", headers=auth).json()["id"]
    job = wait_job(client, auth, client.post(f"/api/projects/{pid}/optimize", json={}, headers=auth).json()["id"])
    assert job["status"] == "completed" and job["mode"] == "demo" and job["message"].startswith("Demo Mode:")
    assert job["candidates_evaluated"] == 0  # never claims the demo results were newly calculated
    lays = client.get(f"/api/projects/{pid}/layouts", headers=auth).json()
    assert len(lays) >= 3 and all(l["result_badge"] == "DEMO RESULT" for l in lays)
    # custom project: must never receive sample layouts
    cid = client.post("/api/projects", json=new_project_payload("Custom"), headers=auth).json()["id"]
    cj = wait_job(client, auth, client.post(f"/api/projects/{cid}/optimize", json={}, headers=auth).json()["id"])
    assert cj["status"] == "failed" and cj["mode"] == "none" and cj["suggested_samples"]
    assert client.get(f"/api/projects/{cid}/layouts", headers=auth).json() == []


def test_ai_brief_unavailable_without_key(client, auth, monkeypatch):
    import app.services.ai_brief as ai
    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "")
    assert client.get("/api/requirements/status", headers=auth).json() == {"available": False}
    r = client.post("/api/requirements/parse", json={"brief": "Design a community centre on a 30m x 20m plot."}, headers=auth)
    assert r.status_code == 503
