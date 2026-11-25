"use client";
const KEY = "archopt_active_project";
export function getActiveProject(): number | null {
  try { const v = localStorage.getItem(KEY); return v ? Number(v) : null; } catch { return null; }
}
export function setActiveProject(id: number | null) {
  try { id === null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, String(id)); } catch {}
}
