"use client";
import { useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardHeader, Chip, Field, Input, Select } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { AssessmentBadge } from "@/components/shared/badges";
import { LimitationList } from "@/components/shared/evidence";
import { TrendChart } from "@/components/shared/trend-chart";
import { useRefLines } from "@/components/analytics/trend-explorer";
import { getGhat, getReadings, getTrends } from "@/lib/api";
import { fmtNum, pct, sortSeasonLabels } from "@/lib/domain";
import { useBenchmark, useGhats, useMetadata, useOutlook } from "@/hooks/queries";
import type { StatBlock } from "@/lib/types";

export function ComparePanel({ initial }: { initial: string[] }) {
  const ghats = useGhats(); const meta = useMetadata();
  const [sel, setSel] = useState<string[]>(initial);
  const [parameter, setParameter] = useState("Dissolved oxygen");
  const ids = sel;
  const trends = useQueries({ queries: ids.map((id) => ({ queryKey: ["trends", id, parameter, null, null], queryFn: ({ signal }: { signal: AbortSignal }) => getTrends(id, { parameter }, signal) })) });
  const latest = useQueries({ queries: ids.map((id) => ({ queryKey: ["latest-during", id, parameter], queryFn: ({ signal }: { signal: AbortSignal }) => getReadings(id, { parameter, evaluate: true, limit: 100 }, signal) })) });
  const ref = useRefLines(parameter, ids[0]);
  const name = (id: string) => ghats.data?.items.find((g) => g.id === id)?.name ?? id;
  const unit = trends.find((t) => t.data)?.data?.items[0]?.unit ?? null;
  const lines = trends.flatMap((t, i) => { const pts = (t.data?.items[0]?.series ?? []).filter((p) => p.phase === "during"); return pts.length ? [{ id: ids[i], label: name(ids[i]), points: pts }] : []; });
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Card id="compare"><CardHeader title="Ghat comparison" subtitle="Select two or more ghats and one parameter. Lines show the 'during immersion' phase; parameters are never mixed on one axis." />
      <div className="space-y-4 p-4">
        <Field label="Parameter" htmlFor="cmp-p"><Select id="cmp-p" value={parameter} onChange={(e) => setParameter(e.target.value)}>{meta.data?.parameters.map((p) => <option key={p.parameter}>{p.parameter}</option>)}</Select></Field>
        <fieldset><legend className="mb-1 text-xs font-medium">Ghats</legend><div className="flex flex-wrap gap-2">{ghats.data?.items.map((g) => (
          <label key={g.id} className={`flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs ${sel.includes(g.id) ? "border-brand bg-brand-soft" : "border-line"}`}><input type="checkbox" className="sr-only" checked={sel.includes(g.id)} onChange={() => toggle(g.id)} />{g.name}</label>))}</div></fieldset>
        {ids.length < 2 ? <EmptyState title="Select at least two ghats to compare" /> : trends.some((t) => t.isPending) ? <LoadingState rows={5} /> : trends.find((t) => t.isError) ? <ErrorState error={trends.find((t) => t.isError)!.error} /> : (<>
          <TrendChart title={`${parameter} by season — selected ghats, during immersion`} parameter={parameter} unit={unit} lines={lines} refLines={ref.data ?? []} />
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><caption className="sr-only">Comparison summary</caption><thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-2 pr-3">Ghat</th><th className="pr-3">Samples</th><th className="pr-3">Missing</th><th className="pr-3">Years</th><th className="pr-3">Latest “during” value</th><th>Assessment</th></tr></thead>
            <tbody>{ids.map((id, i) => { const t = trends[i].data?.items[0]; const rs = (latest[i].data?.items ?? []).filter((r) => r.phase === "during").sort((a, b) => b.sample_year - a.sample_year); const l = rs[0];
              return <tr key={id} className="border-b border-line/60"><td className="py-2 pr-3 font-medium">{name(id)}</td><td className="num pr-3">{t?.sample_count ?? "—"}</td><td className="num pr-3">{t?.missing_count ?? "—"}</td><td className="num pr-3">{t?.start_year}–{t?.end_year}</td>
                <td className="num pr-3">{l ? (l.value === null ? l.flag ?? "no value" : `${fmtNum(l.value)} ${l.unit ?? ""}`) : "—"}{l ? ` (${l.sample_period})` : ""}</td><td>{l ? <AssessmentBadge result={l.evaluation?.result} /> : "—"}</td></tr>; })}</tbody></table></div></>)}
      </div></Card>
  );
}

function Stat({ b, unit }: { b: StatBlock | null; unit: string | null }) {
  if (!b) return null;
  const rows: [string, string][] = [["Samples (n)", String(b.sample_count)], ["Sites", b.site_count === null ? "—" : String(b.site_count)], ["Median", fmtNum(b.median)], ["Mean", fmtNum(b.mean)], ["p25 / p75", `${fmtNum(b.p25)} / ${fmtNum(b.p75)}`], ["Min / max", `${fmtNum(b.min)} / ${fmtNum(b.max)}`], ["Exceedance rate", b.exceedance_rate === null ? "n/a" : `${pct(b.exceedance_rate, 1)} (${b.exceedance_count})`], ["Years", b.years.join(", ")], ["Excluded missing / BDL / dup", `${b.excluded_missing} / ${b.excluded_censored} / ${b.excluded_duplicates}`]];
  return (<div className="rounded-md border border-line p-3"><p className="mb-2 text-sm font-semibold">{b.label}{unit ? <span className="ml-1 text-xs font-normal text-ink-muted">({unit})</span> : null}</p><dl className="space-y-1 text-xs">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-ink-muted">{k}</dt><dd className="num text-right">{v}</dd></div>)}</dl></div>);
}

export function BenchmarkPanel() {
  const meta = useMetadata();
  const [parameter, setParameter] = useState("Dissolved oxygen"); const [year, setYear] = useState(""); const [region, setRegion] = useState(""); const [phase, setPhase] = useState("");
  const q = useBenchmark({ parameter, year: year ? Number(year) : undefined, region: region || undefined, phase: phase || undefined });
  const years = meta.data?.year_range ? Array.from({ length: meta.data.year_range[1] - meta.data.year_range[0] + 1 }, (_, i) => meta.data!.year_range![0] + i) : [];
  return (
    <Card id="benchmark"><CardHeader title="Statewide benchmark" subtitle="Descriptive statistics only. Not a ranking: this page never calls Bhopal best or worst." />
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Parameter" htmlFor="b-p"><Select id="b-p" value={parameter} onChange={(e) => setParameter(e.target.value)}>{meta.data?.parameters.map((p) => <option key={p.parameter}>{p.parameter}</option>)}</Select></Field>
          <Field label="Year" htmlFor="b-y"><Select id="b-y" value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field>
          <Field label="Phase" htmlFor="b-ph"><Select id="b-ph" value={phase} onChange={(e) => setPhase(e.target.value)}><option value="">All phases</option><option>pre</option><option>during</option><option>after</option></Select></Field>
          <Field label="Region (optional)" htmlFor="b-r"><Input id="b-r" list="regions" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="R.O. Bhopal" /><datalist id="regions"><option value="R.O. Bhopal" /></datalist></Field>
        </div>
        {q.isPending ? <LoadingState rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (<>
          {!q.data.comparable && <p className="rounded-md bg-caution-soft p-3 text-sm text-caution">No comparison could be made for this selection. The backend&apos;s reasons are listed below.</p>}
          {q.data.criterion_applied && <p className="text-xs">Criterion applied: {q.data.criterion_applied}</p>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Stat b={q.data.bhopal} unit={q.data.unit} /><Stat b={q.data.statewide} unit={q.data.unit} /><Stat b={q.data.statewide_excluding_bhopal_office} unit={q.data.unit} /><Stat b={q.data.region_stats} unit={q.data.unit} /></div>
          <p className="text-xs text-ink-muted"><b>Aggregation:</b> {q.data.aggregation_method}</p>
          <p className="text-xs text-ink-muted"><b>Missing-data exclusions:</b> {Object.entries(q.data.missing_data_exclusions).map(([k, v]) => `${k}: ${v}`).join("; ") || "none"}</p>
          <p className="text-xs text-ink-muted"><b>Source coverage:</b> {Object.entries(q.data.source_coverage).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ") || "—"}</p>
          <LimitationList title="Warnings" items={q.data.warnings} /><LimitationList items={q.data.limitations} /></>)}
      </div></Card>
  );
}

export function CompletenessPanel() {
  const ghats = useGhats();
  const ds = useQueries({ queries: (ghats.data?.items ?? []).map((g) => ({ queryKey: ["ghat", g.id, undefined], queryFn: ({ signal }: { signal: AbortSignal }) => getGhat(g.id, undefined, signal), staleTime: 300_000 })) });
  const seasons = useMemo(() => sortSeasonLabels(Array.from(new Set(ds.flatMap((d) => [...(d.data?.data_quality.seasons_covered ?? []), ...(d.data?.data_quality.seasons_missing ?? [])])))), [ds]);
  return (
    <Card id="completeness"><CardHeader title="Data completeness" subtitle="Which seasons have records for each ghat. A missing season is unknown, not clean." />
      {ds.some((d) => d.isPending) ? <LoadingState rows={5} /> : (<div className="overflow-x-auto p-4"><table className="w-full min-w-[640px] text-sm"><caption className="sr-only">Ghat by season coverage</caption>
        <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-2 pr-3">Ghat</th><th className="pr-3">Completeness</th><th className="pr-3">Numeric / missing / BDL</th>{seasons.map((s) => <th key={s} className="pr-2 text-center">{s}</th>)}</tr></thead>
        <tbody>{ds.map((d) => { const g = d.data; if (!g) return null; return (<tr key={g.id} className="border-b border-line/60"><td className="py-2 pr-3 font-medium">{g.name}</td><td className="num pr-3">{pct(g.data_quality.completeness, 1)}</td><td className="num pr-3">{g.data_quality.numeric_count} / {g.data_quality.missing_count} / {g.data_quality.censored_count}</td>
          {seasons.map((s) => { const has = g.data_quality.seasons_covered.includes(s); return <td key={s} className="text-center">{has ? <Chip tone="good">Recorded</Chip> : <Chip tone="warn">No data</Chip>}</td>; })}</tr>); })}</tbody></table></div>)}
    </Card>
  );
}

export function OutlookPanel() {
  const ghats = useGhats(); const meta = useMetadata();
  const [ghat, setGhat] = useState(""); const [parameter, setParameter] = useState("Dissolved oxygen");
  const q = useOutlook({ ghat_id: ghat || undefined, parameter, year: 2026 });
  return (
    <Card id="outlook"><CardHeader title="October 20 outlook" subtitle="A forecast is only shown when the backend has enough comparable seasons. Otherwise this is a historical comparison." />
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Ghat" htmlFor="o-g"><Select id="o-g" value={ghat} onChange={(e) => setGhat(e.target.value)}><option value="">All ghats (pooled)</option>{ghats.data?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <Field label="Parameter" htmlFor="o-p"><Select id="o-p" value={parameter} onChange={(e) => setParameter(e.target.value)}>{meta.data?.parameters.map((p) => <option key={p.parameter}>{p.parameter}</option>)}</Select></Field></div>
        {q.isPending ? <LoadingState rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (() => { const d = q.data; return (<>
          <p className="text-sm">Target date <b className="num">{d.target_date}</b> · status <Chip tone={d.is_prediction ? "warn" : "neutral"}>{d.forecast_status.replace("_", " ")}</Chip></p>
          {d.is_prediction && d.prediction !== null ? (<div className="rounded-md border border-caution/30 bg-caution-soft p-3"><Chip tone="warn">Experimental — not an observed reading</Chip>
            <p className="num mt-2 text-2xl font-bold">{fmtNum(d.prediction)} {d.unit}</p><p className="text-xs">{d.method} · n={d.historical_sample_count}{d.uncertainty ? ` · range ${fmtNum(d.uncertainty.lower)}–${fmtNum(d.uncertainty.upper)} (${d.uncertainty.method})` : ""}</p></div>)
            : <p className="rounded-md bg-canvas p-3 text-sm">{d.forecast_status === "insufficient_data" ? "There is not enough data for any outlook." : "No forecast is shown: a forecast would not be defensible with this few seasons. Past Durga “during” values are shown instead."}</p>}
          {d.historical_values.length > 0 && <TrendChart title={`${d.parameter} — past Durga values`} parameter={d.parameter} unit={d.unit} height={200}
            lines={[{ id: "v", label: "Durga (during)", points: d.historical_values.map((v) => ({ reading_id: v.reading_ids[0] ?? "", sample_year: v.sample_year, festival: v.festival, phase: v.phase, sample_period: `${v.sample_year} ${v.festival} (${v.phase})`, value: v.value, flag: v.flag, source_page: null })) }]} />}
          <LimitationList title="Assumptions" items={d.assumptions} /><LimitationList items={d.limitations} /></>); })()}
      </div></Card>
  );
}
