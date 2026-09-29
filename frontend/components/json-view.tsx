"use client";
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn, pretty } from "@/lib/utils";

const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const cls = tok.startsWith('"')
      ? tok.trimEnd().endsWith(":") ? "text-sky-700 dark:text-sky-300" : "text-teal-700 dark:text-teal-300"
      : /true|false/.test(tok) ? "text-violet-600 dark:text-violet-300" : tok === "null" ? "text-dim" : "text-amber-700 dark:text-amber-300";
    out.push(<span key={i++} className={cls}>{tok}</span>);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] text-muted transition hover:bg-fg/5 hover:text-fg", className)}
    >
      {done ? <Check size={13} className="text-pass" /> : <Copy size={13} />}
      {done ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ value, title, empty = "No content", maxHeight = "max-h-[360px]", raw }: { value: unknown; title?: string; empty?: string; maxHeight?: string; raw?: boolean }) {
  const text = typeof value === "string" && raw ? value : pretty(value);
  const truncated = text.length > 20000 ? text.slice(0, 20000) + "\n… (truncated)" : text;
  return (
    <div className="overflow-hidden rounded-xl border border-line/15 bg-elevated/60 dark:bg-[#060a14]">
      {title !== undefined && (
        <div className="flex items-center justify-between border-b border-line/10 px-3 py-1.5 text-[11.5px] text-muted">
          <span>{title}</span>
          {text && <CopyButton text={text} />}
        </div>
      )}
      <pre className={cn("overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11.5px] leading-relaxed text-fg/90", maxHeight)}>
        {text ? (raw ? truncated : highlight(truncated)) : <span className="text-dim">{empty}</span>}
      </pre>
    </div>
  );
}
