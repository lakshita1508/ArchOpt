"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

type Kind = "success" | "error" | "info" | "warning";
interface Toast { id: number; kind: Kind; text: string }
interface Ctx { notify: (kind: Kind, text: string, ms?: number) => void }
const ToastCtx = createContext<Ctx>({ notify: () => {} });
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const notify = useCallback((kind: Kind, text: string, ms = kind === "error" ? 8000 : 4500) => {
    const id = ++seq;
    setItems((l) => [...l, { id, kind, text }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  const icon = { success: <CheckCircle2 size={18} />, error: <XCircle size={18} />, info: <Info size={18} />, warning: <AlertTriangle size={18} /> };
  const style = {
    success: "bg-success-soft text-success border-success/30", error: "bg-danger-soft text-danger border-danger/30",
    info: "bg-secondary text-primary border-line", warning: "bg-warning-soft text-warning border-warning/30",
  };
  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)]" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 p-3 border rounded-md shadow-card text-sm ${style[t.kind]}`}>
            <span className="mt-0.5">{icon[t.kind]}</span>
            <span className="flex-1 break-words">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
