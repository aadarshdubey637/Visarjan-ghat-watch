"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui";
import { EmptyState } from "@/components/shared/states";
import { buildSeasonRows, type LineInput } from "@/lib/chartdata";
import { fmtNum, type RefLine } from "@/lib/domain";

const COLORS = ["#19765B", "#3567A8", "#B7791F", "#B42318", "#172B3A", "#7A4FB5", "#0E7C86"];
const DASH = ["", "6 3", "2 3"];

interface Props { title: string; parameter: string; unit: string | null; lines: LineInput[]; refLines?: RefLine[]; height?: number }

export function TrendChart({ title, parameter, unit, lines, refLines = [], height = 300 }: Props) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const { rows, gaps } = useMemo(() => buildSeasonRows(lines), [lines]);
  const hasNumeric = lines.some((l) => l.points.some((p) => p.value !== null));
  const yLabel = unit ? `${parameter} (${unit})` : parameter;
  return (
    <figure aria-label={title} className="space-y-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="flex gap-1" role="group" aria-label="View as">
          <Button size="sm" variant={view === "chart" ? "primary" : "secondary"} onClick={() => setView("chart")} aria-pressed={view === "chart"}>Chart</Button>
          <Button size="sm" variant={view === "table" ? "primary" : "secondary"} onClick={() => setView("table")} aria-pressed={view === "table"}>Table</Button>
        </span>
      </figcaption>
      {!rows.length || !hasNumeric ? (
        <EmptyState title="No numeric readings to plot" body="Every reading for this selection is missing or below detection, so nothing is drawn. Missing values are never plotted as zero." />
      ) : view === "chart" ? (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 4, left: 12 }}>
              <CartesianGrid stroke="#E0E7E2" strokeDasharray="3 3" />
              <XAxis dataKey="season" padding={{ left: 24, right: 24 }} tick={{ fontSize: 11 }} interval={0} angle={rows.length > 4 ? -20 : 0} textAnchor={rows.length > 4 ? "end" : "middle"} height={rows.length > 4 ? 48 : 28} />
              <YAxis tick={{ fontSize: 11 }} width={48} label={{ value: yLabel, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#65736D", textAnchor: "middle" } }} domain={["auto", "auto"]} />
              <Tooltip content={<ChartTip lines={lines} unit={unit} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {refLines.map((r) => <ReferenceLine key={r.label} y={r.value} stroke="#B42318" strokeDasharray="5 4" label={{ value: r.label, fontSize: 10, fill: "#B42318", position: "insideTopRight" }} />)}
              {lines.map((l, i) => (
                <Line key={l.id} type="linear" dataKey={l.id} name={l.label} stroke={COLORS[i % COLORS.length]} strokeDasharray={DASH[i % DASH.length]} strokeWidth={2} connectNulls={false} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive animationDuration={900} animationEasing="ease-out" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}: values by season</caption>
            <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-1.5 pr-3">Season</th>{lines.map((l) => <th key={l.id} className="py-1.5 pr-3">{l.label}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.season} className="border-b border-line/60">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">{r.season}</th>
                {lines.map((l) => { const v = r[l.id] as number | null; const f = r[`${l.id}__flag`] as string | null;
                  return <td key={l.id} className="num py-1.5 pr-3">{v === null ? <span className="text-ink-muted">{r[`${l.id}__period`] ? (f ?? "no value") : "not in records"}</span> : fmtNum(v)}</td>; })}
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {gaps.length > 0 && hasNumeric && (
        <p className="text-xs text-ink-muted">Not plotted (gaps, not zero): {gaps.map((g) => `${g.line} ${g.season} — ${g.flag}`).join("; ")}.</p>
      )}
      <p className="text-xs text-ink-muted">{refLines.length ? "Red dashed line = CPCB class limit applied by the backend. " : "No CPCB limit applies to this parameter under the selected class. "}X-axis shows sampling seasons; the source has no exact dates.</p>
    </figure>
  );
}

function ChartTip({ active, payload, label, lines, unit }: { active?: boolean; payload?: { dataKey: string; payload: Record<string, string | number | null> }[]; label?: string; lines: LineInput[]; unit: string | null }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-line bg-white p-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      {lines.map((l) => {
        const v = row[l.id] as number | null; const flag = row[`${l.id}__flag`] as string | null; const page = row[`${l.id}__page`] as string | null; const period = row[`${l.id}__period`] as string | null;
        if (period === null) return null;
        return <p key={l.id} className="num"><b>{l.label}</b> · {period}: {v === null ? (flag ?? "no value") : `${fmtNum(v)}${unit ? " " + unit : ""}`}{page ? ` · PDF p.${page}` : ""}</p>;
      })}
    </div>
  );
}
