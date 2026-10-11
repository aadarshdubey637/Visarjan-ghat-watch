"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, LogIn, LogOut, Menu, ShieldAlert, X } from "lucide-react";
import { Wordmark, LogoMark } from "@/components/shared/logo";
import { Button, Chip, cn } from "@/components/ui";
import { useLang } from "@/components/providers";
import { useAuth } from "@/components/auth-provider";
import { useHealth, useMetadata } from "@/hooks/queries";
import { LoadingState, WidgetBoundary } from "@/components/shared/states";
import { Forbidden } from "@/components/shared/forbidden";
import { ROLE_LABEL, VIEW_AS, accessFor, homeFor, isStaff, navFor } from "@/lib/access";
import type { AuthUser, Role } from "@/lib/types";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

function NavList({ user, collapsed, onNavigate }: { user: AuthUser; collapsed?: boolean; onNavigate?: () => void }) {
  const path = usePathname(); const { t } = useLang();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 p-2">
      {navFor(user.role).map(({ href, key, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={collapsed ? t(key) : undefined}
            className={cn("group relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors", active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white")}>
            {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-marigold" aria-hidden />}
            <Icon className="h-4 w-4 shrink-0" aria-hidden />{!collapsed && <span>{t(key)}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function UserCard({ user, collapsed, onLogout }: { user: AuthUser; collapsed?: boolean; onLogout: () => void }) {
  return (
    <div className={cn("m-2 rounded-lg bg-white/8 p-2", collapsed && "p-1")}>
      <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marigold text-xs font-bold text-brand-dark" aria-hidden>{initials(user.name)}</span>
        {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{user.name}</p><p className="truncate text-[11px] text-white/60">{ROLE_LABEL[user.role]}</p></div>}
      </div>
      <button onClick={onLogout} className={cn("mt-2 flex min-h-8 w-full items-center justify-center gap-2 rounded-md text-xs text-white/75 hover:bg-white/10 hover:text-white", collapsed && "mt-1")} aria-label="Sign out">
        <LogOut className="h-3.5 w-3.5" aria-hidden />{!collapsed && "Sign out"}
      </button>
    </div>
  );
}

/** Presenter-only control: preview the officer, field-worker or community experience without signing out. */
function ViewSwitch() {
  const { viewAs, setViewAs } = useAuth(); const router = useRouter();
  const options: { key: Role | null; label: string }[] = [{ key: null, label: "All" }, ...VIEW_AS.map((r) => ({ key: r as Role, label: r === "citizen" ? "Community" : r === "worker" ? "Worker" : "Officer" }))];
  return (
    <div role="group" aria-label="Preview as" className="flex items-center gap-1 rounded-full border border-marigold/40 bg-marigold-soft p-0.5 text-xs">
      <span className="hidden pl-2 pr-1 font-medium text-marigold-dark lg:inline">View as</span>
      {options.map((o) => (
        <button key={o.label} aria-pressed={viewAs === o.key} onClick={() => { setViewAs(o.key); router.push(homeFor(o.key ?? "demo")); }}
          className={cn("min-h-7 rounded-full px-2.5 font-medium transition", viewAs === o.key ? "bg-marigold text-brand-dark shadow-sm" : "text-marigold-dark hover:bg-white/60")}>{o.label}</button>
      ))}
    </div>
  );
}

function BrandLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3"><span className="float-y"><LogoMark size={44} /></span><p className="text-sm text-ink-muted">Loading Ghat Sentinel…</p></div>
    </div>
  );
}

/** Top bar used for visitors, community members and the login pages (no sidebar). */
function PublicShell({ children, user, onLogout, overlay }: { children: ReactNode; user: AuthUser | null; onLogout: () => void; overlay?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div className={cn("flex min-h-screen flex-col", overlay ? "bg-brand-dark" : "bg-canvas")}>
      <header className={cn("z-30", overlay ? "absolute inset-x-0 top-0" : "sticky top-0 border-b border-line bg-canvas/90 backdrop-blur")}>
        <div className={cn("mx-auto flex h-16 items-center gap-3 px-4", overlay ? "glass glass-dark mt-4 max-w-6xl rounded-full px-5" : "max-w-6xl")}>
          <Link href="/" className="flex items-center gap-2" aria-label="Ghat Sentinel home"><LogoMark size={34} /><span className={cn("font-display text-lg font-semibold", overlay ? "text-white" : "text-brand-dark")}>Ghat Sentinel</span></Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="Public">
            <Link href="/citizen" className={cn("rounded-md px-3 py-2 text-sm font-medium", overlay ? "text-white/90 hover:bg-white/10" : "text-ink hover:bg-brand-soft")}>Citizen guide</Link>
            <label className="sr-only" htmlFor="lang">Language</label>
            <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as "en" | "hi")} className="hidden min-h-8 rounded-md border border-line bg-white px-2 text-xs text-ink sm:block"><option value="en">English</option><option value="hi">हिन्दी</option></select>
            {user?.role === "demo" && <ViewSwitch />}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-2 sm:flex"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-marigold text-xs font-bold text-brand-dark" aria-hidden>{initials(user.name)}</span><span className="text-sm font-medium">{user.name}</span></span>
                <Button size="sm" onClick={onLogout}><LogOut className="h-3.5 w-3.5" aria-hidden />Sign out</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/register"><Button size="sm">Sign up</Button></Link>
                <Link href="/login"><Button size="sm" variant="primary"><LogIn className="h-3.5 w-3.5" aria-hidden />Sign in</Button></Link>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className={cn("flex-1", overlay ? "w-full" : "mx-auto w-full max-w-6xl px-4 py-6")}>{children}</main>
      <footer className={cn("py-5 text-center text-xs", overlay ? "bg-brand-dark text-white/60" : "border-t border-line text-ink-muted")}>Historical MPPCB records, 2023–2025. Not live monitoring. Follow current official instructions.</footer>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const { lang, setLang, t } = useLang();
  const { user, ready, config, logout, effectiveRole } = useAuth();
  const health = useHealth(); const meta = useMetadata();
  const path = usePathname(); const router = useRouter();
  // Page content is rendered from live API data on the client only; rendering after mount avoids hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const role = effectiveRole; // a presenter previewing another role is treated as that role
  const staff = isStaff(role);
  const access = accessFor(path, role);
  const authPage = path === "/login" || path === "/register";
  useEffect(() => {
    if (!ready) return;
    if (access === "login") router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, access, path, router]);

  if (!mounted || !ready) return <BrandLoader />;
  const signOut = () => { logout(); router.replace("/"); };
  if (access === "login") return <BrandLoader />;

  // Visitors, community members, login/register and the landing page: no sidebar.
  if (!user || !staff || authPage) {
    return <PublicShell user={user} onLogout={signOut} overlay={path === "/" && !user}>{access === "forbidden" ? <Forbidden role={role} /> : <WidgetBoundary name="This page">{children}</WidgetBoundary>}</PublicShell>;
  }

  const connected = health.isSuccess && health.data.status === "ok";
  const first = user.name.split(" ")[0];
  return (
    <div className="flex min-h-screen">
      <aside className={cn("contours sticky top-0 hidden h-screen shrink-0 flex-col bg-brand-dark transition-[width] md:flex", collapsed ? "w-16" : "w-60")}>
        <div className={cn("flex h-14 items-center border-b border-white/10 px-3", collapsed && "justify-center")}>{collapsed ? <span className="font-display text-lg font-bold text-white">GS</span> : <Wordmark />}</div>
        <div className="flex-1 overflow-y-auto"><NavList user={{ ...user, role: role! }} collapsed={collapsed} /></div>
        <UserCard user={user} collapsed={collapsed} onLogout={signOut} />
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="mx-2 mb-2 flex min-h-9 items-center justify-center rounded-md text-white/60 hover:bg-white/10">
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button className="absolute inset-0 bg-navy/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="contours absolute inset-y-0 left-0 flex w-64 flex-col bg-brand-dark">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-3"><Wordmark /><button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 text-white"><X className="h-5 w-5" /></button></div>
            <div className="flex-1 overflow-y-auto"><NavList user={{ ...user, role: role! }} onNavigate={() => setOpen(false)} /></div>
            <UserCard user={user} onLogout={() => { setOpen(false); signOut(); }} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-line bg-canvas/90 px-3 py-2 backdrop-blur md:px-6">
          <button className="rounded-md p-2 hover:bg-white md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <span className="flex items-center gap-2 md:hidden"><LogoMark size={26} /><span className="font-display text-base font-semibold text-brand-dark">Ghat Sentinel</span></span>
          <p className="hidden font-display text-lg font-medium text-brand-dark md:block">Namaste, {first}</p>
          <div className="ml-auto flex items-center gap-2">
            {meta.data?.year_range && <Chip tone="info" className="hidden sm:inline-flex">{t("coverage")} · {meta.data.year_range[0]}–{meta.data.year_range[1]}</Chip>}
            {user.role === "demo" ? <ViewSwitch /> : <Chip tone="good" className="hidden sm:inline-flex">{ROLE_LABEL[user.role]}</Chip>}
            {/* Backend connectivity is an engineering detail: only developers see it. */}
            {user.role === "developer" && <Chip tone={connected ? "good" : health.isPending ? "neutral" : "bad"}><span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-brand" : health.isPending ? "bg-ink-muted" : "bg-critical")} aria-hidden />{health.isPending ? "Checking API…" : connected ? t("connected") : t("offline")}</Chip>}
            {config?.auth_enabled === false && <Chip tone="warn" className="hidden sm:inline-flex"><ShieldAlert className="h-3 w-3" aria-hidden />Sign-in disabled (open demo)</Chip>}
            <label className="sr-only" htmlFor="lang">Language</label>
            <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as "en" | "hi")} className="min-h-8 rounded-md border border-line bg-white px-2 text-xs"><option value="en">English</option><option value="hi">हिन्दी</option></select>
          </div>
        </header>
        <main className="flex-1 px-3 py-5 md:px-6">{access === "forbidden" ? <Forbidden role={role} /> : <WidgetBoundary name="This page">{children}</WidgetBoundary>}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, crumbs }: { title: string; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="mb-6 space-y-1">
      {crumbs && <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">{crumbs.map((c, i) => (<span key={i}>{i > 0 && " / "}{c.href ? <Link href={c.href} className="hover:underline">{c.label}</Link> : c.label}</span>))}</nav>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">{title}</h1>{subtitle && <p className="mt-1.5 max-w-3xl text-sm text-ink-muted">{subtitle}</p>}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export { LoadingState };
