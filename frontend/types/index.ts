export type RelType = "must_adjacent" | "prefer_adjacent" | "prefer_nearby" | "no_preference" | "must_separate";
export type Algorithm = "constraint_based" | "simulated_annealing" | "genetic";
export type Priority = "max_area_efficiency" | "better_adjacency" | "shorter_circulation" | "better_accessibility" | "balanced";

export const PROJECT_TYPES = ["Residential", "Commercial", "Educational", "Institutional", "Community Centre", "Office", "Other"];
export const ROOM_TYPES = ["Reception", "Living Room", "Bedroom", "Kitchen", "Dining Area", "Classroom", "Office", "Conference Room",
  "Meeting Room", "Toilet", "Storage", "Corridor", "Staircase", "Open Area", "Balcony", "Custom Room"];
export const REL_LABELS: Record<RelType, string> = {
  must_adjacent: "Must be adjacent", prefer_adjacent: "Prefer adjacent", prefer_nearby: "Prefer nearby",
  no_preference: "No preference", must_separate: "Must be separated",
};
export const ALGORITHM_LABELS: Record<Algorithm, string> = {
  constraint_based: "Constraint-Based Generation", simulated_annealing: "Simulated Annealing", genetic: "Genetic Algorithm",
};
export const PRIORITY_LABELS: Record<Priority, string> = {
  max_area_efficiency: "Maximum area efficiency", better_adjacency: "Better adjacency", shorter_circulation: "Shorter circulation",
  better_accessibility: "Better accessibility", balanced: "Balanced optimization",
};

export interface RoomReq {
  id?: number; name: string; room_type: string; required_area: number; min_width: number; min_height: number;
  pref_width: number; pref_height: number; priority: number;
}
export interface RelReq { id?: number; room_a: string; room_b: string; rel_type: RelType; weight: number }
export interface ConstraintsReq {
  min_corridor_width: number; door_width: number; area_tolerance: number; max_aspect: number; separate_distance: number;
  max_expansion: number; open_space_ratio: number; require_connectivity: boolean;
}
export interface ProjectData {
  id?: number; name: string; project_type: string; description: string; plot_width: number; plot_height: number;
  entrance_side: "south" | "north" | "east" | "west"; entrance_offset: number; sample_key?: string | null; created_at?: string;
  rooms: RoomReq[]; relationships: RelReq[]; constraints: ConstraintsReq;
}
export interface ProjectSummary {
  id: number; name: string; project_type: string; description: string; plot_width: number; plot_height: number; plot_area: number;
  room_count: number; layout_count: number; sample_key: string | null; created_at: string;
  optimization_status: "not_optimized" | "running" | "optimized" | "failed"; last_result_mode: string | null;
}

export interface PlacedRoom {
  name: string; type: string; x: number; y: number; width: number; height: number; area?: number; isFree?: boolean; transit?: boolean; requiredArea?: number;
}
export interface CheckItem { id: string; category: "hard" | "soft"; status: "passed" | "failed" | "warning"; room: string; message: string }
export interface PathInfo { room: string; reachable: boolean; distance: number; route: string[]; polyline: number[][] }
export interface Circulation {
  entrance?: { x: number; y: number };
  nodes?: { name: string; cx: number; cy: number; transit: boolean }[];
  edges?: { a: string; b: string; weight: number; doorX: number; doorY: number }[];
  paths?: PathInfo[]; disconnected?: string[]; bottlenecks?: { room: string; load: number }[];
  matrixNames?: string[]; distanceMatrix?: (number | null)[][]; avgDistance?: number; maxDistance?: number;
  components?: number; fullyConnected?: boolean;
}
export interface Metrics {
  totalCost: number; areaEfficiency: number; adjacencySatisfaction: number; circulationScore: number; accessibilityScore: number;
  usableArea: number; circulationArea: number; unusedArea: number; avgWalk: number; maxWalk: number; violations: number;
  costBreakdown: Record<string, number>; feasible: boolean;
}
export interface LayoutData {
  id: number; project_id: number; job_id: string | null; label: string; name: string; source: "live" | "demo" | "manual";
  result_badge: "LIVE RESULT" | "DEMO RESULT" | "MANUAL EDIT"; algorithm: string; rooms: PlacedRoom[]; metrics: Metrics;
  validation: CheckItem[]; circulation: Circulation; is_valid: boolean; is_selected: boolean; created_at: string;
}
export interface JobData {
  id: string; project_id: number; algorithm: string; status: "queued" | "running" | "completed" | "infeasible" | "failed" | "cancelled";
  mode: "live" | "demo" | "none"; message: string; reasons: string[]; candidates_evaluated: number; feasible_found: number;
  execution_ms: number; best_cost: number | null; created_at: string; started_at: string | null; finished_at: string | null;
  layout_ids: number[]; suggested_samples: { key: string; name: string; project_type: string; plot: string }[];
}
export interface SampleProject {
  key: string; name: string; project_type: string; description: string; plot_width: number; plot_height: number; plot_area: number;
  rooms: { name: string; type: string; requiredArea: number; minWidth: number; minHeight: number }[];
  relationships: { a: string; b: string; type: RelType; weight: number }[];
  recommended_algorithm: Algorithm; total_required_area: number; has_demo_layouts: boolean; demo_layout_count: number;
}
export interface DashboardData {
  total_projects: number; generated_layouts: number; avg_area_efficiency: number; completed_optimizations: number;
  recent_projects: ProjectSummary[]; per_project: { project: string; layouts: number; avg_efficiency: number }[];
  recent_activity: { job_id: string; project_id: number; project: string; algorithm: string; status: string; mode: string; message: string; created_at: string; execution_ms: number }[];
  jobs_by_algorithm: { algorithm: string; count: number }[]; data_source: string;
}
export interface SystemStatus { engine: { available: boolean; version: string | null; detail: string }; ai_available: boolean; mode: string }
