"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ClipboardCheck, Eye, EyeOff, HardHat, KeyRound, Presentation, Users } from "lucide-react";
import { toast } from "sonner";
import { AuthSide } from "@/components/shared/auth-side";
import { Button, Field, Input, cn } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { ApiError, friendlyMessage } from "@/lib/api/client";
import { ROLE_LABEL, accessFor, homeFor } from "@/lib/access";
import type { Role } from "@/lib/types";

const TABS: { role: Exclude<Role, "developer">; label: string; icon: typeof Users; blurb: string }[] = [
  { role: "officer", label: "Officer", icon: ClipboardCheck, blurb: "Review priorities, generate briefs and manage verification cases." },
  { role: "worker", label: "Field worker", icon: HardHat, blurb: "See the cases assigned to you and record what you find on site." },
  { role: "citizen", label: "Community", icon: Users, blurb: "Learn responsible immersion practices and ask questions about the records." },
  { role: "demo", label: "Presenter", icon: Presentation, blurb: "One account with every view (officer, field worker and community) for demonstrations." },
];

function LoginForm() {
  const { user, ready, login, config } = useAuth();
  const router = useRouter(); const sp = useSearchParams(); const next = sp.get("next");
  const [tab, setTab] = useState<(typeof TABS)[number]["role"]>("officer");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const go = (role: Role) => {
    const dest = next && accessFor(next, role) === "ok" && next !== "/login" ? next : homeFor(role);
    router.replace(dest);
  };
  useEffect(() => { if (ready && user) go(user.role); }, [ready, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(null);
    try { const u = await login(email.trim(), password); toast.success(`Signed in as ${u.name}`); go(u.role); }
    catch (err) { setError(err instanceof ApiError && err.kind === "rate_limited" ? "Too many failed attempts. Wait a minute and try again." : friendlyMessage(err)); }
    finally { setBusy(false); }
  };
  const demo = config?.demo_accounts.find((d) => d.role === tab);
  const active = TABS.find((t) => t.role === tab)!;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-5">
      <AuthSide className="lg:col-span-2" title="Evidence you can act on." body="Ghat Sentinel turns years of buried water tests into a clear, honest picture of where to look first before Durga visarjan." />
      <div className="rounded-2xl border border-line bg-white p-6 shadow-sm md:p-8 lg:col-span-3">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-brand-soft p-1 text-center text-sm font-medium">
          <span className="rounded-md bg-white py-1.5 text-brand-dark shadow-sm">Sign in</span>
          <Link href="/register" className="rounded-md py-1.5 text-ink-muted hover:text-brand-dark">Sign up</Link>
        </div>
        <p className="eyebrow">Welcome back</p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-ink">Sign in</h1>
        <div role="tablist" aria-label="Account type" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TABS.map(({ role, label, icon: Icon }) => (
            <button key={role} role="tab" aria-selected={tab === role} onClick={() => { setTab(role); setError(null); }}
              className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition", tab === role ? "border-brand bg-brand-soft text-brand-dark" : "border-line hover:bg-canvas")}>
              <Icon className="h-4 w-4" aria-hidden />{label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-muted">{active.blurb}</p>

        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
          <Field label="Password" htmlFor="password">
            <div className="relative">
              <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-muted hover:text-ink">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </Field>
          {error && <p role="alert" className="rounded-md border border-critical/20 bg-critical-soft p-2.5 text-sm text-critical">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!email || !password}><KeyRound className="h-4 w-4" aria-hidden />Sign in</Button>
        </form>

        {demo && (
          <div className="mt-5 rounded-lg border border-dashed border-marigold/50 bg-marigold-soft p-3 text-xs text-marigold-dark">
            <p className="font-medium">Demo environment</p>
            <p className="mt-0.5">A {ROLE_LABEL[demo.role].toLowerCase()} demo account is available.</p>
            <p className="mt-1 font-mono">Email: {demo.email}<br />Password: {demo.password}</p>
            <button type="button" className="mt-1.5 font-semibold underline" onClick={() => { setEmail(demo.email); setPassword(demo.password); setError(null); }}>Fill in the demo login</button>
          </div>
        )}
        <p className="mt-5 text-sm text-ink-muted">New here? <Link href="/register" className="font-medium text-brand hover:underline">Create a community account</Link>, or read the <Link href="/citizen" className="font-medium text-brand hover:underline">citizen guide</Link> without signing in.</p>
        {tab !== "citizen" && <p className="mt-2 text-xs text-ink-muted">Officer and field-worker accounts are created by a municipal officer. Contact your department to get access.</p>}
      </div>
    </div>
  );
}
export default function LoginPage() { return <Suspense fallback={null}><LoginForm /></Suspense>; }
