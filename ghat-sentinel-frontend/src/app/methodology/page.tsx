"use client";
import { ExternalLink, Info, AlertTriangle, BarChart2, Database, FlaskConical, Scale, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, Chip } from "@/components/ui";
import { AssessmentBadge, PriorityBadge } from "@/components/shared/badges";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { useCriteria, useMetadata, useRanked } from "@/hooks/queries";

function SectionBox({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-brand-soft/40 px-5 py-3">
        <Icon className="h-4 w-4 text-brand" aria-hidden />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

export default function MethodologyPage() {
  const meta = useMetadata();
  const ranked = useRanked();
  const criteria = useCriteria();

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Data & Methodology"
        crumbs={[{ href: "/", label: "Dashboard" }, { label: "Methodology" }]}
        subtitle="All figures on this page are derived from live endpoints. The page never drifts from the backend."
      />

      {/* Data Sources */}
      <SectionBox icon={Database} title="Data sources">
        {meta.isPending && <LoadingState rows={3} />}
        {meta.isError && <ErrorState error={meta.error} onRetry={() => meta.refetch()} />}
        {meta.data && (
          <div className="space-y-4">
            {meta.data.sources.map((src) => (
              <div key={src.file_name} className="rounded-lg border border-line p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-ink">{src.file_name}</span>
                  {src.source_url?.startsWith("https://") && (
                    <a href={src.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-info hover:underline">
                      Source <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                  <div><span className="text-ink-muted">Rows: </span><span className="num font-medium">{src.row_count.toLocaleString("en-IN")}</span></div>
                  <div><span className="text-ink-muted">Valid: </span><span className="num font-medium text-brand">{src.valid_row_count.toLocaleString("en-IN")}</span></div>
                  <div><span className="text-ink-muted">Invalid: </span><span className="num font-medium text-critical">{src.invalid_row_count}</span></div>
                  {src.year_range && <div><span className="text-ink-muted">Years: </span><span className="num font-medium">{src.year_range[0]}–{src.year_range[1]}</span></div>}
                </div>
                {src.sha256 && <p className="text-xs text-ink-muted">SHA-256: <span className="font-mono">{src.sha256.slice(0, 16)}…</span></p>}
                {src.retrieved_at && <p className="text-xs text-ink-muted">Retrieved: {src.retrieved_at}</p>}
                {src.warnings.length > 0 && (
                  <ul className="list-disc pl-4 text-xs text-caution space-y-0.5">{src.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                )}
                {src.errors.length > 0 && (
                  <ul className="list-disc pl-4 text-xs text-critical space-y-0.5">{src.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                )}
              </div>
            ))}
            <p className="text-xs text-ink-muted">
              Track 2 repository:{" "}
              <a href="https://github.com/Vishal4742/bhopal-impact-lab-2026-problem-statements/tree/main/track-2-visarjan-ghat-watch" target="_blank" rel="noopener noreferrer" className="text-info hover:underline inline-flex items-center gap-1">
                GitHub <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </p>
          </div>
        )}
      </SectionBox>

      {/* Parameters & units */}
      <SectionBox icon={FlaskConical} title="Parameters and units">
        {meta.isPending && <LoadingState rows={3} />}
        {meta.data && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-caution/30 bg-caution-soft p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-caution" aria-hidden />
              <p className="text-xs text-caution font-medium">Units are assumed by dataset curators — the source PDFs do not print units. Treat unit values with caution.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted text-xs border-b border-line">
                    <th className="pr-4 pb-2 font-medium">Parameter</th>
                    <th className="pr-4 pb-2 font-medium">Unit (assumed)</th>
                    <th className="pr-4 pb-2 font-medium">Readings</th>
                    <th className="pb-2 font-medium">CPCB limit in class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {meta.data.parameters.map((p) => (
                    <tr key={p.parameter} className="hover:bg-canvas/50">
                      <td className="pr-4 py-2 font-medium">{p.parameter}</td>
                      <td className="pr-4 py-2 text-ink-muted">{p.unit ?? <span className="italic">—</span>}</td>
                      <td className="pr-4 py-2 num">{p.observation_count.toLocaleString("en-IN")}</td>
                      <td className="py-2">
                        {p.cpcb_classes_with_limit.length > 0 ? p.cpcb_classes_with_limit.map((c) => <Chip key={c} tone="info" className="mr-1">Class {c}</Chip>) : <span className="text-ink-muted text-xs">None</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionBox>

      {/* Criteria */}
      <SectionBox icon={Scale} title="CPCB water-quality criteria applied">
        {criteria.isPending && <LoadingState rows={4} />}
        {criteria.isError && <ErrorState error={criteria.error} onRetry={() => criteria.refetch()} />}
        {criteria.data && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Default class is <strong>B (Outdoor bathing, organised)</strong>. Only parameters with a class B entry are compared. Range limits are treated as inclusive. Dataset &quot;BOD&quot; maps to &quot;BOD (5 days 20°C)&quot; in the criteria file.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-line">
                    <th className="pr-3 pb-2 font-medium">Class</th>
                    <th className="pr-3 pb-2 font-medium">Parameter</th>
                    <th className="pr-3 pb-2 font-medium">Limit</th>
                    <th className="pr-3 pb-2 font-medium">Unit</th>
                    <th className="pb-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {criteria.data.map((c) => (
                    <tr key={c.id} className={`hover:bg-canvas/50 ${c.cpcb_class === "B" ? "bg-brand-soft/20" : ""}`}>
                      <td className="pr-3 py-1.5"><Chip tone={c.cpcb_class === "B" ? "good" : "neutral"}>Class {c.cpcb_class}</Chip></td>
                      <td className="pr-3 py-1.5 font-medium">{c.parameter}</td>
                      <td className="pr-3 py-1.5 num">
                        {c.comparison_operator === "between_inclusive" ? `${c.threshold}–${c.threshold_upper}` : `${c.comparison_operator} ${c.threshold}`}
                      </td>
                      <td className="pr-3 py-1.5 text-ink-muted">{c.unit ?? "—"}</td>
                      <td className="py-1.5 text-ink-muted max-w-xs truncate">{c.source_reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionBox>

      {/* Assessment classifications */}
      <SectionBox icon={BarChart2} title="Assessment classifications">
        <div className="space-y-3">
          {[
            { result: "within_criterion" as const, label: "Within criterion", desc: "The recorded value meets the applicable CPCB class B limit. This does not mean the site is safe — it means the one measurement met the one limit." },
            { result: "outside_criterion" as const, label: "Outside criterion", desc: "The recorded value does not meet the applicable CPCB class B limit. This is a specific, documented concern, not a comprehensive environmental or health assessment." },
            { result: "insufficient_data" as const, label: "Insufficient data", desc: "The value is null — either not sampled (flag: not sampled, *, **, DRY, na) or below detection (flag: BDL, ND). Blank is not clean; BDL is not zero." },
            { result: "not_comparable" as const, label: "No applicable criterion", desc: "No CPCB class B limit applies to this parameter. Shown neutrally — not a problem or an absence of concern. Ten of thirteen parameters fall here." },
          ].map((r) => (
            <div key={r.result} className="flex items-start gap-3 rounded-lg border border-line p-3">
              <AssessmentBadge result={r.result} />
              <div className="min-w-0">
                <p className="text-xs font-mono text-ink-muted mb-0.5">{r.result}</p>
                <p className="text-sm text-ink">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionBox>

      {/* Prioritization */}
      <SectionBox icon={BarChart2} title="Site prioritization method">
        {ranked.isPending && <LoadingState rows={3} />}
        {ranked.data && (
          <div className="space-y-4">
            <p className="text-sm text-ink">{ranked.data.method}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { name: "Exceedance rate", max: 40, desc: "Share of evaluable readings outside criterion" },
                { name: "Severity", max: 20, desc: "How far readings exceed the limit" },
                { name: "Recurrence", max: 25, desc: "Whether exceedances repeat across seasons" },
                { name: "Staleness", max: 15, desc: "How recent the data is" },
              ].map((f) => (
                <div key={f.name} className="rounded-lg border border-line bg-canvas p-3 text-center">
                  <p className="text-2xl font-bold text-brand">{f.max}</p>
                  <p className="text-xs font-semibold text-ink mt-0.5">{f.name}</p>
                  <p className="text-xs text-ink-muted mt-1">{f.desc}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <PriorityBadge level="high" /><span className="text-xs text-ink-muted self-center">≥ 60</span>
              <PriorityBadge level="review" /><span className="text-xs text-ink-muted self-center">≥ 35</span>
              <PriorityBadge level="routine" /><span className="text-xs text-ink-muted self-center">{"< 35"}</span>
              <PriorityBadge level="insufficient_data" /><span className="text-xs text-ink-muted self-center">{"< 6 evaluable readings"}</span>
            </div>
            <div className="rounded-md border border-critical/20 bg-critical-soft p-3">
              <p className="text-xs font-medium text-critical">{ranked.data.disclaimer}</p>
            </div>
          </div>
        )}
      </SectionBox>

      {/* Forecast policy */}
      <SectionBox icon={BarChart2} title="Forecast policy (October 20 outlook)">
        <p className="text-sm text-ink">
          An experimental forecast is produced only when ≥ 5 comparable seasons exist for a ghat–parameter combination. With the current dataset (3 Durga seasons, 2023–2025), this threshold is never met. The October 20 endpoint always returns <code className="rounded bg-canvas px-1 text-xs">historical_comparison</code>, showing past values without predicting a new one.
        </p>
      </SectionBox>

      {/* Limitations */}
      <SectionBox icon={ShieldAlert} title="Known limitations">
        <ul className="list-disc pl-5 space-y-2 text-sm text-ink">
          {[
            "Historical records ≠ current water conditions. These findings do not tell you whether a ghat is safe today.",
            "No exact sample dates exist. Only year, festival (Ganesh/Durga) and phase (pre/during/after) are available.",
            "Units are assumed by dataset curators. The source PDFs do not print units.",
            "Blank value = not sampled (not clean). BDL/ND = below detection, not zero.",
            "Only pH, Dissolved oxygen and BOD are evaluated against class B. Ten other parameters have no applicable class B limit.",
            "\"Outside a criterion\" is a documented measurement fact, not a complete environmental or health assessment.",
            "The statewide file was not checked row-by-row and contains flagged duplicates.",
            "AI re-words validated evidence only; it does not inspect the environment.",
            "Rani Kamlapati ghat and Kamla Park kund may be two distinct sites conflated in the source data.",
            "Bairagarh and Malikhedi have no Durga 2025 data in the source tables.",
            "No coordinates are available — all latitude/longitude values are null.",
            "No authentication — this is a demo tool with open case endpoints.",
          ].map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </SectionBox>

      {/* Metadata limitations from live API */}
      {meta.data && meta.data.limitations.length > 0 && (
        <SectionBox icon={Info} title="Backend-reported limitations">
          <ul className="list-disc pl-5 space-y-1 text-sm text-ink-muted">
            {meta.data.limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </SectionBox>
      )}
    </div>
  );
}
