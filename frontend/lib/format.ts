export type Unit = "metric" | "imperial";
const FT = 3.280839895;
export function num(v: number | null | undefined, d = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return Number(v.toFixed(d)).toString();
}
export function len(m: number, unit: Unit = "metric", d = 1): string {
  return unit === "imperial" ? `${num(m * FT, d)} ft` : `${num(m, d)} m`;
}
export function area(m2: number, unit: Unit = "metric", d = 1): string {
  return unit === "imperial" ? `${num(m2 * FT * FT, 0)} ft²` : `${num(m2, d)} m²`;
}
export function pct(v: number | null | undefined, d = 1): string { return v === null || v === undefined ? "–" : `${num(v, d)}%`; }
export function date(iso: string): string {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
export function dateTime(iso: string): string {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
