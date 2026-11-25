"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Download, FileText, Image as ImageIcon, XCircle } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import FloorPlanView from "@/components/editor/FloorPlanView";
import { AdjacencyChart, CirculationChart, RoomAreaChart, UtilizationChart } from "@/components/analytics/Charts";
import { ErrorBox, MetricTile, PageHeader, ResultBadge, Section, Spinner } from "@/components/common/ui";
import { num } from "@/lib/format";

export default function LayoutAnalytics() {
  const { id, layoutId } = useParams<{ id: string; layoutId: string }>();
  const { notify } = useToast();
  const { len, area } = useSettings();
  const { data: project } = useAsync(() => api.project(id), [id]);
  const { data: l, error, loading, reload } = useAsync(() => api.layout(layoutId), [layoutId]);
  const [paths, setPaths] = useState(true);
  if (loading) return <Spinner />;
  if (error || !l || !project) return <ErrorBox message={error || "Layout not found"} onRetry={reload} />;
  const m = l.metrics;
  const failed = l.validation.filter((c) => c.status === "failed"), warns = l.validation.filter((c) => c.status === "warning");
  const dl = (kind: "svg" | "pdf" | "report") => api.download(l.id, kind, `${l.label}.${kind === "report" ? "json" : kind}`).then(() => notify("success", "Export downloaded.")).catch((e) => notify("error", e.message));
  return (
    <>
      <PageHeader title={`Layout analytics — ${l.label} · ${l.name}`} subtitle={<><Link className="text-accent font-semibold" href={`/projects/${id}`}>{project.name}</Link> · <Link className="text-accent font-semibold" href={`/projects/${id}/layouts`}>all alternatives</Link></>}
        actions={<><ResultBadge badge={l.result_badge} /><button className="btn" onClick={() => dl("svg")}><ImageIcon size={16} /> SVG</button><button className="btn" onClick={() => dl("pdf")}><Download size={16} /> PDF</button><button className="btn" onClick={() => dl("report")}><FileText size={16} /> Metrics report</button></>} />
      {l.source === "demo" && <div className="mb-4 bg-warning-soft text-warning border border-warning/30 rounded p-3 text-sm"><b>DEMO RESULT</b> — predefined, verified sample result. It was not newly calculated; exported files carry the same label.</div>}
      {l.source === "manual" && <div className="mb-4 bg-secondary text-accent border border-accent/30 rounded p-3 text-sm"><b>MANUAL EDIT</b> — edited by hand and validated by the engine.</div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section title="Floor plan" right={<label className="text-xs flex items-center gap-1"><input type="checkbox" className="accent-accent" checked={paths} onChange={(e) => setPaths(e.target.checked)} /> circulation routes</label>}>
          <FloorPlanView plot={{ width: project.plot_width, height: project.plot_height }} rooms={l.rooms} entrance={l.circulation.entrance} paths={l.circulation.paths} showPaths={paths} interactive />
          <p className="text-xs text-muted mt-2">Scroll to zoom, drag background to pan.</p>
        </Section>
        <div className="grid grid-cols-2 gap-3 content-start">
          <MetricTile label="Area efficiency" value={`${num(m.areaEfficiency)}%`} hint="programme rooms ÷ plot" />
          <MetricTile label="Adjacency" value={`${num(m.adjacencySatisfaction)}%`} />
          <MetricTile label="Circulation score" value={num(m.circulationScore)} hint={`avg walk ${len(m.avgWalk)}`} />
          <MetricTile label="Accessibility" value={`${num(m.accessibilityScore)}%`} />
          <MetricTile label="Usable area" value={area(m.usableArea)} />
          <MetricTile label="Circulation area" value={area(m.circulationArea)} />
          <MetricTile label="Unused area" value={area(m.unusedArea)} />
          <MetricTile label="Optimization cost" value={num(m.totalCost, 2)} />
          <div className={`col-span-2 card p-3 text-sm flex items-center gap-2 ${l.is_valid ? "text-success" : "text-danger"}`}>{l.is_valid ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span><b>Constraint validation:</b> {l.is_valid ? "all hard constraints satisfied" : `${failed.length} failed`}{warns.length ? ` · ${warns.length} warning(s)` : ""} · <Link className="text-accent font-semibold" href={`/projects/${id}/validation?layout=${l.id}`}>details</Link></span></div>
          {m.costBreakdown && <div className="col-span-2 card p-3"><p className="label">Cost breakdown</p><ul className="text-xs grid grid-cols-2 gap-x-4">{Object.entries(m.costBreakdown).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><b>{num(v, 2)}</b></li>)}</ul></div>}
        </div>
      </div>
      <div className="grid gap-6 mt-6 lg:grid-cols-2">
        <Section title="Room-wise area distribution"><RoomAreaChart layout={l} /></Section>
        <Section title="Space utilization"><UtilizationChart layout={l} /></Section>
        <Section title="Adjacency performance"><AdjacencyChart layout={l} /></Section>
        <Section title="Circulation performance"><CirculationChart layout={l} /></Section>
      </div>
      <div className="mt-6"><Section title="Rooms"><div className="overflow-x-auto"><table className="w-full"><thead><tr>{["Room", "Type", "Position", "Size", "Area", "Required"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{l.rooms.map((r) => <tr key={r.name}><td className="td font-medium">{r.name}</td><td className="td">{r.type}</td><td className="td">({num(r.x)}, {num(r.y)})</td><td className="td">{len(r.width)} × {len(r.height)}</td><td className="td">{area(r.width * r.height)}</td><td className="td">{r.isFree ? "–" : area(r.requiredArea ?? 0)}</td></tr>)}</tbody></table></div></Section></div>
    </>
  );
}
