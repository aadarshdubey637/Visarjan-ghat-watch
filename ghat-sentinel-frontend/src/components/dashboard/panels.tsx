"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, CardHeader, Button } from "@/components/ui";
import { EmptyState, QueryBoundary, LoadingState, ErrorState } from "@/components/shared/states";
import { AssessmentBadge, PriorityBadge } from "@/components/shared/badges";
import { EvidenceLink } from "@/components/shared/evidence";
import { CaseDialog } from "@/components/cases/case-dialog";
import { CASE_STATUS_LABEL, criterionText, fmtDateTime, fmtNum, PRIORITY_RANK } from "@/lib/domain";
import { useCases, useFindings, useGhats, useRanked } from "@/hooks/queries";
import type { Finding } from "@/lib/types";

export function PriorityPanel({ limit }: { limit?: number }) {
  const q = useRanked();
  return (
    <Card>
      <CardHeader title="Priority review panel" subtitle="Project-defined review-priority score (0–100). Not an official CPCB index and not a probability of contamination." action={<Link href="/prioritization" className="text-xs font-medium text-brand hover:underline">Full ranking</Link>} />
      <QueryBoundary query={q}>{(d) => {
        const items = [...d.items].sort((a, b) => PRIORITY_RANK[a.priority_level] - PRIORITY_RANK[b.priority_level] || (b.priority_score ?? -1) - (a.priority_score ?? -1)).slice(0, limit ?? 20);
        if (!items.length) return <EmptyState title="No ghats ranked" />;
        return (
          <ol className="divide-y divide-line">
            {items.map((g, i) => (
              <li key={g.ghat_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="num w-5 text-sm font-semibold text-ink-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/ghats/${g.ghat_id}`} className="block truncate text-sm font-medium hover:underline">{g.ghat_name}</Link>
                  <p className="text-xs text-ink-muted"><span className="num">{g.outside_reading_ids.length}</span> supporting findings · last sample {g.last_sample_year ?? "—"}</p>
                </div>
                <span className="num text-sm font-bold">{g.priority_score === null ? "—" : g.priority_score.toFixed(1)}</span>
                <PriorityBadge level={g.priority_level} />
              </li>
            ))}
          </ol>
        );
      }}</QueryBoundary>
      <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">How the score works: <Link className="text-brand hover:underline" href="/methodology">Data & Methodology</Link></p>
    </Card>
  );
}

export function FindingsPanel({ limit = 5 }: { limit?: number }) {
  const q = useFindings({ cpcb_class: "B", limit });
  const [target, setTarget] = useState<Finding | null>(null);
  return (
    <Card>
      <CardHeader title="Important findings" subtitle="Readings outside the applied CPCB class B limit, largest relative exceedance first." />
      {q.isPending ? <LoadingState rows={5} label="Loading evaluated readings" /> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> :
        q.data.items.length === 0 ? <EmptyState title="No readings outside the applied criteria" body="This is a statement about the available records only." /> : (
          <ul className="divide-y divide-line">
            {q.data.items.slice(0, limit).map((f) => {
              const e = f.reading.evaluation;
              return (
                <li key={f.reading.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{f.ghat_name}</span><AssessmentBadge result={e?.result} /></div>
                  <p className="num text-sm"><b>{f.reading.parameter}</b>: {fmtNum(f.reading.value)} {f.reading.unit} <span className="text-ink-muted">— limit {criterionText(e) ?? "n/a"} · {f.reading.sample_period}</span></p>
                  {e?.reason && <p className="text-xs text-ink-muted">{e.reason}</p>}
                  <div className="flex items-center gap-3"><EvidenceLink ghatId={f.ghat_id} readingId={f.reading.id} /><button className="text-xs font-medium text-brand hover:underline" onClick={() => setTarget(f)}>Create case</button></div>
                </li>
              );
            })}
          </ul>
        )}
      <CaseDialog open={!!target} onClose={() => setTarget(null)} ghatId={target?.ghat_id} readingIds={target ? [target.reading.id] : []} suggestedAction={target ? `Verify the recorded ${target.reading.parameter} measurement against the MPPCB report` : undefined} />
    </Card>
  );
}

export function RecentCases() {
  const q = useCases({ limit: 5 }); const ghats = useGhats();
  const name = (id: string) => ghats.data?.items.find((g) => g.id === id)?.name ?? id;
  return (
    <Card>
      <CardHeader title="Recent field activity" action={<Link href="/cases" className="text-xs font-medium text-brand hover:underline">All cases</Link>} />
      <QueryBoundary query={q}>{(d) => d.items.length === 0 ? <EmptyState title="No verification cases yet" body="Open a finding or a ghat and choose Create case." action={<Link href="/cases"><Button size="sm" variant="primary">Go to cases</Button></Link>} /> : (
        <ul className="divide-y divide-line">{d.items.map((c) => (
          <li key={c.id} className="px-4 py-2.5"><Link href={`/cases/${c.id}`} className="text-sm font-medium hover:underline">{name(c.ghat_id)}</Link>
            <p className="text-xs text-ink-muted">{CASE_STATUS_LABEL[c.status]} · updated {fmtDateTime(c.updated_at)}</p></li>))}</ul>
      )}</QueryBoundary>
    </Card>
  );
}
