"use client";
import { useMemo, useState } from "react";
import { Lightbulb, Sparkles } from "lucide-react";
import type { EdgeCase, Report } from "@/lib/types";
import { Badge, type Tone } from "../ui/badge";
import { Segmented } from "../ui/controls";
import { EmptyState } from "../ui/card";
import { CopyButton } from "../json-view";

const PRIORITY_TONE: Record<string, Tone> = { high: "err", medium: "info", low: "neutral" };

export function EdgeCaseCard({ g }: { g: EdgeCase }) {
  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-center gap-2">
        <Badge tone={PRIORITY_TONE[g.priority] ?? "neutral"} className="capitalize">{g.priority} priority</Badge>
        {g.source === "ai" && <Badge tone="ai"><Sparkles size={11} />AI</Badge>}
      </div>
      <h3 className="mt-3 text-[14px] font-medium leading-snug">{g.title}</h3>
      <div className="mt-1 font-mono text-[11px] text-muted">{g.operation}</div>
      <p className="mt-2.5 text-[12.5px] text-muted">{g.detail}</p>
      <div className="mt-auto pt-4">
        <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/[.06] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-brand-blue dark:text-brand-cyan">Suggested test</span>
            <CopyButton text={g.suggested_test} className="-my-1 -mr-1" />
          </div>
          <p className="text-[12.5px] text-fg/90">{g.suggested_test}</p>
        </div>
      </div>
    </article>
  );
}

export function EdgeCasesTab({ report }: { report: Report }) {
  const [priority, setPriority] = useState("all");
  const [source, setSource] = useState("all");
  const list = useMemo(() => report.edge_cases.filter((g) => (priority === "all" || g.priority === priority) && (source === "all" || g.source === source)), [report, priority, source]);
  const count = (p: string) => report.edge_cases.filter((g) => g.priority === p).length;
  const ai = report.edge_cases.filter((g) => g.source === "ai").length;

  if (!report.edge_cases.length) return <EmptyState icon={<Lightbulb size={20} />} title="No uncovered edge cases detected" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Segmented value={priority} onChange={setPriority} options={[
          { value: "all", label: "All", count: report.edge_cases.length },
          { value: "high", label: "High", count: count("high") },
          { value: "medium", label: "Medium", count: count("medium") },
          { value: "low", label: "Low", count: count("low") },
        ]} />
        {ai > 0 && <Segmented value={source} onChange={setSource} options={[{ value: "all", label: "All sources" }, { value: "ai", label: "AI", count: ai }, { value: "rules", label: "Rules" }]} />}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((g, i) => <EdgeCaseCard key={g.title + g.operation + i} g={g} />)}</div>
    </div>
  );
}
