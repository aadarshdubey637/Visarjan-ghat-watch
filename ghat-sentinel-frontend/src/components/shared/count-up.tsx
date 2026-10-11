"use client";
import { useEffect, useRef, useState } from "react";

/** Counts from 0 to `value` once when it first appears. Respects prefers-reduced-motion. Shows the exact value at the end. */
export function CountUp({ value, durationMs = 900, format = (n: number) => n.toLocaleString("en-IN") }: { value: number; durationMs?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) { setShown(value); return; }
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) { setShown(value); done.current = true; return; }
    let raf = 0; let start = -1; // use the first frame's own timestamp: rAF time and performance.now() can differ
    const tick = (t: number) => {
      if (start < 0) start = t;
      const p = Math.min(1, Math.max(0, (t - start) / durationMs));
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick); else { setShown(value); done.current = true; }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return <span className="num" aria-label={format(value)}>{format(shown)}</span>;
}
