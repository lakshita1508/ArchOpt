# demo_data

Pre-computed, **verified** sample optimisation results used only by the app's *Demo / fallback mode*.

| Folder | Contents |
|---|---|
| `projects/` | The four sample project definitions (rooms, relationships, constraints, entrance). |
| `layouts/` | 4 layouts per sample, produced by the real C++ engine. |
| `metrics/` | Metrics and circulation data for each stored layout. |

How they were made: `python scripts/make_sample_projects.py` writes `projects/`; `python scripts/generate_demo_data.py` runs the engine, then re-checks every layout with the engine's `analyze` command **and** an independent Python geometry check before writing it. Layouts that fail are never stored.

Rules the app enforces:
* Demo results are shown only for sample projects whose requirements are unchanged.
* They are always labelled **DEMO RESULT** and never described as newly calculated.
* Custom projects never receive sample layouts.

Regenerate (needs the built engine): `python scripts/generate_demo_data.py`.
