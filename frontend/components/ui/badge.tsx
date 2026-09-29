import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TestState } from "@/lib/types";

export type Tone = "neutral" | "pass" | "fail" | "err" | "warn" | "info" | "ai";
const tones: Record<Tone, string> = {
  neutral: "text-muted bg-line/10 border-line/20",
  pass: "text-pass bg-pass/10 border-pass/30",
  fail: "text-fail bg-fail/10 border-fail/30",
  err: "text-err bg-err/10 border-err/30",
  warn: "text-warn bg-warn/10 border-warn/30",
  info: "text-brand-blue dark:text-brand-sky bg-brand-blue/10 border-brand-blue/30",
  ai: "text-violet-600 dark:text-violet-300 bg-brand-violet/10 border-brand-violet/30",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-line/20 bg-fg/[.04] px-3 py-1 text-[11.5px] text-muted", className)}>
      {children}
    </span>
  );
}

const METHOD_TONE: Record<string, string> = {
  get: "text-cyan-700 bg-cyan-500/10 dark:text-cyan-300 dark:bg-cyan-400/10",
  post: "text-blue-700 bg-blue-500/10 dark:text-blue-300 dark:bg-blue-500/15",
  put: "text-amber-700 bg-amber-500/10 dark:text-amber-300 dark:bg-amber-500/15",
  patch: "text-teal-700 bg-teal-500/10 dark:text-teal-300 dark:bg-teal-500/15",
  delete: "text-fuchsia-700 bg-fuchsia-500/10 dark:text-fuchsia-300 dark:bg-fuchsia-500/15",
};

export function MethodBadge({ method, className }: { method: string; className?: string }) {
  const m = method.toLowerCase();
  return (
    <span className={cn("inline-flex w-[52px] shrink-0 justify-center rounded-md py-[3px] font-mono text-[10.5px] font-semibold uppercase tracking-wide", METHOD_TONE[m] ?? "bg-line/15 text-muted", className)}>
      {m === "delete" ? "DEL" : m}
    </span>
  );
}

export function StateBadge({ state }: { state: TestState }) {
  if (state === "pass") return <Badge tone="pass" dot>Pass</Badge>;
  if (state === "error") return <Badge tone="err" dot>Error</Badge>;
  return <Badge tone="fail" dot>Fail</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone: Tone = severity === "critical" ? "err" : severity === "high" ? "warn" : severity === "medium" ? "info" : "neutral";
  return <Badge tone={tone} className="capitalize">{severity}</Badge>;
}
