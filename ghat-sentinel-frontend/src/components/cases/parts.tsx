import { Check } from "lucide-react";
import { Chip } from "@/components/ui";
import { CASE_STATUSES, CASE_STATUS_LABEL } from "@/lib/domain";
import type { CaseStatus } from "@/lib/types";

export function StatusChip({ status }: { status: CaseStatus }) {
  const tone = status === "resolved" ? "good" : status === "needs_verification" ? "warn" : "info";
  return <Chip tone={tone}>{CASE_STATUS_LABEL[status]}</Chip>;
}
export function CaseStatusStepper({ status }: { status: CaseStatus }) {
  const idx = CASE_STATUSES.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Case progress">
      {CASE_STATUSES.map((s, i) => (
        <li key={s} aria-current={i === idx ? "step" : undefined} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${i === idx ? "border-brand bg-brand text-white" : i < idx ? "border-brand/30 bg-brand-soft text-brand" : "border-line text-ink-muted"}`}>
          {i < idx && <Check className="h-3 w-3" aria-hidden />}{CASE_STATUS_LABEL[s]}</li>
      ))}
    </ol>
  );
}
