"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthSide } from "@/components/shared/auth-side";
import { Button, Field, Input } from "@/components/ui";
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

export default function RegisterPage() {
  const { user, ready, register: signUp } = useAuth(); const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", password: "", confirm: "" } });
  useEffect(() => { if (ready && user) router.replace(homeFor(user.role)); }, [ready, user, router]);
  const e = f.formState.errors;
  const submit = f.handleSubmit(async (v) => {
    setFormError(null);
    try { const u = await signUp({ name: v.name, email: v.email, password: v.password }); toast.success(`Welcome, ${u.name}`); router.replace(homeFor(u.role)); }
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
        <p className="eyebrow">Community</p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-ink">Create your account</h1>
        <p className="mt-2 text-sm text-ink-muted">For citizens and Durga Puja organisers. Municipal officers and field workers are added by their department.</p>
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <Field label="Full name" htmlFor="name" error={e.name?.message}><Input id="name" autoComplete="name" {...f.register("name")} /></Field>
          <Field label="Email" htmlFor="email" error={e.email?.message}><Input id="email" type="email" autoComplete="email" {...f.register("email")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" htmlFor="password" error={e.password?.message} hint="At least 8 characters"><Input id="password" type="password" autoComplete="new-password" {...f.register("password")} /></Field>
            <Field label="Confirm password" htmlFor="confirm" error={e.confirm?.message}><Input id="confirm" type="password" autoComplete="new-password" {...f.register("confirm")} /></Field>
          </div>
          {formError && <p role="alert" className="rounded-md border border-critical/20 bg-critical-soft p-2.5 text-sm text-critical">{formError}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={f.formState.isSubmitting}>Create account</Button>
        </form>
        <p className="mt-5 text-sm text-ink-muted">Already have an account? <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
