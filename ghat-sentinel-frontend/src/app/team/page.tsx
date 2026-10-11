"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dices, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button, Card, CardHeader, Chip, Field, Input, Select } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { useAuth } from "@/components/auth-provider";
import { useUsers } from "@/hooks/queries";
import { createUser, patchUser } from "@/lib/api";
import { ApiError, friendlyMessage } from "@/lib/api/client";
import { ROLE_LABEL } from "@/lib/access";
import { fmtDateTime } from "@/lib/domain";
import type { Role, UserRecord } from "@/lib/types";

const randomPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("") + "#7";
};

export default function TeamPage() {
  const { user } = useAuth(); const qc = useQueryClient();
  const users = useUsers();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("worker"); const [password, setPassword] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => createUser({ name: name.trim(), email: email.trim(), password, role }),
    onSuccess: (u) => { setCreated({ email: u.email, password }); setName(""); setEmail(""); setPassword(""); setFormErr(null); qc.invalidateQueries({ queryKey: ["users"] }); toast.success(`${ROLE_LABEL[u.role]} account created`); },
    onError: (e) => setFormErr(e instanceof ApiError && e.code === "EMAIL_TAKEN" ? "An account with this email already exists." : friendlyMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (u: UserRecord) => patchUser(u.id, { is_active: !u.is_active }),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success(`${u.name} ${u.is_active ? "re-activated" : "deactivated"}`); },
    onError: (e) => toast.error(friendlyMessage(e)),
  });
  const canAdd = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Team" subtitle="Create accounts for field workers and fellow officers, and switch access off when someone leaves. Community members register themselves." />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Add a team member" />
          <form className="space-y-3 p-4" noValidate onSubmit={(e) => { e.preventDefault(); if (canAdd && !add.isPending) add.mutate(); }}>
            <Field label="Full name" htmlFor="tn"><Input id="tn" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></Field>
            <Field label="Email" htmlFor="te"><Input id="te" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Field>
            <Field label="Role" htmlFor="tr"><Select id="tr" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="worker">Field worker</option><option value="officer">Municipal officer</option>{user?.role === "developer" && <option value="developer">Developer</option>}</Select></Field>
            <Field label="Temporary password" htmlFor="tp" hint="At least 8 characters. Share it with the person privately.">
              <div className="flex gap-2"><Input id="tp" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className="font-mono text-xs" />
                <Button type="button" onClick={() => setPassword(randomPassword())} aria-label="Generate a password"><Dices className="h-4 w-4" aria-hidden /></Button></div>
            </Field>
            {formErr && <p role="alert" className="rounded-md border border-critical/20 bg-critical-soft p-2 text-sm text-critical">{formErr}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={add.isPending} disabled={!canAdd}><UserPlus className="h-4 w-4" aria-hidden />Create account</Button>
          </form>
          {created && (
            <div className="mx-4 mb-4 rounded-lg border border-marigold/40 bg-marigold-soft p-3 text-sm text-marigold-dark" role="status">
              <p className="font-medium">Account ready. Share these details now; the password is not shown again.</p>
              <p className="mt-1 font-mono text-xs">{created.email}<br />{created.password}</p>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader title="People with access" subtitle="Community accounts are not listed here." />
          {users.isPending ? <LoadingState rows={5} /> : users.isError ? <div className="p-4"><ErrorState error={users.error} onRetry={() => users.refetch()} /></div> : users.data.items.length === 0 ? <EmptyState title="No team accounts yet" /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Added</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{users.data.items.filter((u) => u.role !== "citizen").map((u) => (
                <tr key={u.id} className="border-b border-line/60">
                  <td className="p-3"><p className="font-medium">{u.name}</p><p className="text-xs text-ink-muted">{u.email}</p></td>
                  <td className="p-3"><Chip tone={u.role === "officer" ? "info" : u.role === "developer" ? "warn" : "good"}>{ROLE_LABEL[u.role]}</Chip></td>
                  <td className="p-3"><Chip tone={u.is_active ? "good" : "neutral"}>{u.is_active ? "Active" : "Deactivated"}</Chip></td>
                  <td className="p-3 text-xs">{fmtDateTime(u.created_at)}</td>
                  <td className="p-3 text-right">{u.id !== user?.id && <Button size="sm" loading={toggle.isPending && toggle.variables?.id === u.id} onClick={() => toggle.mutate(u)}>{u.is_active ? "Deactivate" : "Reactivate"}</Button>}</td>
                </tr>))}</tbody></table></div>
          )}
        </Card>
      </div>
    </div>
  );
}
