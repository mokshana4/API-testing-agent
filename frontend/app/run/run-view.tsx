"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Play, Save, Square } from "lucide-react";
import { runAgent, ApiError } from "@/lib/api";
import { useProjects, useRuns } from "@/lib/store";
import { storedToFile } from "@/lib/spec";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, Switch } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { SpecInput, SpecPreviewPanel, type SpecValue } from "@/components/spec-input";
import { RunProgress, type LogLine, type RunPhase } from "@/components/run-progress";
import { useBackendStatus } from "@/components/backend-status";

export function RunView() {
  const router = useRouter();
  const params = useSearchParams();
  const { projects, save, ready } = useProjects();
  const { add } = useRuns();
  const { status } = useBackendStatus();

  const [projectId, setProjectId] = useState<string>("");
  const [spec, setSpec] = useState<SpecValue>({ mode: "url", url: "" });
  const [baseUrl, setBaseUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [useLlm, setUseLlm] = useState(true);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const abort = useRef<AbortController | null>(null);

  // Prefill from ?project=
  useEffect(() => {
    if (!ready) return;
    const id = params.get("project");
    const p = projects.find((x) => x.id === id);
    if (p) loadProject(p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function loadProject(id: string) {
    setProjectId(id);
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    setSpec({ mode: p.specMode, url: p.specUrl, file: p.specFile });
    setBaseUrl(p.baseUrl);
    setAuthHeader(p.authHeader);
    setUseLlm(p.useLlm);
  }

  const project = projects.find((p) => p.id === projectId);
  const specReady = spec.mode === "url" ? /^https?:\/\//.test(spec.url.trim()) : !!spec.file;
  const running = phase === "running";
  const push = (text: string, tone?: LogLine["tone"]) => setLog((l) => [...l, { t: Date.now(), text, tone }]);

  async function start() {
    if (!specReady || running) return;
    const t0 = Date.now();
    setPhase("running");
    setStartedAt(t0);
    setLog([{ t: t0, text: `POST /api/run · ${spec.mode === "url" ? spec.url : spec.file?.name} · LLM ${useLlm ? "on" : "off"}` }]);
    abort.current = new AbortController();
    try {
      const res = await runAgent({
        specUrl: spec.mode === "url" ? spec.url.trim() : undefined,
        specFile: spec.mode === "file" && spec.file ? storedToFile(spec.file) : undefined,
        baseUrl, authHeader, useLlm,
      }, abort.current.signal);
      const s = res.summary;
      push(`Generated and executed ${s.total} tests across ${s.endpoints} endpoints`, "ok");
      push(`${s.passed} passed · ${s.failed} failed · ${s.edge_cases} uncovered edge cases`, s.failed ? "err" : "ok");
      push(`Report ${res.run_id} written`, "dim");
      setPhase("done");
      add({
        runId: res.run_id, projectId: project?.id, projectName: project?.name,
        title: project?.name ?? (spec.mode === "url" ? spec.url : spec.file?.name ?? "Ad-hoc run"),
        createdAt: new Date().toISOString(), specSource: spec.mode === "url" ? spec.url : spec.file?.name ?? "",
        baseUrl: baseUrl || undefined, useLlm, durationMs: Date.now() - t0, summary: s,
      });
      setTimeout(() => router.push(`/runs/${res.run_id}`), 700);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        push("Stopped waiting. The backend may still finish the run; it will appear under Reports → Open by run ID.", "dim");
        setPhase("idle");
        return;
      }
      push(e instanceof ApiError ? e.message : String(e), "err");
      setPhase("error");
    }
  }

  function saveAsProject() {
    const name = prompt("Project name", project?.name ?? "My API");
    if (!name) return;
    const id = save({ id: project?.id, name, description: project?.description ?? "", specMode: spec.mode, specUrl: spec.url, specFile: spec.file, baseUrl, authHeader, useLlm });
    setProjectId(id);
  }

  return (
    <div>
      <PageHeader eyebrow={<Pill>New run</Pill>} title={project ? project.name : "Test an API"}
        description="The agent parses the spec, generates positive, negative, validation, boundary and edge-case tests, executes them and analyzes the results." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card featured className="space-y-5 p-6">
          <Field label="Project" htmlFor="project">
            <select id="project" className="input" value={projectId} onChange={(e) => (e.target.value ? loadProject(e.target.value) : setProjectId(""))} disabled={running}>
              <option value="">Ad-hoc run (not saved)</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <div><span className="label">API specification</span><SpecInput value={spec} onChange={setSpec} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base URL" htmlFor="base" hint="Defaults to the spec's server"><input id="base" className="input font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:8001" /></Field>
            <Field label="Auth header" htmlFor="auth" hint="Optional, sent on every request"><input id="auth" className="input font-mono" value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Authorization: Bearer …" /></Field>
          </div>
          <Switch id="llm" checked={useLlm} onChange={setUseLlm} label="Use LLM" description="AI-generated scenarios and failure analysis. Falls back to rules if no key is configured." />
          <div className="flex flex-wrap gap-2 border-t border-line/15 pt-5">
            {running
              ? <Button variant="secondary" className="flex-1" onClick={() => abort.current?.abort()}><Square size={13} />Stop waiting</Button>
              : <Button variant="primary" className="flex-1" onClick={start} disabled={!specReady || status === "offline"}><Play size={14} />Run tests</Button>}
            <Button onClick={saveAsProject} disabled={!specReady || running}><Save size={14} />{project ? "Update project" : "Save as project"}</Button>
          </div>
          {status === "offline" && <p className="text-[12px] text-err">Backend offline. Start it with <code className="kbd">uvicorn app.main:app --port 8000</code> in backend/.</p>}
        </Card>

        <div className="space-y-5">
          <RunProgress phase={phase} startedAt={startedAt} useLlm={useLlm} log={log} />
          <SpecPreviewPanel spec={spec} />
        </div>
      </div>
    </div>
  );
}
