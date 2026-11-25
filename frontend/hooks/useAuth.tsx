"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, TOKEN_KEY, USER_KEY } from "@/services/api";

interface Ctx { user: string | null; ready: boolean; login: (u: string, p: string) => Promise<void>; logout: () => Promise<void> }
const AuthCtx = createContext<Ctx>({ user: null, ready: false, login: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  useEffect(() => {
    try { setUser(localStorage.getItem(TOKEN_KEY) ? localStorage.getItem(USER_KEY) : null); } catch {}
    setReady(true);
  }, []);
  const login = useCallback(async (u: string, p: string) => {
    const r = await api.login(u, p);
    localStorage.setItem(TOKEN_KEY, r.access_token);
    localStorage.setItem(USER_KEY, r.username);
    setUser(r.username);
  }, []);
  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch {}
    setUser(null);
    router.replace("/login");
  }, [router]);
  return <AuthCtx.Provider value={{ user, ready, login, logout }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
