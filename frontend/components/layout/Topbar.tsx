"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, LogOut, Menu, TriangleAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/services/api";
import type { SystemStatus } from "@/types";

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const [st, setSt] = useState<SystemStatus | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => { api.status().then((s) => { setSt(s); setOffline(false); }).catch(() => setOffline(true)); }, []);
  return (
    <header className="h-16 sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-line flex items-center gap-3 px-4 lg:px-6">
      <button className="lg:hidden btn btn-sm" onClick={onMenu} aria-label="Open menu"><Menu size={18} /></button>
      <div className="flex-1" />
      {offline && <span className="badge bg-danger-soft text-danger border-danger/30 gap-1"><TriangleAlert size={12} /> Backend offline</span>}
      {st && (st.engine.available
        ? <span className="badge bg-success-soft text-success border-success/30 gap-1" title={st.engine.version || ""}><Cpu size={12} /> Live engine ready</span>
        : <span className="badge bg-warning-soft text-warning border-warning/30 gap-1" title={st.engine.detail}><Cpu size={12} /> Engine unavailable · demo fallback</span>)}
      <Link href="/settings" className="text-sm font-medium text-ink hidden sm:block">{user}</Link>
      <button className="btn btn-sm" onClick={logout}><LogOut size={14} /> Logout</button>
    </header>
  );
}
