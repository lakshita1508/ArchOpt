"""Insert seed data (demo user) on first run."""
from sqlalchemy.orm import Session

from ..core.config import DEMO_PASSWORD, DEMO_USERNAME
from ..core.security import hash_password
from ..models.models import User


def seed_database(db: Session) -> None:
    if not db.query(User).filter(User.username == DEMO_USERNAME).first():
        db.add(User(username=DEMO_USERNAME, password_hash=hash_password(DEMO_PASSWORD)))
        db.commit()
