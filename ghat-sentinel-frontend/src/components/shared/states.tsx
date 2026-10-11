"use client";
import { AlertCircle, Inbox, WifiOff, Loader2, RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Button, Skeleton } from "@/components/ui";
import { ApiError, friendlyMessage } from "@/lib/api/client";

export function LoadingState({ rows = 3, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2 p-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
    </div>
  );
}
export function Spinner({ label }: { label: string }) {
  return <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{label}</div>;
}
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden><path d="M2 30c8-8 14 8 22 0s14 8 22 0 12-4 16-2" stroke="#3567A8" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M2 36h60" stroke="#E0E7E2" strokeWidth="2" /></svg>
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink"><Inbox className="h-4 w-4 text-ink-muted" aria-hidden />{title}</p>
      {body && <p className="max-w-md text-xs text-ink-muted">{body}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && (error.kind === "network" || error.kind === "timeout");
  const Icon = offline ? WifiOff : AlertCircle;
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-critical/20 bg-critical-soft p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-critical"><Icon className="h-4 w-4" aria-hidden />{offline ? "Can't reach the backend" : "Couldn't load this data"}</p>
      <p className="text-ink">{friendlyMessage(error)}</p>
      {error instanceof ApiError && error.code && !offline && <p className="text-xs text-ink-muted">Code: {error.code}</p>}
      {onRetry && <Button size="sm" onClick={onRetry}><RefreshCw className="h-3 w-3" aria-hidden />Retry</Button>}
    </div>
  );
}

/** Renders loading / error / data for a query. Empty handling is left to children. */
export function QueryBoundary<T>({ query, children, rows }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; rows?: number }) {
  if (query.isPending) return <LoadingState rows={rows} />;
  if (query.isError) return <div className="p-4"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>;
  return <>{children(query.data)}</>;
}

export class WidgetBoundary extends Component<{ children: ReactNode; name?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="rounded-md border border-critical/20 bg-critical-soft p-4 text-sm text-critical">{this.props.name ?? "This section"} failed to render. Reload the page to try again.</div>;
    return this.props.children;
  }
}
