"""Optional AI Brief Assistant: natural-language brief -> structured requirements (LLM used ONLY for extraction)."""
import json, re, urllib.error, urllib.request
from typing import Any, Dict

from ..core.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
from ..schemas.schemas import PROJECT_TYPES, ROOM_TYPES, ProjectIn

SYSTEM = f"""You extract architectural requirements from a brief into strict JSON. Output ONLY JSON, no prose.
Schema: {{"name": str, "project_type": one of {PROJECT_TYPES}, "plot_width": number (m), "plot_height": number (m),
"rooms": [{{"name": str, "room_type": one of {ROOM_TYPES}, "required_area": number m2, "min_width": number, "min_height": number, "priority": 1-3}}],
"relationships": [{{"room_a": str, "room_b": str (a room name or "ENTRANCE"), "rel_type": one of must_adjacent|prefer_adjacent|prefer_nearby|no_preference|must_separate, "weight": 1-5}}]}}
Use sensible default areas/min sizes when the brief omits them (and always include one Corridor room). Never invent plot dimensions that were not given: use 0 when missing."""


def ai_available() -> bool:
    return bool(ANTHROPIC_API_KEY)


class AIUnavailable(RuntimeError):
    pass


def parse_brief(brief: str) -> Dict[str, Any]:
    if not ai_available():
        raise AIUnavailable("AI parsing is unavailable: no ANTHROPIC_API_KEY is configured. You can still create projects manually.")
    body = json.dumps({"model": ANTHROPIC_MODEL, "max_tokens": 2500, "system": SYSTEM,
                       "messages": [{"role": "user", "content": brief}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST",
                                 headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AIUnavailable(f"The AI service could not be reached: {exc}") from exc
    text = "".join(b.get("text", "") for b in payload.get("content", []) if b.get("type") == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("The AI response did not contain structured data.")
    data = json.loads(m.group(0))
    data.setdefault("project_type", "Other")
    # The user reviews/edits the result before anything is stored, so only light normalisation here.
    for r in data.get("rooms", []):
        r.setdefault("min_width", 0); r.setdefault("min_height", 0); r.setdefault("priority", 2)
    return data
