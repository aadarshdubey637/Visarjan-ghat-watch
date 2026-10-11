"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FileText, MessageSquare, ClipboardPlus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, CardHeader, Chip, Field, Select } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState, WidgetBoundary } from "@/components/shared/states";
import { AssessmentBadge, PriorityBadge } from "@/components/shared/badges";
import { EvidenceLink, LimitationList } from "@/components/shared/evidence";
import { TrendExplorer } from "@/components/analytics/trend-explorer";
import { PriorityExplanation } from "@/components/ghats/priority-explanation";
import { Pager, ParamSelect, ReadingRows } from "@/components/ghats/readings-table";
import { ParameterMatrix } from "@/components/ghats/parameter-matrix";
import { CaseDialog } from "@/components/cases/case-dialog";
import { CPCB_CLASSES, criterionText, fmtNum, pct } from "@/lib/domain";
import { useFindings, useGhat, useRanked, useReadings } from "@/hooks/queries";
import type { CpcbClass } from "@/lib/types";

export default function GhatDetailPage() {
  const { ghatId } = useParams<{ ghatId: string }>();
  const sp = useSearchParams(); const highlight = sp.get("reading");
  const [cls, setCls] = useState<CpcbClass>("B");
  const q = useGhat(ghatId, cls); const ranked = useRanked({ cpcb_class: cls });
  const [caseOpen, setCaseOpen] = useState(false);
  const [rp, setRp] = useState(""); const [offset, setOffset] = useState(0); const LIMIT = 25;
  const readings = useReadings(ghatId, { parameter: rp || undefined, limit: LIMIT, offset, cpcb_class: cls });
  const findings = useFindings({ ghat_id: ghatId, cpcb_class: cls, limit: 100 });
  const [pSort, setPSort] = useState<"parameter" | "result">("parameter");

  if (q.isPending) return <LoadingState rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const g = q.data; const r = ranked.data?.items.find((x) => x.ghat_id === g.id); const dq = g.data_quality;
  const outsideIds = r?.outside_reading_ids ?? [];
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader crumbs={[{ href: "/ghats", label: "Ghat Explorer" }, { label: g.name }]} title={g.name}
        subtitle={<>{g.water_body ?? "Water body not recorded"} · <code>{g.id}</code> · {g.first_sample_year}–{g.last_sample_year}, <span className="num">{g.observation_count}</span> readings</>}
        actions={<>
          <Link href={`/intelligence?ghat=${g.id}`}><Button><Sparkles className="h-4 w-4" aria-hidden />Generate brief</Button></Link>
          <Link href={`/intelligence?ghat=${g.id}&tab=whatsapp`}><Button><MessageSquare className="h-4 w-4" aria-hidden />WhatsApp summary</Button></Link>
          <Button variant="primary" onClick={() => setCaseOpen(true)}><ClipboardPlus className="h-4 w-4" aria-hidden />Create case</Button>
          <Link href={`/reports?ghat=${g.id}`}><Button><FileText className="h-4 w-4" aria-hidden />Report</Button></Link></>} />
      <div className="flex flex-wrap items-center gap-2"><PriorityBadge level={r?.priority_level} />{g.latitude === null && <Chip>No coordinates in source</Chip>}</div>
      <p className="rounded-md border border-info/20 bg-info-soft p-3 text-sm text-info">Findings describe available historical records and do not establish current water conditions.</p>
      {dq.warnings.length > 0 && <LimitationList title="Data quality warnings" items={dq.warnings} />}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1"><CardHeader title="Summary" />
          <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
            {[["Readings", g.observation_count], ["Numeric", dq.numeric_count], ["Missing", dq.missing_count], ["Below detection", dq.censored_count], ["Parameters", g.parameters.length], ["Outside criterion", outsideIds.length], ["Completeness", pct(dq.completeness, 1)], ["Priority score", r?.priority_score ?? "—"]].map(([k, v]) => (<div key={String(k)}><dt className="text-xs text-ink-muted">{k}</dt><dd className="num text-lg font-semibold">{v}</dd></div>))}
            <div className="col-span-2"><dt className="text-xs text-ink-muted">Seasons covered</dt><dd className="text-xs">{dq.seasons_covered.join(", ") || "—"}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-ink-muted">Seasons missing</dt><dd className="text-xs">{dq.seasons_missing.join(", ") || "none"}</dd></div>
          </dl></Card>
        <Card className="lg:col-span-2"><CardHeader title="Parameter results — latest season" subtitle="Most recent season per parameter. Blank/BDL values show their flag, never zero." action={
          <div className="flex items-end gap-2"><Field label="CPCB class" htmlFor="cls"><Select id="cls" value={cls} onChange={(e) => setCls(e.target.value as CpcbClass)}>{CPCB_CLASSES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Button size="sm" onClick={() => setPSort(pSort === "parameter" ? "result" : "parameter")}>Sort by {pSort === "parameter" ? "assessment" : "parameter"}</Button></div>} />
          <ParameterMatrix readings={g.latest_readings} sortBy={pSort} highlight={highlight} />
          <details className="border-t border-line"><summary className="cursor-pointer px-4 py-2 text-xs font-medium text-brand">Show every reading with its evidence ({g.latest_readings.length} rows)</summary><ReadingRows rows={g.latest_readings} highlight={highlight} /></details></Card>
      </div>

      <Card><CardHeader title="Trend analysis" subtitle="One line per phase. Gaps mean missing or below-detection readings." />
        <div className="p-4"><WidgetBoundary name="Trend chart"><TrendExplorer lockedGhat={g.id} defaultGhat={g.id} compact /></WidgetBoundary></div></Card>

      <Card id="readings"><CardHeader title="Raw readings" subtitle="Paginated from the backend with criterion evaluation." action={<div className="w-48"><ParamSelect id="rp" value={rp} onChange={(v) => { setRp(v); setOffset(0); }} options={g.parameters.map((p) => p.parameter)} /></div>} />
        {readings.isError ? <div className="p-4"><ErrorState error={readings.error} /></div> : readings.data ? <><ReadingRows rows={readings.data.items} highlight={highlight} /><Pager total={readings.data.total} limit={LIMIT} offset={offset} onChange={setOffset} /></> : <LoadingState rows={5} />}</Card>

      <Card><CardHeader title="Findings outside the applied criterion" subtitle={`CPCB class ${cls}`} />
        {findings.isPending ? <LoadingState rows={3} /> : findings.isError ? <div className="p-4"><ErrorState error={findings.error} /></div> : findings.data.items.length === 0 ? <EmptyState title="No readings outside the applied criteria" body="This describes the available records only." /> :
          <ul className="divide-y divide-line">{[...findings.data.items].sort((a, b) => b.reading.sample_year - a.reading.sample_year).map((f) => (
            <li key={f.reading.id} className="space-y-1 px-4 py-2.5 text-sm"><div className="flex flex-wrap items-center gap-2"><b>{f.reading.parameter}</b><span className="num">{fmtNum(f.reading.value)} {f.reading.unit}</span><span className="text-ink-muted">limit {criterionText(f.reading.evaluation)} · {f.reading.sample_period}</span><AssessmentBadge result={f.reading.evaluation?.result} /></div>
              <p className="text-xs text-ink-muted">{f.reading.evaluation?.reason}</p><EvidenceLink ghatId={f.ghat_id} readingId={f.reading.id} /></li>))}</ul>}</Card>

      <Card><CardHeader title="Why this site is prioritised" />
        <div className="p-4">{r ? <PriorityExplanation g={r} method={ranked.data?.method} disclaimer={ranked.data?.disclaimer} /> : <LoadingState rows={4} />}</div></Card>
      <LimitationList items={g.limitations} />
      <CaseDialog open={caseOpen} onClose={() => setCaseOpen(false)} ghatId={g.id} readingIds={outsideIds.slice(0, 5)} />
    </div>
  );
}
