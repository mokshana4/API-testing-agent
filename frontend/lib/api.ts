// Thin client for the existing FastAPI backend. All calls go through the same-origin
// /backend proxy defined in next.config.mjs, so the backend needs no CORS changes.
import type { Report, RunResponse } from "./types";

export const API_BASE = "/backend";

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function detailToMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d))).join("; ");
  }
  return detail ? JSON.stringify(detail) : "";
}

export async function checkHealth(timeoutMs = 3000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export interface RunInput {
  specUrl?: string;
  specFile?: File;
  baseUrl?: string;
  authHeader?: string;
  useLlm: boolean;
}

/** POST /api/run (multipart form) - parse, generate, execute, analyze, report in one call. */
export async function runAgent(input: RunInput, signal?: AbortSignal): Promise<RunResponse> {
  const form = new FormData();
  if (input.specFile) form.set("spec_file", input.specFile);
  else if (input.specUrl) form.set("spec_url", input.specUrl);
  if (input.baseUrl?.trim()) form.set("base_url", input.baseUrl.trim());
  if (input.authHeader?.trim()) form.set("auth_header", input.authHeader.trim());
  form.set("use_llm", input.useLlm ? "true" : "false");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run`, { method: "POST", body: form, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Could not reach the backend. Is it running on the configured BACKEND_URL?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = detailToMessage((data as { detail?: unknown }).detail) || res.statusText;
    throw new ApiError(res.status >= 500 && !msg ? "Backend error" : msg, res.status);
  }
  return data as RunResponse;
}

export const reportUrls = (runId: string) => ({
  html: `${API_BASE}/reports/${encodeURIComponent(runId)}/report.html`,
  json: `${API_BASE}/reports/${encodeURIComponent(runId)}/report.json`,
  cases: `${API_BASE}/reports/${encodeURIComponent(runId)}/test_cases.json`,
});

export async function getReport(runId: string): Promise<Report> {
  let res: Response;
  try {
    res = await fetch(reportUrls(runId).json, { cache: "no-store" });
  } catch {
    throw new ApiError("Could not reach the backend.");
  }
  if (res.status === 404) throw new ApiError(`No report found for run "${runId}".`, 404);
  if (!res.ok) throw new ApiError(`Failed to load report (${res.status}).`, res.status);
  return (await res.json()) as Report;
}
