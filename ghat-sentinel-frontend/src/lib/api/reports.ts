import { request } from "./client";
import type { Lang, Report } from "../types";
export interface ReportRequest { ghat_ids: string[] | null; start_date?: string | null; end_date?: string | null; language: Lang; format: "json" | "csv" }
export const generateReportJson = (body: Omit<ReportRequest, "format">, signal?: AbortSignal) =>
  request<Report>("/reports/generate", { method: "POST", body: { ...body, format: "json" }, timeoutMs: 45000, signal });
export const generateReportCsv = (body: Omit<ReportRequest, "format">, signal?: AbortSignal) =>
  request<Blob>("/reports/generate", { method: "POST", body: { ...body, format: "csv" }, blob: true, timeoutMs: 45000, signal });
