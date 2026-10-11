"use client";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui";
import { ROLE_LABEL, homeFor } from "@/lib/access";
import type { Role } from "@/lib/types";

export function Forbidden({ role }: { role: Role | null }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-line bg-white p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-marigold-soft text-marigold-dark"><Lock className="h-5 w-5" aria-hidden /></span>
      <h1 className="font-display text-2xl font-semibold">This area isn&apos;t part of your account</h1>
      <p className="text-sm text-ink-muted">{role ? `${ROLE_LABEL[role]} accounts can't open this page.` : "Please sign in to continue."} If you think this is a mistake, ask a municipal officer to review your access.</p>
      <Link href={role ? homeFor(role) : "/login"}><Button variant="primary">{role ? "Go to my home" : "Sign in"}</Button></Link>
    </div>
  );
}
