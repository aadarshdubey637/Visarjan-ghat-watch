"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, Chip, Input, Select } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { PriorityBadge } from "@/components/shared/badges";
import { getGhat } from "@/lib/api";
import { PRIORITY, PRIORITY_RANK } from "@/lib/domain";
import { useGhats, useRanked } from "@/hooks/queries";
import type { PriorityLevel } from "@/lib/types";

export default function GhatExplorer() {
  const ghats = useGhats(); const ranked = useRanked(); const router = useRouter();
  const [search, setSearch] = useState(""); const [band, setBand] = useState<"" | PriorityLevel>(""); const [water, setWater] = useState("");
  const [durga25, setDurga25] = useState(false); const [view, setView] = useState<"cards" | "table">("cards"); const [picked, setPicked] = useState<string[]>([]);
  const details = useQueries({ queries: (ghats.data?.items ?? []).map((g) => ({ queryKey: ["ghat", g.id, undefined], queryFn: ({ signal }: { signal: AbortSignal }) => getGhat(g.id, undefined, signal), staleTime: 300_000 })) });
  const has25 = (id: string) => details.find((d) => d.data?.id === id)?.data?.data_quality.seasons_covered.includes("2025 Durga");
  const rows = useMemo(() => (ghats.data?.items ?? []).map((g) => ({ g, r: ranked.data?.items.find((x) => x.ghat_id === g.id) }))
    .filter(({ g, r }) => (!search || g.name.toLowerCase().includes(search.toLowerCase())) && (!band || r?.priority_level === band) && (!water || g.water_body === water) && (!durga25 || has25(g.id)))
    .sort((a, b) => PRIORITY_RANK[a.r?.priority_level ?? "insufficient_data"] - PRIORITY_RANK[b.r?.priority_level ?? "insufficient_data"] || (b.r?.priority_score ?? -1) - (a.r?.priority_score ?? -1)),
    [ghats.data, ranked.data, search, band, water, durga25, details]); // eslint-disable-line react-hooks/exhaustive-deps
  const waters = Array.from(new Set((ghats.data?.items ?? []).map((g) => g.water_body).filter(Boolean))) as string[];
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const clear = () => { setSearch(""); setBand(""); setWater(""); setDurga25(false); };
  return (
    <div>
      <PageHeader title="Ghat Explorer" subtitle="Browse the immersion sites in the historical dataset. Coordinates are not available in the source data." actions={
        <><Button onClick={() => setView(view === "cards" ? "table" : "cards")}>{view === "cards" ? "Table view" : "Card view"}</Button>
          <Button variant="primary" disabled={picked.length < 2} onClick={() => router.push(`/analytics?ghats=${picked.join(",")}#compare`)}>Compare selected ({picked.length})</Button></>} />
      <Card className="mb-4 p-3"><div className="grid gap-3 md:grid-cols-5">
        <Input aria-label="Search ghats" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select aria-label="Priority band" value={band} onChange={(e) => setBand(e.target.value as PriorityLevel | "")}><option value="">All priority bands</option>{(Object.keys(PRIORITY) as PriorityLevel[]).map((k) => <option key={k} value={k}>{PRIORITY[k].label}</option>)}</Select>
        <Select aria-label="Water body" value={water} onChange={(e) => setWater(e.target.value)}><option value="">All water bodies</option>{waters.map((w) => <option key={w}>{w}</option>)}</Select>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={durga25} onChange={(e) => setDurga25(e.target.checked)} />Has Durga 2025 data</label>
        <div className="flex items-center justify-between gap-2 text-xs text-ink-muted"><span aria-live="polite">{rows.length} of {ghats.data?.items.length ?? 0} ghats</span><Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button></div>
      </div></Card>
      {ghats.isPending ? <LoadingState rows={6} /> : ghats.isError ? <ErrorState error={ghats.error} onRetry={() => ghats.refetch()} /> : rows.length === 0 ? <Card><EmptyState title="No ghats match these filters" action={<Button size="sm" onClick={clear}>Clear filters</Button>} /></Card> :
        view === "cards" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(({ g, r }) => (
            <Card key={g.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2"><h2 className="text-sm font-semibold">{g.name}</h2><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggle(g.id)} aria-label={`Compare ${g.name}`} />Compare</label></div>
              <p className="text-xs text-ink-muted">{g.water_body ?? "Water body not recorded"} · {g.first_sample_year ?? "—"}–{g.last_sample_year ?? "—"} · <span className="num">{g.observation_count}</span> readings</p>
              <div className="flex flex-wrap items-center gap-2"><PriorityBadge level={r?.priority_level} />{r && <span className="num text-sm font-bold">{r.priority_score === null ? "—" : r.priority_score.toFixed(1)}</span>}
                {r && <Chip tone={r.outside_reading_ids.length ? "bad" : "neutral"}>{r.outside_reading_ids.length} outside criterion</Chip>}
                {details.find((d) => d.data?.id === g.id)?.data?.data_quality.site_match_confidence === "medium" && <Chip tone="warn">Medium site-match confidence</Chip>}</div>
              <Link href={`/ghats/${g.id}`} className="mt-auto pt-1 text-sm font-medium text-brand hover:underline">Explore ghat</Link>
            </Card>))}</div>
        ) : (
          <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="p-3">Compare</th><th className="p-3">Ghat</th><th className="p-3">Water body</th><th className="p-3">Years</th><th className="p-3">Readings</th><th className="p-3">Priority</th><th className="p-3">Score</th><th className="p-3">Outside</th></tr></thead>
            <tbody>{rows.map(({ g, r }) => <tr key={g.id} className="border-b border-line/60"><td className="p-3"><input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggle(g.id)} aria-label={`Compare ${g.name}`} /></td>
              <td className="p-3"><Link className="font-medium hover:underline" href={`/ghats/${g.id}`}>{g.name}</Link></td><td className="p-3">{g.water_body ?? "—"}</td><td className="num p-3">{g.first_sample_year}–{g.last_sample_year}</td><td className="num p-3">{g.observation_count}</td>
              <td className="p-3"><PriorityBadge level={r?.priority_level} /></td><td className="num p-3">{r?.priority_score?.toFixed(1) ?? "—"}</td><td className="num p-3">{r?.outside_reading_ids.length ?? "—"}</td></tr>)}</tbody></table></Card>
        )}
      <p className="mt-3 text-xs text-ink-muted">No map, coordinates or photos: the source data contains none.</p>
    </div>
  );
}
