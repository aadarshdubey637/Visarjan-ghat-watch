"use client";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crosshair, ExternalLink, MapPin, Navigation, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, CardHeader, Chip, Field, Input, Select } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { LEVEL_COLOR } from "@/components/map/place-map";
import { usePlaces } from "@/hooks/queries";
import * as api from "@/lib/api";
import { friendlyMessage } from "@/lib/api/client";
import { directionsUrl, distanceKm, fmtKm, geocode } from "@/lib/geo";
import type { Place, PlaceKind } from "@/lib/types";

const PlaceMap = dynamic(() => import("@/components/map/place-map"), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-lg bg-brand-soft md:h-[560px]" /> });

const KIND_LABEL: Record<PlaceKind, string> = { ghat: "Ghat", kund: "Immersion kund", hotspot: "Hotspot", water_body: "Water body" };
const LEVEL_LABEL: Record<string, string> = { high: "High review priority", review: "Needs review", routine: "Routine", insufficient_data: "Too little data" };
const LEVEL_TONE: Record<string, "bad" | "warn" | "good" | "neutral"> = { high: "bad", review: "warn", routine: "good", insufficient_data: "neutral" };

export default function MapPage() {
  const { effectiveRole, user } = useAuth();
  const canEdit = !!user && (effectiveRole === "officer" || effectiveRole === "developer");
  const qc = useQueryClient();
  const places = usePlaces();
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [meLabel, setMeLabel] = useState<string | null>(null);
  const [kind, setKind] = useState<"" | PlaceKind>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState(""); const [searching, setSearching] = useState(false); const [locating, setLocating] = useState(false);
  const [pick, setPick] = useState(false); const [pending, setPending] = useState<{ lat: number; lon: number } | null>(null);
  const [form, setForm] = useState({ name: "", kind: "kund" as PlaceKind, ghat_id: "" }); const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    const items = (places.data?.items ?? []).filter((p) => !kind || p.kind === kind).map((p) => ({ p, km: me ? distanceKm(me, { lat: p.latitude, lon: p.longitude }) : null }));
    if (me) items.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
    return items;
  }, [places.data, kind, me]);

  const locate = () => {
    if (!navigator.geolocation) { toast.error("Your browser cannot share its location. Type your area below instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setMeLabel("your current location"); setLocating(false); setSelected(null); },
      () => { setLocating(false); toast.error("Could not get your location. Allow location access, or type your area below."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const search = async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const r = await geocode(`${query.trim()}, Bhopal`);
      if (!r) { toast.error("No match found. Try a landmark or locality name."); return; }
      setMe({ lat: r.lat, lon: r.lon }); setMeLabel(r.label.split(",").slice(0, 2).join(",")); setSelected(null);
    } catch { toast.error("Search is unavailable right now. Use 'Use my location' instead."); }
    finally { setSearching(false); }
  };
  const onSelect = useCallback((id: string) => setSelected(id), []);
  const onPick = useCallback((lat: number, lon: number) => setPending({ lat, lon }), []);
  const refresh = () => qc.invalidateQueries({ queryKey: ["places"] });

  const save = async () => {
    if (!pending || form.name.trim().length < 2) return;
    setSaving(true);
    try {
      await api.createPlace({ name: form.name.trim(), kind: form.kind, latitude: pending.lat, longitude: pending.lon, ghat_id: form.ghat_id || null });
      toast.success("Place added"); setPending(null); setPick(false); setForm({ name: "", kind: "kund", ghat_id: "" }); refresh();
    } catch (e) { toast.error(friendlyMessage(e)); } finally { setSaving(false); }
  };
  const patch = async (p: Place, b: Parameters<typeof api.patchPlace>[1], msg: string) => {
    try { await api.patchPlace(p.id, b); toast.success(msg); refresh(); } catch (e) { toast.error(friendlyMessage(e)); }
  };
  const unlocated = places.data?.unlocated_ghats ?? [];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Visarjan map" subtitle="Find the nearest immersion ghat or kund, see its historical review level, and get directions. Enter your area or share your location." />
      <p className="rounded-md border border-marigold/40 bg-marigold-soft p-3 text-xs text-marigold-dark">
        {places.data?.disclaimer ?? "Locations are approximate. Review levels are historical (MPPCB 2023-2025), not live monitoring."}
      </p>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="primary" onClick={locate} loading={locating}><Crosshair className="h-4 w-4" aria-hidden />Use my location</Button>
          <form className="flex min-w-[240px] flex-1 items-end gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <div className="flex-1"><Field label="Or type your school, locality or landmark" htmlFor="q"><Input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Arera Colony, New Market" /></Field></div>
            <Button type="submit" loading={searching} disabled={query.trim().length < 3}><Search className="h-4 w-4" aria-hidden />Find nearest</Button>
          </form>
          <div className="w-44"><Field label="Show" htmlFor="k"><Select id="k" value={kind} onChange={(e) => setKind(e.target.value as "" | PlaceKind)}><option value="">All places</option>{(Object.keys(KIND_LABEL) as PlaceKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></Field></div>
        </div>
        {me && <p className="mt-3 text-sm text-ink-muted">Showing distances from <strong className="text-ink">{meLabel}</strong>. {list[0] && <>Nearest: <strong className="text-ink">{list[0].p.name}</strong> ({fmtKm(list[0].km ?? 0)} away, straight line).</>}</p>}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted" aria-label="Map legend">
          {Object.entries(LEVEL_LABEL).map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: LEVEL_COLOR[k] }} aria-hidden />{l}</span>)}
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-ink-muted" aria-hidden />Square = kund</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-ink-muted" aria-hidden />Dashed = not yet verified</span>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {places.isPending ? <LoadingState rows={6} /> : places.isError ? <ErrorState error={places.error} onRetry={() => places.refetch()} /> : (
            <PlaceMap places={list.map((x) => x.p)} selectedId={selected} onSelect={onSelect} me={me} pickMode={pick} onPick={onPick} pending={pending} />
          )}
          {canEdit && (
            <Card className="mt-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="text-sm font-semibold">Officer tools</h2><p className="text-xs text-ink-muted">Add a ghat, kund or hotspot by clicking its position on the map. {unlocated.length > 0 && `${unlocated.length} ghat(s) in the data have no location yet.`}</p></div>
                <Button variant={pick ? "primary" : "secondary"} onClick={() => { setPick(!pick); setPending(null); }}><Plus className="h-4 w-4" aria-hidden />{pick ? "Click the map…" : "Add a place"}</Button>
              </div>
              {pick && pending && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Name" htmlFor="pn"><Input id="pn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Municipal kund, Ward 12" /></Field>
                  <Field label="Type" htmlFor="pk"><Select id="pk" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PlaceKind })}>{(Object.keys(KIND_LABEL) as PlaceKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></Field>
                  <Field label="Link to a ghat in the data" htmlFor="pg"><Select id="pg" value={form.ghat_id} onChange={(e) => setForm({ ...form, ghat_id: e.target.value })}><option value="">Not linked</option>{unlocated.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
                  <div className="sm:col-span-3 flex items-center gap-2"><Button variant="primary" onClick={save} loading={saving} disabled={form.name.trim().length < 2}>Save place</Button><span className="num text-xs text-ink-muted">{pending.lat.toFixed(5)}, {pending.lon.toFixed(5)}</span></div>
                </div>
              )}
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title={me ? "Nearest first" : "All places"} subtitle={me ? "Straight-line distance; road distance will be longer." : "Share your location or type an area to sort by distance."} />
          {places.isPending ? <LoadingState rows={4} /> : list.length === 0 ? <div className="p-4"><EmptyState title="No places match" body="Try another type, or ask an officer to add this location." /></div> : (
            <ul className="max-h-[560px] divide-y divide-line/70 overflow-y-auto">
              {list.map(({ p, km }, i) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setSelected(p.id)} aria-current={selected === p.id} className={`w-full p-3 text-left transition hover:bg-brand-soft ${selected === p.id ? "bg-brand-soft" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="flex items-center gap-1.5 text-sm font-medium text-ink"><MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden />{p.name}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{KIND_LABEL[p.kind]}{p.description ? ` · ${p.description}` : ""}</p></div>
                      {km !== null && <span className="num shrink-0 text-sm font-semibold text-ink">{fmtKm(km)}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {i === 0 && km !== null && <Chip tone="info">Nearest</Chip>}
                      {p.review_level && <Chip tone={LEVEL_TONE[p.review_level]}>{LEVEL_LABEL[p.review_level]}</Chip>}
                      <Chip tone={p.verified ? "good" : "neutral"}>{p.verified ? "Verified location" : "Approximate location"}</Chip>
                    </div>
                  </button>
                  {selected === p.id && (
                    <div className="space-y-2 bg-brand-soft/60 px-3 pb-3 text-xs text-ink-muted">
                      <p>{p.location_note}</p>
                      <div className="flex flex-wrap gap-2">
                        <a href={directionsUrl(p.latitude, p.longitude)} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="primary"><Navigation className="h-3.5 w-3.5" aria-hidden />Directions<ExternalLink className="h-3 w-3" aria-hidden /></Button></a>
                        {canEdit && !p.verified && <Button size="sm" onClick={() => patch(p, { verified: true }, "Marked as verified")}>Mark verified</Button>}
                        {canEdit && <Button size="sm" onClick={() => patch(p, { active: false }, "Place hidden")}>Hide</Button>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
