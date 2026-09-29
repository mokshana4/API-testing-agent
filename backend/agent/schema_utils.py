"""Helpers to reason about JSON schemas: sample data, boundaries, invalid values, validation."""
from __future__ import annotations

import copy
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

MISSING = object()  # "no sensible value for this schema"

FORMAT_SAMPLES = {
    "email": "qa.agent@example.com",
    "uuid": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "date": "2026-01-15",
    "date-time": "2026-01-15T10:30:00Z",
    "time": "10:30:00",
    "uri": "https://example.com/resource",
    "url": "https://example.com/resource",
    "hostname": "example.com",
    "ipv4": "192.168.1.10",
    "ipv6": "2001:db8::1",
    "password": "S3cure!Passw0rd",
    "byte": "c2FtcGxl",
    "binary": "sample",
}


def normalize(schema: dict | None) -> dict:
    """Flatten anyOf/oneOf (first non-null branch), allOf (merge) and type lists."""
    if not schema:
        return {}
    s = dict(schema)
    for key in ("anyOf", "oneOf"):
        if key in s:
            variants = [v for v in s.pop(key) if isinstance(v, dict) and v.get("type") != "null"]
            if variants:
                s = {**normalize(variants[0]), **s}
    if "allOf" in s:
        merged: dict[str, Any] = {}
        props: dict[str, Any] = {}
        required: list[str] = []
        for part in s.pop("allOf"):
            part = normalize(part)
            props.update(part.get("properties", {}))
            required += part.get("required", [])
            merged.update({k: v for k, v in part.items() if k not in ("properties", "required")})
        merged.update({k: v for k, v in s.items() if k not in ("properties", "required")})
        props.update(s.get("properties", {}))
        required += s.get("required", [])
        if props:
            merged["properties"] = props
        if required:
            merged["required"] = list(dict.fromkeys(required))
        s = merged
    t = s.get("type")
    if isinstance(t, list):
        non_null = [x for x in t if x != "null"]
        s["type"] = non_null[0] if non_null else "null"
    if "type" not in s:
        if "properties" in s:
            s["type"] = "object"
        elif "items" in s:
            s["type"] = "array"
        elif s.get("enum"):
            s["type"] = json_type(s["enum"][0])
    return s


def json_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "string"


def is_nullable(schema: dict | None) -> bool:
    if not schema:
        return True
    if schema.get("nullable"):
        return True
    t = schema.get("type")
    if t == "null" or (isinstance(t, list) and "null" in t):
        return True
    return any(isinstance(v, dict) and v.get("type") == "null"
               for key in ("anyOf", "oneOf") for v in schema.get(key, []))


def is_free_text(schema: dict) -> bool:
    s = normalize(schema)
    return s.get("type") == "string" and not s.get("enum") and not s.get("format") and not s.get("pattern")


def _bounds(s: dict) -> tuple[Any, Any, Any, Any]:
    lo, hi = s.get("minimum"), s.get("maximum")
    ex_lo, ex_hi = s.get("exclusiveMinimum"), s.get("exclusiveMaximum")
    if ex_lo is True:  # OpenAPI 3.0 boolean style
        ex_lo, lo = lo, None
    if ex_hi is True:
        ex_hi, hi = hi, None
    ex_lo = None if isinstance(ex_lo, bool) else ex_lo
    ex_hi = None if isinstance(ex_hi, bool) else ex_hi
    return lo, hi, ex_lo, ex_hi


def _num(value: float, integer: bool) -> int | float:
    return int(value) if integer else round(float(value), 6)


def _sample_number(s: dict, integer: bool) -> int | float:
    lo, hi, ex_lo, ex_hi = _bounds(s)
    step = 1 if integer else 0.5
    v: float = 1
    if lo is not None:
        v = max(v, lo)
    if ex_lo is not None:
        v = max(v, ex_lo + step)
    if hi is not None:
        v = min(v, hi)
    if ex_hi is not None:
        v = min(v, ex_hi - step)
    return _num(v, integer)


def fit_length(value: str, schema: dict) -> str:
    s = normalize(schema)
    min_len, max_len = s.get("minLength", 0) or 0, s.get("maxLength")
    if len(value) < min_len:
        value += "x" * (min_len - len(value))
    if max_len is not None:
        value = value[:max_len]
    return value


def sample_value(schema: dict | None, name: str = "", depth: int = 0) -> Any:
    """Produce a valid-looking value for a schema (examples > default > enum > synthesized)."""
    s = normalize(schema)
    if s.get("example") is not None:
        return copy.deepcopy(s["example"])
    if isinstance(s.get("examples"), list) and s["examples"]:
        return copy.deepcopy(s["examples"][0])
    if s.get("default") is not None:
        return copy.deepcopy(s["default"])
    if s.get("enum"):
        return s["enum"][0]
    if "const" in s:
        return s["const"]

    t = s.get("type", "string")
    if t == "string":
        base = FORMAT_SAMPLES.get(s.get("format", ""), f"sample_{name}" if name else "sample")
        return fit_length(base, s)
    if t == "integer":
        return _sample_number(s, integer=True)
    if t == "number":
        return _sample_number(s, integer=False)
    if t == "boolean":
        return True
    if t == "array":
        if depth > 4:
            return []
        n = max(s.get("minItems", 1), 1)
        if s.get("maxItems") is not None:
            n = min(n, s["maxItems"])
        return [sample_value(s.get("items", {}), name, depth + 1) for _ in range(n)]
    if t == "object":
        if depth > 4:
            return {}
        return {k: sample_value(v, k, depth + 1)
                for k, v in s.get("properties", {}).items() if not normalize(v).get("readOnly")}
    if t == "null":
        return None
    return "sample"


def boundary_cases(schema: dict | None) -> list[tuple[str, Any, bool]]:
    """Return (label, value, is_valid) triples on and around declared limits."""
    s = normalize(schema)
    t = s.get("type")
    out: list[tuple[str, Any, bool]] = []
    if t in ("integer", "number"):
        integer = t == "integer"
        step = 1 if integer else 0.01
        lo, hi, ex_lo, ex_hi = _bounds(s)
        if lo is not None:
            out += [(f"at minimum ({_num(lo, integer)})", _num(lo, integer), True),
                    (f"below minimum ({_num(lo - step, integer)})", _num(lo - step, integer), False)]
        if ex_lo is not None:
            out += [(f"equal to exclusive minimum ({_num(ex_lo, integer)})", _num(ex_lo, integer), False),
                    (f"just above exclusive minimum ({_num(ex_lo + step, integer)})", _num(ex_lo + step, integer), True)]
        if hi is not None:
            out += [(f"at maximum ({_num(hi, integer)})", _num(hi, integer), True),
                    (f"above maximum ({_num(hi + step, integer)})", _num(hi + step, integer), False)]
        if ex_hi is not None:
            out += [(f"equal to exclusive maximum ({_num(ex_hi, integer)})", _num(ex_hi, integer), False),
                    (f"just below exclusive maximum ({_num(ex_hi - step, integer)})", _num(ex_hi - step, integer), True)]
    elif t == "string" and is_free_text(s):
        min_len, max_len = s.get("minLength"), s.get("maxLength")
        if min_len:
            out += [(f"length at minLength ({min_len})", "a" * min_len, True),
                    (f"length below minLength ({min_len - 1})", "a" * (min_len - 1), False)]
        if max_len is not None:
            out += [(f"length at maxLength ({max_len})", "a" * max_len, True),
                    (f"length above maxLength ({max_len + 1})", "a" * (max_len + 1), False)]
    elif t == "array":
        item = sample_value(s.get("items", {}))
        if s.get("minItems"):
            n = s["minItems"]
            out += [(f"minItems ({n})", [item] * n, True), (f"fewer than minItems ({n - 1})", [item] * (n - 1), False)]
        if s.get("maxItems") is not None:
            n = s["maxItems"]
            out += [(f"maxItems ({n})", [item] * n, True), (f"more than maxItems ({n + 1})", [item] * (n + 1), False)]
    return out


def wrong_type_value(schema: dict | None, location: str) -> Any:
    """A value of the wrong JSON type. Query/path/header values are strings on the wire,
    so a 'wrong type' only exists there for non-string schemas."""
    t = normalize(schema).get("type", "string")
    if location != "body" and t in ("string", "array", "object"):
        return MISSING
    return {"string": 12345, "integer": "not-a-number", "number": "not-a-number",
            "boolean": "not-a-boolean", "array": "not-an-array", "object": "not-an-object"}.get(t, MISSING)


def invalid_enum_value(schema: dict | None) -> Any:
    s = normalize(schema)
    enum = s.get("enum")
    if not enum:
        return MISSING
    return 987654 if isinstance(enum[0], (int, float)) and not isinstance(enum[0], bool) else "INVALID_ENUM_VALUE"


def nonexistent_value(schema: dict | None) -> Any:
    s = normalize(schema)
    if s.get("type") in ("integer", "number"):
        return 999999
    if s.get("format") == "uuid":
        return "00000000-0000-0000-0000-000000000000"
    return "does-not-exist-9f8e7d"


def _to_json_schema(node: Any) -> Any:
    """Convert OpenAPI 3.0 quirks (nullable, boolean exclusive*) to JSON Schema 2020-12."""
    if isinstance(node, list):
        return [_to_json_schema(v) for v in node]
    if not isinstance(node, dict):
        return node
    out = {k: _to_json_schema(v) for k, v in node.items()}
    if out.pop("nullable", False):
        t = out.get("type")
        if isinstance(t, str):
            out["type"] = [t, "null"]
        elif t is None and ("anyOf" in out or "oneOf" in out):
            key = "anyOf" if "anyOf" in out else "oneOf"
            out[key] = out[key] + [{"type": "null"}]
    for flag, bound in (("exclusiveMinimum", "minimum"), ("exclusiveMaximum", "maximum")):
        if out.get(flag) is True and bound in out:
            out[flag] = out.pop(bound)
        elif out.get(flag) is False:
            out.pop(flag)
    return out


def validate_against_schema(instance: Any, schema: dict) -> list[str]:
    try:
        validator = Draft202012Validator(_to_json_schema(schema))
        errors = sorted(validator.iter_errors(instance), key=lambda e: [str(p) for p in e.path])
    except SchemaError:
        return []
    messages = []
    for err in errors[:10]:
        where = "/".join(str(p) for p in err.path) or "<root>"
        msg = err.message if len(err.message) < 240 else err.message[:240] + "..."
        messages.append(f"{where}: {msg}")
    return messages
