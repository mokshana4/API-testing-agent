"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bug, Download, ExternalLink, Grid3x3, LayoutDashboard, Lightbulb, ListChecks, RotateCcw } from "lucide-react";
import type { Report } from "@/lib/types";
import { getReport, reportUrls } from "@/lib/api";
import { useRuns } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Badge, Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Tabs } from "@/components/ui/controls";
import { OverviewTab } from "@/components/report/overview";
import { TestCasesTab } from "@/components/report/test-cases";
import { FailuresTab } from "@/components/report/failures";
import { EdgeCasesTab } from "@/components/report/edge-cases";
import { CoverageTab } from "@/components/report/coverage";

type Tab = "overview" | "tests" | "failures" | "edges" | "coverage";

export default function RunReportPage() {
  const { runId } = useParams<{ runId: string }>();
  const { runs } = useRuns();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    let alive = true;
    setReport(null);
    setError(null);
    getReport(runId).then((r) => alive && setReport(r)).catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [runId]);

  useEffect(() => { if (report) document.title = `${report.meta.title} · ${report.meta.run_id}`; }, [report]);

  if (error) {
    return <EmptyState icon={<Bug size={20} />} title="Report unavailable" body={<>{error} Check that the backend is running and the run ID exists in <code className="font-mono">backend/reports/</code>.</>}
      action={<ButtonLink href="/reports" variant="primary">Back to reports</ButtonLink>} />;
  }
  if (!report) {
    return <div className="space-y-4"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-10" /><div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div><Skeleton className="h-72" /></div>;
  }

  const record = runs.find((r) => r.runId === runId || r.runId === report.meta.run_id);
  const urls = reportUrls(report.meta.run_id);
  const s = report.summary;
  const rerunHref = record?.projectId ? `/run?project=${record.projectId}` : "/run";

  return (
    <div>
      <PageHeader
        eyebrow={<div className="flex flex-wrap items-center gap-2"><Pill>Run {report.meta.run_id}</Pill>{s.failed ? <Badge tone="fail" dot>{s.failed} failing</Badge> : <Badge tone="pass" dot>All passing</Badge>}{report.meta.llm.enabled && <Badge tone="ai">AI-assisted</Badge>}</div>}
        title={`${report.meta.title} test results`}
        description={<>{s.total} tests · {s.endpoints} endpoints · {formatDate(report.meta.generated_at)} · <span className="font-mono">{report.meta.base_url}</span></>}
        actions={<>
          <a href={urls.html} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}><ExternalLink size={13} />HTML report</a>
          <a href={urls.json} download={`report-${report.meta.run_id}.json`} className={buttonClass("secondary", "sm")}><Download size={13} />JSON</a>
          <a href={urls.cases} download={`test_cases-${report.meta.run_id}.json`} className={buttonClass("secondary", "sm")}><Download size={13} />Test cases</a>
          <ButtonLink href={rerunHref} variant="primary" size="sm"><RotateCcw size={13} />Re-run</ButtonLink>
        </>}
      />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
          { value: "tests", label: "Test cases", count: s.total, icon: <ListChecks size={14} /> },
          { value: "failures", label: "Failures", count: s.failed, icon: <Bug size={14} /> },
          { value: "edges", label: "Edge cases", count: report.edge_cases.length, icon: <Lightbulb size={14} /> },
          { value: "coverage", label: "Coverage", icon: <Grid3x3 size={14} /> },
        ]} />
      </div>
      {tab === "overview" && <OverviewTab report={report} goTo={setTab} />}
      {tab === "tests" && <TestCasesTab report={report} />}
      {tab === "failures" && <FailuresTab report={report} />}
      {tab === "edges" && <EdgeCasesTab report={report} />}
      {tab === "coverage" && <CoverageTab report={report} />}
    </div>
  );
}
