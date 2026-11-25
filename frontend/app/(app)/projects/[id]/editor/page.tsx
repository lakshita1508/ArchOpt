"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Redo2, RotateCcw, Save, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { api, ApiError } from "@/services/api";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import { setActiveProject } from "@/hooks/useActiveProject";
import FloorPlanView from "@/components/editor/FloorPlanView";
import { EmptyState, ErrorBox, PageHeader, ResultBadge, Spinner } from "@/components/common/ui";
import { adjacentRooms, geometryIssues } from "@/lib/geometry";
import { REL_LABELS, ROOM_TYPES, type CheckItem, type LayoutData, type PlacedRoom, type ProjectData, type RoomReq } from "@/types";

type Proj = ProjectData & { id: number };

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const { notify } = useToast();
  const { len, area } = useSettings();
  const [project, setProject] = useState<Proj | null>(null);
  const [layouts, setLayouts] = useState<LayoutData[]>([]);
  const [layoutId, setLayoutId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<PlacedRoom[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<PlacedRoom[][]>([]);
  const [future, setFuture] = useState<PlacedRoom[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [engineChecks, setEngineChecks] = useState<{ valid: boolean; items: CheckItem[]; stale: boolean } | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState(0.5);
  const [grid, setGrid] = useState(true);
  const [paths, setPaths] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [editReq, setEditReq] = useState<RoomReq | null>(null);
  const [newType, setNewType] = useState("Bedroom");
  const committed = useRef<PlacedRoom[]>([]);
  const roomsRef = useRef<PlacedRoom[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layout = layouts.find((l) => l.id === layoutId) || null;

  const loadAll = useCallback(async (preferLayout?: number | null) => {
    setError(null);
    try {
      const [p, ls] = await Promise.all([api.project(id), api.layouts(id)]);
      setProject(p as Proj);
      setLayouts(ls);
      const want = preferLayout ?? (search.get("layout") ? Number(search.get("layout")) : null);
      const pick = ls.find((l) => l.id === want) || ls.find((l) => l.is_selected) || ls.find((l) => l.is_valid) || ls[0] || null;
      setLayoutId(pick ? pick.id : null);
      const r = pick ? pick.rooms : [];
      roomsRef.current = r; committed.current = r;
      setRooms(r); setPast([]); setFuture([]); setDirty(false); setEngineChecks(null);
      const room = search.get("room");
      setSelected(room && r.some((x) => x.name === room) ? room : null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [id, search]);

  useEffect(() => { setActiveProject(Number(id)); loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const applyRooms = (r: PlacedRoom[]) => { roomsRef.current = r; setRooms(r); };

  /** Engine (C++) validation of the geometry currently shown, without saving. */
  const runValidation = useCallback(async (r: PlacedRoom[]) => {
    if (!project || r.length === 0) return;
    setValidating(true);
    try {
      const res = await api.validateRooms(project.id, r);
      setEngineChecks({ valid: res.is_valid, items: res.validation, stale: false });
    } catch (e) {
      setEngineChecks(e instanceof ApiError && e.status === 503 ? { valid: false, items: [], stale: true } : null);
    } finally { setValidating(false); }
  }, [project]);

  const onChange = (next: PlacedRoom[], final: boolean) => {
    applyRooms(next);
    if (!final) return;
    setPast((p) => [...p, committed.current]);
    setFuture([]);
    committed.current = roomsRef.current;
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runValidation(roomsRef.current), 250); // every move/resize triggers validation
  };

  const patchRoom = (name: string, patch: Partial<PlacedRoom>) => {
    const next = roomsRef.current.map((r) => (r.name === name ? { ...r, ...patch, area: (patch.width ?? r.width) * (patch.height ?? r.height) } : r));
    applyRooms(next);
    onChange(next, true);
  };
  const undo = () => { if (!past.length) return; const prev = past[past.length - 1]; setPast(past.slice(0, -1)); setFuture((f) => [committed.current, ...f]); committed.current = prev; applyRooms(prev); setDirty(true); runValidation(prev); };
  const redo = () => { if (!future.length) return; const nx = future[0]; setFuture(future.slice(1)); setPast((p) => [...p, committed.current]); committed.current = nx; applyRooms(nx); setDirty(true); runValidation(nx); };

  const save = async () => {
    if (!layout) return;
    setSaving(true);
    try {
      const saved = await api.updateLayout(layout.id, { rooms: roomsRef.current });
      setLayouts((ls) => ls.map((l) => (l.id === saved.id ? saved : l)));
      setDirty(false);
      setEngineChecks({ valid: saved.is_valid, items: saved.validation, stale: false });
      saved.is_valid ? notify("success", "Layout saved and validated by the C++ engine.") : notify("warning", `Layout saved but marked INVALID (${saved.metrics.violations} constraint violations). It is not treated as a valid layout.`);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const switchLayout = (lid: number) => {
    if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
    const l = layouts.find((x) => x.id === lid);
    if (!l) return;
    setLayoutId(lid); committed.current = l.rooms; applyRooms(l.rooms); setPast([]); setFuture([]); setDirty(false); setSelected(null); setEngineChecks(null);
  };

  const createManual = async () => {
    try {
      const l = await api.manualLayout(id);
      notify("success", "Starting arrangement created. Drag rooms into place; invalid areas are highlighted.");
      await loadAll(l.id);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Could not create layout"); }
  };

  const issues = useMemo(() => {
    const out: Record<string, string[]> = project ? { ...geometryIssues(rooms, project.plot_width, project.plot_height) } : {};
    (engineChecks?.items || []).filter((c) => c.status === "failed" && c.room && c.id !== "relationship").forEach((c) => { (out[c.room] ||= []).includes(c.message) || (out[c.room] ||= []).push(c.message); });
    return out;
  }, [rooms, project, engineChecks]);
  const issueCount = Object.keys(issues).length;

  // ---- requirement editing (left panel) -------------------------------------------------
  const addReqRoom = async () => {
    if (!project) return;
    let base = newType === "Custom Room" ? "Room" : newType, name = base, n = 1;
    while (project.rooms.some((r) => r.name === name)) name = `${base} ${++n}`;
    try {
      const r = await api.addRoom(project.id, { name, room_type: newType, required_area: 12, min_width: 3, min_height: 3, pref_width: 3, pref_height: 3, priority: 2 });
      setProject({ ...project, rooms: [...project.rooms, r] });
      if (layout) { const side = Math.sqrt(12); applyRooms([...roomsRef.current, { name, type: newType, x: 0, y: 0, width: Math.round(side * 10) / 10, height: Math.round(side * 10) / 10, area: 12, requiredArea: 12 }]); onChange(roomsRef.current, true); }
      notify("success", `Added “${name}”. Drag it to a free spot.`);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed"); }
  };
  const removeReqRoom = async (r: RoomReq) => {
    if (!project || !r.id || !confirm(`Remove “${r.name}” from the project requirements?`)) return;
    try {
      await api.deleteRoom(r.id);
      setProject({ ...project, rooms: project.rooms.filter((x) => x.id !== r.id), relationships: project.relationships.filter((x) => x.room_a !== r.name && x.room_b !== r.name) });
      if (layout) { applyRooms(roomsRef.current.filter((x) => x.name !== r.name)); onChange(roomsRef.current, true); }
      setSelected(null);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed"); }
  };
  const saveReq = async () => {
    if (!editReq || !editReq.id || !project) return;
    const old = project.rooms.find((r) => r.id === editReq.id);
    try {
      const { id: rid, ...body } = editReq;
      const upd = await api.updateRoom(rid, body);
      setProject({ ...project, rooms: project.rooms.map((r) => (r.id === rid ? upd : r)), relationships: project.relationships.map((x) => ({ ...x, room_a: x.room_a === old?.name ? upd.name : x.room_a, room_b: x.room_b === old?.name ? upd.name : x.room_b })) });
      if (old && old.name !== upd.name) { applyRooms(roomsRef.current.map((r) => (r.name === old.name ? { ...r, name: upd.name } : r))); if (selected === old.name) setSelected(upd.name); }
      setEditReq(null);
      notify("success", "Requirements updated. Validate the layout to re-check it against the new values.");
      runValidation(roomsRef.current);
    } catch (e) { notify("error", e instanceof ApiError ? [e.message, ...e.details].join(" ") : "Update failed"); }
  };

  if (loading) return <Spinner />;
  if (error || !project) return <ErrorBox message={error || "Project not found"} onRetry={() => loadAll()} />;
  const sel = rooms.find((r) => r.name === selected) || null;
  const selReq = sel ? project.rooms.find((r) => r.name === sel.name) : null;
  const selChecks = sel ? (engineChecks?.items || []).filter((c) => c.room === sel.name && c.id !== "relationship" && c.status !== "passed") : [];
  const plot = { width: project.plot_width, height: project.plot_height };

  return (
    <>
      <PageHeader title="Floor Plan Editor" subtitle={<>{project.name} · {len(plot.width)} × {len(plot.height)} · <Link href={`/projects/${id}`} className="text-accent font-semibold">project overview</Link></>} />
      {layout && layout.source === "demo" && <div className="mb-3 bg-warning-soft text-warning border border-warning/30 rounded p-2 text-sm">This is a DEMO RESULT. Saving edits turns it into a separate MANUAL EDIT layout validated by the engine.</div>}
      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)_290px]">
        {/* LEFT: requirements */}
        <aside className="card p-3 space-y-3 h-fit">
          <h2 className="text-sm font-bold uppercase tracking-wide">Project requirements</h2>
          <p className="text-xs text-muted">{project.name}<br />Plot {len(plot.width)} × {len(plot.height)} ({area(plot.width * plot.height)})</p>
          <div className="flex gap-1"><select className="input !py-1.5" value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Room type">{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</select><button className="btn btn-primary btn-sm" onClick={addReqRoom}><Plus size={14} /> Add</button></div>
          <ul className="divide-y divide-line max-h-[340px] overflow-y-auto border border-line rounded">
            {project.rooms.map((r) => (
              <li key={r.id} className={`p-2 text-sm cursor-pointer ${selected === r.name ? "bg-secondary" : "hover:bg-secondary/50"}`} onClick={() => setSelected(r.name)}>
                <div className="flex items-center justify-between gap-1"><span className="font-medium truncate">{r.name}</span>
                  <span className="flex gap-1 shrink-0"><button className="text-muted hover:text-accent" aria-label={`Edit ${r.name}`} onClick={(e) => { e.stopPropagation(); setEditReq({ ...r }); }}><Pencil size={14} /></button>
                    <button className="text-muted hover:text-danger" aria-label={`Remove ${r.name}`} onClick={(e) => { e.stopPropagation(); removeReqRoom(r); }}><Trash2 size={14} /></button></span></div>
                <p className="text-xs text-muted">{area(r.required_area)} · min {len(r.min_width)} × {len(r.min_height)}</p>
              </li>))}
          </ul>
          {editReq && (
            <div className="border border-accent/40 rounded p-2 space-y-2 bg-secondary/40">
              <p className="text-xs font-bold uppercase">Edit “{project.rooms.find((r) => r.id === editReq.id)?.name}”</p>
              <input className="input" value={editReq.name} onChange={(e) => setEditReq({ ...editReq, name: e.target.value })} aria-label="Name" />
              <select className="input" value={editReq.room_type} onChange={(e) => setEditReq({ ...editReq, room_type: e.target.value })}>{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <div className="grid grid-cols-3 gap-1">
                {([["required_area", "Area"], ["min_width", "Min W"], ["min_height", "Min H"]] as const).map(([k, l]) => (
                  <label key={k} className="text-[10px] font-semibold text-muted uppercase">{l}<input type="number" step="0.5" className="input !py-1" value={editReq[k]} onChange={(e) => setEditReq({ ...editReq, [k]: Number(e.target.value) })} /></label>))}
              </div>
              <div className="flex gap-1 justify-end"><button className="btn btn-sm" onClick={() => setEditReq(null)}><X size={12} /> Cancel</button><button className="btn btn-sm btn-primary" onClick={saveReq}>Save</button></div>
            </div>)}
          <div><h3 className="text-xs font-bold uppercase tracking-wide mb-1">Relationships</h3>
            {project.relationships.length === 0 ? <p className="text-xs text-muted">None</p> : <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">{project.relationships.map((r) => <li key={r.id}><b>{r.room_a}</b> · {REL_LABELS[r.rel_type].toLowerCase()} · <b>{r.room_b}</b></li>)}</ul>}</div>
          <div><h3 className="text-xs font-bold uppercase tracking-wide mb-1">Constraints</h3>
            <ul className="text-xs text-muted space-y-0.5"><li>No overlap · inside plot · min dimensions · required areas</li><li>Min corridor width {len(project.constraints.min_corridor_width)}</li><li>Connectivity {project.constraints.require_connectivity ? "required" : "optional"}</li></ul></div>
        </aside>

        {/* CENTRE: floor plan */}
        <div className="min-w-0 space-y-3">
          <div className="card p-2 flex flex-wrap items-center gap-2">
            <select className="input !w-auto !py-1.5" value={layoutId ?? ""} onChange={(e) => switchLayout(Number(e.target.value))} disabled={layouts.length === 0} aria-label="Layout">
              {layouts.length === 0 && <option value="">No layouts</option>}
              {layouts.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.name} · {l.result_badge}{l.is_valid ? "" : " · INVALID"}</option>)}
            </select>
            {layout && <ResultBadge badge={layout.result_badge} />}
            <select className="input !w-auto !py-1.5" value={snap} onChange={(e) => setSnap(Number(e.target.value))} aria-label="Grid snapping"><option value={0.1}>Snap 0.1 m</option><option value={0.5}>Snap 0.5 m</option><option value={1}>Snap 1 m</option></select>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} className="accent-accent" /> Grid</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={paths} onChange={(e) => setPaths(e.target.checked)} className="accent-accent" /> Circulation</label>
            <span className="flex-1" />
            <button className="btn btn-sm" onClick={undo} disabled={!past.length}><Undo2 size={14} /> Undo</button>
            <button className="btn btn-sm" onClick={redo} disabled={!future.length}><Redo2 size={14} /> Redo</button>
            <button className="btn btn-sm" onClick={() => setResetKey((k) => k + 1)}><RotateCcw size={14} /> Reset view</button>
            <button className="btn btn-sm" onClick={() => runValidation(rooms)} disabled={!layout || validating}>{validating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Validate Layout</button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={!layout || saving || !dirty}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes</button>
          </div>
          {!layout ? (
            <EmptyState title="No layout to edit yet" text="Generate layouts with the optimizer, or create a starting arrangement and place the rooms yourself. Manual layouts are validated by the C++ engine."
              action={<><button className="btn btn-primary" onClick={createManual}>Create starting arrangement</button><Link href={`/projects/${id}/optimize`} className="btn">Go to optimization</Link></>} />
          ) : (
            <>
              <FloorPlanView plot={plot} rooms={rooms} entrance={layout.circulation.entrance} paths={layout.circulation.paths} showPaths={paths} selected={selected} issues={issues}
                interactive editable showGrid={grid} snap={snap} resetKey={resetKey} onSelect={setSelected} onChange={onChange} />
              <div className={`rounded border p-2 text-sm flex items-start gap-2 ${issueCount > 0 ? "bg-danger-soft text-danger border-danger/30" : engineChecks?.valid || (!dirty && layout.is_valid) ? "bg-success-soft text-success border-success/30" : "bg-secondary border-line text-muted"}`} role="status">
                {issueCount > 0 ? <AlertTriangle size={16} className="mt-0.5" /> : <CheckCircle2 size={16} className="mt-0.5" />}
                <div className="flex-1">
                  {issueCount > 0 ? <><b>{issueCount} room{issueCount > 1 ? "s" : ""} with problems</b> — highlighted in red. This layout cannot be saved as valid.
                    <ul className="text-xs mt-1 list-disc ml-4">{Object.entries(issues).slice(0, 5).map(([n, m]) => <li key={n}><b>{n}</b>: {m[0]}</li>)}</ul></>
                    : engineChecks?.stale ? "Engine unavailable — only instant overlap/boundary checks are active."
                    : engineChecks ? (engineChecks.valid ? "Engine validation passed: all hard constraints satisfied." : "Engine reports constraint violations (see room properties).")
                    : layout.is_valid && !dirty ? "Saved layout is valid." : "Move or resize a room to trigger validation."}
                </div>
                {dirty && <span className="badge bg-warning-soft text-warning border-warning/30">Unsaved</span>}
              </div>
            </>)}
        </div>

        {/* RIGHT: room properties */}
        <aside className="card p-3 h-fit space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide">Room properties</h2>
          {!sel ? <p className="text-sm text-muted">Select a room on the floor plan or in the list.</p> : (
            <>
              <div><p className="label">Name</p><p className="font-semibold text-primary">{sel.name}</p><p className="text-xs text-muted">{sel.type}</p></div>
              {sel.isFree ? <p className="text-xs text-muted">Engine-generated open space (not a programme room).</p> : (
                <div className="grid grid-cols-2 gap-2">
                  {([["x", "X"], ["y", "Y"], ["width", "Width"], ["height", "Height"]] as const).map(([k, l]) => (
                    <label key={k} className="block"><span className="label">{l} (m)</span>
                      <input type="number" step={snap} className="input" value={Number(sel[k].toFixed(2))} onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v) && ((k !== "width" && k !== "height") || v > 0)) patchRoom(sel.name, { [k]: v }); }} /></label>))}
                </div>)}
              <div className="text-sm space-y-1">
                <p><span className="text-muted">Area:</span> <b>{area(sel.width * sel.height)}</b>{selReq && <span className="text-muted"> (required {area(selReq.required_area)})</span>}</p>
                {selReq && <p><span className="text-muted">Min size:</span> {len(selReq.min_width)} × {len(selReq.min_height)}</p>}
                <p><span className="text-muted">Adjacent rooms:</span> {adjacentRooms(rooms, sel.name).join(", ") || "none"}</p>
              </div>
              <div><p className="label">Constraint status</p>
                {(issues[sel.name]?.length || selChecks.length) ? (
                  <ul className="text-xs text-danger space-y-1">{[...(issues[sel.name] || []), ...selChecks.filter((c) => !(issues[sel.name] || []).includes(c.message)).map((c) => c.message)].map((m, i) => <li key={i}>• {m}</li>)}</ul>
                ) : <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={14} /> {engineChecks ? "All checks passed" : "No problems detected"}</p>}
              </div>
            </>)}
          {layout && <div className="border-t border-line pt-2 text-xs text-muted space-y-1">
            <p>Layout metrics (saved): efficiency {layout.metrics.areaEfficiency?.toFixed(1)}% · adjacency {layout.metrics.adjacencySatisfaction?.toFixed(1)}%</p>
            <Link className="text-accent font-semibold" href={`/projects/${id}/validation?layout=${layout.id}`}>Open full validation report →</Link></div>}
        </aside>
      </div>
    </>
  );
}
