"""Demo-grade authentication helpers.

This is intentionally simple (HMAC-signed bearer token + PBKDF2 password hash) for an academic demo.
It is NOT production-grade security: no rate limiting, no refresh tokens, a single shared secret.
"""
import base64, hashlib, hmac, os, time
from typing import Optional

from .config import SECRET_KEY, TOKEN_TTL_SECONDS


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_b64, _ = stored.split("$", 1)
        return hmac.compare_digest(hash_password(password, base64.b64decode(salt_b64)), stored)
    except Exception:
        return False


def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_token(username: str) -> str:
    payload = f"{username}|{int(time.time()) + TOKEN_TTL_SECONDS}"
    return base64.urlsafe_b64encode(payload.encode()).decode() + "." + _sign(payload)


def verify_token(token: str) -> Optional[str]:
    try:
        b64, sig = token.rsplit(".", 1)
        payload = base64.urlsafe_b64decode(b64.encode()).decode()
        if not hmac.compare_digest(sig, _sign(payload)):
            return None
        username, exp = payload.split("|")
        return username if int(exp) > time.time() else None
    except Exception:
        return None
