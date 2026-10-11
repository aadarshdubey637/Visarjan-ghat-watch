import { AI_TIMEOUT_MS, request } from "./client";
import type { AskResponse, BriefResponse, Lang, WhatsAppLang, WhatsAppResponse } from "../types";

export interface BriefRequest { ghat_ids: string[] | null; start_date?: string | null; end_date?: string | null; language: Lang; use_ai: boolean; require_ai: boolean }
export const generateBrief = (body: BriefRequest, signal?: AbortSignal) =>
  request<BriefResponse>("/brief/generate", { method: "POST", body, timeoutMs: AI_TIMEOUT_MS, signal });

export interface WhatsAppRequest { ghat_ids: string[] | null; language: WhatsAppLang; include_actions: boolean; use_ai: boolean; require_ai: boolean }
export const generateWhatsApp = (body: WhatsAppRequest, signal?: AbortSignal) =>
  request<WhatsAppResponse>("/brief/whatsapp", { method: "POST", body, timeoutMs: AI_TIMEOUT_MS, signal });

export interface AskRequest { question: string; language: Lang; ghat_id?: string | null; use_ai: boolean; require_ai: boolean }
export const askCitizen = (body: AskRequest, signal?: AbortSignal) =>
  request<AskResponse>("/citizen/ask", { method: "POST", body, timeoutMs: AI_TIMEOUT_MS, signal });
