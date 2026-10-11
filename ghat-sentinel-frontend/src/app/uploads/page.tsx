"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, ImagePlus, MapPin, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, CardHeader, Chip, Field, Select, Textarea, cn } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { useGhats } from "@/hooks/queries";
import * as api from "@/lib/api";
import { friendlyMessage } from "@/lib/api/client";
import { fmtDateTime } from "@/lib/domain";
import type { EvidenceItem, ImportReport } from "@/lib/types";

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Thumb({ item }: { item: EvidenceItem }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (item.kind !== "image") return;
    let url: string | null = null, dead = false;
    api.evidenceFile(item.id).then((b) => { if (!dead) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => undefined);
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [item.id, item.kind]);
  if (item.kind !== "image") return <div className="flex h-28 items-center justify-center rounded-md bg-brand-soft text-brand"><FileText className="h-8 w-8" aria-hidden /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={item.note ?? item.filename} className="h-28 w-full rounded-md object-cover" /> : <div className="h-28 animate-pulse rounded-md bg-brand-soft" />;
}

function EvidenceTab() {
  const qc = useQueryClient();
  const ghats = useGhats();
  const files = useQuery({ queryKey: ["evidence"], queryFn: ({ signal }) => api.listEvidence({ limit: 30 }, signal) });
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [ghat, setGhat] = useState(""); const [note, setNote] = useState("");
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null); const [busy, setBusy] = useState(false);

  const gps = () => {
    if (!navigator.geolocation) { toast.error("Your browser cannot share its location."); return; }
    navigator.geolocation.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }), () => toast.error("Could not get your location."), { enableHighAccuracy: true, timeout: 10000 });
  };
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await api.uploadEvidence({ file, ghat_id: ghat || undefined, note: note.trim() || undefined, latitude: pos?.lat, longitude: pos?.lon });
      toast.success("File uploaded"); setFile(null); setNote(""); setPos(null); if (input.current) input.current.value = ""; qc.invalidateQueries({ queryKey: ["evidence"] });
    } catch (e) { toast.error(friendlyMessage(e)); } finally { setBusy(false); }
  };
  const download = async (it: EvidenceItem) => { try { saveBlob(await api.evidenceFile(it.id), it.filename); } catch (e) { toast.error(friendlyMessage(e)); } };

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader title="Add a photo or report" subtitle="JPG, PNG or WebP photos up to 5 MB; PDF, CSV or text reports up to 8 MB." />
        <div className="space-y-4 p-4">
          <Field label="File" htmlFor="ef"><input ref={input} id="ef" type="file" accept="image/jpeg,image/png,image/webp,.pdf,.csv,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-brand-soft" /></Field>
          <Field label="Ghat (optional)" htmlFor="eg"><Select id="eg" value={ghat} onChange={(e) => setGhat(e.target.value)}><option value="">Not linked to a ghat</option>{ghats.data?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <Field label="What does it show? (optional)" htmlFor="en"><Textarea id="en" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Foam and idol remains near the steps, morning of the visit" /></Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={gps}><MapPin className="h-4 w-4" aria-hidden />{pos ? "Position added" : "Add my GPS position"}</Button>
            {pos && <span className="num text-xs text-ink-muted">{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}</span>}
          </div>
          <Button variant="primary" className="w-full" onClick={submit} loading={busy} disabled={!file}><Upload className="h-4 w-4" aria-hidden />Upload</Button>
          <p className="text-xs text-ink-muted">Uploads are evidence for officers to review. They do not change any measured readings.</p>
        </div>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader title="Recent uploads" subtitle={files.data ? `${files.data.total} file(s)` : undefined} />
        {files.isPending ? <LoadingState rows={4} /> : files.isError ? <div className="p-4"><ErrorState error={files.error} onRetry={() => files.refetch()} /></div> : files.data.items.length === 0 ? <div className="p-4"><EmptyState title="Nothing uploaded yet" body="Photos and reports you add will appear here." /></div> : (
          <ul className="grid gap-3 p-4 sm:grid-cols-2">
            {files.data.items.map((it) => (
              <li key={it.id} className="rounded-lg border border-line p-2">
                <Thumb item={it} />
                <div className="mt-2 space-y-1 text-xs">
                  <p className="truncate font-medium text-ink" title={it.filename}>{it.filename}</p>
                  <p className="text-ink-muted">{kb(it.size_bytes)} · {fmtDateTime(it.created_at)} · {it.uploaded_by}</p>
                  {it.ghat_name && <Chip tone="info">{it.ghat_name}</Chip>}
                  {it.note && <p className="text-ink-muted">{it.note}</p>}
                  {it.latitude !== null && it.longitude !== null && <p className="num text-ink-muted">GPS {it.latitude.toFixed(4)}, {it.longitude.toFixed(4)}</p>}
                  <Button size="sm" onClick={() => download(it)}><Download className="h-3.5 w-3.5" aria-hidden />Download</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ReadingsTab() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [report, setReport] = useState<ImportReport | null>(null); const [busy, setBusy] = useState<"" | "preview" | "import">("");
  const run = async (commit: boolean) => {
    if (!file) return;
    setBusy(commit ? "import" : "preview");
    try {
      const r = await api.importReadings(file, commit); setReport(r);
      if (commit && r.committed) { toast.success(`Imported ${r.new_readings} readings`); qc.invalidateQueries(); }
    } catch (e) { setReport(null); toast.error(friendlyMessage(e)); } finally { setBusy(""); }
  };
  const template = async () => { try { saveBlob(await api.readingsTemplate(), "ghat-readings-template.csv"); } catch (e) { toast.error(friendlyMessage(e)); } };
  const canImport = !!report && !report.committed && report.errors.length === 0 && report.new_readings > 0;
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader title="Upload new lab results" subtitle="For Bhopal 2026 or any other city. Check first, then import." />
        <div className="space-y-4 p-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-ink-muted">
            <li>Download the template and fill one row per site, season and parameter.</li>
            <li>Choose the file and click <strong className="text-ink">Check file</strong>. Nothing is saved yet.</li>
            <li>If the summary looks right, click <strong className="text-ink">Import</strong>.</li>
          </ol>
          <Button onClick={template}><FileSpreadsheet className="h-4 w-4" aria-hidden />Download CSV template</Button>
          <Field label="CSV file" htmlFor="cf"><input ref={input} id="cf" type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-brand-soft" /></Field>
          <Button variant="primary" className="w-full" onClick={() => run(false)} loading={busy === "preview"} disabled={!file}>Check file</Button>
          <p className="text-xs text-ink-muted">Columns: year, festival (Ganesh or Durga), site, phase (pre, during or after), parameter, value. Optional: water_body, unit_assumed, flag (BDL, ND), source_page. A blank value is kept as missing, never as zero. Rows that already exist for a site, season and parameter are skipped, so re-uploading is safe. New sites appear without a map location: add it on the Map page.</p>
        </div>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader title="Check result" />
        {!report ? <div className="p-4"><EmptyState title="No file checked yet" body="Choose a CSV and click Check file to see what would be imported." /></div> : (
          <div className="space-y-4 p-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Rows in file", report.row_count], ["Valid", report.valid_row_count], ["Rejected", report.invalid_row_count], [report.committed ? "Imported" : "Will import", report.new_readings]].map(([l, v]) => (
                <div key={String(l)} className="rounded-md border border-line p-3"><p className="num text-xl font-semibold text-ink">{v}</p><p className="text-xs text-ink-muted">{l}</p></div>))}
            </div>
            {report.year_range && <p className="text-ink-muted">Years in file: {report.year_range[0] === report.year_range[1] ? report.year_range[0] : `${report.year_range[0]}-${report.year_range[1]}`}. Skipped as already present: {report.skipped_existing}.</p>}
            {report.new_ghats.length > 0 && <p><Chip tone="warn">New sites</Chip> <span className="text-ink-muted">{report.new_ghats.join(", ")}: added without a map location.</span></p>}
            {report.existing_ghats.length > 0 && <p><Chip tone="info">Existing sites</Chip> <span className="text-ink-muted">{report.existing_ghats.join(", ")}</span></p>}
            {report.errors.map((m) => <p key={m} role="alert" className="rounded-md border border-critical/20 bg-critical-soft p-2.5 text-critical">{m}</p>)}
            {report.warnings.map((m) => <p key={m} className="rounded-md border border-marigold/40 bg-marigold-soft p-2.5 text-xs text-marigold-dark">{m}</p>)}
            {report.exclusions.length > 0 && (
              <details className="rounded-md border border-line p-3"><summary className="cursor-pointer text-xs font-medium">Rejected rows ({report.invalid_row_count})</summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-ink-muted">{report.exclusions.map((x) => <li key={`${x.row}-${x.reason}`}>Row {x.row}: {x.reason}</li>)}</ul></details>)}
            {report.committed && <p className="rounded-md border border-brand/30 bg-brand-soft p-3 text-brand-dark">Done. The new readings now count in rankings, trends and briefs. Source: {report.source_file}.</p>}
            <Button variant="primary" onClick={() => run(true)} loading={busy === "import"} disabled={!canImport} className={cn(!canImport && "opacity-60")}>Import {report.new_readings} readings</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function UploadsPage() {
  const { effectiveRole } = useAuth();
  const canCsv = effectiveRole === "officer" || effectiveRole === "developer";
  const [tab, setTab] = useState<"files" | "csv">("files");
  const active = canCsv ? tab : "files";
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Uploads" subtitle={canCsv ? "Add new lab results (CSV) for any city or season, and attach site photos or reports as evidence." : "Attach site photos or reports from the field as evidence for officers."} />
      {canCsv && (
        <div role="tablist" aria-label="Upload type" className="inline-flex gap-1 rounded-lg bg-brand-soft p-1 text-sm font-medium">
          {([["files", "Photos & reports", ImagePlus], ["csv", "Lab results (CSV)", FileSpreadsheet]] as const).map(([k, l, Icon]) => (
            <button key={k} role="tab" aria-selected={active === k} onClick={() => setTab(k)} className={cn("flex items-center gap-2 rounded-md px-3 py-1.5", active === k ? "bg-white text-brand-dark shadow-sm" : "text-ink-muted hover:text-brand-dark")}><Icon className="h-4 w-4" aria-hidden />{l}</button>))}
        </div>
      )}
      {active === "files" ? <EvidenceTab /> : <ReadingsTab />}
    </div>
  );
}
