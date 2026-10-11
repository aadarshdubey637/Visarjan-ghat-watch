import Link from "next/link";
import { FileSearch } from "lucide-react";
import type { EvidenceItem, Reading } from "@/lib/types";
import { Chip } from "@/components/ui";

export function SourceLine({ r }: { r: Pick<Reading, "source_file" | "source_record_id" | "source_page"> }) {
  return <span className="text-xs text-ink-muted">{r.source_file} · row {r.source_record_id}{r.source_page ? ` · PDF p.${r.source_page}` : ""}</span>;
}
export function EvidenceLink({ ghatId, readingId, children }: { ghatId: string; readingId: string; children?: React.ReactNode }) {
  return (
    <Link href={`/ghats/${encodeURIComponent(ghatId)}?reading=${encodeURIComponent(readingId)}#readings`} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
      <FileSearch className="h-3 w-3" aria-hidden />{children ?? "Inspect evidence"}
    </Link>
  );
}
const TYPE_TONE = { observation: "info", calculation: "good", guidance: "warn", resource: "neutral", forecast: "neutral" } as const;
export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (!items.length) return <p className="text-sm text-ink-muted">No evidence items were returned.</p>;
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className="rounded-md border border-line p-2.5 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2"><Chip tone={TYPE_TONE[e.type]}>{e.type}</Chip><code className="text-xs text-ink-muted">{e.id}</code></div>
          <p>{e.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
            {e.source_file && <span>{e.source_file}{e.source_record_id ? ` · row ${e.source_record_id}` : ""}{e.source_page ? ` · PDF p.${e.source_page}` : ""}</span>}
            {e.type === "observation" && e.ghat_id && <EvidenceLink ghatId={e.ghat_id} readingId={e.id}>Open reading</EvidenceLink>}
          </div>
        </li>
      ))}
    </ul>
  );
}
export function LimitationList({ items, title = "Limitations" }: { items: string[]; title?: string }) {
  if (!items.length) return null;
  return (<div className="rounded-md border border-caution/25 bg-caution-soft p-3"><p className="mb-1 text-xs font-semibold text-caution">{title}</p><ul className="list-disc space-y-0.5 pl-4 text-xs text-ink">{items.map((l, i) => <li key={i}>{l}</li>)}</ul></div>);
}
