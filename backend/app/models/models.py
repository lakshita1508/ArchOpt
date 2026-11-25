"""SQLAlchemy ORM models (SQLite)."""
import datetime as dt

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database.session import Base


def now():
    return dt.datetime.utcnow()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=now)


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    project_type = Column(String(40), nullable=False, default="Other")
    description = Column(Text, default="")
    plot_width = Column(Float, nullable=False)
    plot_height = Column(Float, nullable=False)
    entrance_side = Column(String(8), default="south")
    entrance_offset = Column(Float, default=0.5)
    sample_key = Column(String(64), nullable=True)  # set when created from a predefined sample
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

    rooms = relationship("Room", cascade="all, delete-orphan", passive_deletes=True, order_by="Room.id")
    relationships = relationship("Relationship", cascade="all, delete-orphan", passive_deletes=True, order_by="Relationship.id")
    constraints = relationship("Constraint", cascade="all, delete-orphan", passive_deletes=True)
    jobs = relationship("OptimizationJob", cascade="all, delete-orphan", passive_deletes=True, order_by="OptimizationJob.created_at")
    layouts = relationship("Layout", cascade="all, delete-orphan", passive_deletes=True, order_by="Layout.id")


class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    room_type = Column(String(40), nullable=False, default="Custom Room")
    required_area = Column(Float, nullable=False)
    min_width = Column(Float, nullable=False, default=0)
    min_height = Column(Float, nullable=False, default=0)
    pref_width = Column(Float, default=0)
    pref_height = Column(Float, default=0)
    priority = Column(Integer, default=2)


class Relationship(Base):
    __tablename__ = "relationships"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    room_a = Column(String(80), nullable=False)
    room_b = Column(String(80), nullable=False)  # a room name or "ENTRANCE"
    rel_type = Column(String(24), nullable=False, default="prefer_adjacent")
    weight = Column(Float, default=1.0)


class Constraint(Base):
    __tablename__ = "constraints"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String(40), nullable=False)
    value = Column(Float, nullable=False)


class OptimizationJob(Base):
    __tablename__ = "optimization_jobs"
    id = Column(String(36), primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    algorithm = Column(String(32), nullable=False)
    params_json = Column(Text, default="{}")
    status = Column(String(16), default="queued")  # queued|running|completed|infeasible|failed|cancelled
    mode = Column(String(8), default="live")       # live|demo|none  (provenance of the results)
    message = Column(Text, default="")
    reasons_json = Column(Text, default="[]")
    candidates_evaluated = Column(Integer, default=0)
    feasible_found = Column(Integer, default=0)
    execution_ms = Column(Float, default=0)
    best_cost = Column(Float, nullable=True)
    created_at = Column(DateTime, default=now)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)


class Layout(Base):
    __tablename__ = "layouts"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(String(36), ForeignKey("optimization_jobs.id", ondelete="SET NULL"), nullable=True)
    label = Column(String(16), default="L1")
    name = Column(String(120), default="")
    source = Column(String(8), default="live")  # live | demo | manual
    algorithm = Column(String(32), default="")
    rooms_json = Column(Text, nullable=False)
    validation_json = Column(Text, default="[]")
    circulation_json = Column(Text, default="{}")
    is_valid = Column(Boolean, default=False)
    is_selected = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)

    metrics = relationship("LayoutMetric", uselist=False, cascade="all, delete-orphan", passive_deletes=True)


class LayoutMetric(Base):
    __tablename__ = "layout_metrics"
    id = Column(Integer, primary_key=True)
    layout_id = Column(Integer, ForeignKey("layouts.id", ondelete="CASCADE"), unique=True, nullable=False)
    total_cost = Column(Float, default=0)
    area_efficiency = Column(Float, default=0)
    adjacency_satisfaction = Column(Float, default=0)
    circulation_score = Column(Float, default=0)
    accessibility_score = Column(Float, default=0)
    usable_area = Column(Float, default=0)
    circulation_area = Column(Float, default=0)
    unused_area = Column(Float, default=0)
    avg_walk = Column(Float, default=0)
    max_walk = Column(Float, default=0)
    violations = Column(Integer, default=0)
    cost_breakdown_json = Column(Text, default="{}")
