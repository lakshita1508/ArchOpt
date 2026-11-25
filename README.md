# ArchOpt — Intelligent Architectural Space & Circulation Optimizer

ArchOpt generates and compares floor-plan layouts for a rectangular plot. You give it rooms (required area, minimum size, aspect ratio), relationships (must/prefer adjacent, must separate, prefer nearby), an entrance and rules. A **C++20 engine** searches for layouts that satisfy every hard rule and minimise travel distance; a FastAPI backend stores everything in SQLite; a Next.js frontend lets you edit, optimise, compare, analyse and export.

```
Frontend (Next.js) → FastAPI → C++ engine (subprocess + JSON) → SQLite
```

## 1. Features
Projects (create/edit/delete), four sample projects, interactive SVG floor-plan editor (drag, resize, snap, zoom, pan, live validation), three optimisation algorithms, layout comparison and ranking, circulation graph analysis, validation reports, SVG/PDF/metrics export, Settings (units, theme, default algorithm), optional AI brief assistant, login with route protection.

## 2. Credentials
`demo` / `12345678` (demo-grade auth: PBKDF2 password hash + signed bearer token; not for production).

## 3. Requirements (Windows 10/11)
| Tool | Version | Used for |
|---|---|---|
| Python | 3.10+ (added to PATH) | backend |
| Node.js + npm | 18+ | frontend |
| CMake | 3.16+ | engine build |
| C++ compiler | MinGW-w64 g++ (with mingw32-make) **or** Visual Studio Build Tools (cl.exe) | engine build |

Internet access is needed once for `pip install` and `npm install`.

## 4. Quick start
```
scripts\run_archopt.bat
```
It checks the tools, creates `backend\.venv`, installs Python and npm packages, builds the engine if missing (and runs the C++ tests), initialises the database, opens the backend and frontend in two windows and launches the browser at http://localhost:3000. If the engine cannot be built it stops and tells you why; you may then continue in demo mode (sample projects only).

Manual start: `scripts\build_engine.bat`, then `scripts\start_backend.bat` (http://127.0.0.1:8000, docs at `/docs`) and `scripts\start_frontend.bat` (http://localhost:3000). From MSVC use an *x64 Native Tools Command Prompt* for `build_engine.bat`.

Linux/macOS: `cd engine && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build`; `cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && python -m uvicorn app.main:app --port 8000`; `cd frontend && npm install && npm run dev`.

## 5. Project structure
```
engine/      C++20 core: include/archopt/*.hpp, src/*.cpp, tests/test_engine.cpp, CMakeLists.txt
backend/     FastAPI app: app/{api,core,database,models,schemas,services}, requirements.txt
frontend/    Next.js App Router: app/, components/, hooks/, lib/, services/, types/
demo_data/   verified sample projects, layouts, metrics (see its README)
scripts/     run_archopt.bat, start_backend.bat, start_frontend.bat, build_engine.bat,
             make_sample_projects.py, generate_demo_data.py
tests/       backend/ (pytest), frontend/ (node --test), integration/ (pytest)
.env.example optional settings
```

## 6. Pages
`/login`, `/dashboard`, `/projects`, `/projects/new`, `/projects/[id]` (+ `/edit`, `/editor`, `/optimize`, `/layouts`, `/layouts/[layoutId]`, `/circulation`, `/validation`), `/sample-projects`, `/demo-guide`, `/settings`. Project-scoped sidebar items use `/go/[section]` to pick the active project.

## 7. How the engine works
* **Representation**: a slicing-tree genome (room order, cut direction, split fractions, area bias). Splits snap to a 0.1 m grid, so rooms cannot overlap or leave the plot. If the plot is much larger than the required areas an explicit *Unallocated* free-space room is added (never silently hidden).
* **Hard constraints**: no overlap, inside plot, minimum dimensions (rotation allowed), required area (±5 %), aspect ratio, corridor width, full connectivity from the entrance, must-adjacent, must-separate, open-space ratio. **Soft**: prefer-adjacent, prefer-nearby.
* **Cost**: weighted overlap, boundary, adjacency, corridor, circulation, unused-space terms plus a hard-shortfall term.
* **Circulation**: graph of rooms + entrance. An edge exists where rooms share a wall of at least one door width (1.0 m); weight = centre → door → centre. Only transit rooms (Reception, Living Room, Dining Area, Corridor, Staircase, Open Area) can be walked through. Dijkstra gives distances from the entrance, A* the room-to-room matrix, and bottlenecks are rooms carrying the most shortest paths.
* **Algorithms**: Simulated Annealing (independent chains, Metropolis, geometric cooling), Genetic Algorithm (tournament, order crossover, mutation, elitism, stall stop, parallel fitness), Constraint-based (random sampling + greedy repair + rejection). Deterministic RNG: same seed ⇒ same result regardless of thread count.
* **CLI**: `archopt_engine optimize|analyze <in.json> <out.json>`, `archopt_engine version`; exit code 2 = invalid input (JSON with reasons).

## 8. Live vs Demo mode (important)
* **LIVE RESULT** — computed by the engine for the current project.
* **DEMO RESULT** — stored, verified sample layout. Only used when the engine is unavailable **and** the project is an unmodified sample. The app shows: *"Demo Mode: Displaying predefined, verified sample optimization results because the live optimization engine is currently unavailable."*
* **OPTIMIZATION FAILED** — shown for custom projects when the engine is missing or finds no feasible layout, with the reasons. Custom projects never get sample layouts. Nothing is faked.
* Some problems are genuinely infeasible at a given budget. Example: the Educational Building sample is hard; Simulated Annealing finds layouts but Genetic/Constraint-based may report infeasible by design at default budgets.

## 9. REST API (prefix `/api`)
Auth: `POST /auth/login`, `POST /auth/logout`. Projects: `GET/POST /projects`, `GET/PUT/DELETE /projects/{id}`; samples: `GET /samples`, `POST /samples/{key}/load`. Rooms: `GET/POST /projects/{id}/rooms`, `PUT/DELETE /rooms/{id}` (relationships and constraints are saved with the project via `PUT /projects/{id}`). Optimisation: `POST /projects/{id}/optimize`, `GET /optimization/{job_id}`, `POST /optimization/{job_id}/cancel`, `GET /projects/{id}/jobs`, `GET /system/status`. Layouts: `GET /projects/{id}/layouts`, `GET/PUT/DELETE /layouts/{id}`, `POST /projects/{id}/layouts/manual`, `POST /projects/{id}/validate-rooms`, `POST /layouts/{id}/validate`, `GET /layouts/{id}/circulation`, `GET /layouts/{id}/metrics`, `GET /layouts/{id}/export/{svg|pdf|report}`. Other: `GET /requirements/status`, `POST /requirements/parse`, `GET /dashboard`, `GET /health`. Interactive list: http://127.0.0.1:8000/docs.

## 10. Database
SQLite at `backend/archopt.db` (created on first start; delete the file to reset). Tables: users, projects, rooms, relationships, constraints, optimization_jobs, layouts, layout_metrics (foreign keys enforced, cascading deletes).

## 11. Optional AI brief assistant
Set `ANTHROPIC_API_KEY` in `.env` to let the New Project page extract rooms/requirements from a text brief. It only extracts requirements; it never produces layouts. Without a key the feature reports itself unavailable and everything else works.

## 12. Testing
```
cd engine\build && archopt_tests.exe          rem C++ (geometry, graph, evaluation, optimisers, JSON)
python -m pytest tests/backend tests/integration
cd frontend && npm test && npm run typecheck
```
Integration tests need the built engine and skip themselves otherwise.

## 13. Professor demo workflow
1. Run `scripts\run_archopt.bat`, log in with `demo` / `12345678`.
2. **Sample Projects** → load *Community Centre* → open **Floor Plan Editor**: drag/resize a room and watch live validation.
3. **Optimization** → Simulated Annealing, 4 candidates → Run. Show progress, then the **LIVE RESULT** badge.
4. **Layout Alternatives** → compare candidates and open one: rooms, door-connected adjacencies, metrics.
5. **Circulation Analysis**: graph, shortest path from entrance, bottlenecks. **Validation**: every hard constraint with pass/fail.
6. Export SVG / PDF / report.
7. Demo-mode honesty: stop the engine (rename `archopt_engine.exe`), re-run a sample → DEMO RESULT notice; run a *custom* project → OPTIMIZATION FAILED, no fake layout.
8. Change a sample's room area → it no longer matches the sample, so demo layouts are refused.

## 14. Troubleshooting
| Symptom | Fix |
|---|---|
| `cmake`/`g++` not found | install CMake and MinGW-w64, reopen the terminal |
| Engine unavailable badge | run `scripts\build_engine.bat`; check `GET /api/system/status` |
| Port 8000/3000 busy | close the other process or edit the port in the start scripts |
| Frontend cannot reach API | set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` |
| Reset data | stop backend, delete `backend\archopt.db` |
| `pip`/`npm install` fails | check internet/proxy |

## 15. Verification status of this delivery
Built and tested in a sandbox **without internet**, so some parts could not be executed there:
* **Executed and passing**: C++ engine and its 613 unit checks; engine CLI integration tests; demo-data generation with independent re-verification; backend service logic (8 tests, with the web/ORM layers stubbed); frontend helper tests (6).
* **Written and type-/syntax-checked only, never run**: the FastAPI app with SQLAlchemy, `tests/backend/test_api.py`, and the Next.js UI (checked with a stubbed `tsc`, no build, no browser).
Please run `python -m pytest tests/backend` and `npm run typecheck && npm run build` after installing; expect to fix small integration issues if any appear.
