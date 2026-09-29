import type { ResultRow, TestState } from "./types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

/** pass | fail (wrong behaviour) | error (crash or no response) */
export function stateOf(r: Pick<ResultRow, "passed" | "actual">): TestState {
  if (r.passed) return "pass";
  if (r.actual === null || r.actual >= 500) return "error";
  return "fail";
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function pretty(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function toCurl(r: ResultRow): string {
  const parts = [`curl -X ${r.method.toUpperCase()} ${shellQuote(r.url)}`];
  for (const [k, v] of Object.entries(r.request.headers ?? {})) parts.push(`-H ${shellQuote(`${k}: ${String(v)}`)}`);
  const body = r.request.body;
  if (body !== null && body !== undefined) {
    parts.push(`-H ${shellQuote("Content-Type: application/json")}`);
    parts.push(`--data ${shellQuote(typeof body === "string" ? body : JSON.stringify(body))}`);
  }
  return parts.join(" \\\n  ");
}

export const passTone = (rate: number) => (rate >= 90 ? "pass" : rate >= 70 ? "warn" : "fail");
