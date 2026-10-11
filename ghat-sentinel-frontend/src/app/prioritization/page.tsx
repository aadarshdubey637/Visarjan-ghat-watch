"use client";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, Drawer, Field, Input, Select } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { PriorityBadge } from "@/components/shared/badges";
import { PriorityExplanation } from "@/components/ghats/priority-explanation";
import { CaseDialog } from "@/components/cases/case-dialog";
import Link from "next/link";
import { CPCB_CLASSES, PRIORITY, pct } from "@/lib/domain";
import { useMetadata, useRanked } from "@/hooks/queries";
import type { CpcbClass, PriorityLevel, RankedGhat } from "@/lib/types";

export default function Prioritization() {
  const meta = useMetadata();
  const [cls, setCls] = useState<CpcbClass>("B"); const [start, setStart] = useState<number | null>(null); const [end, setEnd] = useState<number | null>(null);
  const q = useRanked({ cpcb_class: cls, startYear: start, endYear: end });
  const [search, setSearch] = useState(""); const [band, setBand] = useState<"" | PriorityLevel>(""); const [sort, setSort] = useState<"score" | "name">("score");
  const [open, setOpen] = useState<RankedGhat | null>(null); const [caseFor, setCaseFor] = useState<RankedGhat | null>(null);
  const years = meta.data?.year_range ? Array.from({ length: meta.data.year_range[1] - meta.data.year_range[0] + 1 }, (_, i) => meta.data!.year_range![0] + i) : [];
  const rows = useMemo(() => {
    const items = (q.data?.items ?? []).filter((g) => (!search || g.ghat_name.toLowerCase().includes(search.toLowerCase())) && (!band || g.priority_level === band));
    return items.sort((a, b) => {
      const ai = a.priority_level === "insufficient_data", bi = b.priority_level === "insufficient_data";
      if (ai !== bi) return ai ? 1 : -1;               // insufficient_data always last
      return sort === "name" ? a.ghat_name.localeCompare(b.ghat_name) : (b.priority_score ?? -1) - (a.priority_score ?? -1);
    });
  }, [q.data, search, band, sort]);
  return (
    <div>
      <PageHeader title="Site Prioritization" subtitle="Which ghats to verify first before Durga visarjan (20 October 2026). A review-priority score, not a safety rating." />
      <Card className="mb-4 p-3"><div className="grid gap-3 md:grid-cols-6">
        <Field label="CPCB class" htmlFor="pc"><Select id="pc" value={cls} onChange={(e) => setCls(e.target.value as CpcbClass)}>{CPCB_CLASSES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="From year" htmlFor="ps"><Select id="ps" value={start ?? ""} onChange={(e) => setStart(e.target.value ? Number(e.target.value) : null)}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field>
        <Field label="To year" htmlFor="pe"><Select id="pe" value={end ?? ""} onChange={(e) => setEnd(e.target.value ? Number(e.target.value) : null)}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field>
        <Field label="Search" htmlFor="pq"><Input id="pq" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ghat name" /></Field>
        <Field label="Band" htmlFor="pb"><Select id="pb" value={band} onChange={(e) => setBand(e.target.value as PriorityLevel | "")}><option value="">All</option>{(Object.keys(PRIORITY) as PriorityLevel[]).map((k) => <option key={k} value={k}>{PRIORITY[k].label}</option>)}</Select></Field>
        <Field label="Sort" htmlFor="po"><Select id="po" value={sort} onChange={(e) => setSort(e.target.value as "score" | "name")}><option value="score">Score</option><option value="name">Name</option></Select></Field>
      </div>
        {q.data && <p className="mt-2 text-xs text-ink-muted">Class {q.data.cpcb_class}: {q.data.intended_use ?? "—"}. {q.data.disclaimer}</p>}</Card>
      {q.isPending ? <LoadingState rows={7} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <Card><EmptyState title="No ghats match" /></Card> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><caption className="sr-only">Ranked review priorities</caption>
          <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="p-3">Rank</th><th className="p-3">Ghat</th><th className="p-3">Score</th><th className="p-3">Band</th><th className="p-3">Supporting findings</th><th className="p-3">Completeness</th><th className="p-3">Last sample</th><th className="p-3">Primary reason</th><th className="p-3">Actions</th></tr></thead>
          <tbody>{rows.map((g, i) => (<tr key={g.ghat_id} className="cursor-pointer border-b border-line/60 align-top hover:bg-brand-soft/40" onClick={() => setOpen(g)}>
            <td className="num p-3">{g.priority_level === "insufficient_data" ? "—" : i + 1}</td>
            <td className="p-3 font-medium"><button className="text-left hover:underline" onClick={() => setOpen(g)}>{g.ghat_name}</button></td>
            <td className="num p-3 font-bold">{g.priority_score === null ? "—" : g.priority_score.toFixed(1)}</td><td className="p-3"><PriorityBadge level={g.priority_level} /></td>
            <td className="num p-3">{g.outside_reading_ids.length} of {g.evaluated_reading_count}</td><td className="num p-3">{pct(g.data_completeness, 0)}</td><td className="num p-3">{g.last_sample_year ?? "—"}</td>
            <td className="max-w-xs p-3 text-xs">{g.reasons[0] ?? "—"}</td>
            <td className="p-3" onClick={(e) => e.stopPropagation()}><span className="flex flex-wrap gap-1"><Link href={`/ghats/${g.ghat_id}`}><Button size="sm">Details</Button></Link><Button size="sm" onClick={() => setCaseFor(g)}>Create case</Button><Link href={`/reports?ghat=${g.ghat_id}`}><Button size="sm">Report</Button></Link></span></td></tr>))}</tbody></table></Card>)}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.ghat_name ?? ""}>{open && <PriorityExplanation g={open} method={q.data?.method} disclaimer={q.data?.disclaimer} />}</Drawer>
      <CaseDialog open={!!caseFor} onClose={() => setCaseFor(null)} ghatId={caseFor?.ghat_id} readingIds={caseFor?.outside_reading_ids.slice(0, 5) ?? []} />
    </div>
  );
}
