import Link from "next/link";
import type { RankedGhat } from "@/lib/types";
import { PriorityBadge } from "@/components/shared/badges";
import { LimitationList } from "@/components/shared/evidence";

export function PriorityExplanation({ g, method, disclaimer }: { g: RankedGhat; method?: string; disclaimer?: string }) {
  const insufficient = g.priority_level === "insufficient_data";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><span className="num text-3xl font-bold">{g.priority_score === null ? "—" : g.priority_score.toFixed(1)}</span><span className="text-xs text-ink-muted">/ 100</span><PriorityBadge level={g.priority_level} /></div>
      {insufficient && <p className="rounded-md bg-canvas p-2 text-sm">The evidence does not support a classification for this site. This is not a low-risk rating.</p>}
      {method && <p className="text-xs text-ink-muted">{method}</p>}
      <ul className="space-y-3">
        {g.factors.map((f) => (
          <li key={f.name}>
            <div className="flex justify-between text-sm"><span className="font-medium">{f.label}</span><span className="num">{f.points} / {f.max_points}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-line" role="img" aria-label={`${f.label}: ${f.points} of ${f.max_points} points`}><div className="h-full bg-brand" style={{ width: `${Math.min(100, (f.points / f.max_points) * 100)}%` }} /></div>
            <p className="mt-1 text-xs text-ink-muted">{f.explanation}{f.raw_value !== null && <> (raw value <span className="num">{f.raw_value}</span>)</>}</p>
          </li>
        ))}
      </ul>
      {g.reasons.length > 0 && <div><p className="text-xs font-semibold">Reasons</p><ul className="list-disc pl-4 text-sm">{g.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
      <LimitationList items={g.limitations} />
      {disclaimer && <p className="text-xs text-ink-muted">{disclaimer}</p>}
      <p className="text-xs">Scoring definitions: <Link href="/methodology" className="text-brand hover:underline">Data & Methodology</Link></p>
    </div>
  );
}
