"use client";
import { useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { api, ApiError } from "@/services/api";
import { DEFAULT_CONSTRAINTS } from "./ProjectForm";
import { useToast } from "@/hooks/useToast";
import type { ProjectData } from "@/types";

const EXAMPLE = "Design a community centre on a 30m × 20m plot with one reception, two classrooms, one office, two toilets and a storage room. Keep reception near the entrance and classrooms adjacent to each other.";

/** Optional AI Brief Assistant: the LLM only extracts requirements; the C++ engine does all optimisation. */
export default function BriefAssistant({ onExtracted }: { onExtracted: (d: ProjectData) => void }) {
  const { notify } = useToast();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [brief, setBrief] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<any>(null);
  useEffect(() => { api.aiStatus().then((s) => setAvailable(s.available)).catch(() => setAvailable(false)); }, []);

  const run = async () => {
    setBusy(true);
    try {
      const { requirements: q } = await api.parseBrief(brief);
      setRaw(q);
      const d: ProjectData = {
        name: q.name || "Project from brief", project_type: q.project_type || "Other", description: "Created from an AI-parsed brief", plot_width: Number(q.plot_width) || 0, plot_height: Number(q.plot_height) || 0,
        entrance_side: "south", entrance_offset: 0.5,
        rooms: (q.rooms || []).map((r: any) => ({ name: String(r.name), room_type: r.room_type || "Custom Room", required_area: Number(r.required_area) || 0, min_width: Number(r.min_width) || 0, min_height: Number(r.min_height) || 0, pref_width: Number(r.min_width) || 0, pref_height: Number(r.min_height) || 0, priority: Number(r.priority) || 2 })),
        relationships: (q.relationships || []).map((r: any) => ({ room_a: String(r.room_a), room_b: String(r.room_b), rel_type: r.rel_type || "prefer_adjacent", weight: Number(r.weight) || 1 })),
        constraints: DEFAULT_CONSTRAINTS,
      };
      onExtracted(d);
      notify("success", "Requirements extracted. Review and edit the form below, then save.");
    } catch (e) { notify("error", e instanceof ApiError ? e.message : "AI parsing failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2"><Bot size={18} className="text-accent" /><h3 className="font-semibold">AI Brief Assistant <span className="text-xs font-normal text-muted">(optional)</span></h3></div>
      {available === false ? (
        <p className="text-sm text-muted">AI parsing is unavailable because no <code>ANTHROPIC_API_KEY</code> is configured on the backend. Everything else works — fill in the form below manually.</p>
      ) : (
        <>
          <textarea className="input min-h-[90px]" value={brief} onChange={(e) => setBrief(e.target.value)} disabled={available === null} aria-label="Architectural brief" />
          <div className="flex items-center gap-3 mt-2">
            <button type="button" className="btn btn-accent btn-sm" onClick={run} disabled={busy || available === null || brief.trim().length < 10}>{busy && <Loader2 size={14} className="animate-spin" />} Extract requirements</button>
            <span className="text-xs text-muted">The AI only fills the form; layouts are always computed by the C++ engine.</span>
          </div>
          {raw && <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted">Extracted JSON</summary><pre className="bg-secondary p-2 rounded mt-1 overflow-auto max-h-48">{JSON.stringify(raw, null, 2)}</pre></details>}
        </>
      )}
    </div>
  );
}
