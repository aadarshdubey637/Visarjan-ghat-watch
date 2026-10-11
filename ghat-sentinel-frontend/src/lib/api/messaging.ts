import { AI_TIMEOUT_MS, request } from "./client";
import type { Contact, MessageChannel, MessageLogItem, MessagingConfig, Paged, SendResponse } from "../types";

export const getMessagingConfig = (signal?: AbortSignal) => request<MessagingConfig>("/messaging/config", { signal });
export const getContacts = (signal?: AbortSignal) => request<{ items: Contact[] }>("/messaging/contacts", { signal });
export const sendEmail = (b: { to: string[]; subject: string; body: string; brief_id?: string | null }) =>
  request<SendResponse>("/messaging/email", { method: "POST", body: b, timeoutMs: AI_TIMEOUT_MS });
export const sendWhatsApp = (b: { to: string[]; body: string; brief_id?: string | null }) =>
  request<SendResponse>("/messaging/whatsapp", { method: "POST", body: b, timeoutMs: AI_TIMEOUT_MS });
export const getMessageLog = (p: { channel?: MessageChannel; limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
  request<Paged<MessageLogItem>>("/messaging/log", { query: { limit: 50, ...p }, signal });
