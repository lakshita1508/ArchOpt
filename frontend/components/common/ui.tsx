"use client";
import { useEffect, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm" role="status">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center text-center py-14 px-6">
      {icon && <div className="text-muted mb-3">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="text-sm text-muted mt-1 max-w-md">{text}</p>}
      {action && <div className="mt-4 flex flex-wrap gap-2 justify-center">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, details, onRetry }: { message: string; details?: string[]; onRetry?: () => void }) {
  return (
    <div className="border border-danger/30 bg-danger-soft text-danger rounded-md p-4 text-sm flex gap-3 items-start" role="alert">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">{message}</p>
        {details && details.length > 0 && <ul className="list-disc ml-5 mt-1">{details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
      </div>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

/** LIVE RESULT / DEMO RESULT / MANUAL EDIT / OPTIMIZATION FAILED indicator. */
export function ResultBadge({ badge }: { badge: string }) {
  const style: Record<string, string> = {
    "LIVE RESULT": "bg-success-soft text-success border-success/30",
    "DEMO RESULT": "bg-warning-soft text-warning border-warning/30",
    "MANUAL EDIT": "bg-secondary text-accent border-accent/30",
    "OPTIMIZATION FAILED": "bg-danger-soft text-danger border-danger/30",
  };
  return <span className={`badge ${style[badge] || "bg-secondary text-primary border-line"}`}>{badge}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    optimized: ["Optimized", "bg-success-soft text-success border-success/30"],
    completed: ["Completed", "bg-success-soft text-success border-success/30"],
    running: ["Running", "bg-secondary text-accent border-accent/30"],
    queued: ["Queued", "bg-secondary text-accent border-accent/30"],
    not_optimized: ["Not optimized", "bg-secondary text-muted border-line"],
    failed: ["Failed", "bg-danger-soft text-danger border-danger/30"],
    infeasible: ["No feasible layout", "bg-danger-soft text-danger border-danger/30"],
    cancelled: ["Cancelled", "bg-secondary text-muted border-line"],
  };
  const [label, cls] = map[status] || [status, "bg-secondary text-muted border-line"];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", danger = true, busy, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card w-full max-w-md p-5">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="text-sm text-muted mt-2">{message}</div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function MetricTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-primary mt-1">{value}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted mt-1 block">{hint}</span>}
      {error && <span className="field-error block">{error}</span>}
    </label>
  );
}
