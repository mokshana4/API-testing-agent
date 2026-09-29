"""Stage 1 - load an OpenAPI 3.x / Swagger 2.0 document and turn it into Operations."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
import yaml

from .models import ApiSpec, Operation, Parameter

HTTP_METHODS = ("get", "post", "put", "patch", "delete", "head", "options")
_PARAM_SCHEMA_KEYS = (
    "type", "format", "enum", "default", "minimum", "maximum", "exclusiveMinimum",
    "exclusiveMaximum", "minLength", "maxLength", "pattern", "items", "minItems", "maxItems",
)


def load_spec(source: str) -> dict[str, Any]:
    """Load a spec from a URL or a local .json/.yaml file."""
    if source.startswith(("http://", "https://")):
        response = httpx.get(source, timeout=30, follow_redirects=True)
        response.raise_for_status()
        text = response.text
    else:
        text = Path(source).read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        data = yaml.safe_load(text)
        if not isinstance(data, dict):
            raise ValueError("Spec is neither valid JSON nor a YAML mapping")
        return data


# ----------------------------------------------------------------- $ref utils
def _lookup(root: dict, ref: str) -> Any:
    if not ref.startswith("#/"):
        return {}  # external refs are out of scope for this simple agent
    node: Any = root
    for part in ref[2:].split("/"):
        node = node[part.replace("~1", "/").replace("~0", "~")]
    return node


def resolve_refs(node: Any, root: dict, stack: tuple[str, ...] = ()) -> Any:
    """Inline every local $ref. Recursive schemas are cut off with a stub."""
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            if ref in stack:
                return {"type": "object", "description": f"(recursive {ref})"}
            resolved = resolve_refs(_lookup(root, ref), root, stack + (ref,))
            siblings = {k: v for k, v in node.items() if k != "$ref"}
            if siblings and isinstance(resolved, dict):
                resolved = {**resolved, **resolve_refs(siblings, root, stack)}
            return resolved
        return {k: resolve_refs(v, root, stack) for k, v in node.items()}
    if isinstance(node, list):
        return [resolve_refs(v, root, stack) for v in node]
    return node


# -------------------------------------------------------------------- parsing
def _slug(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()


def _pick_json(content: dict[str, Any]) -> tuple[str | None, dict | None]:
    if not content:
        return None, None
    for ctype in content:
        if "json" in ctype:
            return ctype, content[ctype].get("schema")
    ctype = next(iter(content))
    return ctype, content[ctype].get("schema")


def _param_schema(param: dict) -> dict:
    if "schema" in param:
        return param["schema"] or {}
    return {k: param[k] for k in _PARAM_SCHEMA_KEYS if k in param}  # Swagger 2 style


def _base_url(spec: dict, swagger2: bool, source: str | None) -> str | None:
    origin = None
    if source and source.startswith(("http://", "https://")):
        parsed = urlparse(source)
        origin = f"{parsed.scheme}://{parsed.netloc}"
    if swagger2:
        host = spec.get("host")
        if host:
            scheme = (spec.get("schemes") or ["https"])[0]
            return f"{scheme}://{host}{spec.get('basePath', '')}".rstrip("/")
        return (origin + spec.get("basePath", "")).rstrip("/") if origin else None
    servers = spec.get("servers") or []
    if servers:
        url = servers[0].get("url", "")
        for name, var in (servers[0].get("variables") or {}).items():
            url = url.replace("{" + name + "}", str(var.get("default", "")))
        if url.startswith(("http://", "https://")):
            return url.rstrip("/")
        if origin:
            return urljoin(origin + "/", url.lstrip("/")).rstrip("/")
    return origin


def parse_spec(raw: dict[str, Any], source: str | None = None) -> ApiSpec:
    spec = resolve_refs(raw, raw)
    swagger2 = str(spec.get("swagger", "")).startswith("2")
    global_security = spec.get("security") or []
    consumes = spec.get("consumes") or ["application/json"]
    operations: list[Operation] = []

    for path, item in (spec.get("paths") or {}).items():
        shared_params = item.get("parameters", [])
        for method in HTTP_METHODS:
            op = item.get(method)
            if not isinstance(op, dict):
                continue

            merged: dict[tuple[str, str], dict] = {}
            for p in shared_params + op.get("parameters", []):
                merged[(p.get("name"), p.get("in"))] = p

            params: list[Parameter] = []
            body_schema, body_required, content_type = None, False, None
            form_props, form_required = {}, []
            for p in merged.values():
                loc = p.get("in")
                if swagger2 and loc == "body":
                    body_schema, body_required = p.get("schema") or {}, bool(p.get("required"))
                    content_type = (op.get("consumes") or consumes)[0]
                elif swagger2 and loc == "formData":
                    form_props[p["name"]] = _param_schema(p)
                    if p.get("required"):
                        form_required.append(p["name"])
                elif loc in ("path", "query", "header", "cookie"):
                    params.append(Parameter(
                        name=p["name"], location=loc, required=bool(p.get("required")) or loc == "path",
                        schema=_param_schema(p), description=p.get("description", ""),
                    ))
            if form_props:
                body_schema = {"type": "object", "properties": form_props, "required": form_required}
                body_required = bool(form_required)
                content_type = "application/x-www-form-urlencoded"

            if not swagger2 and "requestBody" in op:
                rb = op["requestBody"]
                content_type, body_schema = _pick_json(rb.get("content", {}))
                body_required = bool(rb.get("required"))

            responses: dict[str, dict] = {}
            for code, resp in (op.get("responses") or {}).items():
                resp = resp or {}
                schema = resp.get("schema") if swagger2 else _pick_json(resp.get("content", {}))[1]
                responses[str(code).upper() if "x" in str(code).lower() else str(code)] = {
                    "description": resp.get("description", ""), "schema": schema,
                }

            operations.append(Operation(
                operation_id=op.get("operationId") or f"{method}_{_slug(path)}",
                method=method, path=path,
                summary=op.get("summary", ""), description=op.get("description", ""),
                parameters=params, request_body_schema=body_schema, request_body_required=body_required,
                content_type=content_type, responses=responses, tags=op.get("tags", []),
                security=bool(op.get("security", global_security)),
            ))

    info = spec.get("info", {})
    return ApiSpec(
        title=info.get("title", "Untitled API"),
        version=str(info.get("version", "")),
        openapi_version=str(spec.get("openapi") or spec.get("swagger") or "?"),
        description=info.get("description", ""),
        base_url=_base_url(spec, swagger2, source),
        operations=operations,
    )


def operation_summary(op: Operation, max_chars: int = 5000) -> str:
    """Compact JSON description of an operation, used in LLM prompts."""
    data = {
        "operation_id": op.operation_id, "method": op.method.upper(), "path": op.path,
        "summary": op.summary, "description": op.description[:500],
        "parameters": [{"name": p.name, "in": p.location, "required": p.required, "schema": p.schema}
                       for p in op.parameters],
        "request_body": {"required": op.request_body_required, "schema": op.request_body_schema}
        if op.request_body_schema is not None else None,
        "responses": {code: r.get("description", "") for code, r in op.responses.items()},
        "requires_auth": op.security,
    }
    text = json.dumps(data, default=str)
    return text if len(text) <= max_chars else text[:max_chars] + "...(truncated)"
