// Client-side display geometry (instant feedback while dragging). The authoritative validation is done by the C++ engine.
export interface R { name: string; x: number; y: number; width: number; height: number; isFree?: boolean }
export const EPS = 1e-6;

export function intersectionArea(a: R, b: R): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
export function overlaps(a: R, b: R): boolean { return intersectionArea(a, b) > EPS; }

export function outsideArea(r: R, plotW: number, plotH: number): number {
  const inside = intersectionArea(r, { name: "plot", x: 0, y: 0, width: plotW, height: plotH });
  return Math.max(0, r.width * r.height - inside);
}

/** Length of wall shared by two rectangles (0 if only touching at a corner or apart). */
export function sharedWall(a: R, b: R): number {
  const vx = Math.abs(a.x + a.width - b.x) < 1e-6 || Math.abs(b.x + b.width - a.x) < 1e-6;
  if (vx) {
    const len = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (len > EPS) return len;
  }
  const hy = Math.abs(a.y + a.height - b.y) < 1e-6 || Math.abs(b.y + b.height - a.y) < 1e-6;
  if (hy) {
    const len = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    if (len > EPS) return len;
  }
  return 0;
}

export function adjacentRooms(rooms: R[], name: string, minWall = 1.0): string[] {
  const me = rooms.find((r) => r.name === name);
  if (!me) return [];
  return rooms.filter((r) => r.name !== name && !r.isFree && sharedWall(me, r) + EPS >= minWall).map((r) => r.name);
}

/** room name -> list of instant geometry problems (overlap / outside plot) */
export function geometryIssues(rooms: R[], plotW: number, plotH: number): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (n: string, m: string) => { (out[n] ||= []).push(m); };
  rooms.forEach((r, i) => {
    const o = outsideArea(r, plotW, plotH);
    if (o > EPS) add(r.name, `Outside plot boundary (${o.toFixed(1)} m²)`);
    for (let j = i + 1; j < rooms.length; j++) {
      const a = intersectionArea(r, rooms[j]);
      if (a > EPS) { add(r.name, `Overlaps ${rooms[j].name} (${a.toFixed(1)} m²)`); add(rooms[j].name, `Overlaps ${r.name} (${a.toFixed(1)} m²)`); }
    }
  });
  return out;
}

export function snap(v: number, step: number): number { return step > 0 ? Math.round(v / step) * step : v; }
export function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

/** Rooms whose rectangle differs from the same-named room in the reference layout (for compare view). */
export function differingRooms(ref: R[], other: R[], tol = 0.05): Set<string> {
  const set = new Set<string>();
  for (const r of other) {
    const m = ref.find((x) => x.name === r.name);
    if (!m || Math.abs(m.x - r.x) > tol || Math.abs(m.y - r.y) > tol || Math.abs(m.width - r.width) > tol || Math.abs(m.height - r.height) > tol) set.add(r.name);
  }
  return set;
}
