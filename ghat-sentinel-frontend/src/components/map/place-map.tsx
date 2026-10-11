"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LMap, LayerGroup, Marker } from "leaflet";
import type { Place } from "@/lib/types";

export const BHOPAL: [number, number] = [23.2599, 77.4126];
export const LEVEL_COLOR: Record<string, string> = { high: "#b42318", review: "#d98a1c", routine: "#1f7a5c", insufficient_data: "#6b7a76" };
const colorFor = (p: Place) => (p.review_level ? LEVEL_COLOR[p.review_level] : "#2f6fb0");

interface Props {
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  me: { lat: number; lon: number } | null;
  pickMode: boolean;
  onPick: (lat: number, lon: number) => void;
  pending: { lat: number; lon: number } | null;
}

/** Leaflet over OpenStreetMap tiles (no API key). Loaded on the client only. */
export default function PlaceMap({ places, selectedId, onSelect, me, pickMode, onPick, pending }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const lib = useRef<typeof import("leaflet") | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const pickRef = useRef({ pickMode, onPick }); pickRef.current = { pickMode, onPick };
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default ?? (await import("leaflet"));
      if (dead || !el.current || map.current) return;
      lib.current = L as typeof import("leaflet");
      const m = L.map(el.current, { center: BHOPAL, zoom: 12, scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      m.on("click", (e) => { if (pickRef.current.pickMode) pickRef.current.onPick(e.latlng.lat, e.latlng.lng); });
      map.current = m;
      setTimeout(() => m.invalidateSize(), 50);
      setReady(true);
    })();
    return () => { dead = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const draw = () => {
      const L = lib.current, m = map.current, g = layer.current;
      if (!L || !m || !g) return;
      g.clearLayers(); markers.current = {};
      const pts: [number, number][] = [];
      for (const p of places) {
        const c = colorFor(p), sel = p.id === selectedId;
        const icon = L.divIcon({
          className: "",
          html: `<span style="display:block;width:${sel ? 26 : 20}px;height:${sel ? 26 : 20}px;background:${c};border:3px ${p.verified ? "solid" : "dashed"} #fff;border-radius:${p.kind === "kund" ? "4px" : "50%"};box-shadow:0 1px 6px rgba(0,0,0,.45);${sel ? "outline:3px solid #123b32;" : ""}"></span>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        });
        const mk = L.marker([p.latitude, p.longitude], { icon, title: p.name, keyboard: true }).addTo(g);
        mk.bindTooltip(p.name, { direction: "top", offset: [0, -10] });
        mk.on("click", () => onSelect(p.id));
        markers.current[p.id] = mk;
        pts.push([p.latitude, p.longitude]);
      }
      if (me) {
        L.circleMarker([me.lat, me.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#1d4ed8", fillOpacity: 1 }).addTo(g).bindTooltip("You are here");
        pts.push([me.lat, me.lon]);
      }
      if (pending) L.marker([pending.lat, pending.lon], { title: "New place" }).addTo(g);
      if (!fitted.current && pts.length) { m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); fitted.current = true; }
    };
    draw();
  }, [ready, places, selectedId, me, pending, onSelect]);

  useEffect(() => {
    const m = map.current;
    if (!m || !selectedId) return;
    const p = places.find((x) => x.id === selectedId);
    if (p) m.flyTo([p.latitude, p.longitude], Math.max(m.getZoom(), 14), { duration: 0.6 });
  }, [ready, selectedId, places]);

  useEffect(() => { if (me) { fitted.current = false; } }, [me]);
  useEffect(() => { const c = el.current; if (c) c.style.cursor = pickMode ? "crosshair" : ""; }, [pickMode]);

  return <div ref={el} className="z-0 h-[420px] w-full rounded-lg border border-line md:h-[560px]" role="application" aria-label="Map of immersion places" />;
}
