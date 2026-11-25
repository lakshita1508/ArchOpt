import type { Algorithm, DashboardData, JobData, LayoutData, PlacedRoom, Priority, ProjectData, ProjectSummary, RoomReq, SampleProject, SystemStatus } from "@/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export const TOKEN_KEY = "archopt_token";
export const USER_KEY = "archopt_user";

export class ApiError extends Error {
  status: number;
  details: string[];
  constructor(message: string, status: number, details: string[] = []) { super(message); this.status = status; this.details = details; }
}

function token(): string { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } }

function explain(body: any, status: number): { message: string; details: string[] } {
  const d = body?.detail;
  if (typeof d === "string") return { message: d, details: [] };
  if (d && typeof d === "object" && !Array.isArray(d)) return { message: d.message || `Request failed (${status})`, details: Array.isArray(d.errors) ? d.errors : [] };
  if (Array.isArray(d)) { // FastAPI/pydantic validation errors
    const details = d.map((e: any) => `${(e.loc || []).filter((x: any) => x !== "body").join(".")}: ${e.msg}`);
    return { message: "Please check the highlighted fields.", details };
  }
  return { message: `Request failed (${status})`, details: [] };
}

async function request<T>(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(`Cannot reach the ArchOpt backend at ${API_URL}. Is it running? (scripts\\start_backend.bat)`, 0);
  }
  if (res.status === 401 && !path.startsWith("/api/auth/login")) {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) window.location.href = "/login";
  }
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    const e = explain(body, res.status);
    throw new ApiError(e.message, res.status, e.details);
  }
  if (init.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (b: unknown) => JSON.stringify(b);

export const api = {
  login: (username: string, password: string) => request<{ access_token: string; username: string }>("/api/auth/login", { method: "POST", body: json({ username, password }) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  status: () => request<SystemStatus>("/api/system/status"),
  dashboard: () => request<DashboardData>("/api/dashboard"),
  projects: () => request<ProjectSummary[]>("/api/projects"),
  project: (id: number | string) => request<ProjectData & { id: number }>(`/api/projects/${id}`),
  createProject: (p: ProjectData) => request<ProjectData & { id: number }>("/api/projects", { method: "POST", body: json(p) }),
  updateProject: (id: number | string, p: ProjectData) => request<ProjectData & { id: number }>(`/api/projects/${id}`, { method: "PUT", body: json(p) }),
  deleteProject: (id: number) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  addRoom: (pid: number | string, r: Omit<RoomReq, "id">) => request<RoomReq>(`/api/projects/${pid}/rooms`, { method: "POST", body: json(r) }),
  updateRoom: (id: number, r: Omit<RoomReq, "id">) => request<RoomReq>(`/api/rooms/${id}`, { method: "PUT", body: json(r) }),
  deleteRoom: (id: number) => request<void>(`/api/rooms/${id}`, { method: "DELETE" }),
  samples: () => request<SampleProject[]>("/api/samples"),
  loadSample: (key: string) => request<ProjectData & { id: number }>(`/api/samples/${key}/load`, { method: "POST" }),
  optimize: (pid: number | string, body: { algorithm: Algorithm; candidates: number; max_iterations: number; seed: number; priority: Priority; weights: Record<string, number> }) =>
    request<JobData>(`/api/projects/${pid}/optimize`, { method: "POST", body: json(body) }),
  job: (id: string) => request<JobData>(`/api/optimization/${id}`),
  cancelJob: (id: string) => request<JobData>(`/api/optimization/${id}/cancel`, { method: "POST" }),
  jobs: (pid: number | string) => request<JobData[]>(`/api/projects/${pid}/jobs`),
  layouts: (pid: number | string) => request<LayoutData[]>(`/api/projects/${pid}/layouts`),
  layout: (id: number | string) => request<LayoutData>(`/api/layouts/${id}`),
  updateLayout: (id: number, body: { name?: string; is_selected?: boolean; rooms?: PlacedRoom[] }) => request<LayoutData>(`/api/layouts/${id}`, { method: "PUT", body: json(body) }),
  deleteLayout: (id: number) => request<void>(`/api/layouts/${id}`, { method: "DELETE" }),
  manualLayout: (pid: number | string, rooms?: PlacedRoom[]) => request<LayoutData>(`/api/projects/${pid}/layouts/manual`, { method: "POST", body: json({ rooms: rooms || null }) }),
  validateRooms: (pid: number | string, rooms: PlacedRoom[]) =>
    request<{ is_valid: boolean; metrics: any; validation: any[]; circulation: any }>(`/api/projects/${pid}/validate-rooms`, { method: "POST", body: json({ rooms }) }),
  validateLayout: (id: number) => request<{ layout_id: number; is_valid: boolean; validation: any[]; metrics: any; result_badge: string; from_saved_report: boolean }>(`/api/layouts/${id}/validate`, { method: "POST" }),
  aiStatus: () => request<{ available: boolean }>("/api/requirements/status"),
  parseBrief: (brief: string) => request<{ requirements: any; note: string }>("/api/requirements/parse", { method: "POST", body: json({ brief }) }),
  /** Download an export (svg | pdf | report) through the authenticated API and save it in the browser. */
  async download(layoutId: number, kind: "svg" | "pdf" | "report", fallbackName: string) {
    const res = await request<Response>(`/api/layouts/${layoutId}/export/${kind}`, { raw: true });
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const m = /filename="?([^";]+)"?/.exec(cd);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
};
