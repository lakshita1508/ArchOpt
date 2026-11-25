import os, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("ARCHOPT_DB", str(Path(tempfile.mkdtemp(prefix="archopt_test_")) / "test.db"))

import pytest


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:  # runs lifespan: creates tables + seeds demo user
        yield c


@pytest.fixture(scope="session")
def auth(client):
    r = client.post("/api/auth/login", json={"username": "vikramgupta", "password": "12345678"})
    assert r.status_code == 200
    return {"Authorization": "Bearer " + r.json()["access_token"]}
