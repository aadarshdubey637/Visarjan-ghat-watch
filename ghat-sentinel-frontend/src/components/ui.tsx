"use client";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const cn = (...a: Parameters<typeof clsx>) => twMerge(clsx(...a));

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(18,59,50,0.04)]", className)} {...p}>{children}</div>;
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div><h2 className="text-sm font-semibold text-ink">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean };
export function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-dark border-transparent",
    secondary: "bg-white text-ink border-line hover:bg-brand-soft",
    ghost: "bg-transparent text-ink border-transparent hover:bg-brand-soft",
    danger: "bg-critical text-white border-transparent hover:opacity-90",
  }[variant];
  return (
    <button className={cn("inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", size === "sm" ? "min-h-8 px-2.5 text-xs" : "min-h-10 px-3.5 text-sm", v, className)}
      disabled={disabled || loading} {...p}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
    </button>
  );
}

const field = "w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand disabled:bg-canvas";
// forwardRef: react-hook-form's register() reads values through the ref
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) { return <input ref={ref} className={cn(field, "min-h-10", className)} {...p} />; });
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) { return <textarea ref={ref} className={cn(field, "py-2", className)} {...p} />; });
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) { return <select ref={ref} className={cn(field, "min-h-10 pr-8", className)} {...p}>{children}</select>; });
export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor?: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-critical">{error}</p>}
    </div>
  );
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "info" | "warn" | "bad" | "good"; className?: string }) {
  const t = { neutral: "bg-canvas text-ink-muted border-line", info: "bg-info-soft text-info border-info/20", warn: "bg-caution-soft text-caution border-caution/20", bad: "bg-critical-soft text-critical border-critical/20", good: "bg-brand-soft text-brand border-brand/20" }[tone];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", t, className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) { return <div className={cn("animate-pulse rounded bg-line/70", className)} aria-hidden />; }

/** Native <dialog> modal with focus handling, Escape to close. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal(); else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={title}
      className="m-auto w-[min(92vw,34rem)] rounded-lg border border-line p-0 shadow-xl backdrop:bg-navy/40">
      {open && (<><div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-canvas">✕</button></div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div></>)}
    </dialog>
  );
}
/** Right-side drawer using the same native dialog. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); else if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={title}
      className="m-0 ml-auto h-full max-h-none w-[min(100vw,30rem)] border-l border-line p-0 shadow-xl backdrop:bg-navy/40">
      {open && (<div className="flex h-full flex-col"><div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-canvas">✕</button></div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div></div>)}
    </dialog>
  );
}
