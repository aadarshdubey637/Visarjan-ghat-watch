"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Landing } from "@/components/landing/landing";
import { homeFor } from "@/lib/access";

/** "/" is the landing page for visitors, the dashboard for officers/developers, and a redirect for workers and community members. */
export default function Home() {
  const { user, effectiveRole } = useAuth(); const router = useRouter();
  const redirect = user && effectiveRole && (effectiveRole === "worker" || effectiveRole === "citizen") ? homeFor(effectiveRole) : null;
  useEffect(() => { if (redirect) router.replace(redirect); }, [redirect, router]);
  if (!user) return <Landing />;
  if (redirect) return null;
  return <DashboardView />;
}
