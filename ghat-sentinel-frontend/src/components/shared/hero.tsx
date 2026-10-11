import Image from "next/image";
import type { ReactNode } from "react";

const PHOTOS = [
  { src: "/visarjan-1.png", alt: "Durga idol being immersed at a ghat during visarjan" },
  { src: "/visarjan-2.png", alt: "Colourful Durga idol at the water's edge during immersion" },
  { src: "/visarjan-3.png", alt: "Post-visarjan debris and floral offerings in a water body" },
  { src: "/visarjan-4.png", alt: "Idol remains and plastic waste at a ghat after Ganesh visarjan" },
];

/** Two drifting wave layers. Decorative; pure CSS animation (stopped under prefers-reduced-motion). */
function Waves() {
  const path = "M0 40c60-26 120 26 180 0s120 26 180 0 120 26 180 0 120 26 180 0 120 26 180 0 120 26 180 0v80H0z";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 overflow-hidden" aria-hidden>
      <svg viewBox="0 0 1080 120" preserveAspectRatio="none" className="hero-wave absolute bottom-0 h-full w-[200%] fill-white/10"><path d={path} /></svg>
      <svg viewBox="0 0 1080 120" preserveAspectRatio="none" className="hero-wave-slow absolute -bottom-2 h-[85%] w-[200%] fill-[#3567A8]/25"><path d={path} /></svg>
    </div>
  );
}

/**
 * Full-bleed hero. The project's photographs cross-fade slowly behind a green overlay (CSS-only, no JS timers).
 * The photos are illustrative and not site-specific; a caption says so.
 */
export function HeroBanner({ children, className = "", compact }: { children: ReactNode; className?: string; compact?: boolean }) {
  return (
    <section className={`relative isolate overflow-hidden rounded-2xl bg-brand-dark text-white ${className}`}>
      <div className="absolute inset-0 -z-20" aria-hidden>
        {PHOTOS.map((p, i) => (
          <div key={p.src} className="hero-slide absolute inset-0" style={{ animationDelay: `${i * 7}s` }}>
            <Image src={p.src} alt="" fill sizes="100vw" priority={i === 0} className="object-cover" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-dark via-brand-dark/90 to-brand-dark/55" aria-hidden />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy/70 via-transparent to-transparent" aria-hidden />
      <Waves />
      <div className={`relative ${compact ? "px-6 py-8 md:px-10 md:py-10" : "px-6 py-9 md:px-10 md:py-12"}`}>{children}</div>
      <p className="relative px-6 pb-3 text-[11px] text-white/55 md:px-10">Background photographs supplied by the project · illustrative, not site-specific</p>
    </section>
  );
}
