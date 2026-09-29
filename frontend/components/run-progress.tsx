"use client";
import { useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const STAGES = [
  { key: "parse", label: "Parse specification", detail: "Endpoints, parameters, schemas, status codes" },
  { key: "generate", label: "Generate test cases", detail: "Positive, negative, validation, boundary, edge" },
  { key: "execute", label: "Execute against the API", detail: "HTTP calls with status + schema checks" },
  { key: "analyze", label: "Analyze failures", detail: "Expected vs actual, root cause, fix" },
  { key: "edges", label: "Find uncovered edge cases", detail: "Gaps between spec and exercised behaviour" },
  { key: "report", label: "Write report", detail: "HTML + JSON" },
];

// The backend's /api/run is one synchronous call, so per-stage timing is estimated from
// typical durations; the final state is always the backend's real result.
const EST_NO_LLM = [0.4, 1.0, 2.2, 2.6, 3.0];
const EST_LLM = [1.5, 25, 38, 60, 80];

export type RunPhase = "idle" | "running" | "done" | "error";
export interface LogLine { t: number; text: string; tone?: "ok" | "err" | "dim" }

export function RunProgress({ phase, startedAt, useLlm, log }: { phase: RunPhase; startedAt: number | null; useLlm: boolean; log: LogLine[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [phase]);

  const elapsed = startedAt ? ((phase === "running" ? now : log.at(-1)?.t ?? now) - startedAt) / 1000 : 0;
  const est = useLlm ? EST_LLM : EST_NO_LLM;
  const activeIdx = phase === "done" ? STAGES.length : phase === "running" ? est.filter((s) => elapsed >= s).length : -1;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-medium">Execution</div>
          <div className="text-[11.5px] text-muted">
            {phase === "idle" && "Ready when you are."}
            {phase === "running" && `Running… stage timing is estimated until the backend responds.`}
            {phase === "done" && "Completed. Opening the report…"}
            {phase === "error" && "The run failed. See the log below."}
          </div>
        </div>
        <span className="font-mono text-[12px] tabular-nums text-muted">{elapsed.toFixed(1)}s</span>
      </div>

      <ol className="space-y-1">
        {STAGES.map((s, i) => {
          const state = phase === "error" && i === Math.max(activeIdx, 0) ? "error" : i < activeIdx ? "done" : i === activeIdx && phase === "running" ? "active" : "pending";
          return (
            <li key={s.key} className={cn("flex items-center gap-3 rounded-xl px-2 py-2 transition", state === "active" && "bg-brand-blue/[.07]")}>
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px]",
                state === "done" && "border-transparent bg-brand-grad text-[#04111e]",
                state === "active" && "border-brand-sky/60 text-brand-sky",
                state === "pending" && "border-line/25 text-dim",
                state === "error" && "border-err/50 text-err")}>
                {state === "done" ? <Check size={13} strokeWidth={3} /> : state === "active" ? <LoaderCircle size={13} className="animate-spin" /> : state === "error" ? <X size={13} /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className={cn("text-[13px]", state === "pending" ? "text-muted" : "text-fg")}>{s.label}</div>
                <div className="truncate text-[11.5px] text-dim">{s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {log.length > 0 && (
        <div className="mt-4 max-h-40 overflow-y-auto rounded-xl border border-line/15 bg-elevated/60 p-3 font-mono text-[11.5px] leading-relaxed dark:bg-[#060a14]">
          {log.map((l, i) => (
            <div key={i} className={cn(l.tone === "err" ? "text-err" : l.tone === "ok" ? "text-pass" : l.tone === "dim" ? "text-dim" : "text-fg/85")}>
              <span className="mr-2 text-dim">{startedAt ? `+${((l.t - startedAt) / 1000).toFixed(1)}s` : ""}</span>{l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
