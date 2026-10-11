export class ApiError extends Error {
  status: number; code: string; details?: { field: string; message: string }[];
  constructor(status: number, code: string, message: string, details?: { field: string; message: string }[]) {
    super(message); this.name = "ApiError"; this.status = status; this.code = code; this.details = details;
  }
  get kind(): "network" | "timeout" | "validation" | "not_found" | "rate_limited" | "ai" | "conflict" | "unauthenticated" | "forbidden" | "server" {
    if (this.code === "NETWORK_ERROR") return "network";
    if (this.status === 401) return "unauthenticated";
    if (this.status === 403) return "forbidden";
    if (this.code === "TIMEOUT") return "timeout";
    if (this.status === 422) return "validation";
    if (this.status === 404) return "not_found";
    if (this.status === 429) return "rate_limited";
    if (this.status === 409) return "conflict";
    if (this.code.startsWith("AI_")) return "ai";
    return "server";
  }
}

export function friendlyMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong. Please try again.";
  switch (e.kind) {
    case "network": return "The Ghat Sentinel backend is not reachable. Check that it is running and that NEXT_PUBLIC_API_BASE_URL is correct.";
    case "timeout": return "The request took too long. The backend may be starting up or busy; try again.";
    case "rate_limited": return "Too many requests. Try again in a minute.";
    case "unauthenticated": return e.code === "INVALID_CREDENTIALS" ? "Email or password is incorrect." : "Your session has expired. Please sign in again.";
    case "forbidden": return "Your account does not have access to this.";
    case "ai": return `AI wording is unavailable (${e.code}). ${e.message}`;
    default: return e.message;
  }
}

const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
/** Origin only; strip any trailing slash and an accidental /api/v1 so we never produce /api/v1/api/v1. */
export function resolveBase(raw: string = RAW_BASE): string {
  return raw.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}
export const API_ORIGIN = resolveBase();
export const API_ROOT = `${API_ORIGIN}/api/v1`;

type Query = Record<string, string | number | boolean | null | undefined>;
export function qs(q?: Query): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) { if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const LAST_OK_KEY = "gs:lastOk";
export const TOKEN_KEY = "gs:token";
export const UNAUTH_EVENT = "gs:unauthenticated";
export const getToken = (): string | null => { try { return typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export interface RequestOpts { method?: string; query?: Query; body?: unknown; timeoutMs?: number; signal?: AbortSignal; blob?: boolean }

async function parseError(res: Response): Promise<ApiError> {
  let code = "HTTP_ERROR", message = `Request failed (${res.status}).`, details: ApiError["details"];
  try {
    const j = await res.json();
    if (j?.error) { code = j.error.code ?? code; message = j.error.message ?? message; details = j.error.details; }
    else if (j?.detail) { message = typeof j.detail === "string" ? j.detail : message; }
  } catch { /* non-JSON error body */ }
  return new ApiError(res.status, code, message, details);
}

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, opts.timeoutMs ?? 15000);
  opts.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(`${API_ROOT}${path}${qs(opts.query)}`, {
      method: opts.method ?? "GET",
      // FormData (file uploads) sets its own multipart boundary header
      headers: { ...(opts.body !== undefined && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await parseError(res);
      // An expired/invalid token (not a failed login attempt): tell the app to sign the user out.
      if (err.status === 401 && err.code === "UNAUTHENTICATED" && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTH_EVENT));
      throw err;
    }
    try { if (typeof window !== "undefined") window.sessionStorage.setItem(LAST_OK_KEY, new Date().toISOString()); } catch { /* ignore */ }
    if (opts.blob) return (await res.blob()) as unknown as T;
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (timedOut) throw new ApiError(0, "TIMEOUT", "The request timed out.");
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK_ERROR", "Network request failed.");
  } finally { clearTimeout(timer); }
}
export const AI_TIMEOUT_MS = 60000;
