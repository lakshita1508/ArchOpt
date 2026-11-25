"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FolderKanban, Layers, Plus } from "lucide-react";
import Link from "next/link";
import { api } from "@/services/api";
import { getActiveProject, setActiveProject } from "@/hooks/useActiveProject";
import { useToast } from "@/hooks/useToast";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "@/components/common/ui";
import type { ProjectSummary } from "@/types";

const TITLES: Record<string, string> = { editor: "Floor Plan Editor", optimize: "Optimization", layouts: "Layout Alternatives", analytics: "Layout Analytics", circulation: "Circulation Analysis", validation: "Validation" };

/** Sidebar entries that need a project: jump to the active project or let the user pick one. */
export default function GoPage() {
  const { section } = useParams<{ section: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (pid: number) => {
    setActiveProject(pid);
    if (section === "analytics") {
      try {
        const ls = await api.layouts(pid);
        const best = ls.find((l) => l.is_selected) || ls.find((l) => l.is_valid) || ls[0];
        if (!best) { notify("info", "This project has no layouts yet. Generate layouts first."); router.replace(`/projects/${pid}/optimize`); return; }
        router.replace(`/projects/${pid}/layouts/${best.id}`);
      } catch { router.replace(`/projects/${pid}/layouts`); }
      return;
    }
    router.replace(`/projects/${pid}/${section}`);
  };

  useEffect(() => {
    api.projects().then((list) => {
      setProjects(list);
      const active = getActiveProject();
      if (active && list.some((p) => p.id === active)) open(active);
    }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  if (error) return <ErrorBox message={error} />;
  if (!projects) return <Spinner />;
  if (projects.length === 0) return (
    <>
      <PageHeader title={TITLES[section] || "Select a project"} />
      <EmptyState icon={<FolderKanban size={36} />} title="No projects yet" text="Create a project or load a predefined sample to use this page."
        action={<><Link href="/projects/new" className="btn btn-primary"><Plus size={16} /> Create project</Link><Link href="/sample-projects" className="btn"><Layers size={16} /> Sample projects</Link></>} />
    </>
  );
  return (
    <>
      <PageHeader title={TITLES[section] || "Select a project"} subtitle="Choose the project to open." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <button key={p.id} className="card p-4 text-left hover:border-accent" onClick={() => open(p.id)}>
            <p className="font-semibold text-primary">{p.name}</p>
            <p className="text-xs text-muted mt-1">{p.project_type} · {p.plot_width} × {p.plot_height} m · {p.layout_count} layouts</p>
          </button>))}
      </div>
    </>
  );
}
