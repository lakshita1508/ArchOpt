from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database.session import get_db
from ..models.models import Project, Relationship, Room
from ..schemas.schemas import RoomIn, RoomOut
from .deps import current_user, get_project_or_404

router = APIRouter(prefix="/api", tags=["rooms"], dependencies=[Depends(current_user)])


def _total_ok(p: Project, new_area_delta: float) -> None:
    total = sum(r.required_area for r in p.rooms) + new_area_delta
    if total > p.plot_width * p.plot_height:
        raise HTTPException(status_code=422, detail=f"Total required area ({total:.1f} m2) would exceed the plot area ({p.plot_width * p.plot_height:.1f} m2).")


@router.get("/projects/{project_id}/rooms", response_model=List[RoomOut])
def list_rooms(p: Project = Depends(get_project_or_404)):
    return [RoomOut.model_validate(r) for r in p.rooms]


@router.post("/projects/{project_id}/rooms", response_model=RoomOut, status_code=201)
def add_room(data: RoomIn, p: Project = Depends(get_project_or_404), db: Session = Depends(get_db)):
    if any(r.name == data.name for r in p.rooms):
        raise HTTPException(status_code=409, detail=f"A room named '{data.name}' already exists.")
    _total_ok(p, data.required_area)
    r = Room(project_id=p.id, **data.model_dump())
    db.add(r)
    db.commit()
    return RoomOut.model_validate(r)


@router.put("/rooms/{room_id}", response_model=RoomOut)
def update_room(room_id: int, data: RoomIn, db: Session = Depends(get_db)):
    r = db.get(Room, room_id)
    if not r:
        raise HTTPException(status_code=404, detail="Room not found")
    p = db.get(Project, r.project_id)
    if any(o.name == data.name and o.id != r.id for o in p.rooms):
        raise HTTPException(status_code=409, detail=f"A room named '{data.name}' already exists.")
    _total_ok(p, data.required_area - r.required_area)
    old = r.name
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    if old != data.name:  # keep relationships consistent after a rename
        for rel in db.query(Relationship).filter(Relationship.project_id == p.id).all():
            if rel.room_a == old: rel.room_a = data.name
            if rel.room_b == old: rel.room_b = data.name
    db.commit()
    return RoomOut.model_validate(r)


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: int, db: Session = Depends(get_db)):
    r = db.get(Room, room_id)
    if not r:
        raise HTTPException(status_code=404, detail="Room not found")
    for rel in db.query(Relationship).filter(Relationship.project_id == r.project_id).all():
        if r.name in (rel.room_a, rel.room_b):
            db.delete(rel)
    db.delete(r)
    db.commit()
