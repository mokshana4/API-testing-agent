"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ArrowUpRight, FolderKanban, Play, Rocket, ServerOff } from "lucide-react";
import { useProjects, useRuns, DEMO_PROJECT } from "@/lib/store";
import { passTone, timeAgo } from "@/lib/utils";
import { useBackendStatus } from "@/components/backend-status";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/card";
import { Badge, Pill } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Meter, Sparkline } from "@/components/charts";
import { RunList } from "@/components/run-list";

export default function DashboardPage() {
  const router = useRouter();
  const { projects, save, ready: pReady } = useProjects();
  const { runs, ready: rReady } = useRuns();
  const { status } = useBackendStatus();

  const stats = useMemo(() => {
    const last = runs[0];
    const avg = runs.length ? runs.reduce((n, r) => n + r.summary.pass_rate, 0) / runs.length : 0;
    return {
      last,
      avg: Math.round(avg * 10) / 10,
      tests: runs.reduce((n, r) => n + r.summary.total, 0),
      trend: [...runs].slice(0, 20).reverse().map((r) => r.summary.pass_rate),
    };
  }, [runs]);

  const createDemo = () => {
    const id = save(DEMO_PROJECT);
    router.push(`/run?project=${id}`);
  };

  if (!pReady || !rReady) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div></div>;

  return (
    <div>
      <PageHeader
        eyebrow={<Pill>Spec → tests → execution → analysis → report</Pill>}
        title="Dashboard"
        description="Point the agent at an OpenAPI spec or Postman collection. It generates tests, runs them against your API, explains failures and lists what is still untested."
        actions={<>
          <ButtonLink href="/projects" variant="secondary"><FolderKanban size={14} />Projects</ButtonLink>
          <ButtonLink href="/run" variant="primary"><Play size={14} />New run</ButtonLink>
        </>}
      />

      {status === "offline" && (
        <Card className="mb-6 flex flex-col gap-3 border-err/30 p-5 sm:flex-row sm:items-center">
          <ServerOff size={18} className="shrink-0 text-err" />
          <div className="flex-1 text-[13px]">
            <div className="font-medium">The FastAPI backend isn&apos;t reachable</div>
            <div className="text-muted">Start it from <code className="font-mono">backend/</code>: <code className="kbd">uvicorn app.main:app --port 8000</code>, or run <code className="kbd">python start.py</code> at the repo root.</div>
          </div>
        </Card>
      )}

      {runs.length === 0 ? (
        <EmptyState
          icon={<Rocket size={20} />}
          title="Run your first API test"
          body={<>Try the bundled demo API: it has three planted bugs for the agent to find. Start it with <code className="kbd">uvicorn sample_api.main:app --port 8001</code> in <code className="font-mono">backend/</code>.</>}
          action={<div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={createDemo}><Rocket size={14} />Create demo project</Button><ButtonLink href="/run">Use my own spec</ButtonLink></div>}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Runs" value={runs.length} hint={`${projects.length} projects`}><div>{stats.tests.toLocaleString()} tests executed</div></StatCard>
            <StatCard label="Latest pass rate" value={stats.last.summary.pass_rate} unit="%" hint={stats.last.title} featured>
              <div>{stats.last.summary.failed} failures · {stats.last.summary.edge_cases} edge cases</div>
            </StatCard>
            <StatCard label="Average pass rate" value={stats.avg} unit="%" hint="across all runs"><Meter value={stats.avg} tone={passTone(stats.avg)} /></StatCard>
            <StatCard label="Open failures" value={stats.last.summary.failed} hint="in the latest run">
              <Link href={`/runs/${stats.last.runId}`} className="inline-flex items-center gap-1 text-brand-sky hover:underline">Review failures <ArrowUpRight size={12} /></Link>
            </StatCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card className="p-5">
              <CardHeader title="Pass-rate trend" subtitle="last 20 runs, oldest to newest" />
              <Sparkline values={stats.trend} height={170} id="trend" />
            </Card>
            <Card className="p-5">
              <CardHeader title="Projects" action={<ButtonLink href="/projects" size="sm" variant="ghost">Manage</ButtonLink>} />
              {projects.length === 0 ? <p className="text-[12.5px] text-muted">No saved projects. Runs made without a project still appear in reports.</p> : (
                <div className="space-y-1">
                  {projects.slice(0, 5).map((p) => {
                    const last = runs.find((r) => r.projectId === p.id);
                    return (
                      <Link key={p.id} href={`/run?project=${p.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-fg/[.04]">
                        <div className="min-w-0 flex-1"><div className="truncate text-[13px]">{p.name}</div><div className="truncate font-mono text-[11px] text-dim">{p.specMode === "url" ? p.specUrl : p.specFile?.name}</div></div>
                        {last ? <Badge tone={passTone(last.summary.pass_rate) === "pass" ? "pass" : "fail"}>{last.summary.pass_rate}%</Badge> : <Badge>No runs</Badge>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <CardHeader title="Recent runs" action={<ButtonLink href="/reports" size="sm" variant="ghost">All reports</ButtonLink>} />
            <RunList runs={runs.slice(0, 6)} />
          </Card>
        </div>
      )}
    </div>
  );
}
