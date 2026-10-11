import type { MessageChannel } from "./types";

const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

/** Digits only (a leading + and common separators are removed); must be 8-15 digits like an international number. */
export const normalizePhone = (raw: string): string | null => {
  const digits = raw.replace(/[\s().-]/g, "").replace(/^\+/, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
};
export const isEmail = (s: string) => EMAIL.test(s);

export interface ParsedRecipients { valid: string[]; invalid: string[] }

/** Splits on commas, semicolons and new lines; validates per channel; removes duplicates. */
export function parseRecipients(text: string, channel: MessageChannel): ParsedRecipients {
  const seen = new Set<string>(); const valid: string[] = []; const invalid: string[] = [];
  for (const part of text.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const value = channel === "email" ? (isEmail(part) ? part.toLowerCase() : null) : normalizePhone(part);
    if (value === null) { invalid.push(part); continue; }
    if (!seen.has(value)) { seen.add(value); valid.push(value); }
  }
  return { valid, invalid };
}

/** Merge picked contacts with typed recipients without duplicates. */
export const mergeRecipients = (picked: string[], typed: string[]) => Array.from(new Set([...picked, ...typed]));

/** Line breaks and tabs become " | " (Meta rejects them inside template parameters). */
export const whatsappFlatten = (body: string): string => body.replace(/[\r\n\t]+/g, " | ");

/** The same clean-up the backend applies to WhatsApp template parameters (preview only). */
export function whatsappTemplatePreview(body: string): string {
  const flat = whatsappFlatten(body).replace(/ {5,}/g, "    ").trim();
  return flat.length > 1000 ? flat.slice(0, 999).trimEnd() + "…" : flat;
}
