"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, CardHeader, Field, Select, Textarea } from "@/components/ui";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { PriorityBadge } from "@/components/shared/badges";
import { EvidenceLink } from "@/components/shared/evidence";
import { CaseStatusStepper, StatusChip } from "@/components/cases/parts";
import { ReadingRows } from "@/components/ghats/readings-table";
import { ApiError, friendlyMessage } from "@/lib/api/client";
import { getReadings, patchCase, type PatchCaseBody } from "@/lib/api";
import { ALLOWED_TRANSITIONS, CASE_STATUS_LABEL, fmtDateTime } from "@/lib/domain";
import { useCase, useGhats, useUsers } from "@/hooks/queries";
import { useAuth } from "@/components/auth-provider";
import type { CaseStatus, Reading } from "@/lib/types";

function useLinkedReadings(ghatId: string | undefined, ids: string[]) {
  return useQuery({
    queryKey: ["linked-readings", ghatId, ids],
    enabled: !!ghatId && ids.length > 0,
    queryFn: async ({ signal }) => {
      const found: Reading[] = [];
      for (let off = 0; off < 1000 && found.length < ids.length; off += 100) {
        const p = await getReadings(ghatId!, { evaluate: true, limit: 100, offset: off }, signal);
        found.push(...p.items.filter((r) => ids.includes(r.id)));
        if (off + 100 >= p.total) break;
      }
      return found;
    },
  });
}

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const q = useCase(caseId); const ghats = useGhats(); const qc = useQueryClient();
  const { effectiveRole } = useAuth(); const worker = effectiveRole === "worker";
  const workers = useUsers("worker");
  const c = q.data;
  const linked = useLinkedReadings(c?.ghat_id, c?.reading_ids ?? []);
  const [status, setStatus] = useState<"" | CaseStatus>(""); const [assignee, setAssignee] = useState(""); const [notes, setNotes] = useState(""); const [summary, setSummary] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  useEffect(() => { if (c) { setStatus(""); setAssignee(c.assigned_to ?? ""); setNotes(c.notes); setSummary(c.resolution_summary ?? ""); setFieldErr({}); } }, [c]);
  const m = useMutation({
    mutationFn: (b: PatchCaseBody) => patchCase(caseId, b),
    onSuccess: (n) => { qc.setQueryData(["case", caseId], n); for (const k of ["cases", "overview", "ranked"]) qc.invalidateQueries({ queryKey: [k] }); toast.success(`Case updated: ${CASE_STATUS_LABEL[n.status]}`); },
    onError: (e) => { const errs: Record<string, string> = {}; if (e instanceof ApiError && e.details) e.details.forEach((d) => { errs[d.field.split(".").pop() ?? "form"] = d.message; }); setFieldErr(errs); },
  });
  if (q.isPending) return <LoadingState rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const cs = q.data;
  // Workers may only move a case to "under review" or "resolved"; the backend enforces this too.
  const next = ALLOWED_TRANSITIONS[cs.status].filter((s) => !worker || s === "under_review" || s === "resolved");
  const submit = () => {
    const body: PatchCaseBody = {};
    if (status) body.status = status;
    if (!worker && assignee !== (cs.assigned_to ?? "")) body.assigned_to = assignee || null;
    if (notes !== cs.notes) body.notes = notes;
    if (summary !== (cs.resolution_summary ?? "")) body.resolution_summary = summary || null;
    const errs: Record<string, string> = {};
    if (status === "action_assigned" && !(assignee || cs.assigned_to)) errs.assigned_to = "Assign someone before moving to Action assigned.";
    if (status === "resolved" && !(summary || cs.resolution_summary || (notes && body.notes))) errs.resolution_summary = "Add a resolution summary before resolving.";
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    if (!Object.keys(body).length) { toast.info("Nothing to update"); return; }
    m.mutate(body);
  };
  const ghatName = ghats.data?.items.find((g) => g.id === cs.ghat_id)?.name ?? cs.ghat_id;
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader crumbs={[{ href: "/cases", label: "Field Cases" }, { label: cs.id }]} title={`Case ${cs.id}`} subtitle={<><Link className="text-brand hover:underline" href={`/ghats/${cs.ghat_id}`}>{ghatName}</Link> · created {fmtDateTime(cs.created_at)} · updated {fmtDateTime(cs.updated_at)}</>} />
      <Card className="space-y-3 p-4"><div className="flex flex-wrap items-center gap-2"><StatusChip status={cs.status} /><PriorityBadge level={cs.priority_level} /></div><CaseStatusStepper status={cs.status} />
        <dl className="grid gap-3 text-sm md:grid-cols-2"><div><dt className="text-xs text-ink-muted">Recommended action</dt><dd>{cs.recommended_action}</dd></div><div><dt className="text-xs text-ink-muted">Assigned to</dt><dd>{cs.assigned_to ?? "Unassigned"}</dd></div>
          {cs.created_by && <div><dt className="text-xs text-ink-muted">Created by</dt><dd>{cs.created_by}</dd></div>}
          <div><dt className="text-xs text-ink-muted">Notes</dt><dd className="whitespace-pre-wrap">{cs.notes || "—"}</dd></div><div><dt className="text-xs text-ink-muted">Resolution summary</dt><dd className="whitespace-pre-wrap">{cs.resolution_summary ?? "—"}</dd></div></dl></Card>
      <Card><CardHeader title="Linked readings" subtitle="Evidence the case refers to." />
        {cs.reading_ids.length === 0 ? <p className="p-4 text-sm text-ink-muted">No readings are linked to this case.</p> : linked.isPending ? <LoadingState rows={2} /> : linked.isError ? <div className="p-4"><ErrorState error={linked.error} /></div> : <><ReadingRows rows={linked.data} /><div className="flex flex-wrap gap-3 p-3">{cs.reading_ids.map((id) => <EvidenceLink key={id} ghatId={cs.ghat_id} readingId={id}>{id}</EvidenceLink>)}</div></>}</Card>
      <Card><CardHeader title="Update case" subtitle="Only the transitions the backend allows are offered." />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Status" htmlFor="st"><Select id="st" value={status} onChange={(e) => setStatus(e.target.value as CaseStatus | "")}><option value="">Keep “{CASE_STATUS_LABEL[cs.status]}”</option>{next.map((s) => <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>)}</Select></Field>
          {!worker && (
            <Field label="Assigned to" htmlFor="as" error={fieldErr.assigned_to} hint="Pick a field worker, or leave unassigned.">
              <Select id="as" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {assignee && !workers.data?.items.some((w) => w.email === assignee) && <option value={assignee}>{assignee}</option>}
                {workers.data?.items.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.email}>{w.name} ({w.email})</option>)}
              </Select>
            </Field>
          )}
          <Field label="Notes" htmlFor="nt" error={fieldErr.notes}><Textarea id="nt" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Field label="Resolution summary" htmlFor="rs" error={fieldErr.resolution_summary}><Textarea id="rs" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
          {m.isError && !(m.error instanceof ApiError && m.error.details) && <p role="alert" className="text-sm text-critical md:col-span-2">{friendlyMessage(m.error)}</p>}
          <div className="md:col-span-2"><Button variant="primary" loading={m.isPending} onClick={submit}>Save changes</Button></div></div></Card>
    </div>
  );
}
