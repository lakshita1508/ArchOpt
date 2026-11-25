"""Generate the precomputed, VERIFIED demo layouts by running the real C++ engine.

Usage (from the repository root):   python scripts/generate_demo_data.py [path/to/archopt_engine]
Every stored layout is re-validated through the engine's independent `analyze` command and through an
independent Python geometry check before it is written. Projects that cannot be verified are not written.
"""
import glob, json, os, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENGINE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "engine", "build", "archopt_engine" + (".exe" if os.name == "nt" else ""))
EPS = 1e-6

def run(cmd, payload):
    with tempfile.TemporaryDirectory() as d:
        i, o = os.path.join(d, "in.json"), os.path.join(d, "out.json")
        json.dump(payload, open(i, "w"))
        subprocess.run([ENGINE, cmd, i, o], check=True, capture_output=True)
        return json.load(open(o))

def py_geometry_ok(project, rooms):
    W, H = project["plot"]["width"], project["plot"]["height"]
    for r in rooms:
        if r["x"] < -EPS or r["y"] < -EPS or r["x"] + r["width"] > W + EPS or r["y"] + r["height"] > H + EPS:
            return False, f"{r['name']} outside plot"
    for i, a in enumerate(rooms):
        for b in rooms[i + 1:]:
            if min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"]) > EPS and \
               min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]) > EPS:
                return False, f"{a['name']} overlaps {b['name']}"
    by = {r["name"]: r for r in rooms}
    for pr in project["rooms"]:
        r = by.get(pr["name"])
        if not r: return False, f"{pr['name']} missing"
        if r["width"] * r["height"] < pr["requiredArea"] * 0.95 - EPS: return False, f"{pr['name']} area too small"
        ok = (r["width"] >= pr["minWidth"] - EPS and r["height"] >= pr["minHeight"] - EPS) or \
             (r["width"] >= pr["minHeight"] - EPS and r["height"] >= pr["minWidth"] - EPS)
        if not ok: return False, f"{pr['name']} below minimum dimensions"
    return True, ""

def main():
    os.makedirs(os.path.join(ROOT, "demo_data", "layouts"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "demo_data", "metrics"), exist_ok=True)
    version = subprocess.run([ENGINE, "version"], capture_output=True, text=True).stdout.strip()
    failures = 0
    for f in sorted(glob.glob(os.path.join(ROOT, "demo_data", "projects", "*.json"))):
        project = json.load(open(f))
        opts = {"algorithm": project.get("recommendedAlgorithm", "simulated_annealing"), "candidates": 4,
                "maxIterations": 200 if project.get("recommendedAlgorithm") == "genetic" else 6000, "seed": 42}
        res = run("optimize", {**project, "options": opts})
        verified = []
        for lay in res.get("layouts", []):
            chk = run("analyze", {**project, "layout": {"rooms": lay["rooms"]}})
            ok, why = py_geometry_ok(project, lay["rooms"])
            same = abs(chk["metrics"]["totalCost"] - lay["metrics"]["totalCost"]) < 1e-3
            if chk["metrics"]["feasible"] and ok and same and chk["metrics"]["violations"] == 0:
                lay["verified"] = True
                verified.append(lay)
            else:
                print(f"  rejected {lay['id']}: engine={chk['metrics']['feasible']} py={ok} {why} same={same}")
        if len(verified) < 3:
            print(f"!! {project['key']}: only {len(verified)} verified layouts (need >= 3) - NOT written")
            failures += 1
            continue
        for k, lay in enumerate(verified, 1): lay["id"] = f"L{k}"
        out = {"projectKey": project["key"], "generatedBy": version, "algorithm": opts["algorithm"], "seed": opts["seed"],
               "candidatesEvaluated": res["candidatesEvaluated"], "feasibleFound": res["feasibleFound"],
               "layouts": verified, "note": "Precomputed by the live C++ engine and independently verified. Used only in Demo Mode."}
        json.dump(out, open(os.path.join(ROOT, "demo_data", "layouts", project["key"] + ".json"), "w"), indent=1)
        summary = [{"id": l["id"], "totalCost": l["metrics"]["totalCost"], "areaEfficiency": l["metrics"]["areaEfficiency"],
                    "adjacencySatisfaction": l["metrics"]["adjacencySatisfaction"], "circulationScore": l["metrics"]["circulationScore"],
                    "accessibilityScore": l["metrics"]["accessibilityScore"], "violations": l["metrics"]["violations"]} for l in verified]
        json.dump({"projectKey": project["key"], "layouts": summary}, open(os.path.join(ROOT, "demo_data", "metrics", project["key"] + ".json"), "w"), indent=1)
        print(f"{project['key']}: wrote {len(verified)} verified layouts")
    sys.exit(1 if failures else 0)

main()
