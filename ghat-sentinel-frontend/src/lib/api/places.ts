import { request } from "./client";
import type { EvidenceItem, ImportReport, Place, PlaceKind, PlaceList } from "../types";

const UPLOAD_TIMEOUT_MS = 60000;
export const getPlaces = (signal?: AbortSignal) => request<PlaceList>("/places", { signal });
export const createPlace = (b: { name: string; kind: PlaceKind; latitude: number; longitude: number; ghat_id?: string | null; description?: string | null }) =>
  request<Place>("/places", { method: "POST", body: b });
export const patchPlace = (id: string, b: { name?: string; kind?: PlaceKind; latitude?: number; longitude?: number; verified?: boolean; active?: boolean; description?: string | null }) =>
  request<Place>(`/places/${encodeURIComponent(id)}`, { method: "PATCH", body: b });

export const listEvidence = (p: { ghat_id?: string; kind?: "image" | "report"; limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
  request<{ items: EvidenceItem[]; total: number }>("/evidence", { query: { limit: 30, ...p }, signal });
export const uploadEvidence = (f: { file: File; ghat_id?: string; latitude?: number; longitude?: number; note?: string }) => {
  const fd = new FormData();
  fd.append("file", f.file);
  if (f.ghat_id) fd.append("ghat_id", f.ghat_id);
  if (f.latitude !== undefined && f.longitude !== undefined) { fd.append("latitude", String(f.latitude)); fd.append("longitude", String(f.longitude)); }
  if (f.note) fd.append("note", f.note);
  return request<EvidenceItem>("/evidence", { method: "POST", body: fd, timeoutMs: UPLOAD_TIMEOUT_MS });
};
export const evidenceFile = (id: string) => request<Blob>(`/evidence/${encodeURIComponent(id)}/file`, { blob: true });

export const importReadings = (file: File, commit: boolean) => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("commit", commit ? "true" : "false");
  return request<ImportReport>("/uploads/readings", { method: "POST", body: fd, timeoutMs: UPLOAD_TIMEOUT_MS });
};
export const readingsTemplate = () => request<Blob>("/uploads/readings/template", { blob: true });
