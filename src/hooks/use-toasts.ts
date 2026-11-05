"use client";

import { useCallback, useMemo, useState } from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
}

export interface ToastItem extends ToastInput {
  id: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((input: ToastInput) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((current) => [...current.slice(-2), { id, ...input }]);
  }, []);

  return useMemo(
    () => ({ toasts, push, dismiss }),
    [toasts, push, dismiss],
  );
}
