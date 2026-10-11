import { AlertTriangle, CheckCircle2, Info, MinusCircle, Bot, FileText } from "lucide-react";
import { Chip } from "@/components/ui";
import { ASSESSMENT, PRIORITY } from "@/lib/domain";
import type { ComparisonResultKind, GenerationMode, PriorityLevel } from "@/lib/types";

const ICON = { good: CheckCircle2, bad: AlertTriangle, warn: MinusCircle, neutral: Info } as const;
const CHIP_TONE = { good: "good", bad: "bad", warn: "warn", neutral: "neutral" } as const;

export function AssessmentBadge({ result }: { result: ComparisonResultKind | null | undefined }) {
  if (!result) return <Chip tone="neutral"><Info className="h-3 w-3" aria-hidden />Not evaluated</Chip>;
  const a = ASSESSMENT[result]; const I = ICON[a.tone];
  return <Chip tone={CHIP_TONE[a.tone]}><I className="h-3 w-3" aria-hidden />{a.label}</Chip>;
}
export function PriorityBadge({ level, score }: { level: PriorityLevel | null | undefined; score?: number | null }) {
  if (!level) return <Chip>Not ranked</Chip>;
  const p = PRIORITY[level]; const I = ICON[p.tone];
  return <Chip tone={CHIP_TONE[p.tone]}><I className="h-3 w-3" aria-hidden />{p.label}{score !== undefined && score !== null ? <span className="num"> · {score.toFixed(1)}</span> : null}</Chip>;
}
export function GenerationBadge({ mode, aiStatus }: { mode: GenerationMode; aiStatus: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode === "ai" ? <Chip tone="info"><Bot className="h-3 w-3" aria-hidden />AI-worded</Chip> : <Chip><FileText className="h-3 w-3" aria-hidden />Deterministic template</Chip>}
      {aiStatus && <span className="text-xs text-ink-muted">{aiStatus}</span>}
    </div>
  );
}
