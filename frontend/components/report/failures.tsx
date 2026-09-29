"use client";
import { useMemo, useState } from "react";
import { CircleCheck, Sparkles } from "lucide-react";
import type { Failure, Report } from "@/lib/types";
import { Badge, MethodBadge, SeverityBadge } from "../ui/badge";
import { Segmented } from "../ui/controls";
import { EmptyState } from "../ui/card";
import { Button } from "../ui/button";
import { CaseDrawer } from "./case-detail";

export function FailureCard({ f, onInspect, featured }: { f: Failure; onInspect?: () => void; featured?: boolean }) {
  return (
    <article className={featured ? "card-featured p-5" : "card p-5"}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={f.analysis.severity} />
        <Badge>{f.analysis.failure_type}</Badge>
        {f.analysis.analyzed_by === "ai" && <Badge tone="ai"><Sparkles size={11} />AI analysis</Badge>}
        <span className="ml-auto font-mono text-[11px] text-dim">{f.id}</span>
      </div>
      <h3 className="mt-3 text-[14.5px] font-medium">{f.name}</h3>
      <div className="mt-1.5 flex items-center gap-2"><MethodBadge method={f.method} /><span className="truncate font-mono text-[11.5px] text-muted">{f.path}</span></div>
      <dl className="mt-4 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 border-t border-line/15 pt-4 text-[12.5px]">
        <dt className="text-dim">Expected</dt><dd className="font-mono">{f.expected.join(" or ")}</dd>
        <dt className="text-dim">Actual</dt><dd className="font-mono">{f.actual ?? "no response"}{f.schema_errors[0] ? <span className="text-fail"> · {f.schema_errors[0]}</span> : null}</dd>
        <dt className="text-dim">Finding</dt><dd>{f.analysis.summary}</dd>
        <dt className="text-dim">Likely cause</dt><dd className="text-fg/90">{f.analysis.likely_cause}</dd>
        <dt className="text-dim">Suggested fix</dt><dd className="text-fg/90">{f.analysis.suggestion}</dd>
      </dl>
      {onInspect && <Button size="sm" variant="subtle" className="mt-4 w-full" onClick={onInspect}>Inspect request &amp; response</Button>}
    </article>
  );
}

export function FailuresTab({ report }: { report: Report }) {
  const [sev, setSev] = useState<string>("all");
  const [open, setOpen] = useState<Failure | null>(null);
  const list = useMemo(() => report.failures.filter((f) => sev === "all" || f.analysis.severity === sev), [report, sev]);

  if (!report.failures.length) {
    return <EmptyState icon={<CircleCheck size={20} />} title={`All ${report.summary.total} tests passed`} body="No failures to analyze. Check the edge-case suggestions for what to test next." />;
  }
  const s = report.summary.severities;
  return (
    <div className="space-y-4">
      <Segmented value={sev} onChange={setSev} options={[
        { value: "all", label: "All", count: report.failures.length },
        ...(["critical", "high", "medium", "low"] as const).filter((k) => s[k]).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1), count: s[k] })),
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((f, i) => <FailureCard key={f.id} f={f} featured={i === 0 && sev === "all"} onInspect={() => setOpen(f)} />)}
      </div>
      <CaseDrawer row={open} analysis={open?.analysis} onClose={() => setOpen(null)} />
    </div>
  );
}
