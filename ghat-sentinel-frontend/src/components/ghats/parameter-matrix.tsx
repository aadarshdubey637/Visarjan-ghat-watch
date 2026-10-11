"use client";
import { AlertTriangle, CheckCircle2, Info, MinusCircle } from "lucide-react";
import { AssessmentBadge } from "@/components/shared/badges";
import { PHASES, criterionText, readingValueText } from "@/lib/domain";
import type { ComparisonResultKind, Phase, Reading } from "@/lib/types";

const SEVERITY: Record<ComparisonResultKind, number> = { outside_criterion: 0, insufficient_data: 1, within_criterion: 2, not_comparable: 3 };
const CELL: Record<ComparisonResultKind, { cls: string; Icon: typeof Info; label: string }> = {
  outside_criterion: { cls: "border-critical/30 bg-critical-soft text-critical", Icon: AlertTriangle, label: "Outside criterion" },
  within_criterion: { cls: "border-brand/25 bg-brand-soft text-brand", Icon: CheckCircle2, label: "Within criterion" },
  insufficient_data: { cls: "border-caution/30 bg-caution-soft text-caution", Icon: MinusCircle, label: "Insufficient data" },
  not_comparable: { cls: "border-line bg-canvas text-ink-muted", Icon: Info, label: "No applicable criterion" },
};

interface Row { parameter: string; unit: string | null; byPhase: Partial<Record<Phase, Reading>>; criterion: string | null; worst: ComparisonResultKind; period: string }

export function buildMatrix(readings: Reading[]): Row[] {
  const map = new Map<string, Row>();
  for (const r of readings) {
    const row = map.get(r.parameter) ?? { parameter: r.parameter, unit: r.unit, byPhase: {}, criterion: null, worst: "not_comparable" as ComparisonResultKind, period: r.sample_period.replace(/ \(.*\)$/, "") };
    row.byPhase[r.phase] = r;
    row.criterion ??= criterionText(r.evaluation);
    const k = r.evaluation?.result ?? "not_comparable";
    if (SEVERITY[k] < SEVERITY[row.worst] || (row.worst === "not_comparable" && k !== "not_comparable")) row.worst = k;
    map.set(r.parameter, row);
  }
  return [...map.values()];
}

export function ParameterMatrix({ readings, sortBy, highlight }: { readings: Reading[]; sortBy: "parameter" | "result"; highlight?: string | null }) {
  const rows = buildMatrix(readings).sort((a, b) => sortBy === "result" ? SEVERITY[a.worst] - SEVERITY[b.worst] || a.parameter.localeCompare(b.parameter) : a.parameter.localeCompare(b.parameter));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-ink-muted">
          <th className="px-3 py-2 font-medium">Parameter</th>
          {PHASES.map((p) => <th key={p} className="px-2 py-2 font-medium capitalize">{p === "during" ? "During" : p === "pre" ? "Before" : "One week after"}</th>)}
          <th className="px-3 py-2 font-medium">CPCB limit</th><th className="px-3 py-2 font-medium">Overall</th></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.parameter} className="border-b border-line/60 align-middle animate-fade-in" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
              <td className="px-3 py-2"><span className="font-medium">{row.parameter}</span><span className="block text-xs text-ink-muted">{row.period}</span></td>
              {PHASES.map((ph) => {
                const r = row.byPhase[ph];
                if (!r) return <td key={ph} className="px-2 py-2 text-xs text-ink-muted">—</td>;
                const k = r.evaluation?.result ?? "not_comparable"; const c = CELL[k];
                return (
                  <td key={ph} className="px-2 py-1.5">
                    <span id={r.id} tabIndex={0} title={`${r.evaluation?.reason ?? c.label}\n${r.source_file} · row ${r.source_record_id}${r.source_page ? ` · PDF p.${r.source_page}` : ""}`}
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium num ${c.cls} ${highlight === r.id ? "ring-2 ring-caution" : ""}`}>
                      <c.Icon className="h-3 w-3 shrink-0" aria-hidden /><span className="sr-only">{c.label}: </span>{readingValueText(r)}
                    </span>
                  </td>
                );
              })}
              <td className="num px-3 py-2 text-xs">{row.criterion ?? <span className="text-ink-muted">No class limit</span>}</td>
              <td className="px-3 py-2"><AssessmentBadge result={row.worst} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-ink-muted">No readings.</td></tr>}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-ink-muted">Hover or focus a value for its explanation and source (file, row, PDF page). &quot;Overall&quot; is the most severe backend assessment among the three phases. Flags such as BDL or &quot;not sampled&quot; are shown as printed, never as zero.</p>
    </div>
  );
}
