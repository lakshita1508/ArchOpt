"use client";
import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/services/api";
import { ErrorBox, Field, Section } from "@/components/common/ui";
import { PROJECT_TYPES, REL_LABELS, ROOM_TYPES, type ConstraintsReq, type ProjectData, type RelReq, type RelType, type RoomReq } from "@/types";

export const DEFAULT_CONSTRAINTS: ConstraintsReq = {
  min_corridor_width: 1.2, door_width: 1.0, area_tolerance: 0.05, max_aspect: 5, separate_distance: 4, max_expansion: 1.5, open_space_ratio: 0, require_connectivity: true,
};
export const EMPTY_PROJECT: ProjectData = {
  name: "", project_type: "Community Centre", description: "", plot_width: 30, plot_height: 20, entrance_side: "south", entrance_offset: 0.5,
  rooms: [], relationships: [], constraints: DEFAULT_CONSTRAINTS,
};
// sensible defaults when adding a room of a given type: [area, minW, minH]
const ROOM_DEFAULTS: Record<string, [number, number, number]> = {
  Reception: [25, 4, 4], "Living Room": [30, 5, 5], Bedroom: [14, 3, 3], Kitchen: [12, 3, 3], "Dining Area": [14, 3.5, 3.5], Classroom: [48, 6, 6], Office: [16, 3.5, 3.5],
  "Conference Room": [30, 5, 5], "Meeting Room": [20, 4, 4], Toilet: [8, 2, 2.5], Storage: [10, 2.5, 2.5], Corridor: [24, 1.5, 1.5], Staircase: [12, 2.5, 4], "Open Area": [60, 6, 6],
  Balcony: [8, 1.5, 3], "Custom Room": [12, 3, 3],
};

export function validateProject(d: ProjectData): { fields: Record<string, string>; problems: string[] } {
  const f: Record<string, string> = {}, problems: string[] = [];
  if (!d.name.trim()) f.name = "Project name is required.";
  if (!(d.plot_width > 0) || d.plot_width > 500) f.plot_width = "Enter a width between 0 and 500 m.";
  if (!(d.plot_height > 0) || d.plot_height > 500) f.plot_height = "Enter a height between 0 and 500 m.";
  if (d.rooms.length === 0) problems.push("Add at least one room.");
  const names = d.rooms.map((r) => r.name.trim());
  d.rooms.forEach((r, i) => {
    if (!r.name.trim()) f[`room${i}.name`] = "Name required";
    else if (r.name.trim() === "ENTRANCE") f[`room${i}.name`] = "Reserved name";
    else if (names.indexOf(r.name.trim()) !== i) f[`room${i}.name`] = "Duplicate name";
    if (!(r.required_area > 0)) f[`room${i}.area`] = "Area > 0";
    if (r.min_width < 0 || r.min_height < 0) f[`room${i}.min`] = "Must be ≥ 0";
    const fits = (r.min_width <= d.plot_width && r.min_height <= d.plot_height) || (r.min_height <= d.plot_width && r.min_width <= d.plot_height);
    if (!fits) problems.push(`${r.name || "Room " + (i + 1)}: minimum size ${r.min_width} × ${r.min_height} m does not fit in the plot.`);
  });
  const known = new Set([...names, "ENTRANCE"]);
  d.relationships.forEach((r, i) => {
    if (!known.has(r.room_a) || !known.has(r.room_b)) f[`rel${i}`] = "Choose existing rooms";
    else if (r.room_a === r.room_b) f[`rel${i}`] = "Pick two different rooms";
  });
  const tol = d.constraints.area_tolerance;
  const need = d.rooms.reduce((s, r) => s + Math.max(r.required_area * (1 - tol), r.min_width * r.min_height), 0);
  const avail = d.plot_width * d.plot_height * (1 - d.constraints.open_space_ratio);
  if (need > avail + 1e-9) problems.push(`Total required room area (${need.toFixed(1)} m²) exceeds the available plot area (${avail.toFixed(1)} m²) — the requirements are impossible.`);
  return { fields: f, problems };
}

export default function ProjectForm({ initial, submitLabel, onSubmit, onCancel, banner }: {
  initial: ProjectData; submitLabel: string; onSubmit: (d: ProjectData) => Promise<void>; onCancel: () => void; banner?: React.ReactNode;
}) {
  const [d, setD] = useState<ProjectData>(initial);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ message: string; details: string[] } | null>(null);
  const [newType, setNewType] = useState("Bedroom");
  const { fields, problems } = useMemo(() => validateProject(d), [d]);
  const plotArea = d.plot_width * d.plot_height || 0;
  const totalReq = d.rooms.reduce((s, r) => s + (r.required_area || 0), 0);
  const remaining = plotArea - totalReq;
  const fe = (k: string) => (submitted ? fields[k] : undefined);
  const set = (p: Partial<ProjectData>) => setD((o) => ({ ...o, ...p }));
  const setRoom = (i: number, p: Partial<RoomReq>) => set({ rooms: d.rooms.map((r, k) => (k === i ? { ...r, ...p } : r)) });
  const setRel = (i: number, p: Partial<RelReq>) => set({ relationships: d.relationships.map((r, k) => (k === i ? { ...r, ...p } : r)) });
  const setCon = (p: Partial<ConstraintsReq>) => set({ constraints: { ...d.constraints, ...p } });
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const addRoom = () => {
    const [a, w, h] = ROOM_DEFAULTS[newType] || [12, 3, 3];
    let base = newType === "Custom Room" ? "Room" : newType, name = base, n = 1;
    while (d.rooms.some((r) => r.name === name)) name = `${base} ${++n}`;
    set({ rooms: [...d.rooms, { name, room_type: newType, required_area: a, min_width: w, min_height: h, pref_width: w, pref_height: h, priority: 2 }] });
  };
  const removeRoom = (i: number) => {
    const name = d.rooms[i].name;
    set({ rooms: d.rooms.filter((_, k) => k !== i), relationships: d.relationships.filter((r) => r.room_a !== name && r.room_b !== name) });
  };
  const rename = (i: number, name: string) => {
    const old = d.rooms[i].name;
    set({ rooms: d.rooms.map((r, k) => (k === i ? { ...r, name } : r)), relationships: d.relationships.map((r) => ({ ...r, room_a: r.room_a === old ? name : r.room_a, room_b: r.room_b === old ? name : r.room_b })) });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerErr(null);
    if (Object.keys(fields).length > 0 || problems.length > 0) return;
    setBusy(true);
    try { await onSubmit({ ...d, name: d.name.trim() }); }
    catch (err) { setServerErr(err instanceof ApiError ? { message: err.message, details: err.details } : { message: "Unexpected error", details: [] }); }
    finally { setBusy(false); }
  };

  const roomNames = d.rooms.map((r) => r.name);
  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {banner}
      <Section title="A · Project details">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2"><Field label="Project name" error={fe("name")}><input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Riverside Community Centre" /></Field></div>
          <Field label="Project type"><select className="input" value={d.project_type} onChange={(e) => set({ project_type: e.target.value })}>{PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Total plot area (auto)"><input className="input bg-secondary" readOnly value={`${plotArea.toFixed(1)} m²`} aria-readonly /></Field>
          <Field label="Plot width (m)" error={fe("plot_width")}><input type="number" step="0.1" min="0" className="input" value={d.plot_width || ""} onChange={(e) => set({ plot_width: num(e.target.value) })} /></Field>
          <Field label="Plot height (m)" error={fe("plot_height")}><input type="number" step="0.1" min="0" className="input" value={d.plot_height || ""} onChange={(e) => set({ plot_height: num(e.target.value) })} /></Field>
          <Field label="Entrance side"><select className="input" value={d.entrance_side} onChange={(e) => set({ entrance_side: e.target.value as ProjectData["entrance_side"] })}>{["south", "north", "east", "west"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></Field>
          <Field label={`Entrance position along side (${Math.round(d.entrance_offset * 100)}%)`}><input type="range" min={5} max={95} value={Math.round(d.entrance_offset * 100)} onChange={(e) => set({ entrance_offset: Number(e.target.value) / 100 })} className="w-full accent-accent" /></Field>
          <div className="md:col-span-2 lg:col-span-4"><Field label="Description (optional)"><input className="input" value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field></div>
        </div>
      </Section>

      <Section title="B · Room requirements" right={
        <div className="flex gap-2 items-center">
          <select className="input !w-auto" value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Room type to add">{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <button type="button" className="btn btn-primary btn-sm" onClick={addRoom}><Plus size={14} /> Add room</button>
        </div>}>
        <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
          <div className="bg-secondary rounded p-3"><p className="label !mb-0">Total required</p><p className="text-lg font-bold text-primary">{totalReq.toFixed(1)} m²</p></div>
          <div className="bg-secondary rounded p-3"><p className="label !mb-0">Plot area</p><p className="text-lg font-bold text-primary">{plotArea.toFixed(1)} m²</p></div>
          <div className={`rounded p-3 ${remaining < 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}><p className="label !mb-0 !text-inherit">Remaining available</p><p className="text-lg font-bold">{remaining.toFixed(1)} m²</p></div>
        </div>
        {d.rooms.length === 0 ? <p className="text-sm text-muted py-6 text-center">No rooms yet. Choose a room type above and click “Add room”.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead><tr>{["Name", "Type", "Required area m²", "Min W", "Min H", "Pref W", "Pref H", "Priority", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {d.rooms.map((r, i) => (
                  <tr key={i}>
                    <td className="td"><input className="input" value={r.name} onChange={(e) => rename(i, e.target.value)} aria-label="Room name" />{fe(`room${i}.name`) && <p className="field-error">{fe(`room${i}.name`)}</p>}</td>
                    <td className="td"><select className="input" value={r.room_type} onChange={(e) => setRoom(i, { room_type: e.target.value })}>{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
                    <td className="td"><input type="number" step="0.5" min="0" className="input" value={r.required_area || ""} onChange={(e) => setRoom(i, { required_area: num(e.target.value) })} />{fe(`room${i}.area`) && <p className="field-error">{fe(`room${i}.area`)}</p>}</td>
                    {(["min_width", "min_height", "pref_width", "pref_height"] as const).map((k) => (
                      <td key={k} className="td"><input type="number" step="0.1" min="0" className="input" value={r[k] || ""} onChange={(e) => setRoom(i, { [k]: num(e.target.value) } as Partial<RoomReq>)} /></td>))}
                    <td className="td"><select className="input" value={r.priority} onChange={(e) => setRoom(i, { priority: Number(e.target.value) })}><option value={3}>High</option><option value={2}>Medium</option><option value={1}>Low</option></select></td>
                    <td className="td"><button type="button" className="btn btn-sm btn-danger" onClick={() => removeRoom(i)} aria-label={`Remove ${r.name}`}><Trash2 size={14} /></button></td>
                  </tr>))}
              </tbody>
            </table>
          </div>)}
      </Section>

      <Section title="C · Spatial relationships" right={
        <button type="button" className="btn btn-sm" disabled={d.rooms.length < 1} onClick={() => set({ relationships: [...d.relationships, { room_a: roomNames[0] || "", room_b: "ENTRANCE", rel_type: "prefer_adjacent", weight: 1 }] })}><Plus size={14} /> Add relationship</button>}>
        {d.relationships.length === 0 ? <p className="text-sm text-muted py-4 text-center">No relationships defined. Examples: “Reception — ENTRANCE: must be adjacent”, “Office — Reception: prefer adjacent”.</p> : (
          <div className="space-y-2">
            {d.relationships.map((r, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_90px_40px] items-start">
                <select className="input" value={r.room_a} onChange={(e) => setRel(i, { room_a: e.target.value })} aria-label="First room">{roomNames.map((n) => <option key={n}>{n}</option>)}</select>
                <select className="input" value={r.rel_type} onChange={(e) => setRel(i, { rel_type: e.target.value as RelType })} aria-label="Relationship">{(Object.keys(REL_LABELS) as RelType[]).map((t) => <option key={t} value={t}>{REL_LABELS[t]}</option>)}</select>
                <select className="input" value={r.room_b} onChange={(e) => setRel(i, { room_b: e.target.value })} aria-label="Second room">{["ENTRANCE", ...roomNames].map((n) => <option key={n}>{n}</option>)}</select>
                <input type="number" min="0" max="10" step="0.5" className="input" value={r.weight} onChange={(e) => setRel(i, { weight: num(e.target.value) })} aria-label="Weight" title="Relationship weight" />
                <button type="button" className="btn btn-sm btn-danger h-[38px]" onClick={() => set({ relationships: d.relationships.filter((_, k) => k !== i) })} aria-label="Remove relationship"><Trash2 size={14} /></button>
                {fe(`rel${i}`) && <p className="field-error md:col-span-5">{fe(`rel${i}`)}</p>}
              </div>))}
            <p className="text-xs text-muted">“Must be adjacent / separated” are hard constraints; “prefer” relationships are weighted soft preferences.</p>
          </div>)}
      </Section>

      <Section title="D · Constraints">
        <div className="flex flex-wrap gap-2 mb-4">
          {["No room overlap", "All rooms inside plot", "Minimum room dimensions", "Required room areas"].map((c) => <span key={c} className="badge bg-success-soft text-success border-success/30">✓ {c} (always enforced)</span>)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Min corridor width (m)"><input type="number" step="0.1" className="input" value={d.constraints.min_corridor_width} onChange={(e) => setCon({ min_corridor_width: num(e.target.value) })} /></Field>
          <Field label="Min open space (% of plot)"><input type="number" step="1" min="0" max="80" className="input" value={Math.round(d.constraints.open_space_ratio * 100)} onChange={(e) => setCon({ open_space_ratio: num(e.target.value) / 100 })} /></Field>
          <Field label="Area tolerance (%)" hint="Rooms may be this far below target"><input type="number" step="1" min="0" max="30" className="input" value={Math.round(d.constraints.area_tolerance * 100)} onChange={(e) => setCon({ area_tolerance: num(e.target.value) / 100 })} /></Field>
          <Field label="Max room aspect ratio"><input type="number" step="0.5" className="input" value={d.constraints.max_aspect} onChange={(e) => setCon({ max_aspect: num(e.target.value) })} /></Field>
          <Field label="Separation distance (m)" hint="For ‘must be separated’"><input type="number" step="0.5" className="input" value={d.constraints.separate_distance} onChange={(e) => setCon({ separate_distance: num(e.target.value) })} /></Field>
          <Field label="Max room expansion (×)" hint="Rest of plot = open space"><input type="number" step="0.1" min="1" className="input" value={d.constraints.max_expansion} onChange={(e) => setCon({ max_expansion: num(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 text-sm font-medium mt-6 md:col-span-2"><input type="checkbox" className="w-4 h-4 accent-accent" checked={d.constraints.require_connectivity} onChange={(e) => setCon({ require_connectivity: e.target.checked })} /> Accessible circulation: every room must be reachable from the entrance</label>
        </div>
      </Section>

      {submitted && problems.length > 0 && <ErrorBox message="Please fix the following before saving:" details={problems} />}
      {submitted && Object.keys(fields).length > 0 && <ErrorBox message="Some fields need attention (highlighted above)." />}
      {serverErr && <ErrorBox message={serverErr.message} details={serverErr.details} />}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} {submitLabel}</button>
      </div>
    </form>
  );
}
