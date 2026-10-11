"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Mail, MessageCircle, Send, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, Chip, Dialog, Field, Input, Textarea, cn } from "@/components/ui";
import { useContacts, useMessagingConfig } from "@/hooks/queries";
import { sendEmail, sendWhatsApp } from "@/lib/api";
import { ApiError, friendlyMessage } from "@/lib/api/client";
import { mergeRecipients, normalizePhone, parseRecipients, whatsappFlatten, whatsappTemplatePreview } from "@/lib/messaging";
import type { MessageChannel, SendResponse } from "@/lib/types";

interface Props {
  open: boolean; onClose: () => void;
  channel?: MessageChannel;
  subject?: string; body: string; briefId?: string | null;
}

export function SendDialog({ open, onClose, channel: initialChannel = "email", subject: initialSubject = "", body: initialBody, briefId }: Props) {
  const cfg = useMessagingConfig(); const contacts = useContacts(); const qc = useQueryClient();
  const [channel, setChannel] = useState<MessageChannel>(initialChannel);
  const [subject, setSubject] = useState(initialSubject); const [body, setBody] = useState(initialBody);
  const [picked, setPicked] = useState<string[]>([]); const [typed, setTyped] = useState("");
  const [review, setReview] = useState(false); const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<SendResponse | null>(null); const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setChannel(initialChannel); setSubject(initialSubject); setBody(initialBody); setPicked([]); setTyped(""); setReview(false); setConfirmed(false); setResult(null); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPicked([]); setReview(false); setConfirmed(false); setResult(null); setError(null); }, [channel]);

  const c = cfg.data; const maxR = c?.max_recipients ?? 20;
  const configured = !!c && (channel === "email" ? c.email.configured : c.whatsapp.configured);
  const canSend = configured || !!c?.dry_run;
  const people = useMemo(() => (contacts.data?.items ?? []).filter((p) => (channel === "email" ? !!p.email : !!p.phone && !!normalizePhone(p.phone))), [contacts.data, channel]);
  const parsed = useMemo(() => parseRecipients(typed, channel), [typed, channel]);
  const recipients = mergeRecipients(picked, parsed.valid);
  const tooMany = recipients.length > maxR;
  const bodyMax = channel === "email" ? 30000 : 20000;
  const waLimit = c?.whatsapp.mode === "text" ? 4000 : 1000; // what WhatsApp will actually carry
  const waCut = channel === "whatsapp" && whatsappFlatten(body).length > waLimit;
  const ready = recipients.length > 0 && !tooMany && parsed.invalid.length === 0 && body.trim().length > 0 && body.length <= bodyMax && (channel === "whatsapp" || (subject.trim().length > 0 && subject.length <= 150));

  const send = useMutation({
    mutationFn: () => channel === "email"
      ? sendEmail({ to: recipients, subject: subject.trim(), body, brief_id: briefId ?? null })
      : sendWhatsApp({ to: recipients, body, brief_id: briefId ?? null }),
    onSuccess: (r) => {
      setResult(r); setError(null); qc.invalidateQueries({ queryKey: ["message-log"] });
      if (r.failed === 0) toast.success(r.dry_run ? `Dry run: ${r.results.length} message(s) recorded, nothing was sent` : `Sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}`);
      else toast.warning(`${r.sent} sent, ${r.failed} failed`);
    },
    onError: (e) => setError(e instanceof ApiError && e.code === "CHANNEL_NOT_CONFIGURED" ? `${e.message}` : friendlyMessage(e)),
  });

  const togglePick = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const Icon = channel === "email" ? Mail : MessageCircle;

  return (
    <Dialog open={open} onClose={onClose} title="Send this brief">
      <div className="space-y-4">
        <div role="tablist" aria-label="Channel" className="grid grid-cols-2 gap-2">
          {(["email", "whatsapp"] as const).map((ch) => (
            <button key={ch} role="tab" aria-selected={channel === ch} onClick={() => setChannel(ch)}
              className={cn("flex min-h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium", channel === ch ? "border-brand bg-brand-soft text-brand-dark" : "border-line hover:bg-canvas")}>
              {ch === "email" ? <Mail className="h-4 w-4" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}{ch === "email" ? "Email" : "WhatsApp"}
              {c && !(ch === "email" ? c.email.configured : c.whatsapp.configured) && <Chip tone="warn" className="ml-1">not set up</Chip>}
            </button>
          ))}
        </div>

        {c?.dry_run && <p className="rounded-md border border-marigold/40 bg-marigold-soft p-2.5 text-xs text-marigold-dark"><b>Dry-run mode:</b> messages are recorded in the history but nothing is actually sent.</p>}
        {c && !canSend && <p role="alert" className="flex gap-2 rounded-md border border-caution/30 bg-caution-soft p-2.5 text-xs text-caution"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{channel === "email" ? "Email is not set up on the server yet (SMTP settings are missing)." : "WhatsApp is not set up on the server yet (access token, phone number ID or template name is missing)."} Ask a developer to complete docs/MESSAGING.md.</p>}

        {!result && !review && (
          <>
            <div>
              <p className="mb-1 text-xs font-medium">Team contacts <span className="font-normal text-ink-muted">({channel === "email" ? "with an email" : "with a WhatsApp number"})</span></p>
              {contacts.isPending ? <p className="text-xs text-ink-muted">Loading contacts…</p> : people.length === 0 ? <p className="text-xs text-ink-muted">No team members have a {channel === "email" ? "email" : "phone number"} on file. Add phone numbers on the Team page, or type recipients below.</p> : (
                <div className="flex flex-wrap gap-2">{people.map((p) => {
                  const v = channel === "email" ? p.email.toLowerCase() : normalizePhone(p.phone!)!;
                  return (
                    <label key={p.id} className={cn("flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs", picked.includes(v) ? "border-brand bg-brand-soft" : "border-line")}>
                      <input type="checkbox" className="sr-only" checked={picked.includes(v)} onChange={() => togglePick(v)} />{p.name}<span className="text-ink-muted">· {p.role === "worker" ? "worker" : "officer"}</span></label>
                  );
                })}</div>
              )}
            </div>
            <Field label={channel === "email" ? "Other email addresses" : "Other WhatsApp numbers (with country code)"} htmlFor="sr" hint="Separate with commas or new lines."
              error={parsed.invalid.length ? `Not valid: ${parsed.invalid.slice(0, 3).join(", ")}${parsed.invalid.length > 3 ? "…" : ""}` : tooMany ? `At most ${maxR} recipients per message.` : undefined}>
              <Textarea id="sr" rows={2} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={channel === "email" ? "name@example.com, other@example.com" : "+91 98765 43210"} />
            </Field>
            {channel === "email" && <Field label="Subject" htmlFor="ss"><Input id="ss" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} /></Field>}
            <Field label="Message" htmlFor="sb" hint={channel === "whatsapp" ? (c?.whatsapp.mode === "template" ? "Sent through your approved WhatsApp template: line breaks become “ | ” and text over 1,000 characters is shortened." : "Free-text messages only reach people who messaged your number in the last 24 hours.") : undefined}>
              <Textarea id="sb" rows={8} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
              <p className={cn("num mt-1 text-right text-xs", body.length > bodyMax ? "text-critical" : "text-ink-muted")}>{body.length}/{bodyMax}</p>
            </Field>
            {waCut && <p role="alert" className="flex gap-2 rounded-md border border-caution/30 bg-caution-soft p-2.5 text-xs text-caution"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />WhatsApp carries at most about {waLimit.toLocaleString("en-IN")} characters, so only the start of this message will be sent. Pick fewer ghats before generating the brief, or shorten the text above.</p>}
            <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button>
              <Button type="button" variant="primary" disabled={!ready || !canSend} onClick={() => setReview(true)}><Icon className="h-4 w-4" aria-hidden />Review ({recipients.length})</Button></div>
          </>
        )}

        {!result && review && (
          <div className="space-y-3">
            <p className="text-sm font-medium">You are about to {c?.dry_run ? "record (not send)" : "send"} this {channel === "email" ? "email" : "WhatsApp message"} to {recipients.length} recipient{recipients.length === 1 ? "" : "s"}:</p>
            <ul className="max-h-32 overflow-y-auto rounded-md border border-line p-2 text-xs">{recipients.map((r) => <li key={r} className="num">{channel === "whatsapp" ? `+${r}` : r}</li>)}</ul>
            {channel === "email" && <p className="text-xs"><b>Subject:</b> {subject}</p>}
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-canvas p-3 font-sans text-xs">{channel === "whatsapp" && c?.whatsapp.mode === "template" ? whatsappTemplatePreview(body) : channel === "whatsapp" && body.length > waLimit ? body.slice(0, waLimit - 1) + "…" : body}</pre>
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have checked the message, and these people have agreed to receive it.</label>
            {error && <p role="alert" className="rounded-md border border-critical/20 bg-critical-soft p-2.5 text-sm text-critical">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" onClick={() => setReview(false)} disabled={send.isPending}>Back</Button>
              <Button type="button" variant="primary" loading={send.isPending} disabled={!confirmed} onClick={() => send.mutate()}><Send className="h-4 w-4" aria-hidden />{c?.dry_run ? "Record dry run" : "Send now"}</Button></div>
          </div>
        )}

        {result && (
          <div className="space-y-3" role="status" aria-live="polite">
            <p className="text-sm font-medium">{result.dry_run ? "Dry run complete: nothing was sent." : `${result.sent} sent${result.failed ? `, ${result.failed} failed` : ""}.`}</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto">{result.results.map((r) => (
              <li key={r.recipient} className="flex items-start gap-2 rounded-md border border-line p-2 text-xs">
                {r.status === "failed" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />}
                <span className="num min-w-0 flex-1 break-all">{channel === "whatsapp" ? `+${r.recipient}` : r.recipient}</span>
                <Chip tone={r.status === "sent" ? "good" : r.status === "dry_run" ? "neutral" : "bad"}>{r.status === "dry_run" ? "dry run" : r.status}</Chip>
                {r.error && <span className="basis-full pl-5 text-critical">{r.error}</span>}
              </li>))}</ul>
            <div className="flex justify-end"><Button variant="primary" onClick={onClose}>Done</Button></div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
