"""Bridge to the C++20 engine: JSON in -> subprocess -> JSON out."""
import json, subprocess, tempfile, threading
from pathlib import Path
from typing import Any, Dict, Optional

from ..core.config import ENGINE_TIMEOUT_SECONDS, find_engine_path

_procs: Dict[str, subprocess.Popen] = {}
_lock = threading.Lock()


class EngineUnavailable(RuntimeError):
    """The engine binary is missing or could not be executed."""


class EngineError(RuntimeError):
    """The engine ran but failed (crash, timeout, invalid output)."""


class EngineCancelled(RuntimeError):
    pass


def engine_status() -> Dict[str, Any]:
    path = find_engine_path()
    if not path:
        return {"available": False, "path": None, "version": None,
                "detail": "C++ engine not built. Run scripts\\build_engine.bat (see README)."}
    try:
        out = subprocess.run([str(path), "version"], capture_output=True, text=True, timeout=10)
        return {"available": out.returncode == 0, "path": str(path), "version": out.stdout.strip() or None, "detail": ""}
    except Exception as exc:  # pragma: no cover
        return {"available": False, "path": str(path), "version": None, "detail": f"Engine failed to start: {exc}"}


def run_engine(command: str, payload: Dict[str, Any], job_id: Optional[str] = None,
               timeout: int = ENGINE_TIMEOUT_SECONDS) -> Dict[str, Any]:
    path = find_engine_path()
    if not path:
        raise EngineUnavailable("The C++ optimisation engine is not available (binary not found).")
    with tempfile.TemporaryDirectory(prefix="archopt_") as tmp:
        fin, fout = Path(tmp, "in.json"), Path(tmp, "out.json")
        fin.write_text(json.dumps(payload), encoding="utf-8")
        try:
            proc = subprocess.Popen([str(path), command, str(fin), str(fout)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except OSError as exc:
            raise EngineUnavailable(f"Could not start the engine: {exc}") from exc
        if job_id:
            with _lock:
                _procs[job_id] = proc
        try:
            try:
                _, err = proc.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()
                raise EngineError(f"The engine timed out after {timeout}s.")
            if proc.returncode in (-9, -15) and job_id and cancelled(job_id):
                raise EngineCancelled("Optimisation cancelled.")
            if not fout.exists():
                raise EngineError(f"Engine produced no output (exit code {proc.returncode}). {err.strip()[:300]}")
            try:
                data = json.loads(fout.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                raise EngineError(f"Engine returned invalid JSON: {exc}") from exc
            if proc.returncode not in (0, 2):
                raise EngineError(f"Engine crashed (exit code {proc.returncode}). {err.strip()[:300]}")
            return data
        finally:
            if job_id:
                with _lock:
                    _procs.pop(job_id, None)


_cancelled = set()


def cancelled(job_id: str) -> bool:
    return job_id in _cancelled


def cancel_engine(job_id: str) -> bool:
    _cancelled.add(job_id)
    with _lock:
        proc = _procs.get(job_id)
    if proc and proc.poll() is None:
        proc.terminate()
        return True
    return False
