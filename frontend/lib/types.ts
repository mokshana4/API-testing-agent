// Shapes produced by the existing FastAPI backend (agent/reporter.py). Keep in sync, never extend server-side.

export type Severity = "critical" | "high" | "medium" | "low";
export type Category = "positive" | "negative" | "validation" | "boundary" | "edge" | string;

export interface CategoryStat {
  name: Category;
  total: number;
  passed: number;
  failed: number;
  height: number;
  pass_pct: number;
  fail_pct: number;
}

export interface Summary {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  endpoints: number;
  by_category: CategoryStat[];
  by_source: Record<string, number>;
  failure_types: Record<string, number>;
  severities: Record<Severity, number>;
  avg_ms: number;
  p95_ms: number;
  max_ms: number;
  edge_cases: number;
}

export interface EndpointStat {
  operation_id: string;
  method: string;
  path: string;
  summary: string;
  params: number;
  has_body: boolean;
  documented: string[];
  total: number;
  passed: number;
  failed: number;
  pass_pct: number;
}

export interface RequestInfo {
  path_params: Record<string, unknown>;
  query_params: Record<string, unknown>;
  headers: Record<string, unknown>;
  body: unknown;
}

export interface ResultRow {
  id: string;
  name: string;
  category: Category;
  source: "rules" | "llm" | string;
  method: string;
  path: string;
  operation_id: string;
  description: string;
  expected: string[];
  actual: number | null;
  passed: boolean;
  duration_ms: number;
  url: string;
  request: RequestInfo;
  response_body: unknown;
  errors: string[];
  schema_errors: string[];
}

export interface FailureAnalysis {
  case_id: string;
  failure_type: string;
  severity: Severity;
  summary: string;
  likely_cause: string;
  suggestion: string;
  analyzed_by: "rules" | "ai" | string;
}

export interface Failure extends ResultRow {
  analysis: FailureAnalysis;
}

export interface EdgeCase {
  operation: string;
  title: string;
  detail: string;
  suggested_test: string;
  priority: "high" | "medium" | "low";
  source: "rules" | "ai" | string;
}

export interface Report {
  meta: {
    title: string;
    version: string;
    openapi_version: string;
    spec_source: string;
    base_url: string;
    generated_at: string;
    generated_at_human: string;
    duration_s: number;
    llm: { enabled: boolean; provider: string; model: string | null; calls: number; failures: number };
    provisioned?: string[];
    run_id: string;
  };
  summary: Summary;
  charts: { donut_dash: number; donut_circ: number; latency: { line: string; area: string } };
  endpoints: EndpointStat[];
  results: ResultRow[];
  failures: Failure[];
  edge_cases: EdgeCase[];
}

export interface RunResponse {
  run_id: string;
  summary: Summary;
  report_url: string;
  json_url: string;
  cases_url: string;
}

// ---- frontend-only (stored in the browser) ----
export type SpecKind = "openapi" | "postman";

export interface StoredSpecFile {
  name: string;
  content: string; // always OpenAPI (Postman collections are converted on import)
  kind: SpecKind;
  format: "json" | "yaml";
}

export interface Project {
  id: string;
  name: string;
  description: string;
  specMode: "url" | "file";
  specUrl: string;
  specFile?: StoredSpecFile;
  baseUrl: string;
  authHeader: string;
  useLlm: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  runId: string;
  projectId?: string;
  projectName?: string;
  title: string;
  createdAt: string;
  specSource: string;
  baseUrl?: string;
  useLlm: boolean;
  durationMs: number;
  summary: Summary;
}

export type TestState = "pass" | "fail" | "error";
