"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FolderPlus, Loader2, Play } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { setActiveProject } from "@/hooks/useActiveProject";
import { useSettings } from "@/hooks/useSettings";
import { ErrorBox, PageHeader, Spinner } from "@/components/common/ui";
import { ALGORITHM_LABELS, REL_LABELS } from "@/types";

export default function SampleProjects() {
  const router = useRouter();
  const { notify } = useToast();
  const { len, area } = useSettings();
  const { data, error, loading, reload } = useAsync(() => api.samples());
  const [busy, setBusy] = useState<string | null>(null);
  const load = async (key: string, thenOptimize: boolean) => {
    setBusy(key + thenOptimize);
    try {
      const p = await api.loadSample(key);
      setActiveProject(p.id);
      notify("success", `Sample “${p.name}” loaded as a persistent project.`);
      router.push(thenOptimize ? `/projects/${p.id}/optimize` : `/projects/${p.id}`);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Could not load sample"); setBusy(null); }
  };
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error || "Could not load samples"} onRetry={reload} />;
  return (
    <>
      <PageHeader title="Sample projects" subtitle="Four predefined projects with verified requirements. Loading one creates a real, persistent project that you can optimize, edit and delete." />
      <div className="grid gap-5 lg:grid-cols-2">
        {data.map((s) => (
          <article key={s.key} className="card p-5 flex flex-col">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 bg-secondary text-accent grid place-items-center rounded shrink-0"><Building2 size={20} /></span>
              <div><h2 className="text-lg font-bold">{s.name}</h2><p className="text-sm text-muted">{s.description}</p></div>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 text-sm">
              <div><dt className="label !mb-0">Plot</dt><dd className="font-semibold">{len(s.plot_width)} × {len(s.plot_height)}</dd></div>
              <div><dt className="label !mb-0">Plot area</dt><dd className="font-semibold">{area(s.plot_area)}</dd></div>
              <div><dt className="label !mb-0">Rooms</dt><dd className="font-semibold">{s.rooms.length} ({area(s.total_required_area)})</dd></div>
              <div><dt className="label !mb-0">Demo layouts</dt><dd className="font-semibold">{s.demo_layout_count} verified</dd></div>
            </dl>
            <details className="text-sm mb-4"><summary className="cursor-pointer font-semibold text-primary">Rooms &amp; relationships</summary>
              <div className="overflow-x-auto mt-2"><table className="w-full"><thead><tr><th className="th">Room</th><th className="th">Area</th><th className="th">Min size</th></tr></thead>
                <tbody>{s.rooms.map((r) => <tr key={r.name}><td className="td">{r.name}</td><td className="td">{area(r.requiredArea)}</td><td className="td">{len(r.minWidth)} × {len(r.minHeight)}</td></tr>)}</tbody></table></div>
              <ul className="mt-2 text-xs text-muted space-y-0.5">{s.relationships.map((r, i) => <li key={i}><b className="text-ink">{r.a}</b> · {REL_LABELS[r.type].toLowerCase()} · <b className="text-ink">{r.b}</b></li>)}</ul></details>
            <p className="text-xs text-muted mb-3">Recommended algorithm: <b>{ALGORITHM_LABELS[s.recommended_algorithm]}</b></p>
            <div className="flex flex-wrap gap-2 mt-auto">
              <button className="btn btn-primary" disabled={!!busy} onClick={() => load(s.key, false)}>{busy === s.key + "false" ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={16} />} Load sample project</button>
              <button className="btn btn-accent" disabled={!!busy} onClick={() => load(s.key, true)}>{busy === s.key + "true" ? <Loader2 size={14} className="animate-spin" /> : <Play size={16} />} Load &amp; optimize</button>
            </div>
          </article>))}
      </div>
    </>
  );
}
