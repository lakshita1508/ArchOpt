"use client";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { api } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { Field, PageHeader, Section } from "@/components/common/ui";
import { ALGORITHM_LABELS, type Algorithm, type SystemStatus } from "@/types";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const s = useSettings();
  const [st, setSt] = useState<SystemStatus | null>(null);
  useEffect(() => { api.status().then(setSt).catch(() => setSt(null)); }, []);
  return (
    <>
      <PageHeader title="Settings" subtitle="Preferences are stored in this browser." />
      <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
        <Section title="Preferences">
          <div className="space-y-4">
            <Field label="Username"><input className="input bg-secondary" readOnly value={user ?? ""} /></Field>
            <Field label="Theme preference"><select className="input" value={s.theme} onChange={(e) => s.set({ theme: e.target.value as "light" | "dark" })}><option value="light">Light (default)</option><option value="dark">Dark</option></select></Field>
            <Field label="Default measurement unit" hint="Changes how lengths and areas are displayed (calculations always use metres)."><select className="input" value={s.unit} onChange={(e) => s.set({ unit: e.target.value as "metric" | "imperial" })}><option value="metric">Metric (m, m²)</option><option value="imperial">Imperial (ft, ft²)</option></select></Field>
            <Field label="Default optimization algorithm"><select className="input" value={s.algorithm} onChange={(e) => s.set({ algorithm: e.target.value as Algorithm })}>{(Object.keys(ALGORITHM_LABELS) as Algorithm[]).map((a) => <option key={a} value={a}>{ALGORITHM_LABELS[a]}</option>)}</select></Field>
            <button className="btn btn-danger" onClick={logout}><LogOut size={16} /> Logout</button>
          </div>
        </Section>
        <Section title="System status">
          {!st ? <p className="text-sm text-danger">Backend not reachable.</p> : (
            <dl className="text-sm grid grid-cols-[150px_1fr] gap-y-2">
              <dt className="text-muted">C++ engine</dt><dd className={st.engine.available ? "text-success font-semibold" : "text-warning font-semibold"}>{st.engine.available ? `Available (${st.engine.version})` : "Not available — demo fallback for sample projects"}</dd>
              {!st.engine.available && <><dt className="text-muted">Detail</dt><dd>{st.engine.detail}</dd></>}
              <dt className="text-muted">Mode</dt><dd>{st.mode === "live" ? "LIVE (real optimization)" : "DEMO FALLBACK"}</dd>
              <dt className="text-muted">Database</dt><dd>SQLite (backend/archopt.db)</dd>
              <dt className="text-muted">AI brief parsing</dt><dd>{st.ai_available ? "Enabled" : "Not configured (optional)"}</dd>
            </dl>)}
          <p className="text-xs text-muted mt-4">Authentication is a simple demo login for academic use — not production-grade security.</p>
        </Section>
      </div>
    </>
  );
}
