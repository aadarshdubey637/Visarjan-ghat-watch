"use client";
import { useMutation } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";
import { Copy, Download, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardHeader, Field, Select, Textarea } from "@/components/ui";
import { ErrorState, Spinner } from "@/components/shared/states";
import { GenerationBadge } from "@/components/shared/badges";
import { EvidenceList, LimitationList } from "@/components/shared/evidence";
import { ApiError } from "@/lib/api/client";
import { askCitizen, generateBrief, generateWhatsApp } from "@/lib/api";
import { copyText, downloadText } from "@/lib/util";
import { yearEnd, yearStart } from "@/lib/api/ghats";
import { useCitizenGhats, useGhats, useHealth, useMetadata } from "@/hooks/queries";
import type { AskResponse, EvidenceItem, Lang, WhatsAppLang } from "@/lib/types";

export const AI_NOTE = "AI-generated explanations are based on available records and backend-provided evidence. They do not replace official environmental assessments or current water testing.";

export function GhatMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const ghats = useGhats();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : value.length >= 10 ? value : [...value, id]);
  return (
    <fieldset><legend className="mb-1 text-xs font-medium">Ghats <span className="font-normal text-ink-muted">(none selected = all, max 10)</span></legend>
      <div className="flex flex-wrap gap-2">{ghats.data?.items.map((g) => (
        <label key={g.id} className={`flex min-h-8 cursor-pointer items-center rounded-full border px-3 text-xs ${value.includes(g.id) ? "border-brand bg-brand-soft" : "border-line"}`}>
          <input type="checkbox" className="sr-only" checked={value.includes(g.id)} onChange={() => toggle(g.id)} />{g.name}</label>))}</div></fieldset>
  );
}

export function AiHint() {
  const health = useHealth();
  const configured = health.data?.ai_configured;
  if (configured !== false) return null;
  return <p className="rounded-md bg-canvas p-2 text-xs text-ink-muted">AI wording unavailable — template text will be used.</p>;
}

function AiError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.kind === "rate_limited") return <p role="alert" className="rounded-md bg-caution-soft p-3 text-sm text-caution">Too many requests. Try again in a minute.</p>;
  return <ErrorState error={error} onRetry={onRetry} />;
}

export function BriefGenerator({ initialGhats = [] }: { initialGhats?: string[] }) {
  const meta = useMetadata();
  const [ghats, setGhats] = useState<string[]>(initialGhats); const [lang, setLang] = useState<Lang>("en");
  const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [requireAi, setRequireAi] = useState(false);
  const m = useMutation({ mutationFn: () => generateBrief({ ghat_ids: ghats.length ? ghats : null, start_date: yearStart(start ? Number(start) : null) ?? null, end_date: yearEnd(end ? Number(end) : null) ?? null, language: lang, use_ai: true, require_ai: requireAi }) });
  const years = meta.data?.year_range ? Array.from({ length: meta.data.year_range[1] - meta.data.year_range[0] + 1 }, (_, i) => meta.data!.year_range![0] + i) : [];
  const d = m.data;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-1"><CardHeader title="Municipal review brief" /><div className="space-y-3 p-4">
        <GhatMultiSelect value={ghats} onChange={setGhats} />
        <Field label="Language" htmlFor="bl"><Select id="bl" value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="en">English</option><option value="hi">हिन्दी</option></Select></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="From year" htmlFor="b1"><Select id="b1" value={start} onChange={(e) => setStart(e.target.value)}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field>
          <Field label="To year" htmlFor="b2"><Select id="b2" value={end} onChange={(e) => setEnd(e.target.value)}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requireAi} onChange={(e) => setRequireAi(e.target.checked)} />AI wording only (fail instead of using the template)</label>
        <AiHint />
        <Button variant="primary" className="w-full" loading={m.isPending} onClick={() => m.mutate()}>Generate brief</Button>
      </div></Card>
      <div className="space-y-4 lg:col-span-2">
        {m.isPending && <Spinner label="Generating the brief — this can take up to 30 seconds…" />}
        {m.isError && <AiError error={m.error} onRetry={() => m.mutate()} />}
        {d && (<>
          <Card><CardHeader title={d.title} subtitle={`Generated ${new Date(d.generated_at).toLocaleString("en-IN")}`} action={<div className="flex gap-2">
            <Button size="sm" onClick={async () => (await copyText(d.content)) ? toast.success("Brief copied") : toast.error("Copy failed")}><Copy className="h-3 w-3" aria-hidden />Copy</Button>
            <Button size="sm" onClick={() => downloadText(d.content, `ghat-sentinel-brief-${d.language}.txt`)}><Download className="h-3 w-3" aria-hidden />Download .txt</Button></div>} />
            <div className="space-y-3 p-4"><GenerationBadge mode={d.generation_mode} aiStatus={d.ai_status} /><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{d.content}</pre></div></Card>
          <Card><CardHeader title="Evidence" subtitle={`${d.evidence.length} items`} /><div className="max-h-96 overflow-y-auto p-4"><EvidenceList items={d.evidence} /></div></Card>
          <LimitationList items={d.limitations} />
        </>)}
        <p className="text-xs text-ink-muted">{AI_NOTE}</p>
      </div>
    </div>
  );
}

/** Safely render WhatsApp *bold* markers as <strong> without HTML injection. */
export function renderWhatsApp(text: string): ReactNode[] {
  return text.split("\n").map((line, i) => (
    <Fragment key={i}>{line.split(/(\*[^*\n]+\*)/g).map((part, j) => /^\*[^*\n]+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong> : <Fragment key={j}>{part}</Fragment>)}{"\n"}</Fragment>
  ));
}

export function WhatsAppBrief({ initialGhats = [] }: { initialGhats?: string[] }) {
  const [ghats, setGhats] = useState<string[]>(initialGhats); const [lang, setLang] = useState<WhatsAppLang>("en"); const [actions, setActions] = useState(true); const [requireAi, setRequireAi] = useState(false);
  const m = useMutation({ mutationFn: () => generateWhatsApp({ ghat_ids: ghats.length ? ghats : null, language: lang, include_actions: actions, use_ai: true, require_ai: requireAi }) });
  const d = m.data;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card><CardHeader title="WhatsApp brief" /><div className="space-y-3 p-4">
        <GhatMultiSelect value={ghats} onChange={setGhats} />
        <Field label="Language" htmlFor="wl"><Select id="wl" value={lang} onChange={(e) => setLang(e.target.value as WhatsAppLang)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="bilingual">Bilingual</option></Select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={actions} onChange={(e) => setActions(e.target.checked)} />Include suggested actions</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requireAi} onChange={(e) => setRequireAi(e.target.checked)} />AI wording only</label>
        <AiHint /><Button variant="primary" className="w-full" loading={m.isPending} onClick={() => m.mutate()}>Generate WhatsApp text</Button></div></Card>
      <div className="space-y-4 lg:col-span-2">
        {m.isPending && <Spinner label="Generating…" />}{m.isError && <AiError error={m.error} onRetry={() => m.mutate()} />}
        {d && (<>
          <Card><CardHeader title="Preview" subtitle="Prepared for manual sharing — nothing has been sent." action={<div className="flex gap-2">
            <Button size="sm" onClick={async () => (await copyText(d.content)) ? toast.success("Copied to clipboard") : toast.error("Copy failed")}><Copy className="h-3 w-3" aria-hidden />Copy</Button>
            <Button size="sm" loading={m.isPending} onClick={() => m.mutate()}><RefreshCw className="h-3 w-3" aria-hidden />Regenerate</Button></div>} />
            <div className="space-y-3 p-4"><GenerationBadge mode={d.generation_mode} aiStatus={d.ai_status} />
              <div className="mx-auto max-w-sm rounded-2xl bg-[#DCF8C6] p-3 text-sm shadow-inner"><div className="whitespace-pre-wrap break-words">{renderWhatsApp(d.content)}</div></div>
              <p className="num text-center text-xs text-ink-muted">{d.content.length} characters</p></div></Card>
          <Card><CardHeader title="Evidence" /><div className="max-h-72 overflow-y-auto p-4"><EvidenceList items={d.evidence} /></div></Card><LimitationList items={d.limitations} /></>)}
        <p className="text-xs text-ink-muted">{AI_NOTE}</p>
      </div>
    </div>
  );
}

const SUGGESTED = ["How can we reduce pollution during visarjan?", "What should organizers do with non-biodegradable decorations?", "Where can I find official immersion instructions?", "What does a historical water-quality reading mean?", "Is this ghat safe today?"];
interface Turn { q: string; a?: AskResponse; error?: unknown }

export function CitizenChat({ lang, simple }: { lang: Lang; simple?: boolean }) {
  const ghats = useCitizenGhats(); // public endpoint, so community members and visitors can use the chat too
  const [text, setText] = useState(""); const [ghat, setGhat] = useState(""); const [turns, setTurns] = useState<Turn[]>([]);
  const m = useMutation({
    mutationFn: (q: string) => askCitizen({ question: q, language: lang, ghat_id: ghat || null, use_ai: true, require_ai: false }),
    onSuccess: (a, q) => setTurns((t) => t.map((x) => (x.q === q && !x.a && !x.error ? { ...x, a } : x))),
    onError: (e, q) => setTurns((t) => t.map((x) => (x.q === q && !x.a && !x.error ? { ...x, error: e } : x))),
  });
  const trimmed = text.trim(); const valid = trimmed.length >= 3 && trimmed.length <= 500;
  const send = (q: string) => { if (m.isPending) return; setTurns((t) => [...t, { q }]); setText(""); m.mutate(q); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{SUGGESTED.map((s) => <button key={s} type="button" disabled={m.isPending} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-brand-soft disabled:opacity-50">{s}</button>)}</div>
      <div className="space-y-3" aria-live="polite">
        {turns.map((t, i) => (<div key={i} className="space-y-2">
          <p className="ml-auto max-w-xl rounded-lg bg-brand-soft p-3 text-sm">{t.q}</p>
          {t.a ? (<Card className="p-3 space-y-2"><GenerationBadge mode={t.a.generation_mode} aiStatus={t.a.ai_status} /><p className={`whitespace-pre-wrap text-sm ${simple ? "text-base leading-relaxed" : ""}`}>{t.a.answer}</p>
            <LimitationList items={t.a.limitations} />{t.a.evidence.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-medium">Evidence ({t.a.evidence.length})</summary><div className="mt-2"><EvidenceList items={t.a.evidence as EvidenceItem[]} /></div></details>}</Card>)
            : t.error ? <AiError error={t.error} /> : <Spinner label="Looking up the records…" />}
        </div>))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) send(trimmed); }} className="space-y-2">
        <Field label="Your question" htmlFor="q" error={trimmed.length > 0 && !valid ? "Questions must be 3–500 characters." : undefined}>
          <Textarea id="q" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about immersion practices or what the records mean" /></Field>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="num text-xs text-ink-muted">{text.length}/500</span>
          <div className="flex items-center gap-2"><label className="sr-only" htmlFor="qg">About a specific ghat</label>
            <Select id="qg" className="w-56" value={ghat} onChange={(e) => setGhat(e.target.value)}><option value="">No specific ghat</option>{ghats.data?.items.map((g) => <option key={g.ghat_id} value={g.ghat_id}>{g.name}</option>)}</Select>
            <Button type="button" onClick={() => setTurns([])} disabled={!turns.length}>Clear</Button><Button type="submit" variant="primary" loading={m.isPending} disabled={!valid}><Send className="h-4 w-4" aria-hidden />Ask</Button></div></div>
      </form>
      <p className="text-xs text-ink-muted">Each question is answered on its own; the service keeps no conversation memory. {AI_NOTE}</p>
    </div>
  );
}
