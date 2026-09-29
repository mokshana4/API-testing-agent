"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { checkHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "checking" | "online" | "offline";
const Ctx = createContext<{ status: Status; recheck: () => void }>({ status: "checking", recheck: () => {} });

export function BackendStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const ok = await checkHealth();
      if (alive) setStatus(ok ? "online" : "offline");
    };
    run();
    const id = setInterval(run, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tick]);
  return <Ctx.Provider value={{ status, recheck: () => setTick((t) => t + 1) }}>{children}</Ctx.Provider>;
}

export const useBackendStatus = () => useContext(Ctx);

export function BackendStatusPill() {
  const { status, recheck } = useBackendStatus();
  const label = status === "online" ? "Backend online" : status === "offline" ? "Backend offline" : "Checking backend";
  return (
    <button onClick={recheck} title="Click to re-check" className="inline-flex h-8 items-center gap-2 rounded-lg border border-line/20 px-3 text-xs text-muted hover:text-fg">
      <span className={cn("h-2 w-2 rounded-full", status === "online" ? "bg-pass" : status === "offline" ? "bg-err" : "animate-pulse2 bg-warn")} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
