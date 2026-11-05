import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-sm text-zinc-100 shadow-inner shadow-black/20 outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60";

export const labelClass =
  "mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-400";

export const hintClass = "mt-1.5 text-xs leading-relaxed text-zinc-500";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={className}>
      <label className={labelClass} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className={hintClass}>{hint}</p> : null}
    </div>
  );
}

export function FormMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm",
        tone === "error"
          ? "border-red-500/25 bg-red-500/[0.08] text-red-200"
          : "border-sky-500/20 bg-sky-500/[0.06] text-sky-200",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold",
          tone === "error"
            ? "bg-red-500/20 text-red-300"
            : "bg-sky-500/20 text-sky-300",
        )}
      >
        !
      </span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}
