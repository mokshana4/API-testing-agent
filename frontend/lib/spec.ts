// Client-side spec handling: parse JSON/YAML, preview endpoints, and convert Postman
// collections to OpenAPI 3 so the unchanged backend (which accepts OpenAPI/Swagger) can run them.
import { load } from "js-yaml";
import type { StoredSpecFile } from "./types";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
type Json = Record<string, unknown>;

export interface SpecPreview {
  title: string;
  version: string;
  specVersion: string;
  servers: string[];
  endpoints: { method: string; path: string; summary: string }[];
}

export function parseText(text: string): { data: unknown; format: "json" | "yaml" } {
  try {
    return { data: JSON.parse(text), format: "json" };
  } catch {
    return { data: load(text), format: "yaml" };
  }
}

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

export function isPostman(data: unknown): boolean {
  if (!isObj(data) || !isObj(data.info)) return false;
  const schema = String(data.info.schema ?? "");
  return schema.includes("getpostman") || "_postman_id" in data.info;
}

export function isOpenApi(data: unknown): boolean {
  return isObj(data) && ("openapi" in data || "swagger" in data) && isObj(data.paths);
}

export function previewSpec(data: unknown): SpecPreview {
  if (!isOpenApi(data)) throw new Error("Not an OpenAPI/Swagger document");
  const spec = data as Json;
  const info = (isObj(spec.info) ? spec.info : {}) as Json;
  const endpoints: SpecPreview["endpoints"] = [];
  for (const [path, item] of Object.entries(spec.paths as Json)) {
    if (!isObj(item)) continue;
    for (const m of METHODS) {
      const op = item[m];
      if (isObj(op)) endpoints.push({ method: m, path, summary: String(op.summary ?? op.operationId ?? "") });
    }
  }
  const servers = Array.isArray(spec.servers)
    ? spec.servers.map((s) => (isObj(s) ? String(s.url ?? "") : "")).filter(Boolean)
    : spec.host
      ? [`${Array.isArray(spec.schemes) ? spec.schemes[0] : "https"}://${spec.host}${spec.basePath ?? ""}`]
      : [];
  return {
    title: String(info.title ?? "Untitled API"),
    version: String(info.version ?? ""),
    specVersion: String(spec.openapi ?? spec.swagger),
    servers,
    endpoints,
  };
}

// ------------------------------------------------------------- Postman -> OpenAPI
function inferSchema(value: unknown): Json {
  if (value === null || value === undefined) return {};
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (typeof value === "string") return { type: "string" };
  if (Array.isArray(value)) return { type: "array", items: value.length ? inferSchema(value[0]) : {} };
  if (isObj(value)) {
    const properties: Json = {};
    for (const [k, v] of Object.entries(value)) properties[k] = inferSchema(v);
    return { type: "object", properties, required: Object.keys(value) };
  }
  return {};
}

const OPTIONAL_QUERY = /^(limit|offset|page|page_?size|per_?page|size|skip|take|cursor|sort|sort_?by|order|order_?by|fields|include|expand|lang|locale)$/i;

const scalarSchema = (v: string): Json =>
  /^-?\d+$/.test(v) ? { type: "integer", example: Number(v) } : /^(true|false)$/.test(v) ? { type: "boolean" } : { type: "string", example: v };

export function postmanToOpenApi(collection: Json): { spec: Json; warnings: string[] } {
  const warnings: string[] = [];
  const vars: Record<string, string> = {};
  if (Array.isArray(collection.variable)) {
    for (const v of collection.variable) if (isObj(v) && v.key) vars[String(v.key)] = String(v.value ?? "");
  }
  const resolve = (s: string) => s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  const paths: Record<string, Json> = {};
  const servers = new Set<string>();
  const usedIds = new Set<string>();

  const walk = (items: unknown[], folder: string[]) => {
    for (const it of items) {
      if (!isObj(it)) continue;
      if (Array.isArray(it.item)) {
        walk(it.item, [...folder, String(it.name ?? "")]);
        continue;
      }
      const req = it.request;
      if (!isObj(req) && typeof req !== "string") continue;
      const r = (typeof req === "string" ? { url: req, method: "GET" } : req) as Json;
      const method = String(r.method ?? "GET").toLowerCase();
      const url = r.url;
      let raw = "";
      let pathSegs: string[] = [];
      let query: { key: string; value: string }[] = [];
      if (typeof url === "string") raw = url;
      else if (isObj(url)) {
        raw = String(url.raw ?? "");
        if (Array.isArray(url.path)) pathSegs = url.path.map(String);
        if (Array.isArray(url.query)) {
          query = url.query.filter((q) => isObj(q) && !q.disabled).map((q) => ({ key: String((q as Json).key), value: String((q as Json).value ?? "") }));
        }
      }
      const resolvedRaw = resolve(raw);
      let origin = "";
      try {
        const u = new URL(resolvedRaw);
        origin = u.origin;
        if (!pathSegs.length) pathSegs = u.pathname.split("/").filter(Boolean);
        if (!query.length) u.searchParams.forEach((value, key) => query.push({ key, value }));
      } catch {
        if (!pathSegs.length) pathSegs = resolvedRaw.replace(/^\{\{[^}]+\}\}/, "").split("?")[0].split("/").filter(Boolean);
      }
      if (origin) servers.add(origin);
      const pathParams: string[] = [];
      const segs = pathSegs.map((seg) => {
        const m = seg.match(/^:(\w+)$/) || seg.match(/^\{\{(\w+)\}\}$/);
        if (m) {
          pathParams.push(m[1]);
          return `{${m[1]}}`;
        }
        return resolve(seg);
      });
      const path = "/" + segs.join("/");
      if (method === "get" && !segs.length && !origin) continue;

      const parameters: Json[] = pathParams.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } }));
      // Postman has no "required" flag. The saved request is a known-good call, so its query
      // params are treated as required, except names that are conventionally optional.
      for (const q of query) parameters.push({ name: q.key, in: "query", required: !OPTIONAL_QUERY.test(q.key), schema: scalarSchema(q.value) });
      if (Array.isArray(r.header)) {
        for (const h of r.header) {
          if (!isObj(h) || h.disabled) continue;
          const key = String(h.key ?? "");
          if (!key || /^(content-type|authorization|accept)$/i.test(key)) continue;
          parameters.push({ name: key, in: "header", required: false, schema: { type: "string", example: resolve(String(h.value ?? "")) } });
        }
      }

      const op: Json = {
        summary: String(it.name ?? `${method.toUpperCase()} ${path}`),
        tags: folder.filter(Boolean).slice(-1),
        parameters,
      };
      let id = [...folder, String(it.name ?? method)].join("_").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || `${method}_op`;
      while (usedIds.has(id)) id += "_x";
      usedIds.add(id);
      op.operationId = id;

      const body = isObj(r.body) ? r.body : null;
      if (body && body.mode === "raw" && typeof body.raw === "string" && body.raw.trim()) {
        try {
          const example = JSON.parse(resolve(body.raw));
          op.requestBody = { required: true, content: { "application/json": { schema: { ...inferSchema(example), example } } } };
        } catch {
          warnings.push(`${op.summary}: raw body is not JSON, sent as text schema`);
          op.requestBody = { required: true, content: { "text/plain": { schema: { type: "string", example: body.raw } } } };
        }
      } else if (body && (body.mode === "urlencoded" || body.mode === "formdata") && Array.isArray(body[body.mode as string])) {
        const props: Json = {};
        for (const f of body[body.mode as string] as unknown[]) if (isObj(f) && f.key) props[String(f.key)] = scalarSchema(String(f.value ?? ""));
        op.requestBody = { content: { "application/x-www-form-urlencoded": { schema: { type: "object", properties: props } } } };
      }

      // Saved example responses become documented responses; otherwise accept any 2xx.
      const responses: Json = {};
      if (Array.isArray(it.response)) {
        for (const ex of it.response) {
          if (!isObj(ex) || !ex.code) continue;
          const code = String(ex.code);
          let schema: Json | undefined;
          try {
            if (typeof ex.body === "string" && ex.body.trim()) schema = inferSchema(JSON.parse(ex.body));
          } catch {
            /* non-JSON example */
          }
          responses[code] = { description: String(ex.status ?? ex.name ?? "Example"), ...(schema ? { content: { "application/json": { schema } } } : {}) };
        }
      }
      if (!Object.keys(responses).some((c) => c.startsWith("2"))) responses["2XX"] = { description: "Success" };
      op.responses = responses;

      paths[path] = paths[path] ?? {};
      if (paths[path][method]) warnings.push(`Duplicate ${method.toUpperCase()} ${path}: kept the first request`);
      else paths[path][method] = op;
    }
  };

  walk(Array.isArray(collection.item) ? collection.item : [], []);
  if (!Object.keys(paths).length) throw new Error("The Postman collection contains no requests.");
  const info = (isObj(collection.info) ? collection.info : {}) as Json;
  const spec: Json = {
    openapi: "3.0.3",
    info: { title: String(info.name ?? "Postman collection"), version: String(info.version ?? "1.0.0"), description: "Converted from a Postman collection" },
    paths,
  };
  if (servers.size) spec.servers = [...servers].map((url) => ({ url }));
  else warnings.push("No absolute URL found in the collection; set the Base URL before running.");
  return { spec, warnings };
}

/** Read an uploaded file into a StoredSpecFile the backend can accept. */
export async function importSpecFile(file: File): Promise<{ stored: StoredSpecFile; preview: SpecPreview; warnings: string[] }> {
  const text = await file.text();
  let parsed: ReturnType<typeof parseText>;
  try {
    parsed = parseText(text);
  } catch {
    throw new Error("File is neither valid JSON nor YAML.");
  }
  if (isPostman(parsed.data)) {
    const { spec, warnings } = postmanToOpenApi(parsed.data as Json);
    const name = file.name.replace(/\.(json|ya?ml)$/i, "") + ".openapi.json";
    return { stored: { name, content: JSON.stringify(spec, null, 2), kind: "postman", format: "json" }, preview: previewSpec(spec), warnings };
  }
  if (!isOpenApi(parsed.data)) throw new Error("Not an OpenAPI/Swagger spec or Postman collection.");
  return { stored: { name: file.name, content: text, kind: "openapi", format: parsed.format }, preview: previewSpec(parsed.data), warnings: [] };
}

export function storedToFile(s: StoredSpecFile): File {
  const type = s.format === "json" ? "application/json" : "application/yaml";
  return new File([s.content], s.name, { type });
}

export function previewStored(s: StoredSpecFile): SpecPreview | null {
  try {
    return previewSpec(parseText(s.content).data);
  } catch {
    return null;
  }
}

/** Best effort: many specs are served without CORS; the backend fetches them server-side anyway. */
export async function previewUrl(url: string): Promise<SpecPreview> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return previewSpec(parseText(await res.text()).data);
}
