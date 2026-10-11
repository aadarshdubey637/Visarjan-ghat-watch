import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, friendlyMessage, qs, request, resolveBase } from "@/lib/api/client";
import { yearEnd, yearStart } from "@/lib/api/ghats";

afterEach(() => vi.restoreAllMocks());
async function failure(p: Promise<unknown>): Promise<ApiError> { try { await p; } catch (e) { return e as ApiError; } throw new Error("expected the request to fail"); }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("base URL handling", () => {
  it("accepts an origin and never doubles /api/v1", () => {
    expect(resolveBase("http://localhost:8000")).toBe("http://localhost:8000");
    expect(resolveBase("http://localhost:8000/")).toBe("http://localhost:8000");
    expect(resolveBase("http://localhost:8000/api/v1")).toBe("http://localhost:8000");
    expect(resolveBase("https://api.example.com/api/v1/")).toBe("https://api.example.com");
  });
});

describe("query strings and year filters", () => {
  it("omits empty values and encodes the rest", () => {
    expect(qs({ a: 1, b: "", c: undefined, d: null, e: "x y", f: false })).toBe("?a=1&e=x+y&f=false");
    expect(qs({})).toBe("");
  });
  it("turns years into whole-year ISO dates", () => {
    expect(yearStart(2024)).toBe("2024-01-01"); expect(yearEnd(2024)).toBe("2024-12-31");
    expect(yearStart(null)).toBeUndefined();
  });
});

describe("request()", () => {
  it("returns parsed JSON and calls /api/v1", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true }));
    expect(await request("/health")).toEqual({ ok: true });
    expect(String(f.mock.calls[0][0])).toMatch(/\/api\/v1\/health$/);
  });
  it("sends JSON bodies", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: "c1" }, 201));
    await request("/cases", { method: "POST", body: { ghat_id: "g" } });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST"); expect(init.body).toBe('{"ghat_id":"g"}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
  it("normalises the backend error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: { code: "INVALID_STATUS_TRANSITION", message: "nope" } }, 409));
    const err = await failure(request("/cases/x", { method: "PATCH", body: {} }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409); expect(err.code).toBe("INVALID_STATUS_TRANSITION"); expect(err.kind).toBe("conflict");
  });
  it("keeps field-level validation details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data.", details: [{ field: "limit", message: "too big" }] } }, 422));
    const err = await failure(request("/ghats"));
    expect(err.kind).toBe("validation"); expect(err.details).toEqual([{ field: "limit", message: "too big" }]);
  });
  it("classifies 404, 429 and AI errors", async () => {
    expect(new ApiError(404, "GHAT_NOT_FOUND", "x").kind).toBe("not_found");
    expect(new ApiError(429, "RATE_LIMITED", "x").kind).toBe("rate_limited");
    expect(new ApiError(503, "AI_TIMEOUT", "x").kind).toBe("ai");
    expect(friendlyMessage(new ApiError(429, "RATE_LIMITED", "x"))).toMatch(/minute/);
  });
  it("reports an unreachable backend as a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await failure(request("/health"));
    expect(err.kind).toBe("network"); expect(friendlyMessage(err)).toMatch(/not reachable/);
  });
  it("times out", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_u, init) => new Promise((_res, rej) => { (init as RequestInit).signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError"))); }));
    const err = await failure(request("/health", { timeoutMs: 20 }));
    expect(err.kind).toBe("timeout");
  });
});
