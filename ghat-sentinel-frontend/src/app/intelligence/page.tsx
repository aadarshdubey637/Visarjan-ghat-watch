"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, CardHeader } from "@/components/ui";
import { WidgetBoundary } from "@/components/shared/states";
import { BriefGenerator, CitizenChat, WhatsAppBrief } from "@/components/intelligence/parts";
import type { Lang } from "@/lib/types";

const TABS = [["brief", "Brief generator"], ["whatsapp", "WhatsApp brief"], ["ask", "Q&A"]] as const;
function Content() {
  const sp = useSearchParams(); const g = sp.get("ghat"); const initial = g ? [g] : [];
  const [tab, setTab] = useState<(typeof TABS)[number][0]>((sp.get("tab") as "whatsapp" | "ask") ?? "brief");
  const [lang, setLang] = useState<Lang>("en");
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="AI Intelligence" subtitle="The backend writes briefs from validated evidence. When AI is unavailable you get deterministic template text, which is a normal result, not an error." />
      <div role="tablist" aria-label="Intelligence tools" className="flex flex-wrap gap-2">{TABS.map(([k, label]) => <Button key={k} role="tab" aria-selected={tab === k} variant={tab === k ? "primary" : "secondary"} onClick={() => setTab(k)}>{label}</Button>)}</div>
      <WidgetBoundary>{tab === "brief" ? <BriefGenerator initialGhats={initial} /> : tab === "whatsapp" ? <WhatsAppBrief initialGhats={initial} /> : (
        <Card><CardHeader title="Ask about the records" action={<select aria-label="Answer language" className="min-h-8 rounded-md border border-line px-2 text-xs" value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="en">English</option><option value="hi">हिन्दी</option></select>} /><div className="p-4"><CitizenChat lang={lang} /></div></Card>)}</WidgetBoundary>
    </div>
  );
}
export default function IntelligencePage() { return <Suspense fallback={null}><Content /></Suspense>; }
