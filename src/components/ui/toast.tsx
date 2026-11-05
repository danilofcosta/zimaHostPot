"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import {
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
  XIcon,
} from "@/components/icons";
import { useToasts, type ToastInput, type ToastItem } from "@/hooks/use-toasts";
import { cn } from "@/lib/utils";

interface ToastContextValue {
  push: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return context;
}

const TONE_STYLES = {
  success: {
    ring: "border-emerald-500/25 bg-[#0b1512]",
    icon: "bg-emerald-500/15 text-emerald-300",
    title: "text-emerald-50",
  },
  error: {
    ring: "border-red-500/25 bg-[#160d0f]",
    icon: "bg-red-500/15 text-red-300",
    title: "text-red-50",
  },
  info: {
    ring: "border-sky-500/25 bg-[#0b1218]",
    icon: "bg-sky-500/15 text-sky-300",
    title: "text-sky-50",
  },
} as const;

function ToastIcon({ tone }: { tone: ToastItem["tone"] }) {
  if (tone === "success") {
    return <CheckCircleIcon className="h-4 w-4" />;
  }
  if (tone === "error") {
    return <AlertTriangleIcon className="h-4 w-4" />;
  }
  return <InfoIcon className="h-4 w-4" />;
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 5_500);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const tone = TONE_STYLES[toast.tone];

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md",
        tone.ring,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          tone.icon,
        )}
      >
        <ToastIcon tone={toast.tone} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", tone.title)}>{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 break-words text-xs leading-relaxed text-zinc-400">
            {toast.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded-md p-1 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
        aria-label="Fechar notificação"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, push, dismiss } = useToasts();
  const value = useMemo(() => ({ push }), [push]);
  const handleDismiss = useCallback((id: string) => dismiss(id), [dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
