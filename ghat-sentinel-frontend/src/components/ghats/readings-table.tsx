"use client";
import { Button, Select } from "@/components/ui";
import { AssessmentBadge } from "@/components/shared/badges";
import { SourceLine } from "@/components/shared/evidence";
import { criterionText, readingValueText } from "@/lib/domain";
import type { Reading } from "@/lib/types";

export function ReadingRows({ rows, highlight }: { rows: Reading[]; highlight?: string | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-ink-muted">
          <th className="px-3 py-2">Parameter</th><th className="px-3 py-2">Phase</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Sample period</th>
          <th className="px-3 py-2">Applicable criterion</th><th className="px-3 py-2">Assessment</th><th className="px-3 py-2">Evidence</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const crit = criterionText(r.evaluation);
            return (
              <tr key={r.id} id={r.id} className={`border-b border-line/60 align-top ${highlight === r.id ? "bg-caution-soft" : ""}`}>
                <td className="px-3 py-2 font-medium">{r.parameter}</td>
                <td className="px-3 py-2">{r.phase}</td>
                <td className="num px-3 py-2">{readingValueText(r)}{r.value === null && <span className="ml-1 text-xs text-ink-muted">(no value)</span>}</td>
                <td className="px-3 py-2">{r.sample_period}</td>
                <td className="num px-3 py-2">{crit ?? <span className="text-ink-muted">No CPCB class B limit</span>}</td>
                <td className="px-3 py-2"><AssessmentBadge result={r.evaluation?.result} /></td>
                <td className="px-3 py-2"><code className="text-xs">{r.id}</code><br /><SourceLine r={r} /></td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-ink-muted">No readings for this selection.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (o: number) => void }) {
  const end = Math.min(offset + limit, total);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-ink-muted">
      <span className="num">{total === 0 ? "0" : `${offset + 1}–${end}`} of {total}</span>
      <span className="flex gap-2"><Button size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button><Button size="sm" disabled={end >= total} onClick={() => onChange(offset + limit)}>Next</Button></span>
    </div>
  );
}
export function ParamSelect({ value, onChange, options, id }: { value: string; onChange: (v: string) => void; options: string[]; id: string }) {
  return <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}><option value="">All parameters</option>{options.map((o) => <option key={o}>{o}</option>)}</Select>;
}
