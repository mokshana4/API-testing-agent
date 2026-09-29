"use client";
// Browser persistence for projects and run history. The backend is stateless per run and
// exposes no listing endpoint, so this keeps the UI useful without adding a database.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, RunRecord } from "./types";
import { uid } from "./utils";

const EVENT = "ata:store";
const PROJECTS = "ata.projects.v1";
const RUNS = "ata.runs.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function usePersistent<T>(key: string, fallback: T) {
  const fb = useRef(fallback);
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(read(key, fb.current));
    setReady(true);
    const onLocal = (e: Event) => (e as CustomEvent<string>).detail === key && setValue(read(key, fb.current));
    const onStorage = (e: StorageEvent) => e.key === key && setValue(read(key, fb.current));
    window.addEventListener(EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(read(key, fb.current)) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        /* quota exceeded: keep in memory */
      }
      setValue(resolved);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
    [key],
  );

  return [value, update, ready] as const;
}

export function useProjects() {
  const [projects, setProjects, ready] = usePersistent<Project[]>(PROJECTS, []);

  const save = useCallback(
    (p: Omit<Project, "id" | "createdAt" | "updatedAt"> & Partial<Pick<Project, "id" | "createdAt">>) => {
      const now = new Date().toISOString();
      const id = p.id ?? uid();
      setProjects((prev) => {
        const existing = prev.find((x) => x.id === id);
        const next: Project = { ...p, id, createdAt: existing?.createdAt ?? p.createdAt ?? now, updatedAt: now };
        return existing ? prev.map((x) => (x.id === id ? next : x)) : [next, ...prev];
      });
      return id;
    },
    [setProjects],
  );
  const remove = useCallback((id: string) => setProjects((prev) => prev.filter((p) => p.id !== id)), [setProjects]);
  return { projects, ready, save, remove };
}

export function useRuns() {
  const [runs, setRuns, ready] = usePersistent<RunRecord[]>(RUNS, []);
  const add = useCallback(
    (r: RunRecord) => setRuns((prev) => [r, ...prev.filter((x) => x.runId !== r.runId)].slice(0, 200)),
    [setRuns],
  );
  const remove = useCallback((runId: string) => setRuns((prev) => prev.filter((r) => r.runId !== runId)), [setRuns]);
  const clear = useCallback(() => setRuns([]), [setRuns]);
  return { runs, ready, add, remove, clear };
}

export const DEMO_PROJECT: Omit<Project, "id" | "createdAt" | "updatedAt"> = {
  name: "Quantum PM API (demo)",
  description: "Bundled sample API with three planted bugs. Start it with: uvicorn sample_api.main:app --port 8001",
  specMode: "url",
  specUrl: "http://127.0.0.1:8001/openapi.json",
  baseUrl: "",
  authHeader: "",
  useLlm: true,
};
