"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { setActiveProject } from "@/hooks/useActiveProject";
import { EmptyState, ErrorBox, MetricTile, PageHeader, ResultBadge, Section, Spinner } from "@/components/common/ui";
import type { CheckItem } from "@/types";

const ID_LABELS: Record<string, string> = {
  overlap: "Room overlap", boundary: "Plot boundary", min_dimensions: "Room dimensions", required_area: "Required area", aspect_ratio: "Aspect ratio", connectivity: "Connectivity / accessibility",
  corridor_width: "Corridor width", relationship: "Spatial relationships", open_space: "Open space", missing_space: "Required spaces",
};

export default function ValidationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { notify } = useToast();
  const { data: project } = useAsync(() => api.project(id), [id]);
  const { data: layouts, error, loading, reload, setData } = useAsync(() => api.layouts(id), [id]);
  const [lid, setLid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setActiveProject(Number(id)); }, [id]);
  useEffect(() => {
    if (!layouts || lid !== null) return;
    const want = Number(search.get("layout"));
    const b = layouts.find((l) => l.id === want) || layouts.find((l) => l.is_selected) || layouts[0];
    if (b) setLid(b.id);
  }, [layouts, lid, search]);
  const layout = layouts?.find((l) => l.id === lid);

  const groups = useMemo(() => {
    const v = layout?.validation || [];
    return { failed: v.filter((c) => c.status === "failed"), warning: v.filter((c) => c.status === "warning"), passed: v.filter((c) => c.status === "passed") };
  }, [layout]);
  const byRoom = useMemo(() => {
    const m = new Map<string, CheckItem[]>();
    (layout?.rooms || []).filter((r) => !r.isFree).forEach((r) => m.set(r.name, []));
    (layout?.validation || []).filter((c) => c.room && m.has(c.room)).forEach((c) => m.get(c.room)!.push(c));
    return m;
  }, [layout]);

  const rerun = async () => {
    if (!layout) return;
    setBusy(true);
    try {
      const r = await api.validateLayout(layout.id);
      setData(await api.layouts(id));
      notify(r.from_saved_report ? "info" : "success", r.from_saved_report ? "Engine unavailable — showing the saved validation report of this demo layout." : "Validation re-run by the C++ engine.");
    } catch (e) { notify("error", e instanceof Error ? e.message : "Validation failed"); } finally { setBusy(false); }
  };
  const goto = (room: string) => router.push(`/projects/${id}/editor?layout=${layout!.id}&room=${encodeURIComponent(room)}`);

  if (loading) return <Spinner />;
  if (error || !project) return <ErrorBox message={error || "Project not found"} onRetry={reload} />;
  if (!layouts || layouts.length === 0) return (<><PageHeader title="Validation" /><EmptyState title="No layouts to validate" text="Generate or create a layout first." action={<Link href={`/projects/${id}/optimize`} className="btn btn-primary">Go to optimization</Link>} /></>);

  const Row = ({ c, tone }: { c: CheckItem; tone: string }) => (
    <li><button className={`w-full text-left flex items-start gap-2 p-2 rounded hover:bg-secondary/60 ${tone}`} onClick={() => c.room && goto(c.room)} disabled={!c.room}>
      <span className="mt-0.5 shrink-0">{c.status === "failed" ? <XCircle size={16} /> : c.status === "warning" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}</span>
      <span className="flex-1 text-sm"><b>{ID_LABELS[c.id] || c.id}</b>{c.room ? ` · ${c.room}` : ""} <span className="badge ml-1 bg-secondary text-muted border-line">{c.category}</span><br /><span className="text-ink/80">{c.message}</span></span>
      {c.room && <ChevronRight size={16} className="mt-0.5 text-muted" />}</button></li>);

  return (
    <>
      <PageHeader title="Constraint validation" subtitle="Geometry and constraint checks computed by the C++ engine. Click an issue to open the room in the editor."
        actions={<><select className="input !w-auto" value={lid ?? ""} onChange={(e) => setLid(Number(e.target.value))} aria-label="Layout">{layouts.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.name}{l.is_valid ? "" : " (invalid)"}</option>)}</select>{layout && <ResultBadge badge={layout.result_badge} />}
          <button className="btn btn-primary" onClick={rerun} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Re-run validation</button></>} />
      {layout && <>
        <div className="grid gap-4 sm:grid-cols-4 mb-6">
          <MetricTile label="Overall" value={<span className={layout.is_valid ? "text-success" : "text-danger"}>{layout.is_valid ? "VALID" : "INVALID"}</span>} />
          <MetricTile label="Passed" value={groups.passed.length} /><MetricTile label="Failed" value={groups.failed.length} /><MetricTile label="Warnings" value={groups.warning.length} />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <Section title={`Failed constraints (${groups.failed.length})`}>{groups.failed.length === 0 ? <p className="text-sm text-success flex gap-2 items-center"><CheckCircle2 size={16} /> No failed constraints.</p> : <ul className="space-y-1">{groups.failed.map((c, i) => <Row key={i} c={c} tone="text-danger" />)}</ul>}</Section>
            <Section title={`Warnings (${groups.warning.length})`}>{groups.warning.length === 0 ? <p className="text-sm text-muted">No warnings.</p> : <ul className="space-y-1">{groups.warning.map((c, i) => <Row key={i} c={c} tone="text-warning" />)}</ul>}</Section>
            <Section title={`Passed constraints (${groups.passed.length})`}><details><summary className="cursor-pointer text-sm text-accent font-semibold">Show passed checks</summary><ul className="space-y-1 mt-2 max-h-[420px] overflow-y-auto">{groups.passed.map((c, i) => <Row key={i} c={c} tone="text-success" />)}</ul></details></Section>
          </div>
          <Section title="Room-wise validation">
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Room</th><th className="th">Status</th><th className="th">Issues</th></tr></thead>
              <tbody>{[...byRoom.entries()].map(([name, items]) => { const f = items.filter((c) => c.status === "failed"), w = items.filter((c) => c.status === "warning");
                return <tr key={name} className="cursor-pointer hover:bg-secondary/50" onClick={() => goto(name)}><td className="td font-medium">{name}</td>
                  <td className="td">{f.length ? <span className="badge bg-danger-soft text-danger border-danger/30">{f.length} failed</span> : w.length ? <span className="badge bg-warning-soft text-warning border-warning/30">{w.length} warning</span> : <span className="badge bg-success-soft text-success border-success/30">passed</span>}</td>
                  <td className="td text-xs text-muted">{[...f, ...w].map((c) => c.message).join(" · ") || "—"}</td></tr>; })}</tbody></table></div>
          </Section>
        </div></>}
    </>
  );
}
