import { Card, Skeleton } from "@/components/ui";
import { CountUp } from "@/components/shared/count-up";
import type { ReactNode } from "react";

export function MetricCard({ label, value, sub, loading, tone, suffix, icon }: {
  label: string; value: number | ReactNode | undefined; sub?: ReactNode; loading?: boolean; tone?: "bad"; suffix?: ReactNode; icon?: ReactNode;
}) {
  return (
    <Card className="card-hover relative overflow-hidden p-4 animate-fade-in">
      <span className={`absolute inset-y-0 left-0 w-1 ${tone === "bad" ? "bg-critical" : "bg-brand"}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        {icon && <span className="text-brand/70" aria-hidden>{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className={`num mt-1 text-3xl font-bold tracking-tight ${tone === "bad" ? "text-critical" : "text-ink"}`}>
          {typeof value === "number" ? <CountUp value={value} /> : (value ?? "—")}
          {suffix && <span className="ml-1.5 text-sm font-medium text-ink-muted">{suffix}</span>}
        </p>
      )}
      {sub && !loading && <p className="mt-1 text-xs leading-snug text-ink-muted">{sub}</p>}
    </Card>
  );
}
