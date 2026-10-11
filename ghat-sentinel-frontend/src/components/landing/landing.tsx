"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, BookOpenCheck, CalendarClock, ClipboardCheck, FileText, Languages, ListChecks, Play, Scale, ShieldCheck, Sparkles, Users, Waves } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { CountUp } from "@/components/shared/count-up";
import { useAuth } from "@/components/auth-provider";
import { useHealth } from "@/hooks/queries";
import { useReveal } from "@/hooks/use-reveal";
import { friendlyMessage } from "@/lib/api/client";
import { LANDING_IMAGES } from "@/lib/landing-images";

const DURGA_VISARJAN = new Date("2026-10-20T00:00:00+05:30");
const daysUntil = () => Math.ceil((DURGA_VISARJAN.getTime() - Date.now()) / 86_400_000);

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={`reveal ${className}`} style={{ ["--d" as string]: `${delay}ms` }}>{children}</div>;
}

/** Full-bleed photo that sits behind glass panels. */
function PhotoBackdrop({ src, tint = "from-brand-dark/80 via-brand-dark/70 to-navy/85", className = "" }: { src: string; tint?: string; className?: string }) {
  return (
    <div className={`absolute inset-0 -z-10 ${className}`} aria-hidden>
      <Image src={src} alt="" fill sizes="100vw" className="object-cover" />
      <div className={`absolute inset-0 bg-gradient-to-b ${tint}`} />
    </div>
  );
}

/** Decorative mini-visuals inside the feature cards. They illustrate the idea and show no real data. */
function MiniLimitChart() {
  return (
    <svg viewBox="0 0 220 90" className="h-28 w-full" aria-hidden>
      <line x1="0" y1="34" x2="220" y2="34" stroke="#F4D9A8" strokeWidth="1.5" strokeDasharray="5 4" />
      <polyline points="6,58 44,40 82,66 120,26 158,48 196,20" fill="none" stroke="#9fe3c6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {[[6, 58], [44, 40], [82, 66], [120, 26], [158, 48], [196, 20]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" fill={y > 34 ? "#F4A58E" : "#9fe3c6"} />)}
      <text x="214" y="30" textAnchor="end" fontSize="9" fill="#F4D9A8">limit</text>
    </svg>
  );
}
function MiniBars() {
  return (
    <div className="space-y-2" aria-hidden>
      {[["w-[88%]", "bg-[#E9A23B]"], ["w-[72%]", "bg-[#E9A23B]"], ["w-[55%]", "bg-[#9fe3c6]"], ["w-[34%]", "bg-[#9fe3c6]"]].map(([w, c], i) => (
        <div key={i} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white/60" /><span className="h-2.5 flex-1 rounded-full bg-white/15"><span className={`block h-full rounded-full ${w} ${c} grow-x`} style={{ animationDelay: `${i * 120}ms` }} /></span></div>
      ))}
    </div>
  );
}
function MiniChat() {
  return (
    <div className="space-y-2 text-[11px] leading-snug" aria-hidden>
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#DCF8C6] px-3 py-1.5 text-[#1c3b2a]">Example · WhatsApp brief</p>
      <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-white/20 px-3 py-1.5">Priority, reason and the numbers behind it — with units, sampling period and one next step.</p>
      <p className="w-fit rounded-full bg-white/15 px-2.5 py-1 text-[10px]">हिन्दी · English · Bilingual</p>
    </div>
  );
}
function MiniSteps() {
  return (
    <ol className="flex flex-wrap gap-1.5 text-[10px] font-medium" aria-hidden>
      {["Needs verification", "Under review", "Action assigned", "Resolved"].map((s, i) => (
        <li key={s} className={`rounded-full border px-2.5 py-1 ${i === 1 ? "border-[#E9A23B] bg-[#E9A23B]/25" : "border-white/30 bg-white/10"}`}>{s}</li>
      ))}
    </ol>
  );
}

export function Landing() {
  const { config, login, user } = useAuth(); const router = useRouter();
  const health = useHealth();
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDays(daysUntil()), []);
  useReveal();
  const presenter = config?.demo_accounts.find((d) => d.role === "demo");
  const launchDemo = async () => {
    if (!presenter || busy) return; setBusy(true);
    try { await login(presenter.email, presenter.password); router.push("/"); }
    catch (e) { toast.error(friendlyMessage(e)); setBusy(false); }
  };
  const [a, b, c, d] = LANDING_IMAGES;

  return (
    <div className="overflow-x-clip bg-brand-dark text-white">
      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden pt-24 pb-28">
        <div className="absolute inset-0 -z-20" aria-hidden>
          {LANDING_IMAGES.map((img, i) => (
            <div key={img.src} className="hero-slide absolute inset-0" style={{ animationDelay: `${i * 7}s` }}><Image src={img.src} alt="" fill sizes="100vw" priority={i === 0} className="object-cover" /></div>
          ))}
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-dark via-brand-dark/85 to-brand-dark/40" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-brand-dark via-transparent to-brand-dark/40" aria-hidden />
        <div className="contours absolute inset-0 -z-10 opacity-70" aria-hidden />

        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <p className="eyebrow !text-[#F4D9A8] animate-slide-in-left">Visarjan Ghat Watch · Bhopal</p>
            <h1 className="font-display mt-4 text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl animate-slide-up">Know where to look <span className="text-sheen">before</span> the immersion.</h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/85 md:text-lg animate-slide-up" style={{ animationDelay: "90ms" }}>
              Three years of buried water tests from Bhopal&apos;s immersion ghats, lined up against the legal limits, so the people who plan Durga visarjan can act on evidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 animate-slide-up" style={{ animationDelay: "170ms" }}>
              {presenter && !user && (
                <Button onClick={launchDemo} loading={busy} className="!min-h-12 !border-transparent !bg-marigold px-6 !text-brand-dark shadow-[0_10px_30px_rgba(233,162,59,.45)] hover:!bg-[#f0b153]"><Play className="h-4 w-4" aria-hidden />Launch live demo</Button>
              )}
              <Link href="/login"><Button className={`!min-h-12 px-6 ${presenter && !user ? "glass !text-white" : "!border-transparent !bg-marigold !text-brand-dark hover:!bg-[#f0b153]"}`}>Sign in <ArrowRight className="h-4 w-4" aria-hidden /></Button></Link>
              <Link href="/register"><Button className="glass !min-h-12 px-6 !text-white">Sign up</Button></Link>
              <Link href="/citizen"><Button className="glass !min-h-12 px-6 !text-white">Citizen guide</Button></Link>
            </div>
            <p className="mt-6 text-xs text-white/65">Historical MPPCB records 2023–2025 · not live monitoring</p>
          </div>

          {/* live glass snapshot */}
          <div className="relative hidden lg:col-span-2 lg:block">
            <div className="glass glass-tilt rounded-3xl p-6 animate-scale-in" style={{ animationDelay: "250ms" }}>
              <div className="flex items-center gap-2 text-xs font-medium text-white/80"><span className="live-dot h-2 w-2 rounded-full bg-[#7ee0b5]" aria-hidden />Dataset snapshot</div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div><p className="font-display text-5xl font-semibold">{health.data ? <CountUp value={health.data.ghats_loaded} /> : "—"}</p><p className="mt-1 text-xs text-white/70">immersion ghats</p></div>
                <div><p className="font-display text-5xl font-semibold">{health.data ? <CountUp value={health.data.readings_loaded} /> : "—"}</p><p className="mt-1 text-xs text-white/70">readings checked</p></div>
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-black/20 p-3">
                <CalendarClock className="h-5 w-5 shrink-0 text-marigold" aria-hidden />
                <p className="text-sm">{days === null ? "Durga visarjan: 20 October 2026" : days > 0 ? <><b className="font-display text-xl">{days}</b> days to Durga visarjan (20 Oct 2026)</> : days === 0 ? "Durga visarjan is today" : "Durga visarjan 2026 has passed"}</p>
              </div>
            </div>
            <figure className="glass drift absolute -bottom-20 -left-10 w-44 overflow-hidden rounded-2xl p-1.5" style={{ ["--r" as string]: "-4deg" }}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl"><Image src={c.src} alt={c.alt} fill sizes="180px" className="object-cover" /></div>
              <figcaption className="px-1 pt-1.5 text-[10px] text-white/80">{c.caption}</figcaption>
            </figure>
            <figure className="glass drift absolute -right-6 -top-10 w-36 overflow-hidden rounded-2xl p-1.5" style={{ ["--r" as string]: "5deg", animationDelay: "1.5s" }}>
              <div className="relative aspect-square overflow-hidden rounded-xl"><Image src={b.src} alt={b.alt} fill sizes="150px" className="object-cover" /></div>
            </figure>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/15 bg-black/20 py-3 backdrop-blur-md" aria-hidden>
          <div className="marquee-track flex w-max gap-10 whitespace-nowrap text-xs font-medium uppercase tracking-[0.18em] text-white/70">
            {Array.from({ length: 2 }).flatMap((_, k) => ["Evidence before opinion", "Missing is never clean", "CPCB class B limits", "Hindi & English briefs", "Verification cases", "Citizen guide", "Historical, not live"].map((t) => <span key={`${k}-${t}`} className="flex items-center gap-10">{t}<span className="h-1 w-1 rounded-full bg-marigold" /></span>))}
          </div>
        </div>
      </section>

      {/* ── FEATURES (glass on a photo) ───────────────────────────────── */}
      <section className="relative isolate overflow-hidden px-5 py-24" aria-labelledby="features">
        <PhotoBackdrop src={d.src} className="bg-fixed-photo" tint="from-brand-dark/90 via-brand-dark/80 to-brand-dark/95" />
        <div className="contours absolute inset-0 -z-10 opacity-60" aria-hidden />
        <div className="mx-auto max-w-6xl">
          <Reveal><p className="eyebrow !text-[#F4D9A8]">What it does</p>
            <h2 id="features" className="font-display mt-2 max-w-2xl text-4xl font-semibold leading-tight md:text-5xl">From a 90-page PDF to a decision you can defend</h2></Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-6 [perspective:1200px]">
            <Reveal className="md:col-span-4"><article className="glass glass-tilt h-full rounded-3xl p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Scale className="h-5 w-5 text-[#9fe3c6]" aria-hidden /></span>
              <h3 className="font-display mt-4 text-2xl font-semibold">Evidence engine</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/80">Every MPPCB reading is checked against CPCB class B limits by deterministic rules. Each result keeps its source file, row and PDF page, and missing is never treated as clean.</p>
              <div className="mt-4 max-w-md"><MiniLimitChart /></div>
            </article></Reveal>
            <Reveal delay={90} className="md:col-span-2"><article className="glass glass-tilt h-full rounded-3xl p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><ListChecks className="h-5 w-5 text-[#F4D9A8]" aria-hidden /></span>
              <h3 className="font-display mt-4 text-2xl font-semibold">Review priorities</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">A transparent four-factor score ranks the ghats, and shows exactly why.</p>
              <div className="mt-5"><MiniBars /></div>
            </article></Reveal>

            <Reveal className="md:col-span-2"><article className="glass glass-tilt h-full rounded-3xl p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Languages className="h-5 w-5 text-[#9fe3c6]" aria-hidden /></span>
              <h3 className="font-display mt-4 text-2xl font-semibold">Briefs that travel</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">Hindi, English or bilingual summaries ready to forward. AI only re-words checked evidence.</p>
              <div className="mt-5"><MiniChat /></div>
            </article></Reveal>
            <Reveal delay={90} className="md:col-span-2"><article className="glass glass-tilt h-full rounded-3xl p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><ClipboardCheck className="h-5 w-5 text-[#F4D9A8]" aria-hidden /></span>
              <h3 className="font-display mt-4 text-2xl font-semibold">Verification cases</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">Turn a finding into a case, assign it to a field worker and track it to resolution.</p>
              <div className="mt-5"><MiniSteps /></div>
            </article></Reveal>
            <Reveal delay={160} className="md:col-span-2"><article className="glass glass-tilt relative h-full min-h-[18rem] rounded-3xl">
              <Image src={a.src} alt={a.alt} fill sizes="(max-width:768px) 100vw, 33vw" className="-z-10 object-cover" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-brand-dark/90 via-brand-dark/40 to-transparent" aria-hidden />
              <div className="flex h-full flex-col justify-end p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20"><Users className="h-5 w-5" aria-hidden /></span>
                <h3 className="font-display mt-3 text-2xl font-semibold">Citizen guide</h3>
                <p className="mt-1 text-sm text-white/85">Responsible immersion practices and verified resources, in plain language.</p>
              </div>
            </article></Reveal>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden px-5 py-24" aria-labelledby="how">
        <PhotoBackdrop src={b.src} className="bg-fixed-photo" tint="from-navy/90 via-brand-dark/85 to-brand-dark/95" />
        <div className="mx-auto max-w-6xl">
          <Reveal><p className="eyebrow !text-[#F4D9A8]">How it works</p><h2 id="how" className="font-display mt-2 text-4xl font-semibold md:text-5xl">Three steps, nothing hidden</h2></Reveal>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {[{ n: "01", icon: BookOpenCheck, t: "Evidence", d: "Readings are imported with provenance, validated, and compared with the limits that actually apply." },
              { n: "02", icon: Waves, t: "Priority", d: "Exceedance rate, severity, recurrence and age of the data combine into a score anyone can audit." },
              { n: "03", icon: ShieldCheck, t: "Action", d: "Briefs, reports and verification cases keep every follow-up traceable to its evidence." }].map(({ n, icon: Icon, t, d: text }, i) => (
              <li key={n}><Reveal delay={i * 100}><div className="glass glass-dark glass-tilt h-full rounded-3xl p-7">
                <span className="font-display text-6xl font-semibold text-white/20">{n}</span>
                <div className="mt-1 flex items-center gap-2"><Icon className="h-5 w-5 text-marigold" aria-hidden /><h3 className="font-display text-xl font-semibold">{t}</h3></div>
                <p className="mt-2 text-sm leading-relaxed text-white/80">{text}</p>
              </div></Reveal></li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── WHO / HONEST ───────────────────────────────────────────── */}
      <section className="bg-canvas px-5 py-20 text-ink" aria-labelledby="who">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
          <Reveal><p className="eyebrow">Built for</p><h2 id="who" className="font-display mt-2 text-3xl font-semibold md:text-4xl">The officer who plans the day, the worker on the ghat, the neighbour who cares</h2>
            <div className="mt-6 space-y-3 text-sm text-ink-muted">
              {[["Municipal officers", "Decide where to send cleaning, aeration and testing first.", ClipboardCheck], ["Field workers", "See assigned cases and record what they find.", FileText], ["Community", "Learn what to do, and what the records say.", Sparkles]].map(([t, x, Icon]) => {
                const I = Icon as typeof Users; return <div key={String(t)} className="flex gap-3 rounded-2xl border border-line bg-white p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><I className="h-4 w-4" aria-hidden /></span><p><b className="text-ink">{String(t)}.</b> {String(x)}</p></div>;
              })}
            </div></Reveal>
          <Reveal delay={120}><p className="eyebrow">Honest by design</p><h2 className="font-display mt-2 text-3xl font-semibold md:text-4xl">What this is, and what it is not</h2>
            <ul className="mt-6 space-y-3 text-sm text-ink-muted">
              {["Historical MPPCB samples from 2023 to 2025. It does not show today's water quality.", "Blank values mean not sampled, never clean. Below-detection values are not zero.", "Priorities are a project-defined review score, not an official CPCB classification.", "AI only re-words evidence the system has already checked, and says when it cannot answer."].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marigold" aria-hidden />{t}</li>))}
            </ul></Reveal>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden px-5 py-24">
        <PhotoBackdrop src={c.src} className="bg-fixed-photo" tint="from-brand-dark/85 via-brand-dark/75 to-brand-dark/95" />
        <Reveal><div className="glass mx-auto max-w-3xl rounded-[2rem] p-10 text-center md:p-14">
          <h2 className="font-display text-3xl font-semibold md:text-5xl">See it working on real records</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">Explore the dashboard, open a ghat, generate a Hindi brief and track a case from finding to resolution.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {presenter && !user && <Button onClick={launchDemo} loading={busy} className="!min-h-12 !border-transparent !bg-marigold px-6 !text-brand-dark hover:!bg-[#f0b153]"><Play className="h-4 w-4" aria-hidden />Launch live demo</Button>}
            <Link href="/login"><Button className="glass !min-h-12 px-6 !text-white">Sign in</Button></Link>
            <Link href="/register"><Button className="glass !min-h-12 px-6 !text-white">Create a community account</Button></Link>
          </div>
        </div></Reveal>
      </section>
    </div>
  );
}
