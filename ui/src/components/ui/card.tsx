import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

interface PanelProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_30px_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm",
        className,
      )}
    >
      {title || action ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            {title ? (
              <h2 className="text-sm font-semibold tracking-tight text-white">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-white/15 bg-white/[0.06] text-zinc-300",
  success: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300",
  warning: "border-amber-400/25 bg-amber-400/[0.08] text-amber-300",
  danger: "border-red-400/25 bg-red-400/[0.08] text-red-300",
  info: "border-sky-400/25 bg-sky-400/[0.08] text-sky-300",
  muted: "border-white/10 bg-white/[0.03] text-zinc-500",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.66rem] font-medium",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}

const STAT_TONES = {
  default: "text-white",
  success: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-red-300",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {label}
        </p>
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-400">
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 truncate text-2xl font-semibold tracking-tight",
          STAT_TONES[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] text-zinc-500">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3.5 py-3 text-xs leading-relaxed text-red-200"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-[0.65rem] font-bold text-red-300"
      >
        !
      </span>
      <span>{children}</span>
    </div>
  );
}

export function InlineInfo({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-3.5 py-3 text-xs leading-relaxed text-sky-200">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[0.65rem] font-bold text-sky-300"
      >
        i
      </span>
      <span>{children}</span>
    </div>
  );
}

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-10 text-sm text-zinc-500">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
      {label}
    </div>
  );
}

export function KeyValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 truncate text-sm text-zinc-200",
          mono && "font-mono text-xs",
        )}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}
