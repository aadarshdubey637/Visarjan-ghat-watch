"""Export the OpenAPI schema to docs/openapi.json and generate docs/API_CONTRACT.md from it
(no database or network needed).

Usage: python scripts/export_openapi.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from app.main import app  # noqa: E402


def ref_name(schema: dict | None) -> str:
    if not schema:
        return "-"
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]
    if schema.get("type") == "array":
        return f"{ref_name(schema.get('items'))}[]"
    return schema.get("type", "object")


def type_of(schema: dict) -> str:
    if "anyOf" in schema:
        opts = [o.get("type", "?") for o in schema["anyOf"] if o.get("type") != "null"]
        return "/".join(opts) or "?"
    if "enum" in schema:
        return "|".join(str(v) for v in schema["enum"])
    t = schema.get("type", "?")
    return f"{t} (format {schema['format']})" if "format" in schema else t


def contract(spec: dict) -> str:
    out = ["# API contract", "",
           "Generated from `docs/openapi.json` by `python scripts/export_openapi.py`. Do not edit by hand.", "",
           "Base path `/api/v1`. All errors use `{\"error\": {\"code\", \"message\", \"details?\"}}` "
           "(see `ErrorResponse`). Dates are ISO 8601; the source data has no exact sample dates, so `sample_date` is "
           "always `null` (use `sample_year`, `festival`, `phase`). Timestamps are UTC.", "",
           "Typical status codes: 200 OK, 201 created (POST /cases), 404 unknown resource, 409 invalid case status "
           "transition, 413 body too large, 422 invalid input, 429 AI rate limit, 503 AI unavailable "
           "(only when `require_ai` is true).", ""]
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            out.append(f"## `{method.upper()} {path}`")
            out.append(op.get("summary", ""))
            if op.get("description"):
                out += ["", op["description"]]
            params = op.get("parameters", [])
            if params:
                out += ["", "| Parameter | In | Required | Type |", "|---|---|---|---|"]
                for p in params:
                    out.append(f"| `{p['name']}` | {p['in']} | {'yes' if p.get('required') else 'no'} | "
                               f"{type_of(p.get('schema', {}))} |")
            body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
            if body:
                out += ["", f"Request body: `{ref_name(body)}`"]
            out += ["", "| Status | Response |", "|---|---|"]
            for code, resp in op["responses"].items():
                content = resp.get("content", {})
                if "application/json" in content:
                    shape = ref_name(content["application/json"].get("schema"))
                elif content:
                    shape = ", ".join(content)
                else:
                    shape = resp.get("description", "")
                out.append(f"| {code} | `{shape}` |")
            out.append("")
    out += ["## Schemas", ""]
    for name, sch in sorted(spec["components"]["schemas"].items()):
        if name in ("HTTPValidationError", "ValidationError"):
            continue
        props = sch.get("properties", {})
        req = set(sch.get("required", []))
        out += [f"### {name}", "", "| Field | Type | Required |", "|---|---|---|"]
        for field, fs in props.items():
            out.append(f"| `{field}` | {type_of(fs) if 'anyOf' in fs or 'enum' in fs or 'type' in fs else ref_name(fs)} | "
                       f"{'yes' if field in req else 'no'} |")
        out.append("")
    return "\n".join(out)


def main() -> int:
    spec = app.openapi()
    (ROOT / "docs" / "openapi.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False), encoding="utf-8")
    (ROOT / "docs" / "API_CONTRACT.md").write_text(contract(spec), encoding="utf-8")
    print("Wrote docs/openapi.json and docs/API_CONTRACT.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
