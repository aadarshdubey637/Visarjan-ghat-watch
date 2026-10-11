"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClipboardCheck, HardHat, Presentation, Users } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthSide } from "@/components/shared/auth-side";
import { Button, Field, Input, cn } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { ApiError, friendlyMessage } from "@/lib/api/client";
import { homeFor } from "@/lib/access";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
type Form = z.infer<typeof schema>;
const TABS = [
  { role: "officer", label: "Officer", icon: ClipboardCheck },
  { role: "worker", label: "Field worker", icon: HardHat },
  { role: "citizen", label: "Community", icon: Users },
  { role: "demo", label: "Presenter", icon: Presentation },
] as const;

export default function RegisterPage() {
  const { user, ready, register: signUp, config } = useAuth(); const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["role"]>("citizen");
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", password: "", confirm: "" } });
  useEffect(() => { if (ready && user) router.replace(homeFor(user.role)); }, [ready, user, router]);
  const e = f.formState.errors;
  const staffOpen = config?.open_staff_signup !== false;
  const formOpen = tab === "citizen" || ((tab === "officer" || tab === "worker") && staffOpen);
  const submit = f.handleSubmit(async (v) => {
    setFormError(null);
    try { const u = await signUp({ name: v.name, email: v.email, password: v.password, role: tab === "officer" || tab === "worker" ? tab : "citizen" }); toast.success(`Welcome, ${u.name}`); router.replace(homeFor(u.role)); }
    catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") f.setError("email", { message: "An account with this email already exists." });
      else if (err instanceof ApiError && err.details) err.details.forEach((d) => { const k = d.field.split(".").pop() as keyof Form; if (k in v) f.setError(k, { message: d.message }); });
      else setFormError(friendlyMessage(err));
    }
  });
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-5">
      <AuthSide className="lg:col-span-2" title="Keep our water clean, together." body="Community accounts get the responsible-immersion guide, verified resources and plain-language answers about the historical records." />
      <div className="rounded-2xl border border-line bg-white p-6 shadow-sm md:p-8 lg:col-span-3">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-brand-soft p-1 text-center text-sm font-medium">
          <Link href="/login" className="rounded-md py-1.5 text-ink-muted hover:text-brand-dark">Sign in</Link>
          <span className="rounded-md bg-white py-1.5 text-brand-dark shadow-sm">Sign up</span>
        </div>
        <p className="eyebrow">{TABS.find((t) => t.role === tab)!.label}</p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-ink">Create your account</h1>
        <div role="tablist" aria-label="Account type" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TABS.map(({ role, label, icon: Icon }) => (
            <button key={role} type="button" role="tab" aria-selected={tab === role} onClick={() => setTab(role)}
              className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition", tab === role ? "border-brand bg-brand-soft text-brand-dark" : "border-line hover:bg-canvas")}>
              <Icon className="h-4 w-4" aria-hidden />{label}
            </button>
          ))}
        </div>
        {!formOpen && (
          <div className="mt-5 rounded-lg border border-line bg-canvas p-4 text-sm text-ink-muted">
            {tab === "demo"
              ? "The presenter account is a shared demo login. It does not need sign-up."
              : "Officer and field-worker accounts are created by a municipal officer (Team page). Ask your department for access, then sign in."}
            <div className="mt-3"><Link href={`/login?role=${tab}`}><Button variant="primary">Go to sign in</Button></Link></div>
          </div>
        )}
        {formOpen && <p className="mt-3 text-sm text-ink-muted">{tab === "citizen" ? "For citizens and Durga Puja organisers." : tab === "officer" ? "Creates an officer account: review priorities, generate briefs, manage cases and send messages." : "Creates a field-worker account: see assigned cases and record site findings."}</p>}
        <form hidden={!formOpen} onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <Field label="Full name" htmlFor="name" error={e.name?.message}><Input id="name" autoComplete="name" {...f.register("name")} /></Field>
          <Field label="Email" htmlFor="email" error={e.email?.message}><Input id="email" type="email" autoComplete="email" {...f.register("email")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" htmlFor="password" error={e.password?.message} hint="At least 8 characters"><Input id="password" type="password" autoComplete="new-password" {...f.register("password")} /></Field>
            <Field label="Confirm password" htmlFor="confirm" error={e.confirm?.message}><Input id="confirm" type="password" autoComplete="new-password" {...f.register("confirm")} /></Field>
          </div>
          {formError && <p role="alert" className="rounded-md border border-critical/20 bg-critical-soft p-2.5 text-sm text-critical">{formError}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={f.formState.isSubmitting}>{tab === "officer" ? "Create officer account" : tab === "worker" ? "Create field-worker account" : "Create account"}</Button>
        </form>
        <p className="mt-5 text-sm text-ink-muted">Already have an account? <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
