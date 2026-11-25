"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/services/api";

/** Load data on mount / when deps change, with loading + error state and manual reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await fnRef.current()); } catch (e) { setError(e instanceof ApiError || e instanceof Error ? e.message : "Unexpected error"); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, error, loading, reload, setData };
}
