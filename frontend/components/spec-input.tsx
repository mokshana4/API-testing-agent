"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileJson, Link2, RefreshCw, Upload, X } from "lucide-react";
import type { StoredSpecFile } from "@/lib/types";
import { importSpecFile, previewStored, previewUrl, type SpecPreview } from "@/lib/spec";
import { cn } from "@/lib/utils";
import { Segmented } from "./ui/controls";
import { Badge, MethodBadge } from "./ui/badge";

export interface SpecValue {
  mode: "url" | "file";
  url: string;
  file?: StoredSpecFile;
}

export function SpecInput({ value, onChange }: { value: SpecValue; onChange: (v: SpecValue) => void }) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const { stored, warnings } = await importSpecFile(file);
      setWarnings(warnings);
      onChange({ ...value, mode: "file", file: stored });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [onChange, value]);

  return (
    <div className="space-y-3">
      <Segmented
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: "url", label: <><Link2 size={13} />Spec URL</> },
          { value: "file", label: <><Upload size={13} />Upload file</> },
        ]}
      />

      {value.mode === "url" ? (
        <input
          className="input font-mono"
          placeholder="http://127.0.0.1:8001/openapi.json"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          aria-label="Spec URL"
        />
      ) : value.file ? (
        <div className="flex items-center gap-3 rounded-xl border border-line/20 bg-elevated/50 px-3 py-2.5">
          <FileJson size={18} className="shrink-0 text-brand-sky" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px]">{value.file.name}</div>
            <div className="text-[11.5px] text-muted">{value.file.kind === "postman" ? "Converted from Postman collection to OpenAPI 3" : `OpenAPI · ${value.file.format.toUpperCase()}`}</div>
          </div>
          {value.file.kind === "postman" && <Badge tone="info">Postman</Badge>}
          <button onClick={() => inputRef.current?.click()} className="rounded-md p-1.5 text-muted hover:text-fg" aria-label="Replace file"><RefreshCw size={14} /></button>
          <button onClick={() => { onChange({ ...value, file: undefined }); setWarnings([]); }} className="rounded-md p-1.5 text-muted hover:text-fg" aria-label="Remove file"><X size={14} /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) accept(f); }}
          className={cn("flex w-full flex-col items-center rounded-xl border border-dashed px-4 py-8 text-center transition",
            drag ? "border-brand-cyan/70 bg-brand-cyan/5" : "border-line/30 hover:border-brand-sky/50")}
        >
          <Upload size={20} className="mb-2 text-muted" />
          <span className="text-[13px]">{busy ? "Reading file…" : "Drop a spec here or click to browse"}</span>
          <span className="mt-1 text-[11.5px] text-dim">OpenAPI 3.x / Swagger 2.0 (.json, .yaml) or Postman collection v2.x</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept=".json,.yaml,.yml" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); e.target.value = ""; }} />
      {error && <p className="text-[12px] text-err">{error}</p>}
      {warnings.map((w) => <p key={w} className="text-[12px] text-warn">{w}</p>)}
    </div>
  );
}

/** Shows what the agent will parse: endpoints, methods, servers. */
export function SpecPreviewPanel({ spec }: { spec: SpecValue }) {
  const [preview, setPreview] = useState<SpecPreview | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setNote(null);
    if (spec.mode === "file") {
      setPreview(spec.file ? previewStored(spec.file) : null);
      return;
    }
    setPreview(null);
    if (!/^https?:\/\//.test(spec.url)) return;
    const t = setTimeout(() => {
      previewUrl(spec.url).then(setPreview).catch(() =>
        setNote("Preview isn't available from the browser for this URL (usually CORS). The agent fetches it server-side, so the run will still work."));
    }, 500);
    return () => clearTimeout(t);
  }, [spec.mode, spec.url, spec.file]);

  if (!preview) {
    return (
      <div className="card p-5 text-[12.5px] text-muted">
        <div className="mb-1 text-[13px] font-medium text-fg">Spec preview</div>
        {note ?? "Add a spec URL or upload a file to see the endpoints the agent will test."}
      </div>
    );
  }
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{preview.title} <span className="text-muted">v{preview.version}</span></div>
          <div className="mt-0.5 text-[11.5px] text-muted">{preview.specVersion.startsWith("2") ? "Swagger" : "OpenAPI"} {preview.specVersion} · {preview.endpoints.length} endpoints</div>
        </div>
        {preview.servers[0] && <span className="truncate font-mono text-[11px] text-dim">{preview.servers[0]}</span>}
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {preview.endpoints.map((e) => (
          <li key={e.method + e.path} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-[12px] hover:bg-fg/[.03]">
            <MethodBadge method={e.method} />
            <span className="truncate font-mono text-[11.5px]">{e.path}</span>
            <span className="ml-auto hidden truncate text-[11.5px] text-dim sm:inline">{e.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
