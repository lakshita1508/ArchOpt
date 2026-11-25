"""ArchOpt FastAPI application.  Run from the backend/ folder:  uvicorn app.main:app --host 127.0.0.1 --port 8000"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import analysis, auth, dashboard, layouts, optimization, projects, rooms
from .core.config import CORS_ORIGINS
from .database.session import SessionLocal, init_db
from .services.engine_runner import engine_status
from .services.seed import seed_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    st = engine_status()
    print("ArchOpt engine:", "AVAILABLE " + str(st["version"]) if st["available"] else "NOT AVAILABLE -> " + st["detail"])
    yield


app = FastAPI(title="ArchOpt API", version="1.0.0", lifespan=lifespan,
              description="Intelligent Architectural Space & Circulation Optimizer - REST API (FastAPI + SQLite + C++20 engine).")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
for r in (auth.router, projects.router, rooms.router, optimization.router, layouts.router, analysis.router, dashboard.router):
    app.include_router(r)


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}
