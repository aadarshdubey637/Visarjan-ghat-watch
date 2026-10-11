"use client";
import Link from "next/link";
import { useState } from "react";
import { Activity, AlertTriangle, BarChart3, ClipboardPlus, FileText, FolderOpen, MapPinned, Sparkles } from "lucide-react";
import { HeroBanner } from "@/components/shared/hero";
import { MetricCard } from "@/components/dashboard/metric-card";
import { FindingsPanel, PriorityPanel, RecentCases } from "@/components/dashboard/panels";
import { TrendExplorer } from "@/components/analytics/trend-explorer";
import { SeasonHeatmap } from "@/components/dashboard/season-heatmap";
import { CaseDialog } from "@/components/cases/case-dialog";
import { Button, Card, CardHeader, Chip } from "@/components/ui";
import { ErrorState, WidgetBoundary } from "@/components/shared/states";
import { OPEN_STATUSES } from "@/lib/domain";
import { useMetadata, useOverview, useRanked } from "@/hooks/queries";

export function DashboardView() {
  const meta = useMetadata(); const ov = useOverview(); const ranked = useRanked();
  const [caseOpen, setCaseOpen] = useState(false);
  const needing = ranked.data?.items.filter((g) => g.priority_level === "high" || g.priority_level === "review").length;
  const open = ov.data ? OPEN_STATUSES.reduce((s, k) => s + (ov.data.cases_by_status[k] ?? 0), 0) : undefined;
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero */}
      <HeroBanner>
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm animate-slide-in-left">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7ee0b5]" aria-hidden />
            Environmental Intelligence Platform
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl animate-slide-up" style={{ animationDelay: "60ms" }}>
            <span className="text-sheen">Ghat Sentinel</span> — Environmental Intelligence Dashboard
          </h1>
          <p className="max-w-xl text-sm text-white/85 md:text-base animate-slide-up" style={{ animationDelay: "120ms" }}>
            Explore historical water-quality records, understand site-level concerns, and coordinate evidence-backed verification.
          </p>
          <div className="flex flex-wrap gap-2 pt-1 animate-slide-up" style={{ animationDelay: "180ms" }}>
            <Chip tone="info">Historical dataset{meta.data?.year_range ? ` · ${meta.data.year_range[0]}–${meta.data.year_range[1]}` : ""}</Chip>
            <Chip tone="warn">Historical MPPCB samples — not real-time monitoring</Chip>
            <Chip tone="warn">Durga Visarjan: 20 Oct 2026</Chip>
          </div>
        </div>
      </HeroBanner>

      {ov.isError && <ErrorState error={ov.error} onRetry={() => ov.refetch()} />}

      {/* Metric cards with stagger */}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-5 stagger">
        <MetricCard label="Ghats covered" icon={<MapPinned className="h-4 w-4" />} value={ov.data?.total_ghats} loading={ov.isPending} sub="immersion sites" />
        <MetricCard label="Historical readings" icon={<Activity className="h-4 w-4" />} value={ov.data?.total_readings} loading={ov.isPending}
          sub={ov.data && `${ov.data.numeric_readings.toLocaleString("en-IN")} numeric · ${ov.data.missing_readings} missing · ${ov.data.censored_readings} BDL/ND`} />
        <MetricCard label="Outside-criterion" icon={<AlertTriangle className="h-4 w-4" />} tone="bad" value={ov.data?.flagged_readings} suffix={ov.data && `of ${ov.data.evaluated_readings}`}
          loading={ov.isPending} sub={ov.data && `class ${ov.data.cpcb_class}: ${ov.data.intended_use ?? ""}`} />
        <MetricCard label="Ghats needing review" icon={<BarChart3 className="h-4 w-4" />} value={needing} loading={ranked.isPending} sub="high or review priority (ghats, not readings)" />
        <MetricCard label="Open cases" icon={<FolderOpen className="h-4 w-4" />} value={open} loading={ov.isPending} sub="not yet resolved" />
      </section>

      {ov.data && ov.data.data_quality_warnings.length > 0 && (
        <details className="rounded-lg border border-line bg-white p-3 text-sm animate-fade-in">
          <summary className="cursor-pointer font-medium">Data quality notes ({ov.data.data_quality_warnings.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-muted">
            {ov.data.data_quality_warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      <WidgetBoundary name="The season map"><SeasonHeatmap /></WidgetBoundary>

      {/* Main grid */}
      <section className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3 animate-slide-up" style={{ animationDelay: "100ms" }}>
          <CardHeader title="Seasonal trend" subtitle="Each point is a sampling season; there are no exact sample dates in the source." />
          <div className="p-4"><WidgetBoundary name="The trend chart"><TrendExplorer compact /></WidgetBoundary></div>
        </Card>
        <div className="xl:col-span-2 animate-slide-up" style={{ animationDelay: "160ms" }}>
          <WidgetBoundary name="The priority panel"><PriorityPanel /></WidgetBoundary>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 animate-slide-up" style={{ animationDelay: "80ms" }}>
          <WidgetBoundary name="Findings"><FindingsPanel /></WidgetBoundary>
        </div>
        <div className="animate-slide-up" style={{ animationDelay: "140ms" }}>
          <WidgetBoundary name="Recent cases"><RecentCases /></WidgetBoundary>
        </div>
      </section>

      <section aria-label="Quick actions" className="flex flex-wrap gap-2 animate-fade-in" style={{ animationDelay: "200ms" }}>
        <Link href="/intelligence"><Button variant="primary"><Sparkles className="h-4 w-4" aria-hidden />Generate brief</Button></Link>
        <Link href="/analytics#compare"><Button><BarChart3 className="h-4 w-4" aria-hidden />Compare ghats</Button></Link>
        <Button onClick={() => setCaseOpen(true)}><ClipboardPlus className="h-4 w-4" aria-hidden />Create case</Button>
        <Link href="/reports"><Button><FileText className="h-4 w-4" aria-hidden />Generate report</Button></Link>
      </section>

      <CaseDialog open={caseOpen} onClose={() => setCaseOpen(false)} />
    </div>
  );
}
