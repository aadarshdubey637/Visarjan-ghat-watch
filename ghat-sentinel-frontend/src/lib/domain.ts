import type { CaseStatus, ComparisonResult, ComparisonResultKind, CpcbClass, Phase, PriorityLevel, Reading } from "./types";

export const PHASES: Phase[] = ["pre", "during", "after"];
export const FESTIVAL_ORDER: Record<string, number> = { Ganesh: 0, Durga: 1 };
export const PHASE_ORDER: Record<string, number> = { pre: 0, during: 1, after: 2 };
export const CPCB_CLASSES: CpcbClass[] = ["A", "B", "C", "D", "E"];

/** Season = year + festival. Order: year, then Ganesh before Durga. */
export interface SeasonKey { sample_year: number; festival: string }
export const seasonLabel = (s: SeasonKey) => `${s.sample_year} ${s.festival}`;
export const compareSeason = (a: SeasonKey, b: SeasonKey) =>
  a.sample_year - b.sample_year || (FESTIVAL_ORDER[a.festival] ?? 9) - (FESTIVAL_ORDER[b.festival] ?? 9);
export function parseSeason(label: string): SeasonKey {
  const [y, f] = label.split(" ");
  return { sample_year: Number(y), festival: f ?? "" };
}
export const sortSeasonLabels = (labels: string[]) => [...labels].sort((a, b) => compareSeason(parseSeason(a), parseSeason(b)));

export const ASSESSMENT: Record<ComparisonResultKind, { label: string; tone: "good" | "bad" | "warn" | "neutral" }> = {
  within_criterion: { label: "Within criterion", tone: "good" },
  outside_criterion: { label: "Outside criterion", tone: "bad" },
  insufficient_data: { label: "Insufficient data (missing/BDL)", tone: "warn" },
  not_comparable: { label: "No applicable criterion", tone: "neutral" },
};
export const PRIORITY: Record<PriorityLevel, { label: string; tone: "bad" | "warn" | "good" | "neutral" }> = {
  high: { label: "High review priority", tone: "bad" },
  review: { label: "Review", tone: "warn" },
  routine: { label: "Routine", tone: "good" },
  insufficient_data: { label: "Insufficient data", tone: "neutral" },
};
export const PRIORITY_RANK: Record<PriorityLevel, number> = { high: 0, review: 1, routine: 2, insufficient_data: 3 };

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  needs_verification: "Needs verification", under_review: "Under review", action_assigned: "Action assigned", resolved: "Resolved",
};
export const CASE_STATUSES: CaseStatus[] = ["needs_verification", "under_review", "action_assigned", "resolved"];
export const ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  needs_verification: ["under_review"],
  under_review: ["action_assigned", "resolved", "needs_verification"],
  action_assigned: ["under_review", "resolved"],
  resolved: ["under_review"],
};
export const OPEN_STATUSES: CaseStatus[] = ["needs_verification", "under_review", "action_assigned"];

export const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`);
export const fmtNum = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.?0+$/, "");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

/** Value cell text: a number with unit, or the flag text. Never 0 for null. */
export function readingValueText(r: Pick<Reading, "value" | "unit" | "flag" | "value_as_printed">): string {
  if (r.value === null || r.value === undefined) return r.flag ?? r.value_as_printed ?? "not sampled";
  return `${fmtNum(r.value)}${r.unit && r.unit !== "pH" ? ` ${r.unit}` : ""}`; // pH is dimensionless; the unit label would just repeat the parameter
}

const OP_TEXT: Record<string, string> = { "<=": "≤", ">=": "≥", "<": "<", ">": ">", "=": "=" };
export function criterionText(e: Pick<ComparisonResult, "comparison_operator" | "threshold" | "threshold_upper" | "unit"> | null | undefined): string | null {
  if (!e || e.threshold === null || !e.comparison_operator) return null;
  const u = e.unit ? ` ${e.unit}` : "";
  if (e.comparison_operator.startsWith("between")) return `${e.threshold}–${e.threshold_upper}${u} (inclusive)`;
  return `${OP_TEXT[e.comparison_operator] ?? e.comparison_operator} ${e.threshold}${u}`;
}

export interface RefLine { value: number; label: string }
/** Reference lines come ONLY from backend evaluation objects (threshold + operator) of the selected class. */
export function refLinesFromReadings(readings: Pick<Reading, "evaluation">[]): RefLine[] {
  const e = readings.map((r) => r.evaluation).find((x) => x && x.threshold !== null && x.comparison_operator);
  if (!e || e.threshold === null) return [];
  const op = e.comparison_operator ?? "";
  if (op.startsWith("between") && e.threshold_upper !== null) return [{ value: e.threshold, label: `min ${e.threshold}` }, { value: e.threshold_upper, label: `max ${e.threshold_upper}` }];
  return [{ value: e.threshold, label: `CPCB ${criterionText(e)}` }];
}

export const safeHttpsUrl = (u: string | null | undefined): string | null => {
  if (!u) return null;
  try { const url = new URL(u); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
};
