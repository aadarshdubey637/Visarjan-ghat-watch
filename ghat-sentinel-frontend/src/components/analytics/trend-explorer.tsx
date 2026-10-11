"use client";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LimitationList } from "@/components/shared/evidence";
import { fmtNum } from "@/lib/domain";
import { Field, Select } from "@/components/ui";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { TrendChart } from "@/components/shared/trend-chart";
import { getReadings, getTrends } from "@/lib/api";
import { linesByPhase, type LineInput } from "@/lib/chartdata";
import { PHASES, refLinesFromReadings } from "@/lib/domain";
import { useGhats, useMetadata } from "@/hooks/queries";
import type { Phase } from "@/lib/types";

/** Reference lines for one parameter, taken from a backend-evaluated reading (class B). Empty when no limit applies. */
export function useRefLines(parameter: string | undefined, ghatId: string | undefined, cls = "B") {
  return useQuery({
    queryKey: ["refline", parameter, ghatId, cls],
    queryFn: async ({ signal }) => {
      const page = await getReadings(ghatId!, { parameter, limit: 20, evaluate: true, cpcb_class: cls as "B" }, signal);
      return refLinesFromReadings(page.items);
    },
    enabled: !!parameter && !!ghatId, staleTime: 300_000,
  });
}

export function TrendExplorer({ defaultParameter = "Dissolved oxygen", defaultGhat = "all", lockedGhat, compact }: { defaultParameter?: string; defaultGhat?: string; lockedGhat?: string; compact?: boolean }) {
  const meta = useMetadata(); const ghats = useGhats();
  const [parameter, setParameter] = useState(defaultParameter);
  const [ghat, setGhat] = useState(lockedGhat ?? defaultGhat);
  const [phase, setPhase] = useState<Phase>("during");
  const [startYear, setStartYear] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);
  const years = meta.data?.year_range ? Array.from({ length: meta.data.year_range[1] - meta.data.year_range[0] + 1 }, (_, i) => meta.data!.year_range![0] + i) : [];
  const ids = ghat === "all" ? ghats.data?.items.map((g) => g.id) ?? [] : [ghat];
  const results = useQueries({ queries: ids.map((id) => ({ queryKey: ["trends", id, parameter, startYear, endYear], queryFn: ({ signal }: { signal: AbortSignal }) => getTrends(id, { parameter, startYear, endYear }, signal), staleTime: 60_000 })) });
  const ref = useRefLines(parameter, ids[0]);
  const loading = results.some((r) => r.isPending) || ghats.isPending;
  const failed = results.find((r) => r.isError);
  const unit = results.find((r) => r.data)?.data?.items[0]?.unit ?? meta.data?.parameters.find((p) => p.parameter === parameter)?.unit ?? null;

  const lines: LineInput[] = useMemo(() => {
    if (ghat !== "all") { const pts = results[0]?.data?.items[0]?.series ?? []; return linesByPhase(pts); }
    return results.flatMap((r, i) => {
      const name = ghats.data?.items.find((g) => g.id === ids[i])?.name ?? ids[i];
      const pts = (r.data?.items[0]?.series ?? []).filter((p) => p.phase === phase);
      return pts.length ? [{ id: ids[i], label: name, points: pts }] : [];
    });
  }, [results, ghat, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = ghat === "all" ? `${parameter} by season — all ghats, ${phase} immersion` : `${parameter} by season — ${ghats.data?.items.find((g) => g.id === ghat)?.name ?? ""}`;
  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-5"}`}>
        <Field label="Parameter" htmlFor="tp"><Select id="tp" value={parameter} onChange={(e) => setParameter(e.target.value)}>{meta.data?.parameters.map((p) => <option key={p.parameter} value={p.parameter}>{p.parameter}{p.unit ? ` (${p.unit})` : ""}</option>) ?? <option>{parameter}</option>}</Select></Field>
        {!lockedGhat && <Field label="Ghat" htmlFor="tg"><Select id="tg" value={ghat} onChange={(e) => setGhat(e.target.value)}><option value="all">All ghats</option>{ghats.data?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>}
        {ghat === "all" && <Field label="Phase" htmlFor="tph"><Select id="tph" value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>{PHASES.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>}
        <Field label="From year" htmlFor="ty1"><Select id="ty1" value={startYear ?? ""} onChange={(e) => setStartYear(e.target.value ? Number(e.target.value) : null)}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field>
        <Field label="To year" htmlFor="ty2"><Select id="ty2" value={endYear ?? ""} onChange={(e) => setEndYear(e.target.value ? Number(e.target.value) : null)}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field>
      </div>
      {loading ? <LoadingState rows={6} label="Loading trend data" /> : failed ? <ErrorState error={failed.error} onRetry={() => results.forEach((r) => r.refetch())} /> :
        <TrendChart title={title} parameter={parameter} unit={unit} lines={lines} refLines={ref.data ?? []} height={compact ? 260 : 320} />}
      {ghat !== "all" && !loading && !failed && results[0]?.data?.items[0] && (() => { const t = results[0].data!.items[0]; return (
        <div className="space-y-2">
          <ul className="space-y-1 text-sm">{t.trend_summaries.map((s) => (
            <li key={`${s.festival}-${s.phase}`} className="rounded-md border border-line p-2">
              <b>{s.festival}, {s.phase}:</b>{" "}
              {s.supported ? <>first <span className="num">{fmtNum(s.first_value)}</span> → last <span className="num">{fmtNum(s.last_value)}</span>{unit ? ` ${unit}` : ""}, change <span className="num">{s.change === null ? "—" : (s.change > 0 ? "+" : "") + fmtNum(s.change)}</span>{s.direction ? `, ${s.direction}` : ""} — descriptive only, {s.observation_count} seasons, no significance test.</> : <span className="text-ink-muted">No trend supported: {s.limitations[0] ?? "too few observations."}</span>}
            </li>))}</ul>
          <LimitationList items={t.limitations} />
        </div>); })()}
    </div>
  );
}
