"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, FileJson, Printer, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, CardHeader, Chip, Field, Select } from "@/components/ui";
import { AssessmentBadge, PriorityBadge } from "@/components/shared/badges";
import { ErrorState, EmptyState, LoadingState } from "@/components/shared/states";
import { GhatMultiSelect } from "@/components/intelligence/parts";
import { generateReportJson, generateReportCsv } from "@/lib/api/reports";
import { yearStart, yearEnd } from "@/lib/api/ghats";
import { useMetadata } from "@/hooks/queries";
import type { Lang, Report, ReportSection } from "@/lib/types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SectionCard({ sec }: { sec: ReportSection }) {
  const [open, setOpen] = useState(false);
  const outside = Object.values(sec.exceedance_counts_by_parameter).reduce((n, m) => n + (m.outside_criterion ?? 0), 0);
  return (
    <Card className="overflow-hidden">
      <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />}
          <div className="min-w-0">
            <p className="font-semibold text-ink truncate">{sec.ghat_name}</p>
            <p className="text-xs text-ink-muted">{sec.water_body} · {sec.readings.length} readings · {outside} outside criterion</p>
          </div>
        </div>
        <PriorityBadge level={sec.priority.priority_level} score={sec.priority.priority_score} />
      </button>

      {open && (
        <div className="border-t border-line divide-y divide-line">
          {/* Observations */}
          <div className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">Observations ({sec.readings.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="pr-3 pb-2 font-medium">Parameter</th>
                    <th className="pr-3 pb-2 font-medium">Period</th>
                    <th className="pr-3 pb-2 font-medium">Value</th>
                    <th className="pr-3 pb-2 font-medium">Assessment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {sec.readings.slice(0, 20).map((r) => (
                    <tr key={r.id} className="hover:bg-canvas/50">
                      <td className="pr-3 py-1.5 font-medium">{r.parameter}</td>
                      <td className="pr-3 py-1.5 text-ink-muted">{r.sample_period}</td>
                      <td className="pr-3 py-1.5 num">
                        {r.value !== null ? `${r.value} ${r.unit ?? ""}` : <span className="italic text-ink-muted">{r.flag ?? "—"}</span>}
                      </td>
                      <td className="py-1.5">{r.evaluation ? <AssessmentBadge result={r.evaluation.result} /> : <span className="text-ink-muted">—</span>}</td>
                    </tr>
                  ))}
                  {sec.readings.length > 20 && <tr><td colSpan={4} className="py-1.5 text-ink-muted italic">… {sec.readings.length - 20} more readings (download JSON/CSV for full data)</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Priority factors */}
          <div className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">Priority analysis</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sec.priority.factors.map((f) => (
                <div key={f.name} className="rounded-md border border-line bg-canvas p-2">
                  <p className="text-xs text-ink-muted">{f.label}</p>
                  <p className="text-sm font-semibold num">{f.points.toFixed(1)}<span className="text-xs text-ink-muted">/{f.max_points}</span></p>
                  <div className="mt-1 h-1.5 rounded-full bg-line overflow-hidden">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, (f.points / f.max_points) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {sec.priority.reasons.length > 0 && (
              <ul className="mt-2 list-disc pl-4 text-xs text-ink-muted space-y-0.5">
                {sec.priority.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>

          {/* Cases */}
          {sec.cases.length > 0 && (
            <div className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">Field cases ({sec.cases.length})</h3>
              <div className="space-y-2">
                {sec.cases.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 rounded-md border border-line p-2">
                    <Chip tone={c.status === "resolved" ? "good" : c.status === "needs_verification" ? "warn" : "neutral"}>{c.status.replace(/_/g, " ")}</Chip>
                    <p className="text-xs text-ink line-clamp-2">{c.recommended_action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ReportPreview({ report }: { report: Report }) {
  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-4 border-brand/20 bg-brand-soft/30">
        <h2 className="font-bold text-ink">{report.title}</h2>
        <p className="text-xs text-ink-muted mt-1">Generated {new Date(report.generated_at).toLocaleString("en-IN")} · Class {report.selection.cpcb_class} · {report.language.toUpperCase()}</p>
        {report.selection.intended_use && <p className="text-xs text-ink-muted">{report.selection.intended_use}</p>}
        {report.historical_context.length > 0 && (
          <ul className="mt-2 list-disc pl-4 text-xs text-ink-muted space-y-0.5">
            {report.historical_context.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </Card>

      {report.outlook && report.outlook.historical_values.length > 0 && (
        <Card>
          <CardHeader title="October 20 outlook" subtitle={`${report.outlook.forecast_status === "historical_comparison" ? "Historical comparison only — forecast not defensible with current data" : "Experimental estimate"}`} />
          <div className="p-4">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-ink-muted"><th className="pr-4 pb-2 font-medium">Year</th><th className="pr-4 pb-2 font-medium">Festival</th><th className="pr-4 pb-2 font-medium">Phase</th><th className="pr-4 pb-2 font-medium">Value</th><th className="pb-2 font-medium">Sites</th></tr></thead>
              <tbody className="divide-y divide-line/50">
                {report.outlook.historical_values.map((v, i) => (
                  <tr key={i}>
                    <td className="pr-4 py-1.5 num">{v.sample_year}</td>
                    <td className="pr-4 py-1.5">{v.festival}</td>
                    <td className="pr-4 py-1.5">{v.phase}</td>
                    <td className="pr-4 py-1.5 num">{v.value !== null ? `${v.value} ${report.outlook!.unit ?? ""}` : <span className="italic text-ink-muted">{v.flag ?? "—"}</span>}</td>
                    <td className="py-1.5 text-ink-muted">{v.n_sites ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">Ghat sections ({report.sections.length})</h3>
        <div className="space-y-3">
          {report.sections.map((sec) => <SectionCard key={sec.ghat_id} sec={sec} />)}
        </div>
      </div>

      {report.limitations.length > 0 && (
        <details className="rounded-lg border border-line bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium">Report limitations ({report.limitations.length})</summary>
          <ul className="mt-2 list-disc pl-4 text-xs text-ink-muted space-y-1">{report.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const meta = useMetadata();
  const [ghats, setGhats] = useState<string[]>([]);
  const [lang, setLang] = useState<Lang>("en");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const years = meta.data?.year_range ? Array.from({ length: meta.data.year_range[1] - meta.data.year_range[0] + 1 }, (_, i) => meta.data!.year_range![0] + i) : [];

  const jsonMut = useMutation({
    mutationFn: () => generateReportJson({ ghat_ids: ghats.length ? ghats : null, start_date: yearStart(start ? Number(start) : null) ?? null, end_date: yearEnd(end ? Number(end) : null) ?? null, language: lang }),
    onError: (e) => toast.error("Report failed", { description: e instanceof Error ? e.message : "Try again." }),
  });

  const csvMut = useMutation({
    mutationFn: () => generateReportCsv({ ghat_ids: ghats.length ? ghats : null, start_date: yearStart(start ? Number(start) : null) ?? null, end_date: yearEnd(end ? Number(end) : null) ?? null, language: lang }),
    onSuccess: (blob) => {
      downloadBlob(blob, `ghat-sentinel-report-${Date.now()}.csv`);
      toast.success("CSV downloaded");
    },
    onError: (e) => toast.error("CSV failed", { description: e instanceof Error ? e.message : "Try again." }),
  });

  const dlJson = () => {
    if (!jsonMut.data) return;
    downloadBlob(new Blob([JSON.stringify(jsonMut.data, null, 2)], { type: "application/json" }), `ghat-sentinel-report-${Date.now()}.json`);
    toast.success("JSON downloaded");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        crumbs={[{ href: "/", label: "Dashboard" }, { label: "Reports" }]}
        subtitle="Generate structured reports from historical MPPCB water-quality records. Download as JSON or CSV."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Builder */}
        <Card className="lg:col-span-1">
          <CardHeader title="Report builder" />
          <div className="space-y-4 p-4">
            <GhatMultiSelect value={ghats} onChange={setGhats} />
            <Field label="Language" htmlFor="rl">
              <Select id="rl" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From year" htmlFor="rs">
                <Select id="rs" value={start} onChange={(e) => setStart(e.target.value)}>
                  <option value="">Any</option>
                  {years.map((y) => <option key={y}>{y}</option>)}
                </Select>
              </Field>
              <Field label="To year" htmlFor="re">
                <Select id="re" value={end} onChange={(e) => setEnd(e.target.value)}>
                  <option value="">Any</option>
                  {years.map((y) => <option key={y}>{y}</option>)}
                </Select>
              </Field>
            </div>

            <div className="space-y-2 pt-1">
              <Button variant="primary" className="w-full" loading={jsonMut.isPending} onClick={() => jsonMut.mutate()}>
                <FileJson className="h-4 w-4" aria-hidden />Generate preview (JSON)
              </Button>
              <Button className="w-full" loading={csvMut.isPending} onClick={() => csvMut.mutate()}>
                <Download className="h-4 w-4" aria-hidden />Download CSV
              </Button>
            </div>

            {jsonMut.isSuccess && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <Button size="sm" onClick={dlJson}>
                  <FileJson className="h-3 w-3" />Download JSON
                </Button>
                <Button size="sm" onClick={() => window.print()}>
                  <Printer className="h-3 w-3" />Print / Save as PDF
                </Button>
                <p className="text-xs text-ink-muted">Print uses the browser — no PDF is generated by the backend.</p>
              </div>
            )}

            <p className="rounded-md border border-line bg-canvas p-2 text-xs text-ink-muted flex gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-caution" aria-hidden />
              Large reports (all ghats) may take up to 45 s and be several hundred KB.
            </p>
          </div>
        </Card>

        {/* Preview */}
        <div className="space-y-4 lg:col-span-2">
          {jsonMut.isPending && <LoadingState rows={6} label="Generating report…" />}
          {jsonMut.isError && <ErrorState error={jsonMut.error} onRetry={() => jsonMut.mutate()} />}
          {!jsonMut.data && !jsonMut.isPending && !jsonMut.isError && (
            <EmptyState
              title="Report preview"
              body="Configure your selection on the left and click 'Generate preview' to see a structured report from the real backend data."
            />
          )}
          {jsonMut.data && <ReportPreview report={jsonMut.data} />}
        </div>
      </div>
    </div>
  );
}
