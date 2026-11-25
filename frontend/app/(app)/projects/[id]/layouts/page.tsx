"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, Download, ExternalLink, GitCompare, LayoutGrid, Pencil, Star, Trash2 } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { setActiveProject } from "@/hooks/useActiveProject";
import FloorPlanView from "@/components/editor/FloorPlanView";
import { ConfirmDialog, EmptyState, ErrorBox, PageHeader, ResultBadge, Section, Spinner } from "@/components/common/ui";
import { differingRooms } from "@/lib/geometry";
import { num } from "@/lib/format";
import { useEffect } from "react";
import type { LayoutData } from "@/types";

const METRICS: { key: keyof LayoutData["metrics"]; label: string; unit: string; better: "high" | "low" }[] = [
  { key: "areaEfficiency", label: "Area efficiency", unit: "%", better: "high" }, { key: "adjacencySatisfaction", label: "Adjacency satisfaction", unit: "%", better: "high" },
  { key: "circulationScore", label: "Circulation score", unit: "", better: "high" }, { key: "accessibilityScore", label: "Accessibility score", unit: "%", better: "high" },
  { key: "violations", label: "Constraint violations", unit: "", better: "low" }, { key: "totalCost", label: "Optimization cost", unit: "", better: "low" },
  { key: "avgWalk", label: "Average walking distance", unit: " m", better: "low" }, { key: "unusedArea", label: "Unused area", unit: " m²", better: "low" },
];

export default function LayoutsPage() {
  const { id } = useParams<{ id: string }>();
  const { notify } = useToast();
  const { data: project } = useAsync(() => api.project(id), [id]);
  const { data, error, loading, reload } = useAsync(() => api.layouts(id), [id]);
  const [cmp, setCmp] = useState<number[]>([]);
  const [del, setDel] = useState<LayoutData | null>(null);
  const [rename, setRename] = useState<{ id: number; name: string } | null>(null);
  useEffect(() => { setActiveProject(Number(id)); }, [id]);

  const compared = useMemo(() => (data || []).filter((l) => cmp.includes(l.id)), [data, cmp]);
  const toggle = (lid: number) => setCmp((c) => (c.includes(lid) ? c.filter((x) => x !== lid) : c.length >= 3 ? [...c.slice(1), lid] : [...c, lid]));
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); notify("success", ok); reload(); } catch (e) { notify("error", e instanceof Error ? e.message : "Failed"); } };

  if (loading) return <Spinner />;
  if (error || !data || !project) return <ErrorBox message={error || "Could not load"} onRetry={reload} />;
  const plot = { width: project.plot_width, height: project.plot_height };
  const best = (k: keyof LayoutData["metrics"], better: "high" | "low") => { const vals = compared.map((l) => Number(l.metrics[k])); return better === "high" ? Math.max(...vals) : Math.min(...vals); };

  return (
    <>
      <PageHeader title="Layout alternatives" subtitle={`${project.name} · ${data.length} stored layouts`} actions={<Link href={`/projects/${id}/optimize`} className="btn btn-primary">Generate more</Link>} />
      {data.length === 0 ? <EmptyState icon={<LayoutGrid size={36} />} title="No layouts yet" text="Run an optimization to generate floor-plan alternatives." action={<Link href={`/projects/${id}/optimize`} className="btn btn-primary">Go to optimization</Link>} /> : (
        <>
          {data.some((l) => l.source === "demo") && <div className="mb-4 bg-warning-soft text-warning border border-warning/30 rounded p-3 text-sm">Some layouts below are <b>DEMO RESULTS</b>: predefined, verified sample results — not newly calculated.</div>}
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {data.map((l) => (
              <article key={l.id} className={`card p-3 space-y-3 ${l.is_selected ? "ring-2 ring-accent" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">{rename?.id === l.id ? (
                    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); act(() => api.updateLayout(l.id, { name: rename.name }), "Layout saved."); setRename(null); }}>
                      <input className="input !py-1" value={rename.name} onChange={(e) => setRename({ id: l.id, name: e.target.value })} autoFocus aria-label="Layout name" /><button className="btn btn-sm btn-primary"><Check size={14} /></button></form>
                  ) : <h3 className="font-semibold text-primary truncate">{l.label} · {l.name}</h3>}
                    <p className="text-xs text-muted">Layout ID #{l.id}</p></div>
                  <div className="flex flex-col items-end gap-1"><ResultBadge badge={l.result_badge} />{l.is_selected && <span className="badge bg-secondary text-accent border-accent/30"><Star size={10} className="mr-1" /> Preferred</span>}</div>
                </div>
                <FloorPlanView plot={plot} rooms={l.rooms} entrance={l.circulation.entrance} compact />
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">Area efficiency</dt><dd className="font-semibold text-right">{num(l.metrics.areaEfficiency)}%</dd>
                  <dt className="text-muted">Adjacency satisfaction</dt><dd className="font-semibold text-right">{num(l.metrics.adjacencySatisfaction)}%</dd>
                  <dt className="text-muted">Circulation score</dt><dd className="font-semibold text-right">{num(l.metrics.circulationScore)}</dd>
                  <dt className="text-muted">Accessibility score</dt><dd className="font-semibold text-right">{num(l.metrics.accessibilityScore)}%</dd>
                  <dt className="text-muted">Constraint violations</dt><dd className={`font-semibold text-right ${l.metrics.violations ? "text-danger" : "text-success"}`}>{l.metrics.violations}</dd>
                  <dt className="text-muted">Optimization cost</dt><dd className="font-semibold text-right">{num(l.metrics.totalCost, 2)}</dd>
                </dl>
                <div className="flex flex-wrap gap-1 border-t border-line pt-2">
                  <label className="btn btn-sm cursor-pointer"><input type="checkbox" className="accent-accent mr-1" checked={cmp.includes(l.id)} onChange={() => toggle(l.id)} /> Compare</label>
                  <Link href={`/projects/${id}/layouts/${l.id}`} className="btn btn-sm"><ExternalLink size={14} /> Open</Link>
                  <button className="btn btn-sm" onClick={() => act(() => api.updateLayout(l.id, { is_selected: !l.is_selected }), l.is_selected ? "Preference removed." : "Marked as preferred layout.")}><Star size={14} /> {l.is_selected ? "Unselect" : "Select preferred"}</button>
                  <button className="btn btn-sm" onClick={() => setRename({ id: l.id, name: l.name })}><Pencil size={14} /> Save</button>
                  <button className="btn btn-sm" onClick={() => api.download(l.id, "svg", `${l.label}.svg`).catch((e) => notify("error", e.message))}><Download size={14} /> SVG</button>
                  <button className="btn btn-sm" onClick={() => api.download(l.id, "pdf", `${l.label}.pdf`).catch((e) => notify("error", e.message))}><Download size={14} /> PDF</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDel(l)} aria-label={`Delete ${l.label}`}><Trash2 size={14} /></button>
                </div>
              </article>))}
          </div>

          <div className="mt-8">
            <Section title={`Side-by-side comparison${compared.length ? ` (${compared.length})` : ""}`} right={compared.length > 0 && <button className="btn btn-sm" onClick={() => setCmp([])}>Clear</button>}>
              {compared.length < 2 ? <p className="text-sm text-muted py-6 text-center"><GitCompare className="inline mr-2" size={16} />Tick “Compare” on two or three layouts to compare them. Rooms whose position or size differs from the first layout are outlined in orange.</p> : (
                <div className="space-y-5">
                  <div className={`grid gap-4 ${compared.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
                    {compared.map((l, i) => (
                      <div key={l.id}><div className="flex items-center justify-between mb-1"><b className="text-primary text-sm">{l.label} · {l.name}</b><ResultBadge badge={l.result_badge} /></div>
                        <FloorPlanView plot={plot} rooms={l.rooms} entrance={l.circulation.entrance} compact diff={i === 0 ? undefined : differingRooms(compared[0].rooms, l.rooms)} maxHeight={340} />
                        {i > 0 && <p className="text-xs text-muted mt-1">{differingRooms(compared[0].rooms, l.rooms).size} room(s) differ from {compared[0].label}</p>}</div>))}
                  </div>
                  <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Metric</th>{compared.map((l) => <th key={l.id} className="th">{l.label}</th>)}</tr></thead>
                    <tbody>{METRICS.map((m) => { const b = best(m.key, m.better); return (
                      <tr key={m.key}><td className="td text-muted">{m.label}</td>{compared.map((l) => { const v = Number(l.metrics[m.key]); return <td key={l.id} className={`td ${v === b ? "font-bold text-success" : ""}`}>{num(v, m.key === "totalCost" ? 2 : 1)}{m.unit}{v === b && compared.length > 1 ? " ✓" : ""}</td>; })}</tr>); })}</tbody></table>
                    <p className="text-xs text-muted mt-1">✓ = best value among the compared layouts.</p></div>
                </div>)}
            </Section>
          </div>
        </>)}
      <ConfirmDialog open={!!del} title="Delete layout?" message={<>Delete <b>{del?.label} · {del?.name}</b>? This cannot be undone.</>} onCancel={() => setDel(null)}
        onConfirm={() => { const l = del!; setDel(null); setCmp((c) => c.filter((x) => x !== l.id)); act(() => api.deleteLayout(l.id), "Layout deleted."); }} />
    </>
  );
}
