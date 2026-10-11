import { describe, expect, it } from "vitest";
import { isEmail, mergeRecipients, normalizePhone, parseRecipients, whatsappTemplatePreview } from "@/lib/messaging";
import { accessFor, navFor } from "@/lib/access";

describe("phone numbers", () => {
  it("normalises common spellings to digits", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhone("(91) 98765 43210")).toBe("919876543210");
    expect(normalizePhone("919876543210")).toBe("919876543210");
  });
  it("rejects too short, too long and non-numeric values", () => {
    for (const bad of ["12345", "1234567890123456", "98765abc10", "", "+"]) expect(normalizePhone(bad)).toBeNull();
  });
});

describe("email addresses", () => {
  it("accepts normal addresses and rejects injection attempts", () => {
    expect(isEmail("officer@city.gov.in")).toBe(true);
    for (const bad of ["no-at-sign", "a@b", "a b@c.com", "a@b.com\nBcc: x@y.com", "<a@b.com>"]) expect(isEmail(bad)).toBe(false);
  });
});

describe("recipient parsing", () => {
  it("splits on commas, semicolons and new lines, lower-cases and de-duplicates emails", () => {
    const r = parseRecipients("A@x.com, b@x.com;\n a@X.com\n", "email");
    expect(r.valid).toEqual(["a@x.com", "b@x.com"]); expect(r.invalid).toEqual([]);
  });
  it("reports every invalid entry instead of silently dropping it", () => {
    const r = parseRecipients("ok@x.com, nope, 123", "email");
    expect(r.valid).toEqual(["ok@x.com"]); expect(r.invalid).toEqual(["nope", "123"]);
  });
  it("normalises and de-duplicates WhatsApp numbers", () => {
    const r = parseRecipients("+91 98765 43210, 919876543210, 12", "whatsapp");
    expect(r.valid).toEqual(["919876543210"]); expect(r.invalid).toEqual(["12"]);
  });
  it("merges picked contacts and typed recipients without duplicates", () => {
    expect(mergeRecipients(["a@x.com"], ["a@x.com", "b@x.com"])).toEqual(["a@x.com", "b@x.com"]);
  });
});

describe("WhatsApp template preview", () => {
  it("removes line breaks and tabs (Meta rejects them in template parameters)", () => {
    expect(whatsappTemplatePreview("Line one\nLine two\t\tend")).not.toMatch(/[\n\t]/);
    expect(whatsappTemplatePreview("a\nb")).toBe("a | b");
  });
  it("shortens very long text to 1000 characters", () => {
    const out = whatsappTemplatePreview("x".repeat(3000)); expect(out.length).toBeLessThanOrEqual(1000); expect(out.endsWith("…")).toBe(true);
  });
});

describe("who can reach messaging", () => {
  it("is available to officers, developers and presenters only", () => {
    for (const r of ["officer", "developer", "demo"] as const) { expect(accessFor("/messages", r)).toBe("ok"); expect(navFor(r).some((n) => n.href === "/messages")).toBe(true); }
    for (const r of ["worker", "citizen"] as const) expect(accessFor("/messages", r)).toBe("forbidden");
    expect(accessFor("/messages", null)).toBe("login");
  });
});
