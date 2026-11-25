"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/common/ui";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

/** Persistent left sidebar + top bar + content. Redirects unauthenticated users to /login. */
export default function AppShell({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (ready && !user) router.replace("/login"); }, [ready, user, router]);
  if (!ready || !user) return <Spinner label="Checking session…" />;
  return (
    <div className="flex min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex-1 p-4 lg:p-6 max-w-[1500px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
