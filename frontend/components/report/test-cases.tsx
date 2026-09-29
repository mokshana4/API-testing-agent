"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Report, ResultRow } from "@/lib/types";
import { cn, stateOf } from "@/lib/utils";
import { Badge, MethodBadge, StateBadge } from "../ui/badge";
import { Segmented } from "../ui/controls";
import { CaseDrawer } from "./case-detail";

type StatusFilter = "all" | "pass" | "fail" | "error";

export function TestCasesTab({ report, initialStatus = "all" }: { report: Report; initialStatus?: StatusFilter }) {
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [cat, setCat] = useState("all");
  const [endpoint, setEndpoint] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ResultRow | null>(null);
  const analyses = useMemo(() => new Map(report.failures.map((f) => [f.id, f.analysis])), [report]);

  const counts = useMemo(() => {
    const c = { all: report.results.length, pass: 0, fail: 0, error: 0 };
    report.results.forEach((r) => c[stateOf(r)]++);
    return c;
  }, [report]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return report.results.filter((r) =>
      (status === "all" || stateOf(r) === status) &&
      (cat === "all" || r.category === cat) &&
      (endpoint === "all" || r.operation_id === endpoint) &&
      (!needle || `${r.id} ${r.name} ${r.method} ${r.path}`.toLowerCase().includes(needle)));
  }, [report, status, cat, endpoint, q]);

  const cats = report.summary.by_category.filter((c) => c.total > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={setStatus} options={[
          { value: "all", label: "All", count: counts.all },
          { value: "pass", label: "Passed", count: counts.pass },
          { value: "fail", label: "Failed", count: counts.fail },
          { value: "error", label: "Errors", count: counts.error },
        ]} />
        <select className="input h-8 w-auto rounded-full py-0 text-xs" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {cats.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.total})</option>)}
        </select>
        <select className="input h-8 w-auto max-w-[260px] rounded-full py-0 text-xs" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} aria-label="Endpoint">
          <option value="all">All endpoints</option>
          {report.endpoints.map((e) => <option key={e.operation_id} value={e.operation_id}>{e.method.toUpperCase()} {e.path}</option>)}
        </select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input h-8 rounded-full py-0 pl-8 text-xs" placeholder="Search tests, paths, IDs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[70px_minmax(0,1.3fr)_minmax(0,1.6fr)_96px_120px_70px_76px] gap-3 border-b border-line/15 px-4 py-2.5 text-[11px] text-dim md:grid">
          <span>ID</span><span>Endpoint</span><span>Test</span><span>Category</span><span>Expected → actual</span><span className="text-right">Time</span><span>Result</span>
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          {rows.map((r) => {
            const st = stateOf(r);
            return (
              <button key={r.id} onClick={() => setOpen(r)}
                className={cn("grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-line/10 px-4 py-2.5 text-left text-[12.5px] transition last:border-0 hover:bg-fg/[.03]",
                  "md:grid-cols-[70px_minmax(0,1.3fr)_minmax(0,1.6fr)_96px_120px_70px_76px]")}>
                <span className="hidden font-mono text-[11.5px] text-dim md:block">{r.id}</span>
                <span className="hidden min-w-0 items-center gap-2 md:flex"><MethodBadge method={r.method} /><span className="truncate font-mono text-[11.5px] text-muted">{r.path}</span></span>
                <span className="min-w-0 truncate">
                  {r.name}{r.source === "llm" && <Badge tone="ai" className="ml-2">AI</Badge>}
                  <span className="block truncate font-mono text-[11px] text-dim md:hidden">{r.method.toUpperCase()} {r.path}</span>
                </span>
                <span className="hidden md:block"><Badge className="capitalize">{r.category}</Badge></span>
                <span className="hidden font-mono text-[11.5px] text-muted md:block">{r.expected.join("/")} → <b className="font-medium text-fg">{r.actual ?? "ERR"}</b></span>
                <span className="hidden text-right text-[11.5px] text-dim md:block">{r.duration_ms} ms</span>
                <span className="row-span-2 md:row-span-1"><StateBadge state={st} /></span>
              </button>
            );
          })}
          {rows.length === 0 && <div className="px-4 py-12 text-center text-[13px] text-muted">No tests match these filters.</div>}
        </div>
      </div>
      <p className="text-[11.5px] text-dim">{rows.length} of {report.results.length} tests shown. Click a row to inspect the request and response.</p>
      <CaseDrawer row={open} analysis={open ? analyses.get(open.id) : undefined} onClose={() => setOpen(null)} />
    </div>
  );
}
