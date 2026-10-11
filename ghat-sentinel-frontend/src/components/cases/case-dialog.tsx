"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button, Dialog, Field, Select, Textarea } from "@/components/ui";
import { ApiError, friendlyMessage } from "@/lib/api/client";
import { createCase } from "@/lib/api";
import { useGhats } from "@/hooks/queries";

export const caseSchema = z.object({
  ghat_id: z.string().min(1, "Choose a ghat"),
  recommended_action: z.string().trim().min(3, "Enter at least 3 characters").max(1000, "Keep it under 1000 characters"),
  notes: z.string().max(4000, "Keep notes under 4000 characters").optional(),
  reading_ids: z.array(z.string()),
});
export type CaseForm = z.infer<typeof caseSchema>;

const SUGGESTIONS = [
  "Verify the recorded measurement against the MPPCB report before Durga visarjan",
  "Arrange a fresh field sample at this site and compare with the historical record",
  "Check the source page of the flagged readings for transcription errors",
];

export function CaseDialog({ open, onClose, ghatId, readingIds = [], suggestedAction }: { open: boolean; onClose: () => void; ghatId?: string; readingIds?: string[]; suggestedAction?: string }) {
  const ghats = useGhats(); const router = useRouter(); const qc = useQueryClient();
  const form = useForm<CaseForm>({ resolver: zodResolver(caseSchema), defaultValues: { ghat_id: ghatId ?? "", recommended_action: suggestedAction ?? "", notes: "", reading_ids: readingIds } });
  useEffect(() => { if (open) form.reset({ ghat_id: ghatId ?? "", recommended_action: suggestedAction ?? "", notes: "", reading_ids: readingIds }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: createCase,
    onSuccess: (c) => {
      for (const k of ["cases", "overview", "ranked"]) qc.invalidateQueries({ queryKey: [k] });
      toast.success(`Case ${c.id} created`); onClose(); router.push(`/cases/${c.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.details) for (const d of e.details) { const f = d.field.split(".").pop() as keyof CaseForm; if (f in caseSchema.shape) form.setError(f, { message: d.message }); }
      else if (e instanceof ApiError && e.code === "INVALID_READING_IDS") form.setError("reading_ids", { message: e.message });
    },
  });
  const rids = form.watch("reading_ids");
  const err = form.formState.errors;
  return (
    <Dialog open={open} onClose={onClose} title="Create verification case">
      <form onSubmit={form.handleSubmit((v) => m.mutate({ ghat_id: v.ghat_id, reading_ids: v.reading_ids, recommended_action: v.recommended_action, notes: v.notes ?? "" }))} className="space-y-3" noValidate>
        <p className="rounded-md bg-info-soft p-2 text-xs text-info">A case is a request to verify a concern. It does not mean authorities accepted it or that pollution is confirmed.</p>
        <Field label="Ghat" htmlFor="cg" error={err.ghat_id?.message}>
          <Select id="cg" {...form.register("ghat_id")} disabled={!!ghatId}>
            <option value="">Select a ghat…</option>{ghats.data?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        {rids.length > 0 && <p className="text-xs text-ink-muted">Linked readings: <span className="num">{rids.join(", ")}</span></p>}
        {err.reading_ids?.message && <p role="alert" className="text-xs text-critical">{err.reading_ids.message}</p>}
        <Field label="Recommended action" htmlFor="ca" error={err.recommended_action?.message}>
          <Textarea id="ca" rows={3} {...form.register("recommended_action")} />
        </Field>
        <div className="flex flex-wrap gap-1">{SUGGESTIONS.map((s) => <button type="button" key={s} onClick={() => form.setValue("recommended_action", s, { shouldValidate: true })} className="rounded-full border border-line px-2 py-0.5 text-xs hover:bg-brand-soft">{s.length > 48 ? s.slice(0, 46) + "…" : s}</button>)}</div>
        <Field label="Notes (optional)" htmlFor="cn" error={err.notes?.message}><Textarea id="cn" rows={2} {...form.register("notes")} /></Field>
        {m.isError && !(m.error instanceof ApiError && (m.error.details || m.error.code === "INVALID_READING_IDS")) && <p role="alert" className="text-sm text-critical">{friendlyMessage(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={m.isPending}>Create case</Button></div>
      </form>
    </Dialog>
  );
}
