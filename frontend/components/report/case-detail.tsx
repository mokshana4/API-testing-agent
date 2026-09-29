"use client";
import { useState } from "react";
import { Sparkles, Terminal } from "lucide-react";
import type { FailureAnalysis, ResultRow } from "@/lib/types";
import { stateOf, toCurl } from "@/lib/utils";
import { Badge, MethodBadge, SeverityBadge, StateBadge } from "../ui/badge";
import { Drawer, Segmented } from "../ui/controls";
import { CodeBlock, CopyButton } from "../json-view";

export function CaseDrawer({ row, analysis, onClose }: { row: ResultRow | null; analysis?: FailureAnalysis; onClose: () => void }) {
  const [tab, setTab] = useState<"request" | "response">("response");
  if (!row) return null;
  const state = stateOf(row);
  const params = { path: row.request.path_params, query: row.request.query_params };
  const hasParams = Object.keys(params.path ?? {}).length + Object.keys(params.query ?? {}).length > 0;

  return (
    <Drawer open onClose={onClose}
      title={<span className="flex items-center gap-2">{row.name}</span>}
      subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{row.id}</span>·<span className="capitalize">{row.category}</span>{row.source === "llm" && <Badge tone="ai">AI-generated</Badge>}</span>}>
      <div className="space-y-5">
        <div className="flex items-center gap-2.5 rounded-xl border border-line/15 bg-elevated/50 px-3 py-2.5">
          <MethodBadge method={row.method} />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={row.url}>{row.url}</span>
          <StateBadge state={state} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Expected" value={row.expected.join(" or ")} />
          <Stat label="Actual" value={row.actual ?? "No response"} tone={state === "pass" ? "text-pass" : state === "error" ? "text-err" : "text-fail"} />
          <Stat label="Duration" value={`${row.duration_ms} ms`} />
        </div>

        <p className="text-[13px] text-muted">{row.description}</p>

        {(row.errors.length > 0 || row.schema_errors.length > 0) && (
          <div className="rounded-xl border border-fail/25 bg-fail/[.06] p-3">
            <div className="mb-1.5 text-xs font-medium text-fail">Assertion errors</div>
            {[...row.errors, ...row.schema_errors.map((e) => `schema · ${e}`)].map((e) => (
              <div key={e} className="font-mono text-[11.5px] text-fg/85">{e}</div>
            ))}
          </div>
        )}

        {analysis && (
          <div className="rounded-xl border border-brand-violet/25 bg-brand-violet/[.05] p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Sparkles size={14} className="text-violet-500 dark:text-violet-300" />
              <span className="text-[13px] font-medium">Failure analysis</span>
              <SeverityBadge severity={analysis.severity} />
              <Badge>{analysis.failure_type}</Badge>
              {analysis.analyzed_by === "ai" && <Badge tone="ai">AI</Badge>}
            </div>
            <dl className="grid gap-2 text-[12.5px] sm:grid-cols-[110px_1fr]">
              <dt className="text-dim">Likely cause</dt><dd>{analysis.likely_cause}</dd>
              <dt className="text-dim">Suggested fix</dt><dd>{analysis.suggestion}</dd>
            </dl>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Segmented value={tab} onChange={setTab} options={[{ value: "request", label: "Request" }, { value: "response", label: `Response${row.actual ? ` · ${row.actual}` : ""}` }]} />
          <CopyButton text={toCurl(row)} label="Copy as cURL" className="border border-line/20" />
        </div>

        {tab === "request" ? (
          <div className="space-y-3">
            {hasParams && <CodeBlock title="Parameters" value={params} />}
            {Object.keys(row.request.headers ?? {}).length > 0 && <CodeBlock title="Headers" value={row.request.headers} />}
            <CodeBlock title="Body" value={row.request.body} raw={typeof row.request.body === "string"} empty="No request body" />
            <CodeBlock title="cURL" value={toCurl(row)} raw maxHeight="max-h-40" />
          </div>
        ) : (
          <CodeBlock title="Response body" value={row.response_body} empty={row.actual === null ? "No response received" : "Empty body"} maxHeight="max-h-[480px]" />
        )}
        <p className="flex items-center gap-1.5 text-[11.5px] text-dim"><Terminal size={12} /> Auth headers passed as defaults are not stored in the report and are left out of cURL.</p>
      </div>
    </Drawer>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-line/15 px-3 py-2.5">
      <div className="text-[11px] text-dim">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-[13px] ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
