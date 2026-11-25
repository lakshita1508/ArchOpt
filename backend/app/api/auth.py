from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.security import make_token, verify_password
from ..database.session import get_db
from ..models.models import User
from ..schemas.schemas import LoginRequest, TokenResponse
from .deps import current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    if not body.username.strip() or not body.password:
        raise HTTPException(status_code=422, detail="Username and password are required.")
    user = db.query(User).filter(User.username == body.username.strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    return TokenResponse(access_token=make_token(user.username), username=user.username)


@router.post("/logout")
def logout(_: str = Depends(current_user)):
    # Stateless demo tokens: the client discards the token. (Production systems would revoke server-side.)
    return {"ok": True}
