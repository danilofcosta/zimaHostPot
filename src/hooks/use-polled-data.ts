"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { describeError } from "@/lib/utils";

export interface PolledData<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  updatedAt: Date | null;
  refresh: () => void;
}

/**
 * Polls an async loader on an interval.
 *
 * `intervalMs = 0` fetches once (and whenever `refresh()` is called or `key`
 * changes). The loader is kept in a ref, so callers can pass an inline
 * function without restarting the timer on every render.
 */
export function usePolledData<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  intervalMs = 0,
  key: string = "",
): PolledData<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    controllerRef.current = controller;

    const run = async (background: boolean) => {
      if (runningRef.current) {
        return;
      }
      runningRef.current = true;
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await loaderRef.current(controller.signal);
        if (cancelled || !mountedRef.current) {
          return;
        }
        setData(result);
        setError(null);
        setUpdatedAt(new Date());
      } catch (loadError) {
        if (cancelled || !mountedRef.current) {
          return;
        }
        setError(describeError(loadError));
      } finally {
        runningRef.current = false;
        if (!cancelled && mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void run(false);

    let timer: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      timer = setInterval(() => {
        void run(true);
      }, intervalMs);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [intervalMs, tick, key]);

  const refresh = useCallback(() => {
    setTick((current) => current + 1);
  }, []);

  return { data, error, loading, refreshing, updatedAt, refresh };
}
