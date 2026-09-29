"use client";
import Link from "next/link";
import type { RunRecord } from "@/lib/types";
import { passTone, timeAgo } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Meter } from "./charts";

export function RunList({ runs }: { runs: RunRecord[] }) {
  return (
    <div className="divide-y divide-line/10">
      {runs.map((r) => (
        <Link key={r.runId} href={`/runs/${r.runId}`} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 hover:bg-fg/[.02] md:grid-cols-[1.4fr_1fr_120px_110px_80px]">
          <div className="min-w-0">
            <div className="truncate text-[13px]">{r.projectName ?? r.title}</div>
            <div className="truncate font-mono text-[11px] text-dim">{r.runId}</div>
          </div>
          <div className="hidden truncate font-mono text-[11.5px] text-muted md:block">{r.specSource}</div>
          <div className="hidden items-center gap-2 md:flex"><Meter value={r.summary.pass_rate} tone={passTone(r.summary.pass_rate)} className="flex-1" /><span className="w-10 text-right text-[11.5px] text-muted">{r.summary.pass_rate}%</span></div>
          <div className="hidden md:block">{r.summary.failed ? <Badge tone="fail" dot>{r.summary.failed} failed</Badge> : <Badge tone="pass" dot>All passed</Badge>}</div>
          <div className="text-right text-[11.5px] text-dim">{timeAgo(r.createdAt)}</div>
        </Link>
      ))}
    </div>
  );
}
