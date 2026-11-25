"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, FolderKanban, LayoutDashboard, Layers, LayoutGrid, Network, PencilRuler, Settings, ShieldCheck, Sparkles, X } from "lucide-react";

const ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { label: "Projects", href: "/projects", icon: FolderKanban, key: "projects" },
  { label: "Sample Projects", href: "/sample-projects", icon: Layers, key: "sample-projects" },
  { label: "Floor Plan Editor", href: "/go/editor", icon: PencilRuler, key: "editor" },
  { label: "Optimization", href: "/go/optimize", icon: Sparkles, key: "optimize" },
  { label: "Layout Alternatives", href: "/go/layouts", icon: LayoutGrid, key: "layouts" },
  { label: "Analytics", href: "/go/analytics", icon: BarChart3, key: "analytics" },
  { label: "Circulation Analysis", href: "/go/circulation", icon: Network, key: "circulation" },
  { label: "Validation", href: "/go/validation", icon: ShieldCheck, key: "validation" },
  { label: "Demo Guide", href: "/demo-guide", icon: BookOpen, key: "demo-guide" },
  { label: "Settings", href: "/settings", icon: Settings, key: "settings" },
];

/** Which sidebar entry is active for the current URL. */
export function activeKey(path: string): string {
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "go") return seg[1] || "";
  if (seg[0] === "projects" && seg.length >= 3) {
    if (seg[2] === "layouts" && seg.length >= 4) return "analytics";
    if (seg[2] === "layouts") return "layouts";
    if (["editor", "optimize", "circulation", "validation"].includes(seg[2])) return seg[2];
    return "projects";
  }
  return seg[0] || "dashboard";
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname() || "";
  const current = activeKey(path);
  return (
    <>
      {open && <div className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 bg-card border-r border-line flex flex-col transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-line">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
            <span className="w-8 h-8 bg-primary text-white grid place-items-center rounded font-bold text-sm">A</span>
            <span className="font-bold text-primary text-lg tracking-tight">ArchOpt</span>
          </Link>
          <button className="lg:hidden" onClick={onClose} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1" aria-label="Main navigation">
          {ITEMS.map(({ label, href, icon: Icon, key }) => {
            const active = current === key;
            return (
              <Link key={key} href={href} onClick={onClose} aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium border-l-[3px] ${active ? "bg-secondary text-primary border-accent" : "text-muted border-transparent hover:bg-secondary/60 hover:text-ink"}`}>
                <Icon size={18} /> {label}
              </Link>
            );
          })}
        </nav>
        <p className="px-5 py-3 text-[11px] text-muted border-t border-line">Intelligent Architectural Space &amp; Circulation Optimizer</p>
      </aside>
    </>
  );
}
