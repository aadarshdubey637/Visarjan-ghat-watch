import Image from "next/image";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Ghat Sentinel logo">
      <rect width="64" height="64" rx="14" fill="#123B32" />
      <path d="M32 11c7 9 13 15 13 23a13 13 0 0 1-26 0c0-8 6-14 13-23z" fill="#fff" />
      <path d="M25.5 34.5l5 5 9-10" stroke="#19765B" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 53c6-5 10 3 16 0s10 3 16 0 10 3 16 0" stroke="#3567A8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
export function Wordmark() {
  return <span className="flex items-center gap-2"><LogoMark /><span className="text-base font-bold tracking-tight text-white">Ghat Sentinel</span></span>;
}
/** Abstract stepped-ghat + water layers. Decorative only; never implies a real site photo. */
export function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 160" className={className} aria-hidden preserveAspectRatio="xMaxYMid slice">
      <g opacity="0.16" fill="#fff"><path d="M300 160V120h40v-20h40V80h40V60h60v100z" /></g>
      <path d="M0 118c40-14 80 14 120 0s80 14 120 0 80 14 120 0 80 14 120 0v42H0z" fill="#19765B" opacity="0.35" />
      <path d="M0 136c40-12 80 12 120 0s80 12 120 0 80 12 120 0 80 12 120 0v24H0z" fill="#3567A8" opacity="0.35" />
      <polyline points="20,70 90,52 160,64 230,38 300,48 370,28 440,40" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="3 4" className="data-line-glow" />
      <path d="M440 20c6 8 10 12 10 18a10 10 0 0 1-20 0c0-6 4-10 10-18z" fill="#fff" opacity="0.5" />
    </svg>
  );
}

/**
 * A contextual image collage using real visarjan photos supplied by the project owner.
 * Captions are shown on hover. Never identifies a specific ghat location.
 */
export function VisarjanPhotoStrip() {
  const photos = [
    { src: "/visarjan-1.png", alt: "Durga idol being immersed at a ghat during visarjan" },
    { src: "/visarjan-2.png", alt: "Colourful Durga idol at the water's edge during immersion" },
    { src: "/visarjan-3.png", alt: "Post-visarjan debris and floral offerings in a water body" },
    { src: "/visarjan-4.png", alt: "Idol remains and plastic waste at a ghat after Ganesh visarjan" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5 rounded-lg overflow-hidden" role="img" aria-label="Visarjan scene photographs supplied by project">
      {photos.map((p) => (
        <div key={p.src} className="relative aspect-[3/4] overflow-hidden group">
          <Image src={p.src} alt={p.alt} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="25vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
            <span className="text-white text-[10px] leading-tight">{p.alt}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
