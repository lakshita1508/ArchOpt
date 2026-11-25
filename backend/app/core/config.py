"""Central configuration (paths, demo credentials, optional AI key)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]          # .../archopt


def _load_dotenv(path: Path) -> None:
    """Tiny .env reader (no dependency): KEY=VALUE lines; real environment variables win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv(ROOT / ".env")
BACKEND_DIR = ROOT / "backend"
DB_PATH = Path(os.getenv("ARCHOPT_DB", str(BACKEND_DIR / "archopt.db")))
DEMO_DIR = Path(os.getenv("ARCHOPT_DEMO_DIR", str(ROOT / "demo_data")))
SECRET_KEY = os.getenv("ARCHOPT_SECRET", "archopt-demo-secret-not-for-production")
TOKEN_TTL_SECONDS = 12 * 3600
DEMO_USERNAME = "vikramgupta"
DEMO_PASSWORD = "12345678"
ENGINE_TIMEOUT_SECONDS = int(os.getenv("ARCHOPT_ENGINE_TIMEOUT", "180"))
CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-5-5")


def find_engine_path():
    """Locate the compiled C++ engine. Returns a Path or None (never raises)."""
    env = os.getenv("ARCHOPT_ENGINE")
    exe = "archopt_engine.exe" if os.name == "nt" else "archopt_engine"
    candidates = [Path(env)] if env else []
    base = ROOT / "engine" / "build"
    candidates += [base / exe, base / "Release" / exe, base / "Debug" / exe, base / "bin" / exe]
    for c in candidates:
        if c.is_file():
            return c
    return None
