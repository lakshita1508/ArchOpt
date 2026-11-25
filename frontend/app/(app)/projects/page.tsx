"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownAZ, CalendarClock, FolderOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { setActiveProject } from "@/hooks/useActiveProject";
import { ConfirmDialog, EmptyState, ErrorBox, PageHeader, ResultBadge, Spinner, StatusBadge } from "@/components/common/ui";
import { date } from "@/lib/format";
import { PROJECT_TYPES, type ProjectSummary } from "@/types";
import { useSettings } from "@/hooks/useSettings";

export default function ProjectsPage() {
  const { data, error, loading, reload } = useAsync(() => api.projects());
  const { notify } = useToast();
  const { len, area } = useSettings();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"name" | "date">("date");
  const [del, setDel] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    let l = (data || []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) && (type === "all" || p.project_type === type) && (status === "all" || p.optimization_status === status));
    l = [...l].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.created_at.localeCompare(a.created_at)));
    return l;
  }, [data, q, type, status, sort]);

  const open = (p: ProjectSummary) => { setActiveProject(p.id); router.push(`/projects/${p.id}`); };
  const confirmDelete = async () => {
    if (!del) return;
    setBusy(true);
    try { await api.deleteProject(del.id); notify("success", `Deleted “${del.name}”.`); setDel(null); reload(); }
    catch (e: any) { notify("error", e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Projects" subtitle="All architectural projects stored in the SQLite database." actions={<Link href="/projects/new" className="btn btn-primary"><Plus size={16} /> New project</Link>} />
      <div className="card p-3 mb-4 grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
        <div className="relative"><Search size={16} className="absolute left-3 top-2.5 text-muted" /><input className="input !pl-9" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" /></div>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type"><option value="all">All types</option>{PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="not_optimized">Not optimized</option><option value="optimized">Optimized</option><option value="running">Running</option><option value="failed">Failed</option></select>
        <div className="flex gap-1">
          <button className={`btn ${sort === "name" ? "btn-primary" : ""}`} onClick={() => setSort("name")}><ArrowDownAZ size={16} /> Name</button>
          <button className={`btn ${sort === "date" ? "btn-primary" : ""}`} onClick={() => setSort("date")}><CalendarClock size={16} /> Newest</button>
        </div>
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : (data || []).length === 0 ? (
        <EmptyState icon={<FolderOpen size={36} />} title="No projects yet" text="Create a project from scratch or load a predefined sample." action={<><Link href="/projects/new" className="btn btn-primary">Create project</Link><Link href="/sample-projects" className="btn">Sample projects</Link></>} />
      ) : list.length === 0 ? <EmptyState title="No projects match your filters" action={<button className="btn" onClick={() => { setQ(""); setType("all"); setStatus("all"); }}>Clear filters</button>} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr>{["Project", "Type", "Plot", "Area", "Rooms", "Layouts", "Created", "Status", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/40">
                  <td className="td"><button className="font-semibold text-primary hover:underline text-left" onClick={() => open(p)}>{p.name}</button>{p.sample_key && <span className="badge ml-2 bg-secondary text-muted border-line">sample</span>}</td>
                  <td className="td">{p.project_type}</td>
                  <td className="td whitespace-nowrap">{len(p.plot_width)} × {len(p.plot_height)}</td>
                  <td className="td">{area(p.plot_area)}</td>
                  <td className="td">{p.room_count}</td>
                  <td className="td">{p.layout_count}</td>
                  <td className="td whitespace-nowrap">{date(p.created_at)}</td>
                  <td className="td"><div className="flex flex-col gap-1 items-start"><StatusBadge status={p.optimization_status} />{p.last_result_mode === "demo" && <ResultBadge badge="DEMO RESULT" />}</div></td>
                  <td className="td"><div className="flex gap-1 justify-end">
                    <button className="btn btn-sm btn-primary" onClick={() => open(p)}><FolderOpen size={14} /> Open</button>
                    <Link href={`/projects/${p.id}/edit`} className="btn btn-sm" aria-label={`Edit ${p.name}`}><Pencil size={14} /></Link>
                    <button className="btn btn-sm btn-danger" onClick={() => setDel(p)} aria-label={`Delete ${p.name}`}><Trash2 size={14} /></button>
                  </div></td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      <ConfirmDialog open={!!del} title="Delete project?" busy={busy} onCancel={() => setDel(null)} onConfirm={confirmDelete}
        message={<>This permanently deletes <b>{del?.name}</b> together with its rooms, relationships, optimization jobs and all {del?.layout_count ?? 0} generated layouts. This cannot be undone.</>} />
    </>
  );
}
