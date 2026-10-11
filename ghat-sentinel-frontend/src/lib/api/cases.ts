import { request } from "./client";
import type { CaseStatus, Paged, ReviewCase } from "../types";
export const listCases = (p: { status?: CaseStatus; ghat_id?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
  request<Paged<ReviewCase>>("/cases", { query: { limit: 50, ...p }, signal });
export const getCase = (id: string, signal?: AbortSignal) => request<ReviewCase>(`/cases/${encodeURIComponent(id)}`, { signal });
export interface CreateCaseBody { ghat_id: string; reading_ids?: string[]; recommended_action: string; notes?: string }
export const createCase = (body: CreateCaseBody) => request<ReviewCase>("/cases", { method: "POST", body });
export interface PatchCaseBody { status?: CaseStatus; assigned_to?: string | null; notes?: string; resolution_summary?: string | null }
export const patchCase = (id: string, body: PatchCaseBody) => request<ReviewCase>(`/cases/${encodeURIComponent(id)}`, { method: "PATCH", body });
