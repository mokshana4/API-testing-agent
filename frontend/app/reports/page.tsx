"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileText, Search, Trash2 } from "lucide-react";
import { useProjects, useRuns } from "@/lib/store";
import { formatDate, passTone } from "@/lib/utils";
import { reportUrls } from "@/lib/api";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Meter } from "@/components/charts";

export default function ReportsPage() {
  const router = useRouter();
  const { runs, remove, clear, ready } = useRuns();
  const { projects } = useProjects();
  const [project, setProject] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState("");

  const list = useMemo(() => runs.filter((r) =>
    (project === "all" || r.projectId === project || (project === "adhoc" && !r.projectId)) &&
    (!q || `${r.title} ${r.runId} ${r.specSource}`.toLowerCase().includes(q.toLowerCase()))), [runs, project, q]);

  return (
    <div>
      <PageHeader title="Reports" description="Every run made from this browser. Reports themselves live on the backend under backend/reports/."
        actions={runs.length > 0 && <Button variant="ghost" size="sm" onClick={() => confirm("Clear run history in this browser? Reports on the backend are kept.") && clear()}>Clear history</Button>} />

      <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="text-[13px] sm:flex-1"><div className="font-medium">Open a report by run ID</div><div className="text-[12px] text-muted">For runs made with the CLI or demo, e.g. <code className="font-mono">latest</code> or <code className="font-mono">20260928-120655</code>.</div></div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (openId.trim()) router.push(`/runs/${encodeURIComponent(openId.trim())}`); }}>
          <input className="input h-9 w-56 font-mono" value={openId} onChange={(e) => setOpenId(e.target.value)} placeholder="latest" aria-label="Run ID" />
          <Button type="submit" size="sm" variant="primary" className="h-9">Open</Button>
        </form>
      </Card>

      {ready && runs.length === 0 ? (
        <EmptyState icon={<FileText size={20} />} title="No runs yet" body="Start a run and its report will show up here." action={<ButtonLink href="/run" variant="primary">New run</ButtonLink>} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select className="input h-8 w-auto rounded-full py-0 text-xs" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
              <option value="all">All projects</option>
              <option value="adhoc">Ad-hoc runs</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="relative ml-auto w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
              <input className="input h-8 rounded-full py-0 pl-8 text-xs" placeholder="Search runs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search runs" />
            </div>
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead><tr className="border-b border-line/15 text-left text-[11px] text-dim">
                <th className="px-4 py-3 font-normal">Run</th><th className="px-3 py-3 font-normal">Spec</th><th className="px-3 py-3 font-normal">Tests</th>
                <th className="px-3 py-3 font-normal">Pass rate</th><th className="px-3 py-3 font-normal">Result</th><th className="px-3 py-3 font-normal">When</th><th className="px-4 py-3" />
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.runId} className="border-b border-line/10 last:border-0 hover:bg-fg/[.02]">
                    <td className="px-4 py-3"><Link href={`/runs/${r.runId}`} className="block hover:text-brand-sky"><div className="truncate text-[13px]">{r.projectName ?? r.title}</div><div className="font-mono text-[11px] text-dim">{r.runId}</div></Link></td>
                    <td className="max-w-[240px] truncate px-3 py-3 font-mono text-[11.5px] text-muted">{r.specSource}</td>
                    <td className="px-3 py-3">{r.summary.total}<span className="text-dim"> · {r.summary.endpoints} ep</span></td>
                    <td className="px-3 py-3"><div className="flex items-center gap-2"><Meter value={r.summary.pass_rate} tone={passTone(r.summary.pass_rate)} className="w-20" /><span className="text-muted">{r.summary.pass_rate}%</span></div></td>
                    <td className="px-3 py-3">{r.summary.failed ? <Badge tone="fail" dot>{r.summary.failed} failed</Badge> : <Badge tone="pass" dot>Passed</Badge>}{r.useLlm && <Badge tone="ai" className="ml-1.5">AI</Badge>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <a href={reportUrls(r.runId).html} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 text-[11.5px] text-muted hover:bg-fg/5 hover:text-fg">HTML</a>
                        <button onClick={() => remove(r.runId)} className="rounded-md p-1.5 text-dim hover:bg-fg/5 hover:text-err" aria-label="Remove from history"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No runs match.</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
