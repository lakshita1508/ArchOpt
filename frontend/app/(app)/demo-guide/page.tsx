"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2 } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { setActiveProject } from "@/hooks/useActiveProject";
import { ErrorBox, PageHeader, Section, Spinner } from "@/components/common/ui";
import { ALGORITHM_LABELS, REL_LABELS } from "@/types";

const EXPECT: Record<string, string> = {
  "community-centre": "3–4 distinct feasible layouts: reception on the entrance wall, a corridor spine serving the toilets, the two classrooms sharing a wall, ~95% area efficiency, 100% accessibility.",
  "residential-apartment": "Several feasible layouts with the living room at the entrance, dining next to the kitchen, bedrooms grouped, bathrooms reachable from the corridor.",
  "office-workspace": "Layouts where reception is at the entrance, the conference room is kept at least 3 m from the open workspace, and the pantry/toilets are reachable from circulation.",
  "educational-building": "The hardest sample (11 rooms). Simulated annealing finds feasible layouts; the genetic and constraint-based algorithms may honestly report ‘no feasible layout’ at default budgets.",
};

export default function DemoGuide() {
  const router = useRouter();
  const { notify } = useToast();
  const { data, error, loading, reload } = useAsync(() => api.samples());
  const [busy, setBusy] = useState<string | null>(null);
  const load = async (key: string) => {
    setBusy(key);
    try { const p = await api.loadSample(key); setActiveProject(p.id); notify("success", `Loaded “${p.name}”.`); router.push(`/projects/${p.id}/optimize`); }
    catch (e) { notify("error", e instanceof Error ? e.message : "Failed"); setBusy(null); }
  };
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error || "Could not load"} onRetry={reload} />;
  const steps = [
    ["Login", "Username demo, password 12345678."], ["Load a sample", "Use “Load Sample Project” below (or the Sample Projects page). A persistent project is created in SQLite."],
    ["Review requirements", "Open the project overview: rooms, areas, minimum sizes and relationships are predefined."],
    ["Optimization", "Choose the recommended algorithm, keep the default parameters and press “Generate Layouts”. The status panel shows real job data: candidates evaluated, feasible candidates, execution time, best cost."],
    ["Compare layouts", "On Layout Alternatives tick two or three layouts to compare them side by side. Orange outlines show rooms that differ; the best metric is marked."],
    ["Analytics", "Open a layout for charts (area, utilization, adjacency, circulation) and export SVG, PDF or the metrics report."],
    ["Circulation", "Open Circulation Analysis, click a room to see the Dijkstra shortest path from the entrance, the walking distance, the graph and bottlenecks."],
    ["Validation", "Open Validation to see passed/failed/warnings. In the editor, drag a room onto another one: the overlap is highlighted and the layout cannot be saved as valid."],
    ["Fallback (optional)", "If the C++ engine is not built, sample projects show clearly labelled DEMO RESULT layouts instead. Custom projects never receive sample results."],
  ];
  return (
    <>
      <PageHeader title="Demo guide" subtitle="A step-by-step workflow for demonstrating ArchOpt without typing any project data." />
      <Section title="Demonstration workflow"><ol className="space-y-2">{steps.map(([t, d], i) => <li key={t} className="flex gap-3 text-sm"><span className="w-6 h-6 shrink-0 rounded bg-primary text-white grid place-items-center text-xs font-bold">{i + 1}</span><span><b>{t}.</b> {d}</span></li>)}</ol></Section>
      <div className="grid gap-5 lg:grid-cols-2 mt-6">
        {data.map((s) => (
          <Section key={s.key} title={s.name}>
            <ul className="text-sm space-y-1.5">
              <li><b>Plot:</b> {s.plot_width} × {s.plot_height} m ({s.plot_area} m²)</li>
              <li><b>Rooms:</b> {s.rooms.map((r) => `${r.name} (${r.requiredArea} m²)`).join(", ")}</li>
              <li><b>Relationships:</b> {s.relationships.map((r) => `${r.a} ↔ ${r.b}: ${REL_LABELS[r.type].toLowerCase()}`).join("; ")}</li>
              <li><b>Algorithm to select:</b> {ALGORITHM_LABELS[s.recommended_algorithm]}</li>
              <li><b>What to expect:</b> {EXPECT[s.key] || "Several feasible, validated layouts."}</li>
              <li><b>Demo Mode data:</b> {s.demo_layout_count} verified precomputed layouts (used only if the live engine is unavailable).</li>
            </ul>
            <button className="btn btn-primary mt-4" disabled={!!busy} onClick={() => load(s.key)}>{busy === s.key ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={16} />} Load Sample Project</button>
          </Section>))}
      </div>
    </>
  );
}
