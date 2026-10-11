"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, ExternalLink, HelpCircle, Info, Leaf, Waves } from "lucide-react";
import { Button, Card, Chip } from "@/components/ui";
import { CitizenChat } from "@/components/intelligence/parts";
import { useAuth } from "@/components/auth-provider";
import { HeroBanner } from "@/components/shared/hero";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { useCitizenGhats, useGuide, useResources } from "@/hooks/queries";
import type { Lang } from "@/lib/types";

function CitizenHero() {
  return (
    <HeroBanner compact>
      <div className="max-w-xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm animate-slide-in-left">
          <Leaf className="h-3.5 w-3.5" aria-hidden /> For citizens &amp; Durga Puja organisers
        </div>
        <h1 className="animate-slide-up text-3xl font-bold leading-tight md:text-4xl">Responsible Visarjan Guide</h1>
        <p className="mt-3 animate-slide-up text-base text-white/85 md:text-lg" style={{ animationDelay: "80ms" }}>
          Understand historical environmental information and learn responsible ways to reduce pollution during immersion activities.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 animate-slide-up" style={{ animationDelay: "160ms" }}>
          <Chip tone="warn" className="text-xs">Historical data only — not live monitoring</Chip>
          <Chip tone="info" className="text-xs">Durga Visarjan: 20 Oct 2026</Chip>
        </div>
      </div>
    </HeroBanner>
  );
}

function GhatHistorySection() {
  const q = useCitizenGhats();
  if (q.isPending) return <LoadingState rows={4} label="Loading historical data…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { items, notice } = q.data;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-caution/30 bg-caution-soft p-4">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-caution" aria-hidden />
        <p className="text-sm text-caution font-medium">{notice}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((g) => (
          <Card key={g.ghat_id} className="p-4 hover:border-brand/40 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="font-semibold text-ink">{g.name}</h3>
                {g.water_body && <p className="text-xs text-ink-muted">{g.water_body}</p>}
              </div>
              {g.last_sample_year && <Chip tone="neutral" className="shrink-0 text-xs">{g.last_sample_year}</Chip>}
            </div>
            {g.latest_season_summary.length > 0 && (
              <ul className="mb-2 space-y-1">
                {g.latest_season_summary.map((s, i) => <li key={i} className="text-xs text-ink">{s}</li>)}
              </ul>
            )}
            {g.historical_exceedance_rate !== null && (
              <p className="text-xs text-ink-muted">
                Share of past comparable readings outside CPCB class B limits:{" "}
                <span className="font-semibold num">{(g.historical_exceedance_rate * 100).toFixed(0)}%</span>
              </p>
            )}
            {g.limitations.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-ink-muted">Limitations</summary>
                <ul className="mt-1 list-disc pl-4 text-xs text-ink-muted space-y-0.5">{g.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
              </details>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  idols: "Idols & Materials",
  offerings: "Offerings",
  decorations: "Decorations",
  sites: "Immersion Sites",
  practices: "Practices",
  safety: "Safety",
  understanding_data: "Understanding the Data",
};
const CATEGORY_ICONS: Record<string, typeof Leaf> = {
  idols: Waves, offerings: Leaf, decorations: Leaf, sites: Waves, practices: Leaf, safety: AlertTriangle, understanding_data: Info,
};

function GuideSection({ lang }: { lang: Lang }) {
  const q = useGuide(lang);
  if (q.isPending) return <LoadingState rows={5} label="Loading guidance…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { items, notice } = q.data;
  const byCategory: Record<string, typeof items> = {};
  for (const item of items) { (byCategory[item.category] ??= []).push(item); }
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-caution/30 bg-caution-soft p-4">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-caution" aria-hidden />
        <p className="text-sm text-caution font-medium">{notice}</p>
      </div>
      {Object.entries(byCategory).map(([cat, catItems]) => {
        const Icon = CATEGORY_ICONS[cat] ?? Leaf;
        return (
          <Card key={cat} className="overflow-hidden">
            <div className="flex items-center gap-2 bg-brand-soft/50 px-4 py-3 border-b border-line">
              <Icon className="h-4 w-4 text-brand" aria-hidden />
              <h3 className="text-sm font-semibold text-ink">{CATEGORY_LABELS[cat] ?? cat}</h3>
            </div>
            <div className="divide-y divide-line">
              {catItems.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h4 className="text-sm font-medium text-ink">{item.title}</h4>
                    <Chip tone="warn" className="shrink-0 text-xs">Draft guidance</Chip>
                  </div>
                  <p className="text-sm text-ink">{item.body}</p>
                  {item.basis && <p className="mt-1 text-xs text-ink-muted">Basis: {item.basis}</p>}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ResourcesSection() {
  const q = useResources();
  if (q.isPending) return <LoadingState rows={3} label="Loading resources…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { items, notice } = q.data;
  return (
    <div className="space-y-4">
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-line bg-canvas p-3">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-info" aria-hidden />
          <p className="text-xs text-ink-muted">{notice}</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((r) => {
          const safeUrl = r.url.startsWith("https://") ? r.url : null;
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold text-ink leading-snug">{r.title}</h3>
                <Chip tone="neutral" className="text-xs shrink-0">{r.resource_type}</Chip>
              </div>
              {r.issuing_organization && <p className="text-xs text-ink-muted mb-1">{r.issuing_organization}</p>}
              <p className="text-xs text-ink mb-2">{r.description}</p>
              <p className="text-xs text-ink-muted mb-2 italic">{r.verification_note}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted">{r.last_verified ? `Verified: ${r.last_verified}` : "Not verified"}</span>
                {safeUrl ? (
                  <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-info hover:underline">
                    Open <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : <span className="text-xs text-ink-muted">No link</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const TABS = [
  { key: "history", label: "Historical info", icon: Waves },
  { key: "guide", label: "Immersion guide", icon: BookOpen },
  { key: "resources", label: "Resources", icon: ExternalLink },
  { key: "ask", label: "Ask a question", icon: HelpCircle },
] as const;

export default function CitizenPage() {
  const { user, staff } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("history");
  const [lang, setLang] = useState<Lang>("en");

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <CitizenHero />

      {/* Disclaimer — always visible */}
      <div className="flex items-start gap-2 rounded-xl border border-critical/20 bg-critical-soft p-4">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-critical" aria-hidden />
        <p className="text-sm text-critical font-medium">
          Historical measurements do not establish current water safety. Follow current official instructions and rely on appropriate testing and official advisories for present conditions.
        </p>
      </div>

      {/* Language toggle */}
      <div className="flex items-center justify-between">
        <div role="tablist" aria-label="Citizen guide sections" className="flex flex-wrap gap-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? "primary" : "secondary"} size="sm" onClick={() => setTab(key)}>
              <Icon className="h-3.5 w-3.5" aria-hidden />{label}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          Language:
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="min-h-7 rounded border border-line px-2 text-xs">
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </label>
      </div>

      {/* Tab content */}
      <div>
        {tab === "history" && <GhatHistorySection />}
        {tab === "guide" && <GuideSection lang={lang} />}
        {tab === "resources" && <ResourcesSection />}
        {tab === "ask" && (
          <Card>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Ask about the records</h2>
                <p className="text-xs text-ink-muted mt-0.5">Each question is independent — no conversation memory.</p>
              </div>
            </div>
            <div className="p-4"><CitizenChat lang={lang} /></div>
          </Card>
        )}
      </div>

      <div className="text-center text-xs text-ink-muted border-t border-line pt-4">
        Data from MPPCB reports, 2023–2025.{" "}
        {staff ? <><Link href="/methodology" className="text-brand hover:underline">Data &amp; Methodology</Link> · <Link href="/" className="text-brand hover:underline">Back to my workspace</Link></> : !user ? <Link href="/register" className="text-brand hover:underline">Create a community account</Link> : null}
      </div>
    </div>
  );
}
