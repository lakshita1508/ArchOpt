"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BarChart3, LayoutGrid, Network, Pencil, PencilRuler, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { setActiveProject } from "@/hooks/useActiveProject";
import { useSettings } from "@/hooks/useSettings";
import { ErrorBox, MetricTile, PageHeader, ResultBadge, Section, Spinner, StatusBadge } from "@/components/common/ui";
import FloorPlanView from "@/components/editor/FloorPlanView";
import { REL_LABELS } from "@/types";

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { len, area } = useSettings();
  useEffect(() => { setActiveProject(Number(id)); }, [id]);
  const { data: p, error, loading, reload } = useAsync(() => api.project(id), [id]);
  const { data: layouts } = useAsync(() => api.layouts(id), [id]);
  if (loading) return <Spinner />;
  if (error || !p) return <ErrorBox message={error || "Project not found"} onRetry={reload} />;
  const best = layouts?.find((l) => l.is_selected) || layouts?.find((l) => l.is_valid) || layouts?.[0];
  const links = [
    { href: "editor", label: "Floor plan editor", icon: PencilRuler }, { href: "optimize", label: "Optimization", icon: Sparkles },
    { href: "layouts", label: "Layout alternatives", icon: LayoutGrid }, { href: "circulation", label: "Circulation analysis", icon: Network },
    { href: "validation", label: "Validation", icon: ShieldCheck },
  ];
  const total = p.rooms.reduce((s, r) => s + r.required_area, 0);
  return (
    <>
      <PageHeader title={p.name} subtitle={`${p.project_type} · plot ${len(p.plot_width)} × ${len(p.plot_height)} (${area(p.plot_width * p.plot_height)})${p.description ? " · " + p.description : ""}`}
        actions={<Link href={`/projects/${id}/edit`} className="btn"><Pencil size={16} /> Edit requirements</Link>} />
      <div className="flex flex-wrap gap-2 mb-6">
        {links.map(({ href, label, icon: Icon }) => <Link key={href} href={`/projects/${id}/${href}`} className="btn btn-primary"><Icon size={16} /> {label}</Link>)}
        {best && <Link href={`/projects/${id}/layouts/${best.id}`} className="btn"><BarChart3 size={16} /> Layout analytics</Link>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <MetricTile label="Rooms" value={p.rooms.length} hint={`${area(total)} required of ${area(p.plot_width * p.plot_height)}`} />
        <MetricTile label="Relationships" value={p.relationships.length} />
        <MetricTile label="Generated layouts" value={layouts?.length ?? "…"} hint={best ? `${best.result_badge.toLowerCase()} available` : "run an optimization"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Room requirements">
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr>{["Room", "Type", "Area", "Min size"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{p.rooms.map((r) => <tr key={r.id}><td className="td font-medium">{r.name}</td><td className="td">{r.room_type}</td><td className="td">{area(r.required_area)}</td><td className="td">{len(r.min_width)} × {len(r.min_height)}</td></tr>)}</tbody>
          </table></div>
          {p.relationships.length > 0 && <>
            <h3 className="text-xs font-bold uppercase tracking-wide mt-4 mb-1">Relationships</h3>
            <ul className="text-sm space-y-1">{p.relationships.map((r) => <li key={r.id}>{r.room_a} <span className="text-muted">— {REL_LABELS[r.rel_type].toLowerCase()} (w {r.weight}) →</span> {r.room_b}</li>)}</ul></>}
        </Section>
        <Section title={best ? "Preferred / best layout" : "Layout"} right={best && <ResultBadge badge={best.result_badge} />}>
          {best ? <FloorPlanView plot={{ width: p.plot_width, height: p.plot_height }} rooms={best.rooms} entrance={best.circulation.entrance} />
            : <div className="text-center py-12 text-sm text-muted">No layouts generated yet.<br /><Link className="text-accent font-semibold" href={`/projects/${id}/optimize`}>Generate layouts</Link></div>}
        </Section>
      </div>
    </>
  );
}
