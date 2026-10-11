import Image from "next/image";
import { LogoMark } from "@/components/shared/logo";

/** Decorative side panel for the login / register pages. Uses one of the project's photographs under a green wash. */
export function AuthSide({ title, body, className = "" }: { title: string; body: string; className?: string }) {
  return (
    <aside className={`relative isolate hidden min-h-[28rem] overflow-hidden rounded-2xl bg-brand-dark p-8 text-white lg:flex lg:flex-col lg:justify-between ${className}`}>
      <Image src="/visarjan-2.png" alt="" fill sizes="40vw" className="-z-20 object-cover" priority />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-dark/85 via-brand-dark/80 to-brand-dark/95" aria-hidden />
      <div className="contours absolute inset-0 -z-10 opacity-80" aria-hidden />
      <div className="flex items-center gap-2"><LogoMark size={36} /><span className="font-display text-xl font-semibold">Ghat Sentinel</span></div>
      <div>
        <h2 className="font-display text-3xl font-semibold leading-tight">{title}</h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/80">{body}</p>
        <p className="mt-6 text-[11px] text-white/50">Photograph supplied by the project · illustrative, not site-specific</p>
      </div>
    </aside>
  );
}
