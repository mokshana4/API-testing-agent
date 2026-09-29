"use client";
import { useMemo } from "react";
import type { Report } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MethodBadge } from "../ui/badge";
import { StatCard } from "../ui/card";
import { Meter } from "../charts";

const CATS = ["positive", "negative", "validation", "boundary", "edge"];
const matches = (code: number, doc: string) => doc === String(code) || (doc.toUpperCase().endsWith("XX") && doc[0] === String(code)[0]);

export function useCoverage(report: Report) {
  return useMemo(() => {
    const rows = report.endpoints.map((e) => {
      const rs = report.results.filter((r) => r.operation_id === e.operation_id);
      const cells = CATS.map((c) => {
        const inCat = rs.filter((r) => r.category === c);
        return { cat: c, total: inCat.length, failed: inCat.filter((r) => !r.passed).length };
      });
      const observed = [...new Set(rs.map((r) => r.actual).filter((x): x is number => x !== null))].sort();
      const documented = e.documented.filter((d) => d !== "default");
      const docStatus = documented.map((d) => ({ code: d, seen: observed.some((o) => matches(o, d)) }));
      const undocumented = observed.filter((o) => !documented.some((d) => matches(o, d)));
      return { e, cells, docStatus, undocumented };
    });
    const cellsTotal = rows.length * CATS.length;
    const cellsHit = rows.reduce((n, r) => n + r.cells.filter((c) => c.total > 0).length, 0);
    const docTotal = rows.reduce((n, r) => n + r.docStatus.length, 0);
    const docHit = rows.reduce((n, r) => n + r.docStatus.filter((d) => d.seen).length, 0);
    return {
      rows,
      categoryCoverage: cellsTotal ? Math.round((cellsHit / cellsTotal) * 100) : 0,
      statusCoverage: docTotal ? Math.round((docHit / docTotal) * 100) : 0,
      endpointsTested: rows.filter((r) => r.e.total > 0).length,
      undocumentedCount: rows.reduce((n, r) => n + r.undocumented.length, 0),
      docHit, docTotal,
    };
  }, [report]);
}

export function CoverageTab({ report }: { report: Report }) {
  const cov = useCoverage(report);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Endpoints tested" value={`${cov.endpointsTested}/${report.endpoints.length}`} hint="with at least one test" />
        <StatCard label="Scenario coverage" value={cov.categoryCoverage} unit="%" hint="endpoint × category cells with tests" featured />
        <StatCard label="Status-code coverage" value={cov.statusCoverage} unit="%" hint={`${cov.docHit} of ${cov.docTotal} documented codes observed`} />
        <StatCard label="Undocumented responses" value={cov.undocumentedCount} hint="codes returned but not in the spec" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line/15 text-left text-[11px] text-dim">
              <th className="px-4 py-3 font-normal">Endpoint</th>
              {CATS.map((c) => <th key={c} className="px-2 py-3 text-center font-normal capitalize">{c}</th>)}
              <th className="px-3 py-3 font-normal">Status codes (documented · observed)</th>
              <th className="px-4 py-3 font-normal">Pass rate</th>
            </tr>
          </thead>
          <tbody>
            {cov.rows.map(({ e, cells, docStatus, undocumented }) => (
              <tr key={e.operation_id} className="border-b border-line/10 last:border-0">
                <td className="px-4 py-2.5"><div className="flex items-center gap-2"><MethodBadge method={e.method} /><span className="font-mono text-[11.5px]">{e.path}</span></div></td>
                {cells.map((c) => (
                  <td key={c.cat} className="px-2 py-2.5 text-center">
                    <span className={cn("inline-grid h-7 min-w-[34px] place-items-center rounded-lg px-1.5 font-mono text-[11px]",
                      c.total === 0 ? "border border-dashed border-line/25 text-dim" : c.failed ? "bg-fail/15 text-fail" : "bg-pass/15 text-pass")}
                      title={c.total ? `${c.total} tests, ${c.failed} failed` : "Not covered"}>
                      {c.total || "–"}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {docStatus.map((d) => (
                      <span key={d.code} title={d.seen ? "Observed" : "Documented, never observed"}
                        className={cn("rounded-md px-1.5 py-0.5 font-mono text-[10.5px]", d.seen ? "bg-pass/15 text-pass" : "border border-dashed border-line/30 text-dim")}>{d.code}</span>
                    ))}
                    {undocumented.map((c) => (
                      <span key={c} title="Returned but not documented" className="rounded-md bg-warn/15 px-1.5 py-0.5 font-mono text-[10.5px] text-warn">{c}!</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Meter value={e.pass_pct} tone={e.failed ? "fail" : "pass"} className="w-20" /><span className="w-10 text-right text-[11.5px] text-muted">{e.pass_pct}%</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-pass/40" />Covered, all passing</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-fail/40" />Covered, has failures</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded border border-dashed border-line/40" />Not covered / not observed</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-warn/40" />Undocumented status</span>
      </div>
    </div>
  );
}
