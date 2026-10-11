"use client";
import { useEffect, useState } from "react";
import { ActivitySquare, Bot, Database, Globe2, Info, RefreshCw, Server } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, CardHeader, Chip } from "@/components/ui";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { useHealth, useMetadata, useOverview } from "@/hooks/queries";
import { API_ORIGIN } from "@/lib/api/client";
import { LAST_OK_KEY } from "@/lib/api/client";

type StatusLevel = "ok" | "warn" | "error" | "unknown";
function StatusRow({ icon: Icon, label, level, detail }: { icon: typeof Server; label: string; level: StatusLevel; detail?: string }) {
  const colors: Record<StatusLevel, string> = { ok: "text-brand", warn: "text-caution", error: "text-critical", unknown: "text-ink-muted" };
  const dot: Record<StatusLevel, string> = { ok: "bg-brand", warn: "bg-caution", error: "bg-critical", unknown: "bg-ink-muted" };
  const labels: Record<StatusLevel, string> = { ok: "OK", warn: "Degraded", error: "Error", unknown: "Unknown" };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
      <Icon className={`h-5 w-5 shrink-0 ${colors[level]}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {detail && <p className="text-xs text-ink-muted truncate">{detail}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dot[level]}`} aria-hidden />
        <span className={`text-xs font-medium ${colors[level]}`}>{labels[level]}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const health = useHealth();
  const meta = useMetadata();
  const overview = useOverview();
  const [lastOk, setLastOk] = useState<string | null>(null);

  useEffect(() => {
    try { setLastOk(window.sessionStorage.getItem(LAST_OK_KEY)); } catch { /* ignore */ }
  }, []);

  const h = health.data;
  const m = meta.data;

  const backendLevel: StatusLevel = health.isPending ? "unknown" : health.isError ? "error" : h?.status === "ok" ? "ok" : "warn";
  const dataLevel: StatusLevel = h?.data_loaded ? "ok" : h ? "error" : "unknown";
  const analyticsLevel: StatusLevel = overview.isSuccess ? "ok" : overview.isPending ? "unknown" : "warn";
  const aiLevel: StatusLevel = h?.ai_configured ? "ok" : h ? "warn" : "unknown";

  return (
    <div className="space-y-5 max-w-2xl pb-8">
      <PageHeader
        title="System status"
        crumbs={[{ href: "/", label: "Dashboard" }, { label: "System status" }]}
        subtitle="For developers: backend connectivity, dataset status and AI availability. No secrets are displayed here."
      />

      {/* Connectivity */}
      <Card>
        <CardHeader
          title="System status"
          action={<Button size="sm" onClick={() => { health.refetch(); meta.refetch(); overview.refetch(); }}><RefreshCw className="h-3 w-3" />Refresh</Button>}
        />
        <div className="p-4 space-y-2">
          <StatusRow icon={Globe2} label="Backend reachable" level={backendLevel} detail={`${API_ORIGIN}/api/v1`} />
          <StatusRow icon={Database} label="Dataset loaded" level={dataLevel}
            detail={h ? `${h.ghats_loaded} ghats · ${h.readings_loaded.toLocaleString("en-IN")} readings` : undefined} />
          <StatusRow icon={ActivitySquare} label="Analytics available" level={analyticsLevel}
            detail={overview.isSuccess ? "GET /analytics/overview succeeded" : undefined} />
          <StatusRow icon={Bot} label="AI configured" level={aiLevel}
            detail={h?.ai_configured ? "Backend has Anthropic API key — AI wording enabled" : h ? "No Anthropic API key — template text will be used for all briefs" : undefined} />
        </div>
      </Card>

      {/* Health details */}
      {health.isPending && <LoadingState rows={3} label="Checking backend…" />}
      {health.isError && <ErrorState error={health.error} onRetry={() => health.refetch()} />}
      {h && (
        <Card>
          <CardHeader title="Backend health response" />
          <div className="p-4 grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
            {[
              ["App", h.app],
              ["Status", h.status],
              ["Database", h.database],
              ["Data loaded", h.data_loaded ? "Yes" : "No"],
              ["Ghats", h.ghats_loaded],
              ["Readings", h.readings_loaded.toLocaleString("en-IN")],
              ["AI configured", h.ai_configured ? "Yes" : "No"],
              ["Timestamp", new Date(h.timestamp).toLocaleString("en-IN")],
              ["Last OK (this session)", lastOk ? new Date(lastOk).toLocaleString("en-IN") : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-line bg-canvas p-2">
                <p className="text-ink-muted">{k}</p>
                <p className="font-medium text-ink mt-0.5 truncate">{String(v)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Dataset metadata */}
      {m && (
        <Card>
          <CardHeader title="Dataset metadata" />
          <div className="p-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Total ghats", m.total_ghats],
                ["Total readings", m.total_readings.toLocaleString("en-IN")],
                ["Year range", m.year_range ? `${m.year_range[0]}–${m.year_range[1]}` : "—"],
                ["Default class", `Class ${m.default_cpcb_class}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md border border-line bg-canvas p-2 text-xs">
                  <p className="text-ink-muted">{k}</p>
                  <p className="font-semibold num text-ink mt-0.5">{String(v)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-muted">{m.date_convention}</p>
          </div>
        </Card>
      )}

      {/* Frontend info */}
      <Card>
        <CardHeader title="Frontend info" />
        <div className="p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">Backend URL:</span>
            <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">{API_ORIGIN}</code>
          </div>
          <p className="text-xs text-ink-muted">Set via <code className="rounded bg-canvas px-1">NEXT_PUBLIC_API_BASE_URL</code> — origin only, no path. The client appends /api/v1.</p>
          <div className="flex items-center gap-2 pt-1">
            <Chip tone="good"><Server className="h-3 w-3" />Developer view</Chip>
            <Chip tone="neutral">Visible to developer accounts only</Chip>
          </div>
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-line bg-canvas p-3 text-xs text-ink-muted">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-medium text-ink mb-1">Troubleshooting</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>CORS: add your frontend origin to the backend <code>FRONTEND_ORIGIN</code> env variable (comma-separated).</li>
            <li>Backend sleeping on free hosting: wait 30 s for cold start, then retry.</li>
            <li>AI not configured: set <code>ANTHROPIC_API_KEY</code> and <code>ANTHROPIC_MODEL</code> on the backend. The frontend works without AI — all endpoints return deterministic template text as a normal result.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
