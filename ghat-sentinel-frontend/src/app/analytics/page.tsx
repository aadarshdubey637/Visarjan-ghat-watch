"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardHeader } from "@/components/ui";
import { WidgetBoundary } from "@/components/shared/states";
import { TrendExplorer } from "@/components/analytics/trend-explorer";
import { BenchmarkPanel, CompletenessPanel, ComparePanel, OutlookPanel } from "@/components/analytics/panels";

function Content() {
  const sp = useSearchParams();
  const initial = (sp.get("ghats") ?? "").split(",").filter(Boolean);
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Analytics & Trends" subtitle="Seasonal trends, ghat comparison, statewide benchmark, data completeness and the October 20 outlook, all from historical MPPCB records." />
      <Card><CardHeader title="Trend explorer" /><div className="p-4"><WidgetBoundary name="Trend explorer"><TrendExplorer /></WidgetBoundary></div></Card>
      <WidgetBoundary name="Comparison"><ComparePanel initial={initial} /></WidgetBoundary>
      <WidgetBoundary name="Benchmark"><BenchmarkPanel /></WidgetBoundary>
      <WidgetBoundary name="Completeness"><CompletenessPanel /></WidgetBoundary>
      <WidgetBoundary name="Outlook"><OutlookPanel /></WidgetBoundary>
    </div>
  );
}
export default function AnalyticsPage() { return <Suspense fallback={null}><Content /></Suspense>; }
