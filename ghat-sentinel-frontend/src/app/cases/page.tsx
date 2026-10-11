"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, Field, Select } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { PriorityBadge } from "@/components/shared/badges";
import { StatusChip } from "@/components/cases/parts";
import { Pager } from "@/components/ghats/readings-table";
import { CaseDialog } from "@/components/cases/case-dialog";
import { useAuth } from "@/components/auth-provider";
import { CASE_STATUSES, CASE_STATUS_LABEL, fmtDateTime } from "@/lib/domain";
import { useCases, useGhats, useOverview } from "@/hooks/queries";
import type { CaseStatus } from "@/lib/types";

export default function CasesPage() {
  const [status, setStatus] = useState<"" | CaseStatus>(""); const [ghat, setGhat] = useState(""); const [offset, setOffset] = useState(0); const [open, setOpen] = useState(false);
  const LIMIT = 20;
  const { effectiveRole } = useAuth(); const worker = effectiveRole === "worker";
  const q = useCases({ status: status || undefined, ghat_id: ghat || undefined, limit: LIMIT, offset });
  const ov = useOverview(); const ghats = useGhats();
  const name = (id: string) => ghats.data?.items.find((g) => g.id === id)?.name ?? id;
  return (
    <div>
      <PageHeader title={worker ? "My cases" : "Field Cases"} subtitle={worker ? "Cases assigned to you. Open one to read the evidence, then record notes and update its status." : "A case is a request to verify a concern. It does not mean authorities accepted it or that pollution is confirmed."} actions={!worker ? <Button variant="primary" onClick={() => setOpen(true)}>Create case</Button> : undefined} />
      {!worker && <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">{CASE_STATUSES.map((s) => (
        <button key={s} onClick={() => { setStatus(status === s ? "" : s); setOffset(0); }} aria-pressed={status === s} className={`rounded-lg border p-3 text-left ${status === s ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
          <p className="text-xs text-ink-muted">{CASE_STATUS_LABEL[s]}</p><p className="num font-display text-3xl font-semibold">{ov.data ? ov.data.cases_by_status[s] ?? 0 : "—"}</p></button>))}</div>}
      <Card className="mb-4 p-3"><div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status" htmlFor="cs"><Select id="cs" value={status} onChange={(e) => { setStatus(e.target.value as CaseStatus | ""); setOffset(0); }}><option value="">All</option>{CASE_STATUSES.map((s) => <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>)}</Select></Field>
        <Field label="Ghat" htmlFor="cgf"><Select id="cgf" value={ghat} onChange={(e) => { setGhat(e.target.value); setOffset(0); }}><option value="">All</option>{ghats.data?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field></div></Card>
      {q.isPending ? <LoadingState rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.items.length === 0 ? <Card><EmptyState title={worker ? "Nothing assigned to you yet" : "No cases match"} body={worker ? "When an officer assigns you a case it will appear here." : "Create a case from a finding, a ghat page, or the button above."} action={!worker ? <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Create case</Button> : undefined} /></Card> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="p-3">Case ID</th><th className="p-3">Ghat</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3">Recommended action</th><th className="p-3">Assigned to</th><th className="p-3">Created</th><th className="p-3">Updated</th></tr></thead>
          <tbody>{q.data.items.map((c) => (<tr key={c.id} className="border-b border-line/60 hover:bg-brand-soft/40"><td className="p-3"><Link className="font-mono text-xs font-medium text-brand hover:underline" href={`/cases/${c.id}`}>{c.id}</Link></td><td className="p-3">{name(c.ghat_id)}</td><td className="p-3"><PriorityBadge level={c.priority_level} /></td><td className="p-3"><StatusChip status={c.status} /></td>
            <td className="max-w-xs truncate p-3" title={c.recommended_action}>{c.recommended_action}</td><td className="p-3 text-xs">{c.assigned_to ?? "Unassigned"}</td><td className="p-3 text-xs">{fmtDateTime(c.created_at)}</td><td className="p-3 text-xs">{fmtDateTime(c.updated_at)}</td></tr>))}</tbody></table>
          <Pager total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} /></Card>)}
      <CaseDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
