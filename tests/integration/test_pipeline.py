"""Integration tests: engine CLI <-> JSON <-> stored demo data.  Run from repo root:  pytest tests/integration
(The full HTTP/SQLite path is covered by tests/backend/test_api.py, which needs FastAPI installed.)"""
import json, subprocess, sys, tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import find_engine_path  # noqa: E402

ENGINE = find_engine_path()
pytestmark = pytest.mark.skipif(ENGINE is None, reason="C++ engine not built (run scripts/build_engine.bat)")


def call(cmd, payload):
    with tempfile.TemporaryDirectory() as d:
        i, o = Path(d, "i.json"), Path(d, "o.json")
        i.write_text(json.dumps(payload))
        r = subprocess.run([str(ENGINE), cmd, str(i), str(o)], capture_output=True, text=True)
        return r.returncode, json.loads(o.read_text())


def sample(key):
    return json.loads((ROOT / "demo_data" / "projects" / f"{key}.json").read_text())


@pytest.mark.parametrize("algo,iters", [("simulated_annealing", 4000), ("genetic", 150), ("constraint_based", 1500)])
def test_engine_returns_valid_json_and_feasible_layouts(algo, iters):
    code, out = call("optimize", {**sample("community-centre"), "options": {"algorithm": algo, "candidates": 3, "maxIterations": iters, "seed": 3}})
    assert code == 0 and out["status"] == "success"
    assert out["candidatesEvaluated"] > 0 and out["executionMs"] > 0
    for lay in out["layouts"]:
        assert lay["metrics"]["feasible"] and lay["metrics"]["violations"] == 0
        assert lay["circulation"]["fullyConnected"]


def test_same_seed_same_result_regardless_of_threads():
    base = {**sample("office-workspace")}
    res = []
    for threads in (1, 4):
        _, out = call("optimize", {**base, "options": {"algorithm": "simulated_annealing", "candidates": 3, "maxIterations": 1500, "seed": 9, "threads": threads}})
        res.append([[(r["x"], r["y"], r["width"], r["height"]) for r in l["rooms"]] for l in out["layouts"]])
    assert res[0] == res[1]


def test_invalid_input_gives_meaningful_error():
    code, out = call("optimize", {"plot": {"width": 0, "height": 5}, "rooms": []})
    assert code == 2 and out["status"] == "invalid_input" and out["reasons"]


def test_impossible_requirements_report_reason():
    p = sample("community-centre"); p["plot"] = {"width": 10, "height": 10}
    _, out = call("optimize", {**p, "options": {"algorithm": "simulated_annealing", "maxIterations": 50}})
    assert out["status"] == "infeasible" and "impossible" in " ".join(out["reasons"])


def test_every_stored_demo_layout_reverifies_with_engine():
    for f in sorted((ROOT / "demo_data" / "layouts").glob("*.json")):
        key = f.stem
        stored = json.loads(f.read_text())
        assert len(stored["layouts"]) >= 3
        for lay in stored["layouts"]:
            _, chk = call("analyze", {**sample(key), "layout": {"rooms": lay["rooms"]}})
            assert chk["metrics"]["feasible"] is True and chk["metrics"]["violations"] == 0
            assert abs(chk["metrics"]["totalCost"] - lay["metrics"]["totalCost"]) < 1e-3


def test_cpp_unit_tests_binary_passes():
    exe = ENGINE.parent / ("archopt_tests.exe" if sys.platform == "win32" else "archopt_tests")
    if not exe.exists():
        pytest.skip("archopt_tests not built")
    r = subprocess.run([str(exe)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-800:]
