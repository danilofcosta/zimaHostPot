"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { HotspotApi } from "@/lib/api";
import type { HotspotClientsResponse } from "@/lib/types";
import { describeError } from "@/lib/utils";

const CLIENTS_POLL_MS = 10_000;

/**
 * Polls the hotspot client list while the hotspot is active.
 *
 * The neighbor table changes slowly, so 10 s is enough. Polling stops as soon
 * as the hotspot is not active, and the last list is hidden so a stopped
 * hotspot never shows stale clients.
 */
export function useHotspotClients(
  api: HotspotApi,
  interfaceName: string,
  enabled: boolean,
) {
  const [data, setData] = useState<HotspotClientsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settledInterface, setSettledInterface] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const controller = useRef<AbortController | null>(null);
  const currentInterface = interfaceName.trim();

  useEffect(() => {
    if (!enabled || !currentInterface) {
      controller.current?.abort();
      controller.current = null;
      return;
    }

    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    let cancelled = false;
    let inFlight = false;

    const run = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;

      try {
        const response = await api.getClients(currentInterface, next.signal);
        if (!cancelled && !next.signal.aborted) {
          setData(response);
          setError(null);
          setUpdatedAt(new Date());
        }
      } catch (cause) {
        if (!cancelled && !next.signal.aborted) {
          setError(describeError(cause));
        }
      }

      inFlight = false;

      if (!cancelled && controller.current === next) {
        setSettledInterface(currentInterface);
        setRefreshing(false);
      }
    };

    void run();

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void run();
      }
    }, CLIENTS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      next.abort();
      if (controller.current === next) {
        controller.current = null;
      }
    };
  }, [api, currentInterface, enabled, refreshToken]);

  const refresh = useCallback(() => {
    if (!enabled || !currentInterface) {
      return;
    }
    setRefreshing(true);
    setRefreshToken((value) => value + 1);
  }, [enabled, currentInterface]);

  return {
    data: enabled ? data : null,
    loading: enabled && (refreshing || settledInterface !== currentInterface),
    error: enabled ? error : null,
    updatedAt: enabled ? updatedAt : null,
    refresh,
  };
}
