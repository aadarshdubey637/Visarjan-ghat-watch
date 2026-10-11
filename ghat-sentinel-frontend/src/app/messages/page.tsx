"use client";
import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardHeader, Chip, Field, Select } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Pager } from "@/components/ghats/readings-table";
import { useMessageLog, useMessagingConfig } from "@/hooks/queries";
import { fmtDateTime } from "@/lib/domain";
import type { MessageChannel } from "@/lib/types";

export default function MessagesPage() {
  const [channel, setChannel] = useState<"" | MessageChannel>(""); const [offset, setOffset] = useState(0); const LIMIT = 25;
  const log = useMessageLog({ channel: channel || undefined, limit: LIMIT, offset });
  const cfg = useMessagingConfig();
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Messages" subtitle="Every email and WhatsApp message sent from the platform, with who sent it and whether it was delivered to the provider. Send a message from a brief on the AI Intelligence page." />
      {cfg.data && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip tone={cfg.data.email.configured ? "good" : "warn"}><Mail className="h-3 w-3" aria-hidden />Email {cfg.data.email.configured ? `ready (${cfg.data.email.from_address ?? "sender set"})` : "not set up"}</Chip>
          <Chip tone={cfg.data.whatsapp.configured ? "good" : "warn"}><MessageCircle className="h-3 w-3" aria-hidden />WhatsApp {cfg.data.whatsapp.configured ? `ready (${cfg.data.whatsapp.mode} mode)` : "not set up"}</Chip>
          {cfg.data.dry_run && <Chip tone="info">Dry-run mode: nothing is really sent</Chip>}
        </div>
      )}
      <Card>
        <CardHeader title="History" action={<div className="w-40"><Field label="Channel" htmlFor="mc"><Select id="mc" value={channel} onChange={(e) => { setChannel(e.target.value as "" | MessageChannel); setOffset(0); }}><option value="">All</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></Select></Field></div>} />
        {log.isPending ? <LoadingState rows={5} /> : log.isError ? <div className="p-4"><ErrorState error={log.error} onRetry={() => log.refetch()} /></div> : log.data.items.length === 0 ? <EmptyState title="No messages yet" body="Generate a brief on the AI Intelligence page and choose Send." /> : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="p-3">When</th><th className="p-3">Channel</th><th className="p-3">Recipient</th><th className="p-3">Subject</th><th className="p-3">Status</th><th className="p-3">Sent by</th></tr></thead>
              <tbody>{log.data.items.map((m) => (
                <tr key={m.id} className="border-b border-line/60 align-top">
                  <td className="p-3 text-xs">{fmtDateTime(m.created_at)}</td>
                  <td className="p-3">{m.channel === "email" ? <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" aria-hidden />Email</span> : <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" aria-hidden />WhatsApp</span>}</td>
                  <td className="num p-3 text-xs">{m.channel === "whatsapp" ? `+${m.recipient}` : m.recipient}</td>
                  <td className="max-w-xs truncate p-3 text-xs" title={m.subject ?? ""}>{m.subject ?? "—"}</td>
                  <td className="p-3"><Chip tone={m.status === "sent" ? "good" : m.status === "dry_run" ? "neutral" : "bad"}>{m.status === "dry_run" ? "dry run" : m.status}</Chip>{m.error && <p className="mt-1 max-w-[16rem] text-xs text-critical">{m.error}</p>}</td>
                  <td className="p-3 text-xs">{m.sent_by}</td>
                </tr>))}</tbody></table></div>
            <Pager total={log.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  );
}
