"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { useAuth } from "@/components/auth-provider";
import { getFindings, getGhat } from "@/lib/api";
import { useRanked } from "@/hooks/queries";
import { sortSeasonLabels } from "@/lib/domain";

/** Colour steps for "readings outside the limit" per ghat and season. Counts come from the backend's evaluated findings. */
const STEPS = [
  { min: 1, cls: "bg-[#F4D9A8] text-[#6B430A]" },
  { min: 3, cls: "bg-[#E9A23B] text-[#4A2D05]" },
  { min: 6, cls: "bg-[#C8501D] text-white" },
  { min: 10, cls: "bg-[#8E2A12] text-white" },
];
const stepFor = (n: number) => [...STEPS].reverse().find((s) => n >= s.min)?.cls;

export function SeasonHeatmap() {
  const { staff } = useAuth();
  const ranked = useRanked();
  const ghats = useMemo(() => ranked.data?.items ?? [], [ranked.data]);
  // Findings come 100 per page; fetch both pages (there are fewer than 200 for the current data).
  const pages = useQueries({ queries: [0, 100].map((offset) => ({ queryKey: ["findings", { limit: 100, offset, cpcb_class: "B", all: true }], queryFn: ({ signal }: { signal: AbortSignal }) => getFindings({ cpcb_class: "B", limit: 100, offset }, signal), enabled: staff, staleTime: 60_000 })) });
  const details = useQueries({ queries: ghats.map((g) => ({ queryKey: ["ghat", g.ghat_id, "B"], queryFn: ({ signal }: { signal: AbortSignal }) => getGhat(g.ghat_id, "B", signal), enabled: staff, staleTime: 300_000 })) });

  const model = useMemo(() => {
    const counts = new Map<string, number>(); const seasons = new Set<string>(); const missing = new Map<string, Set<string>>();
    for (const p of pages) for (const f of p.data?.items ?? []) {
      const s = `${f.reading.sample_year} ${f.reading.festival}`; seasons.add(s);
      const k = `${f.ghat_id}|${s}`; counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    details.forEach((d, i) => { if (!d.data) return; d.data.data_quality.seasons_covered.forEach((s) => seasons.add(s)); d.data.data_quality.seasons_missing.forEach((s) => seasons.add(s)); missing.set(ghats[i].ghat_id, new Set(d.data.data_quality.seasons_missing)); });
    return { counts, missing, seasons: sortSeasonLabels([...seasons]) };
  }, [pages, details, ghats]);

  const loading = ranked.isPending || pages.some((p) => p.isPending) || details.some((d) => d.isPending);
  const err = ranked.error ?? pages.find((p) => p.isError)?.error ?? details.find((d) => d.isError)?.error;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Where concerns concentrate" subtitle="Readings outside the CPCB class B limit, by ghat and sampling season. Counts come from the backend's criterion checks." />
      {loading ? <LoadingState rows={6} label="Building the season map" /> : err ? <div className="p-4"><ErrorState error={err} /></div> : (
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
            <thead><tr><th className="w-48 text-left font-medium text-ink-muted" scope="col"><span className="sr-only">Ghat</span></th>
              {model.seasons.map((s) => <th key={s} scope="col" className="pb-1 text-center font-medium text-ink-muted">{s.replace(" ", " ")}</th>)}</tr></thead>
            <tbody>
              {ghats.map((g) => (
                <tr key={g.ghat_id}>
                  <th scope="row" className="pr-2 text-left font-medium"><Link href={`/ghats/${g.ghat_id}`} className="line-clamp-1 hover:underline">{g.ghat_name}</Link></th>
                  {model.seasons.map((s, i) => {
                    const n = model.counts.get(`${g.ghat_id}|${s}`) ?? 0; const gap = model.missing.get(g.ghat_id)?.has(s);
                    return (
                      <td key={s} className="p-0">
                        {gap ? (
                          <span title={`${g.ghat_name} · ${s}: no data in the source reports`} className="flex h-9 items-center justify-center rounded-md border border-dashed border-line bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,#E4E0D3_4px,#E4E0D3_5px)] text-[10px] text-ink-muted">no data</span>
                        ) : (
                          <Link href={`/ghats/${g.ghat_id}`} title={`${g.ghat_name} · ${s}: ${n} reading${n === 1 ? "" : "s"} outside the limit`} aria-label={`${g.ghat_name}, ${s}: ${n} readings outside the limit`}
                            className={`heat-cell flex h-9 items-center justify-center rounded-md font-semibold num ${n ? stepFor(n) : "bg-brand-soft text-brand"}`} style={{ animationDelay: `${i * 40}ms` }}>{n || "0"}</Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted" aria-label="Legend">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-brand-soft" />0 outside the limit</span>
            {STEPS.map((s) => <span key={s.min} className="flex items-center gap-1"><span className={`inline-block h-3 w-5 rounded ${s.cls.split(" ")[0]}`} />{s.min}+</span>)}
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded border border-dashed border-line" />no data in the reports</span>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">A zero means no evaluable reading was outside the limit in that season. It does not mean the water was good: only pH, dissolved oxygen and BOD are compared with class B limits, and missing or below-detection values are not counted.</p>
        </div>
      )}
    </Card>
  );
}
