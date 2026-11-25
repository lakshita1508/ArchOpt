"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, FolderKanban, FolderPlus, Layers, LayoutGrid, Percent, Sparkles } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { setActiveProject } from "@/hooks/useActiveProject";
import { CountChart, EfficiencyByProjectChart } from "@/components/analytics/Charts";
import { EmptyState, ErrorBox, PageHeader, ResultBadge, Section, Spinner, StatusBadge } from "@/components/common/ui";
import { date, dateTime, num } from "@/lib/format";
import { ALGORITHM_LABELS, type Algorithm } from "@/types";

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload } = useAsync(() => api.dashboard());
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error || "Could not load dashboard"} onRetry={reload} />;
  const cards = [
    { label: "Total projects", value: data.total_projects, icon: FolderKanban },
    { label: "Generated layouts", value: data.generated_layouts, icon: LayoutGrid },
    { label: "Avg area efficiency", value: data.generated_layouts ? `${num(data.avg_area_efficiency)}%` : "–", icon: Percent },
    { label: "Completed optimizations", value: data.completed_optimizations, icon: CheckCircle2 },
  ];
  const lastProject = data.recent_projects[0];
  return (
    <>
      <PageHeader title={`Welcome back, ${user ?? ""}`} subtitle={`Statistics below come from ${data.data_source}.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-4 flex items-center gap-4">
            <span className="w-11 h-11 bg-secondary text-accent grid place-items-center rounded"><Icon size={22} /></span>
            <div><p className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</p><p className="text-2xl font-bold text-primary">{value}</p></div>
          </div>))}
      </div>

      <Section title="Quick actions">
        <div className="flex flex-wrap gap-2">
          <Link href="/projects/new" className="btn btn-primary"><FolderPlus size={16} /> Create new project</Link>
          <Link href="/projects" className="btn"><FolderKanban size={16} /> View all projects</Link>
          <Link href="/sample-projects" className="btn"><Layers size={16} /> Load sample project</Link>
          <button className="btn btn-accent" onClick={() => { if (lastProject) { setActiveProject(lastProject.id); router.push(`/projects/${lastProject.id}/optimize`); } else router.push("/sample-projects"); }}><Sparkles size={16} /> Generate new layout</button>
        </div>
      </Section>

      {data.total_projects === 0 ? (
        <div className="mt-6"><EmptyState icon={<FolderKanban size={36} />} title="No projects yet" text="Create your first project, or load one of the four predefined sample projects to see ArchOpt in action."
          action={<><Link href="/projects/new" className="btn btn-primary">Create project</Link><Link href="/sample-projects" className="btn">Browse samples</Link></>} /></div>
      ) : (
        <div className="grid gap-6 mt-6 lg:grid-cols-2">
          <Section title="Recent projects" right={<Link href="/projects" className="text-xs text-accent font-semibold">View all</Link>}>
            <ul className="divide-y divide-line">
              {data.recent_projects.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0"><Link href={`/projects/${p.id}`} className="font-medium text-primary hover:underline truncate block">{p.name}</Link>
                    <p className="text-xs text-muted">{p.project_type} · {p.plot_width} × {p.plot_height} m · {p.layout_count} layouts · {date(p.created_at)}</p></div>
                  <StatusBadge status={p.optimization_status} />
                </li>))}
            </ul>
          </Section>
          <Section title="Recent optimization activity">
            {data.recent_activity.length === 0 ? <p className="text-sm text-muted py-6 text-center">No optimizations have been run yet.</p> : (
              <ul className="divide-y divide-line">
                {data.recent_activity.map((a) => (
                  <li key={a.job_id} className="py-2.5 flex items-start gap-3">
                    <Activity size={16} className="text-muted mt-1 shrink-0" />
                    <div className="flex-1 min-w-0"><p className="text-sm"><span className="font-medium">{a.project}</span> · {ALGORITHM_LABELS[a.algorithm as Algorithm] || a.algorithm}</p>
                      <p className="text-xs text-muted">{dateTime(a.created_at)}{a.mode === "live" ? ` · ${num(a.execution_ms, 0)} ms` : ""}</p></div>
                    <div className="flex flex-col items-end gap-1"><StatusBadge status={a.status} />{a.mode === "demo" && <ResultBadge badge="DEMO RESULT" />}{a.mode === "live" && <ResultBadge badge="LIVE RESULT" />}</div>
                  </li>))}
              </ul>)}
          </Section>
          <Section title="Area efficiency by project">
            {data.per_project.some((p) => p.layouts > 0) ? <EfficiencyByProjectChart data={data.per_project.filter((p) => p.layouts > 0)} /> : <p className="text-sm text-muted py-10 text-center">Generate layouts to see area-efficiency statistics.</p>}
          </Section>
          <Section title="Layout generation statistics">
            {data.per_project.length > 0 && <CountChart data={data.per_project} nameKey="project" valueKey="layouts" />}
            {data.jobs_by_algorithm.length > 0 && <p className="text-xs text-muted mt-2">Runs by algorithm: {data.jobs_by_algorithm.map((j) => `${ALGORITHM_LABELS[j.algorithm as Algorithm] || j.algorithm} ×${j.count}`).join(" · ")}</p>}
          </Section>
        </div>)}
    </>
  );
}
