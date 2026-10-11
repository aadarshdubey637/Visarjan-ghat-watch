import { request } from "./client";
import type { CpcbClass, GhatDetail, GhatSummary, Paged, RankedResponse, ReadingsPage, TrendsResponse } from "../types";

export const yearStart = (y?: number | null) => (y ? `${y}-01-01` : undefined);
export const yearEnd = (y?: number | null) => (y ? `${y}-12-31` : undefined);

export const listGhats = (p: { search?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
  request<Paged<GhatSummary>>("/ghats", { query: { limit: 100, ...p }, signal });

export const getRanked = (p: { cpcb_class?: CpcbClass; startYear?: number | null; endYear?: number | null; asOfYear?: number | null } = {}, signal?: AbortSignal) =>
  request<RankedResponse>("/ghats/ranked", {
    query: { cpcb_class: p.cpcb_class, start_date: yearStart(p.startYear), end_date: yearEnd(p.endYear), as_of: p.asOfYear ? `${p.asOfYear}-12-31` : undefined },
    signal,
  });

export const getGhat = (id: string, cpcb_class?: CpcbClass, signal?: AbortSignal) =>
  request<GhatDetail>(`/ghats/${encodeURIComponent(id)}`, { query: { cpcb_class }, signal });

export const getReadings = (
  id: string,
  p: { parameter?: string; startYear?: number | null; endYear?: number | null; limit?: number; offset?: number; evaluate?: boolean; cpcb_class?: CpcbClass } = {},
  signal?: AbortSignal,
) =>
  request<ReadingsPage>(`/ghats/${encodeURIComponent(id)}/readings`, {
    query: { parameter: p.parameter, start_date: yearStart(p.startYear), end_date: yearEnd(p.endYear), limit: p.limit ?? 50, offset: p.offset ?? 0, evaluate: p.evaluate, cpcb_class: p.cpcb_class },
    signal,
  });

export const getTrends = (id: string, p: { parameter?: string; startYear?: number | null; endYear?: number | null } = {}, signal?: AbortSignal) =>
  request<TrendsResponse>(`/ghats/${encodeURIComponent(id)}/trends`, {
    query: { parameter: p.parameter, start_date: yearStart(p.startYear), end_date: yearEnd(p.endYear) }, signal,
  });
