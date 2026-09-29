"use client";
import Link from "next/link";
import { useState } from "react";
import { FileJson, FolderKanban, Link2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { Project } from "@/lib/types";
import { useProjects, useRuns } from "@/lib/store";
import { passTone, timeAgo } from "@/lib/utils";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ProjectForm } from "@/components/project-form";

export default function ProjectsPage() {
  const { projects, save, remove, ready } = useProjects();
  const { runs } = useRuns();
  const [editing, setEditing] = useState<Project | null>(null);
  const [open, setOpen] = useState(false);

  const openNew = () => { setEditing(null); setOpen(true); };

  return (
    <div>
      <PageHeader title="Projects" description="Save an API's spec, base URL and auth once, then re-run it whenever the API changes."
        actions={<Button variant="primary" onClick={openNew}><Plus size={14} />New project</Button>} />
      {!ready ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
        : projects.length === 0 ? (
          <EmptyState icon={<FolderKanban size={20} />} title="No projects yet" body="Create a project from an OpenAPI URL, an OpenAPI file or a Postman collection."
            action={<Button variant="primary" onClick={openNew}><Plus size={14} />New project</Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => {
              const pr = runs.filter((r) => r.projectId === p.id);
              const last = pr[0];
              return (
                <Card key={p.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-medium">{p.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{p.description || "No description"}</p>
                    </div>
                    {last ? <Badge tone={passTone(last.summary.pass_rate) === "pass" ? "pass" : "fail"}>{last.summary.pass_rate}%</Badge> : <Badge>New</Badge>}
                  </div>
                  <div className="mt-4 space-y-1.5 border-t border-line/15 pt-4 text-[12px] text-muted">
                    <div className="flex items-center gap-2 truncate">{p.specMode === "url" ? <Link2 size={13} /> : <FileJson size={13} />}<span className="truncate font-mono text-[11.5px]">{p.specMode === "url" ? p.specUrl : p.specFile?.name}</span>{p.specFile?.kind === "postman" && <Badge tone="info">Postman</Badge>}</div>
                    <div>{pr.length} run{pr.length === 1 ? "" : "s"}{last && <> · last {timeAgo(last.createdAt)}</>}{p.useLlm && <> · LLM on</>}</div>
                  </div>
                  <div className="mt-5 flex items-center gap-2">
                    <ButtonLink href={`/run?project=${p.id}`} variant="primary" size="sm" className="flex-1"><Play size={13} />Run tests</ButtonLink>
                    {last && <ButtonLink href={`/runs/${last.runId}`} size="sm">Last report</ButtonLink>}
                    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setEditing(p); setOpen(true); }}><Pencil size={14} /></Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => confirm(`Delete "${p.name}"? Its reports stay on the backend.`) && remove(p.id)}><Trash2 size={14} /></Button>
                  </div>
                </Card>
              );
            })}
            <button onClick={openNew} className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-line/30 text-[13px] text-muted transition hover:border-brand-sky/50 hover:text-fg">
              <Plus size={18} className="mb-2" />New project
            </button>
          </div>
        )}
      <p className="mt-6 text-[11.5px] text-dim">Tip: runs made from the CLI are also viewable — open <Link href="/runs/latest" className="text-brand-sky hover:underline">/runs/latest</Link>.</p>
      <ProjectForm open={open} initial={editing} onClose={() => setOpen(false)} onSave={(d) => { save(d); setOpen(false); }} />
    </div>
  );
}
