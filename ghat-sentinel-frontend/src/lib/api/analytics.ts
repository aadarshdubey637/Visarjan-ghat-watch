import { request } from "./client";
import type { Benchmark, CpcbClass, FindingsPage, Oct20Outlook, Overview } from "../types";

export const getOverview = (cpcb_class?: CpcbClass, signal?: AbortSignal) => request<Overview>("/analytics/overview", { query: { cpcb_class }, signal });

export const getBenchmark = (p: { parameter: string; year?: number | null; region?: string; phase?: string; cpcb_class?: CpcbClass }, signal?: AbortSignal) =>
  request<Benchmark>("/analytics/benchmark", { query: { ...p }, signal });

export const getOutlook = (p: { ghat_id?: string; parameter?: string; year?: number }, signal?: AbortSignal) =>
  request<Oct20Outlook>("/predict/oct20", { query: { ...p }, signal });

/** Readings outside the applicable criterion, most severe first (computed by the backend criteria engine). */
export const getFindings = (p: { ghat_id?: string; parameter?: string; cpcb_class?: CpcbClass; limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
  request<FindingsPage>("/analytics/findings", { query: { limit: 20, ...p }, signal });
