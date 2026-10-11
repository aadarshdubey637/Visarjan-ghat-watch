import { compareSeason, seasonLabel, sortSeasonLabels, parseSeason, PHASE_ORDER } from "./domain";
import type { Phase, TrendPoint } from "./types";

export interface LineInput { id: string; label: string; points: TrendPoint[] }
export interface ChartRow { season: string; [k: string]: string | number | null }
export interface Gap { line: string; season: string; period: string; flag: string }

/** Rows keyed by season; null stays null (rendered as a gap, never zero). */
export function buildSeasonRows(lines: LineInput[]): { rows: ChartRow[]; gaps: Gap[]; seasons: string[] } {
  const seasons = sortSeasonLabels(Array.from(new Set(lines.flatMap((l) => l.points.map((p) => seasonLabel(p))))));
  const gaps: Gap[] = [];
  const rows: ChartRow[] = seasons.map((season) => {
    const row: ChartRow = { season };
    for (const l of lines) {
      const p = l.points.find((x) => seasonLabel(x) === season);
      row[l.id] = p ? p.value : null;
      row[`${l.id}__flag`] = p?.flag ?? null;
      row[`${l.id}__page`] = p?.source_page ?? null;
      row[`${l.id}__period`] = p?.sample_period ?? null;
      if (p && p.value === null) gaps.push({ line: l.label, season, period: p.sample_period, flag: p.flag ?? "no value" });
    }
    return row;
  });
  return { rows, gaps, seasons };
}

/** Group a single ghat's trend series into one line per phase, ordered pre/during/after. */
export function linesByPhase(points: TrendPoint[]): LineInput[] {
  const phases = Array.from(new Set(points.map((p) => p.phase))).sort((a, b) => (PHASE_ORDER[a] ?? 9) - (PHASE_ORDER[b] ?? 9)) as Phase[];
  return phases.map((ph) => ({ id: ph, label: ph, points: points.filter((p) => p.phase === ph) }));
}
export { compareSeason, parseSeason };
