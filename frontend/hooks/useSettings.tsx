"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { area as fArea, len as fLen, type Unit } from "@/lib/format";
import type { Algorithm } from "@/types";

interface Settings { theme: "light" | "dark"; unit: Unit; algorithm: Algorithm }
const DEFAULTS: Settings = { theme: "light", unit: "metric", algorithm: "simulated_annealing" };
interface Ctx extends Settings { set: (s: Partial<Settings>) => void; len: (m: number, d?: number) => string; area: (m2: number, d?: number) => string }
const SettingsCtx = createContext<Ctx>({ ...DEFAULTS, set: () => {}, len: (m) => `${m} m`, area: (a) => `${a} m²` });
const KEY = "archopt_settings";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS);
  useEffect(() => { try { const raw = localStorage.getItem(KEY); if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) }); } catch {} }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", s.theme === "dark"); }, [s.theme]);
  const set = useCallback((p: Partial<Settings>) => setS((old) => { const n = { ...old, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} return n; }), []);
  return <SettingsCtx.Provider value={{ ...s, set, len: (m: number, d?: number) => fLen(m, s.unit, d), area: (a: number, d?: number) => fArea(a, s.unit, d) }}>{children}</SettingsCtx.Provider>;
}
export const useSettings = () => useContext(SettingsCtx);
