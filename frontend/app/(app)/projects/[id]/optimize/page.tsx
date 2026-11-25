"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { api, ApiError } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import { setActiveProject } from "@/hooks/useActiveProject";
import { ErrorBox, Field, PageHeader, ResultBadge, Section, Spinner, StatusBadge } from "@/components/common/ui";
import { dateTime, num } from "@/lib/format";
import { ALGORITHM_LABELS, PRIORITY_LABELS, type Algorithm, type JobData, type Priority } from "@/types";

const DEFAULT_WEIGHTS = { overlap: 1000, boundary: 1000, adjacency: 40, corridor: 2, circulation: 6, unused: 0.5 };
const WEIGHT_LABELS: Record<keyof typeof DEFAULT_WEIGHTS, string> = {
  overlap: "Overlap penalty", boundary: "Boundary penalty", adjacency: "Adjacency weight", corridor: "Excess-corridor weight", circulation: "Circulation weight", unused: "Unused-area penalty",
};
const ALGO_INFO: Record<Algorithm, { text: string; iterations: number; hint: string }> = {
  constraint_based: { text: "Generates many random slicing-tree arrangements, greedily repairs them and rejects any that violate hard constraints.", iterations: 3000, hint: "samples (each is repaired for up to 150 steps)" },
  simulated_annealing: { text: "Explores layouts with swap / split / resize moves, accepting worse layouts with a cooling probability. Runs independent chains in parallel threads.", iterations: 6000, hint: "steps per chain" },
  genetic: { text: "Evolves a population with tournament selection, order crossover, mutation and elitism. Fitness is evaluated in parallel.", iterations: 200, hint: "generations (population 48)" },
};

export default function OptimizePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const settings = useSettings();
  const { data: project, error, loading } = useAsync(() => api.project(id), [id]);
  const jobs = useAsync(() => api.jobs(id), [id]);
  const [algorithm, setAlgorithm] = useState<Algorithm>(settings.algorithm);
  const [candidates, setCandidates] = useState(4);
  const [iterations, setIterations] = useState(ALGO_INFO[settings.algorithm].iterations);
  const [seed, setSeed] = useState(42);
  const [priority, setPriority] = useState<Priority>("balanced");
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [job, setJob] = useState<JobData | null>(null);
  const [starting, setStarting] = useState(false);
  const [formErr, setFormErr] = useState<{ message: string; details: string[] } | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { setActiveProject(Number(id)); return () => { if (poll.current) clearInterval(poll.current); }; }, [id]);

  const pickAlgorithm = (a: Algorithm) => { setAlgorithm(a); setIterations(ALGO_INFO[a].iterations); };
  const running = job && (job.status === "queued" || job.status === "running");

  const watch = useCallback((jobId: string) => {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const j = await api.job(jobId);
        setJob(j);
        if (j.status !== "queued" && j.status !== "running") {
          if (poll.current) clearInterval(poll.current);
          jobs.reload();
          if (j.status === "completed" && j.mode === "demo") notify("warning", j.message, 9000);
          else if (j.status === "completed") notify("success", `Found ${j.layout_ids.length} feasible layouts in ${num(j.execution_ms, 0)} ms.`);
          else if (j.status === "infeasible" || j.status === "failed") notify("error", j.message);
        }
      } catch { /* transient network error: keep polling */ }
    }, 700);
  }, [jobs, notify]);

  const generate = async () => {
    setFormErr(null); setStarting(true);
    try {
      const j = await api.optimize(id, { algorithm, candidates, max_iterations: iterations, seed, priority, weights });
      setJob(j);
      watch(j.id);
    } catch (e) { setFormErr(e instanceof ApiError ? { message: e.message, details: e.details } : { message: "Could not start optimization", details: [] }); }
    finally { setStarting(false); }
  };
  const cancel = async () => { if (!job) return; try { setJob(await api.cancelJob(job.id)); } catch (e) { notify("error", e instanceof Error ? e.message : "Cancel failed"); } };
  const loadSample = async (key: string) => { try { const p = await api.loadSample(key); notify("success", `Loaded sample “${p.name}”.`); router.push(`/projects/${p.id}/optimize`); } catch (e) { notify("error", e instanceof Error ? e.message : "Failed"); } };

  if (loading) return <Spinner />;
  if (error || !project) return <ErrorBox message={error || "Project not found"} />;
  const demo = job?.mode === "demo";
  const badge = job ? (job.status === "completed" ? (demo ? "DEMO RESULT" : "LIVE RESULT") : job.status === "failed" || job.status === "infeasible" ? "OPTIMIZATION FAILED" : null) : null;

  return (
    <>
      <PageHeader title="Optimization" subtitle={<>{project.name} · {project.rooms.length} rooms · <Link href={`/projects/${id}`} className="text-accent font-semibold">overview</Link></>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Section title="Algorithm">
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(ALGORITHM_LABELS) as Algorithm[]).map((a) => (
                <button key={a} type="button" onClick={() => pickAlgorithm(a)} aria-pressed={algorithm === a} className={`text-left border rounded-md p-3 ${algorithm === a ? "border-accent bg-secondary ring-2 ring-accent/20" : "border-line hover:bg-secondary/50"}`}>
                  <p className="font-semibold text-primary text-sm">{ALGORITHM_LABELS[a]}</p><p className="text-xs text-muted mt-1">{ALGO_INFO[a].text}</p></button>))}
            </div>
          </Section>
          <Section title="Parameters" right={<button className="btn btn-sm" onClick={() => { setWeights({ ...DEFAULT_WEIGHTS }); setIterations(ALGO_INFO[algorithm].iterations); setCandidates(4); setSeed(42); setPriority("balanced"); }}><RotateCcw size={12} /> Defaults</button>}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Number of candidate layouts" hint="1 – 10"><input type="number" min={1} max={10} className="input" value={candidates} onChange={(e) => setCandidates(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} /></Field>
              <Field label="Maximum iterations" hint={ALGO_INFO[algorithm].hint}><input type="number" min={10} max={200000} className="input" value={iterations} onChange={(e) => setIterations(Math.max(10, Number(e.target.value) || 10))} /></Field>
              <Field label="Random seed" hint="Same seed + input = same result"><input type="number" min={0} className="input" value={seed} onChange={(e) => setSeed(Math.max(0, Number(e.target.value) || 0))} /></Field>
              <div className="sm:col-span-2 lg:col-span-3"><Field label="Optimization priority"><select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select></Field></div>
            </div>
            <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-primary">Cost-function weights</summary>
              <p className="text-xs text-muted my-2">Cost = w₁·overlap + w₂·boundary + w₃·bad adjacency + w₄·excess corridor + w₅·poor circulation + w₆·unused area (+ hard-constraint shortfall).</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(DEFAULT_WEIGHTS) as (keyof typeof DEFAULT_WEIGHTS)[]).map((k) => (
                  <Field key={k} label={WEIGHT_LABELS[k]}><input type="number" min={0} step="any" className="input" value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Math.max(0, Number(e.target.value) || 0) })} /></Field>))}
              </div>
            </details>
          </Section>
          {formErr && <ErrorBox message={formErr.message} details={formErr.details} />}
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={generate} disabled={starting || !!running}>{starting || running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Generate Layouts</button>
            {running && <button className="btn btn-danger" onClick={cancel}><Square size={14} /> Cancel</button>}
            <Link href={`/projects/${id}/edit`} className="btn">Edit requirements</Link>
          </div>
        </div>

        <div className="space-y-6">
          <Section title="Optimization status" right={badge && <ResultBadge badge={badge} />}>
            {!job ? <p className="text-sm text-muted">No run yet. Press “Generate Layouts”. Status and timings shown here are reported by the backend job — nothing is simulated.</p> : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">{running && <Loader2 size={16} className="animate-spin text-accent" />}<StatusBadge status={job.status} /><span className="text-muted text-xs">started {job.started_at ? dateTime(job.started_at) : "…"}</span></div>
                {demo && <div className="bg-warning-soft text-warning border border-warning/30 rounded p-2 flex gap-2"><Info size={16} className="mt-0.5 shrink-0" /><span>{job.message}</span></div>}
                {job.status === "completed" && !demo && <div className="bg-success-soft text-success border border-success/30 rounded p-2 flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />{job.message}</div>}
                {(job.status === "failed" || job.status === "infeasible") && (
                  <div className="bg-danger-soft text-danger border border-danger/30 rounded p-2 space-y-1"><p className="font-semibold flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{job.message}</p>
                    {job.reasons.length > 0 && <ul className="list-disc ml-6 text-xs">{job.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                    {job.status === "infeasible" && <p className="text-xs">Try more iterations, another algorithm, a different seed, or relax constraints (e.g. smaller minimum sizes, larger plot).</p>}</div>)}
                {job.suggested_samples.length > 0 && <div className="border border-line rounded p-2"><p className="text-xs font-semibold mb-1">Compatible sample projects:</p>
                  <div className="flex flex-wrap gap-2">{job.suggested_samples.map((s) => <button key={s.key} className="btn btn-sm" onClick={() => loadSample(s.key)}>Load “{s.name}” ({s.plot})</button>)}</div>
                  <p className="text-xs text-muted mt-1">Sample layouts are never shown as results for your custom project.</p></div>}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3">
                  <dt className="text-muted">Algorithm</dt><dd className="font-medium">{ALGORITHM_LABELS[job.algorithm as Algorithm] || job.algorithm}</dd>
                  <dt className="text-muted">Candidates evaluated</dt><dd className="font-medium">{demo ? "n/a (precomputed)" : job.candidates_evaluated.toLocaleString()}</dd>
                  <dt className="text-muted">Feasible candidates found</dt><dd className="font-medium">{demo ? "n/a (precomputed)" : job.feasible_found.toLocaleString()}</dd>
                  <dt className="text-muted">Layouts returned</dt><dd className="font-medium">{job.layout_ids.length}</dd>
                  <dt className="text-muted">Execution time</dt><dd className="font-medium">{demo ? "n/a (not calculated)" : job.status === "completed" || job.status === "infeasible" ? `${num(job.execution_ms, 0)} ms` : "…"}</dd>
                  <dt className="text-muted">Best optimization cost</dt><dd className="font-medium">{job.best_cost !== null && !demo ? num(job.best_cost, 2) : "–"}</dd>
                </dl>
                {job.status === "completed" && <div className="flex gap-2 pt-1"><Link href={`/projects/${id}/layouts`} className="btn btn-primary btn-sm">View layout alternatives</Link><Link href={`/projects/${id}/editor`} className="btn btn-sm">Open editor</Link></div>}
              </div>)}
          </Section>
          <Section title="Run history">
            {jobs.loading ? <Spinner label="" /> : !jobs.data || jobs.data.length === 0 ? <p className="text-sm text-muted">No previous runs.</p> : (
              <ul className="divide-y divide-line text-sm">{jobs.data.slice(0, 6).map((j) => (
                <li key={j.id} className="py-2 flex items-center justify-between gap-2"><div><p className="font-medium">{ALGORITHM_LABELS[j.algorithm as Algorithm] || j.algorithm}</p><p className="text-xs text-muted">{dateTime(j.created_at)}{j.mode === "live" ? ` · ${num(j.execution_ms, 0)} ms` : ""}</p></div>
                  <div className="flex flex-col items-end gap-1"><StatusBadge status={j.status} />{j.mode === "demo" && <ResultBadge badge="DEMO RESULT" />}</div></li>))}</ul>)}
          </Section>
        </div>
      </div>
    </>
  );
}
