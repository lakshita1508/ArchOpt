"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import { setActiveProject } from "@/hooks/useActiveProject";
import FloorPlanView from "@/components/editor/FloorPlanView";
import CirculationGraph from "@/components/analytics/CirculationGraph";
import { EmptyState, ErrorBox, MetricTile, PageHeader, ResultBadge, Section, Spinner } from "@/components/common/ui";
import { num } from "@/lib/format";
import type { LayoutData } from "@/types";

export default function CirculationPage() {
  const { id } = useParams<{ id: string }>();
  const { notify } = useToast();
  const { len } = useSettings();
  const { data: project } = useAsync(() => api.project(id), [id]);
  const { data: layouts, error, loading, reload, setData } = useAsync(() => api.layouts(id), [id]);
  const [lid, setLid] = useState<number | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [from, setFrom] = useState("ENTRANCE");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setActiveProject(Number(id)); }, [id]);
  useEffect(() => { if (layouts && lid === null) { const b = layouts.find((l) => l.is_selected) || layouts.find((l) => l.is_valid) || layouts[0]; if (b) setLid(b.id); } }, [layouts, lid]);
  const layout: LayoutData | undefined = layouts?.find((l) => l.id === lid);
  const circ = layout?.circulation;

  const pathTo = useMemo(() => (circ?.paths || []).find((p) => p.room === target) || null, [circ, target]);
  const names = circ?.matrixNames || [];
  const pairDist = useMemo(() => {
    if (!circ?.distanceMatrix || !target || from === "ENTRANCE") return null;
    const i = names.indexOf(from), j = names.indexOf(target);
    return i >= 0 && j >= 0 ? circ.distanceMatrix[i][j] : null;
  }, [circ, from, target, names]);

  const recompute = async () => {
    if (!layout) return;
    setBusy(true);
    try { await api.validateLayout(layout.id); setData(await api.layouts(id)); notify("success", "Circulation recomputed from the layout geometry."); }
    catch (e) { notify("error", e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  if (error || !project) return <ErrorBox message={error || "Project not found"} onRetry={reload} />;
  if (!layouts || layouts.length === 0) return (<><PageHeader title="Circulation analysis" /><EmptyState title="No layouts to analyse" text="Generate layouts first; circulation is calculated from the actual room geometry." action={<Link href={`/projects/${id}/optimize`} className="btn btn-primary">Go to optimization</Link>} /></>);
  const plot = { width: project.plot_width, height: project.plot_height };
  const route = pathTo?.route || [];
  const rows = [...(circ?.paths || [])].sort((a, b) => (a.reachable === b.reachable ? a.distance - b.distance : a.reachable ? -1 : 1));

  return (
    <>
      <PageHeader title="Circulation analysis" subtitle="Weighted graph: rooms are nodes, shared walls with a door are edges, weights are walking distances. Paths use Dijkstra; room-to-room distances use A*. Only circulation-type rooms can be walked through."
        actions={<><select className="input !w-auto" value={lid ?? ""} onChange={(e) => { setLid(Number(e.target.value)); setTarget(null); }} aria-label="Layout">{layouts.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.name}</option>)}</select>{layout && <ResultBadge badge={layout.result_badge} />}
          <button className="btn" onClick={recompute} disabled={busy || layout?.source === "demo"} title={layout?.source === "demo" ? "Demo layouts use their saved circulation analysis" : ""}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recompute</button></>} />
      {!circ || !circ.paths ? <ErrorBox message="This layout has no stored circulation analysis. Use Recompute (requires the C++ engine)." /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
            <MetricTile label="Connectivity" value={circ.fullyConnected ? "Fully connected" : `${circ.disconnected?.length} disconnected`} hint={`${circ.components} physical component(s)`} />
            <MetricTile label="Average walk" value={len(circ.avgDistance || 0)} />
            <MetricTile label="Longest walk" value={len(circ.maxDistance || 0)} />
            <MetricTile label="Bottlenecks" value={circ.bottlenecks?.length ?? 0} hint={circ.bottlenecks?.length ? circ.bottlenecks.map((b) => `${b.room} (${b.load} rooms)`).join(", ") : "none detected"} />
          </div>
          {!circ.fullyConnected && <div className="mb-4 bg-danger-soft text-danger border border-danger/30 rounded p-3 text-sm flex gap-2"><AlertTriangle size={16} className="mt-0.5" /><span>Disconnected rooms (not reachable from the entrance): <b>{circ.disconnected?.join(", ")}</b></span></div>}
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Highlighted route on floor plan" right={target && <span className="text-xs text-muted">Entrance → {target}</span>}>
              <FloorPlanView plot={plot} rooms={layout!.rooms} entrance={circ.entrance} highlight={pathTo?.reachable ? pathTo.polyline : null} highlightRooms={route} selected={target} interactive onSelect={(n) => setTarget(n)} />
              <div className="mt-3 text-sm">{!target ? <p className="text-muted">Click a room (here, in the graph or in the table) to highlight its shortest path from the entrance.</p>
                : pathTo?.reachable ? <p><CheckCircle2 size={14} className="inline text-success mr-1" /><b>Walking distance: {len(pathTo.distance)}</b> via {pathTo.route.join(" → ")}</p>
                : <p className="text-danger"><AlertTriangle size={14} className="inline mr-1" /><b>{target}</b> cannot be reached from the entrance.</p>}</div>
            </Section>
            <Section title="Room connection graph"><CirculationGraph plot={plot} circ={circ} route={route} selected={target} onSelect={setTarget} /><p className="text-xs text-muted mt-2">Edge labels = walking distance in metres (through the door at the shared wall). Indigo nodes can be walked through; grey nodes are dead-end rooms.</p></Section>
          </div>
          <div className="grid gap-6 xl:grid-cols-2 mt-6">
            <Section title="Entrance-to-room shortest paths">
              <div className="overflow-x-auto max-h-[420px]"><table className="w-full"><thead><tr><th className="th">Room</th><th className="th">Distance</th><th className="th">Route</th></tr></thead>
                <tbody>{rows.map((p) => <tr key={p.room} className={`cursor-pointer hover:bg-secondary/50 ${target === p.room ? "bg-secondary" : ""}`} onClick={() => setTarget(p.room)}>
                  <td className="td font-medium">{p.room}</td><td className={`td ${p.reachable ? "" : "text-danger"}`}>{p.reachable ? len(p.distance) : "unreachable"}</td><td className="td text-xs text-muted">{p.reachable ? p.route.slice(1).join(" → ") : "—"}</td></tr>)}</tbody></table></div>
            </Section>
            <Section title="Distance between spaces (A*)">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label><span className="label">From</span><select className="input" value={from} onChange={(e) => setFrom(e.target.value)}><option value="ENTRANCE">Entrance</option>{names.map((n) => <option key={n}>{n}</option>)}</select></label>
                <label><span className="label">To</span><select className="input" value={target ?? ""} onChange={(e) => setTarget(e.target.value || null)}><option value="">Select…</option>{names.map((n) => <option key={n}>{n}</option>)}</select></label>
              </div>
              <p className="text-sm mb-3">{!target ? <span className="text-muted">Choose two spaces.</span> : from === "ENTRANCE" ? (pathTo?.reachable ? <>Entrance → {target}: <b>{len(pathTo.distance)}</b></> : "Unreachable") : pairDist === null ? <span className="text-danger">No walkable route between these spaces.</span> : <>{from} → {target}: <b>{len(pairDist)}</b></>}</p>
              <div className="overflow-auto max-h-[300px] border border-line rounded"><table className="text-xs"><thead><tr><th className="th"></th>{names.map((n) => <th key={n} className="th !px-1 whitespace-nowrap" title={n}>{n.length > 6 ? n.slice(0, 5) + "…" : n}</th>)}</tr></thead>
                <tbody>{(circ.distanceMatrix || []).map((row, i) => <tr key={i}><td className="td font-semibold whitespace-nowrap">{names[i]}</td>{row.map((d, j) => <td key={j} className={`td !px-1 text-center ${i === j ? "text-muted" : d === null ? "text-danger" : ""}`}>{i === j ? "·" : d === null ? "∞" : num(d, 0)}</td>)}</tr>)}</tbody></table></div>
            </Section>
          </div>
        </>)}
    </>
  );
}
