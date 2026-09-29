"use client";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";
import { Drawer, Field, Switch } from "./ui/controls";
import { Button } from "./ui/button";
import { SpecInput, SpecPreviewPanel, type SpecValue } from "./spec-input";

type Draft = Omit<Project, "id" | "createdAt" | "updatedAt"> & { id?: string };
const EMPTY: Draft = { name: "", description: "", specMode: "url", specUrl: "", baseUrl: "", authHeader: "", useLlm: true };

export function ProjectForm({ open, initial, onClose, onSave }: { open: boolean; initial?: Project | null; onClose: () => void; onSave: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(EMPTY);
  useEffect(() => { if (open) setD(initial ? { ...initial } : EMPTY); }, [open, initial]);
  const spec: SpecValue = { mode: d.specMode, url: d.specUrl, file: d.specFile };
  const setSpec = (s: SpecValue) => setD({ ...d, specMode: s.mode, specUrl: s.url, specFile: s.file });
  const valid = d.name.trim() && (d.specMode === "url" ? /^https?:\/\//.test(d.specUrl.trim()) : !!d.specFile);

  return (
    <Drawer open={open} onClose={onClose} width="max-w-2xl" title={initial ? "Edit project" : "New project"} subtitle="Projects are saved in this browser.">
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ ...d, name: d.name.trim(), specUrl: d.specUrl.trim() }); }}>
        <Field label="Name" htmlFor="p-name"><input id="p-name" className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Payments API" autoFocus /></Field>
        <Field label="Description" htmlFor="p-desc"><input id="p-desc" className="input" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Optional" /></Field>
        <div><span className="label">API specification</span><SpecInput value={spec} onChange={setSpec} /></div>
        <SpecPreviewPanel spec={spec} />
        <Field label="Base URL" htmlFor="p-base" hint="Optional. Defaults to the spec's first server."><input id="p-base" className="input font-mono" value={d.baseUrl} onChange={(e) => setD({ ...d, baseUrl: e.target.value })} placeholder="http://127.0.0.1:8001" /></Field>
        <Field label="Auth header" htmlFor="p-auth" hint="Sent with every request. Stored in this browser only."><input id="p-auth" className="input font-mono" value={d.authHeader} onChange={(e) => setD({ ...d, authHeader: e.target.value })} placeholder="Authorization: Bearer …" /></Field>
        <Switch id="p-llm" checked={d.useLlm} onChange={(useLlm) => setD({ ...d, useLlm })} label="Use LLM by default" description="AI test ideas and failure analysis (needs a key in backend/.env)" />
        <div className="flex justify-end gap-2 border-t border-line/15 pt-5">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid}>{initial ? "Save changes" : "Create project"}</Button>
        </div>
      </form>
    </Drawer>
  );
}
