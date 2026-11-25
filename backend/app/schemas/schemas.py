"""Pydantic request/response schemas."""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

PROJECT_TYPES = ["Residential", "Commercial", "Educational", "Institutional", "Community Centre", "Office", "Other"]
ROOM_TYPES = ["Reception", "Living Room", "Bedroom", "Kitchen", "Dining Area", "Classroom", "Office", "Conference Room",
              "Meeting Room", "Toilet", "Storage", "Corridor", "Staircase", "Open Area", "Balcony", "Custom Room"]
REL_TYPES = ["must_adjacent", "prefer_adjacent", "prefer_nearby", "no_preference", "must_separate"]
ALGORITHMS = ["constraint_based", "simulated_annealing", "genetic"]
PRIORITIES = ["max_area_efficiency", "better_adjacency", "shorter_circulation", "better_accessibility", "balanced"]


class LoginRequest(BaseModel):
    username: str = ""
    password: str = ""


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class RoomIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    room_type: str = "Custom Room"
    required_area: float = Field(gt=0, le=100000)
    min_width: float = Field(default=0, ge=0)
    min_height: float = Field(default=0, ge=0)
    pref_width: float = Field(default=0, ge=0)
    pref_height: float = Field(default=0, ge=0)
    priority: int = Field(default=2, ge=1, le=3)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v or v == "ENTRANCE":
            raise ValueError("Room name must be non-empty and cannot be 'ENTRANCE'")
        return v


class RoomOut(RoomIn):
    id: int
    model_config = {"from_attributes": True}


class RelationshipIn(BaseModel):
    room_a: str
    room_b: str
    rel_type: Literal["must_adjacent", "prefer_adjacent", "prefer_nearby", "no_preference", "must_separate"] = "prefer_adjacent"
    weight: float = Field(default=1.0, ge=0, le=10)


class RelationshipOut(RelationshipIn):
    id: int
    model_config = {"from_attributes": True}


class ConstraintsIn(BaseModel):
    min_corridor_width: float = Field(default=1.2, ge=0.6, le=6)
    door_width: float = Field(default=1.0, ge=0.5, le=3)
    area_tolerance: float = Field(default=0.05, ge=0, le=0.3)
    max_aspect: float = Field(default=5.0, ge=1.5, le=20)
    separate_distance: float = Field(default=4.0, ge=0, le=30)
    max_expansion: float = Field(default=1.5, ge=1.0, le=4.0)
    open_space_ratio: float = Field(default=0.0, ge=0, le=0.8)
    require_connectivity: bool = True


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    project_type: str = "Other"
    description: str = ""
    plot_width: float = Field(gt=0, le=500)
    plot_height: float = Field(gt=0, le=500)
    entrance_side: Literal["south", "north", "east", "west"] = "south"
    entrance_offset: float = Field(default=0.5, ge=0, le=1)
    rooms: List[RoomIn] = []
    relationships: List[RelationshipIn] = []
    constraints: ConstraintsIn = ConstraintsIn()

    @field_validator("project_type")
    @classmethod
    def _ptype(cls, v: str) -> str:
        if v not in PROJECT_TYPES:
            raise ValueError(f"project_type must be one of {PROJECT_TYPES}")
        return v


class ProjectSummary(BaseModel):
    id: int
    name: str
    project_type: str
    description: str
    plot_width: float
    plot_height: float
    plot_area: float
    room_count: int
    layout_count: int
    sample_key: Optional[str]
    created_at: str
    optimization_status: str  # not_optimized | running | optimized | failed
    last_result_mode: Optional[str] = None


class ProjectOut(ProjectIn):
    id: int
    sample_key: Optional[str] = None
    created_at: str
    rooms: List[RoomOut] = []
    relationships: List[RelationshipOut] = []


class OptimizeWeights(BaseModel):
    overlap: float = Field(default=1000, ge=0)
    boundary: float = Field(default=1000, ge=0)
    adjacency: float = Field(default=40, ge=0)
    corridor: float = Field(default=2, ge=0)
    circulation: float = Field(default=6, ge=0)
    unused: float = Field(default=0.5, ge=0)


class OptimizeRequest(BaseModel):
    algorithm: Literal["constraint_based", "simulated_annealing", "genetic"] = "simulated_annealing"
    candidates: int = Field(default=4, ge=1, le=10)
    max_iterations: int = Field(default=6000, ge=10, le=200000)
    seed: int = Field(default=42, ge=0, le=2**31)
    priority: Literal["max_area_efficiency", "better_adjacency", "shorter_circulation", "better_accessibility", "balanced"] = "balanced"
    weights: OptimizeWeights = OptimizeWeights()
    replace_existing: bool = True


class JobOut(BaseModel):
    id: str
    project_id: int
    algorithm: str
    status: str
    mode: str
    message: str
    reasons: List[str] = []
    candidates_evaluated: int
    feasible_found: int
    execution_ms: float
    best_cost: Optional[float]
    created_at: str
    started_at: Optional[str]
    finished_at: Optional[str]
    layout_ids: List[int] = []
    suggested_samples: List[Dict[str, Any]] = []


class LayoutOut(BaseModel):
    id: int
    project_id: int
    job_id: Optional[str]
    label: str
    name: str
    source: str            # live | demo | manual
    result_badge: str      # LIVE RESULT | DEMO RESULT | MANUAL EDIT
    algorithm: str
    rooms: List[Dict[str, Any]]
    metrics: Dict[str, Any]
    validation: List[Dict[str, Any]]
    circulation: Dict[str, Any]
    is_valid: bool
    is_selected: bool
    created_at: str


class LayoutUpdate(BaseModel):
    name: Optional[str] = None
    is_selected: Optional[bool] = None
    rooms: Optional[List[Dict[str, Any]]] = None


class ManualLayoutRequest(BaseModel):
    rooms: Optional[List[Dict[str, Any]]] = None  # omit => automatic shelf placement


class BriefRequest(BaseModel):
    brief: str = Field(min_length=10, max_length=4000)
