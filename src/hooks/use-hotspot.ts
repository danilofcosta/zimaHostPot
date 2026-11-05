"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { HotspotApi } from "@/lib/api";
import type {
  HealthResponse,
  HotspotConfig,
  HotspotConfigInput,
  HotspotCreateInput,
  HotspotCreateResult,
  HotspotStartInput,
  HotspotStartResult,
  HotspotStatus,
  HotspotStopInput,
  HotspotStopResult,
  HotspotTeardownResult,
} from "@/lib/types";

export type HotspotAction = "create" | "start" | "stop" | "teardown" | "save";

export interface StatusQuery {
  interfaceName: string;
  profileName: string;
}

const STATUS_POLL_MS = 5_000;
const HEALTH_POLL_MS = 20_000;

export function useHotspot(api: HotspotApi, query: StatusQuery) {
  const [status, setStatus] = useState<HotspotStatus | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastCreated, setLastCreated] = useState<HotspotCreateResult | null>(
    null,
  );
  const [pending, setPending] = useState<HotspotAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);

  const mounted = useRef(true);
  const lastAppliedSeq = useRef(0);
  const statusController = useRef<AbortController | null>(null);
  const queryRef = useRef(query);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      statusController.current?.abort();
    };
  }, []);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const loadStatus = useCallback(
    async (target?: StatusQuery, options?: { force?: boolean }) => {
      const activeQuery = target ?? queryRef.current;

      // Já existe um poll em andamento: não empilha outro request. Quando é uma
      // atualização explícita, cancela o anterior para buscar o estado novo.
      if (statusController.current) {
        if (!options?.force) {
          return;
        }
        statusController.current.abort();
      }

      const controller = new AbortController();
      statusController.current = controller;
      const sequence = ++lastAppliedSeq.current;

      try {
        const next = await api.getStatus(activeQuery, controller.signal);
        if (!mounted.current || sequence !== lastAppliedSeq.current) {
          return;
        }
        setStatus(next);
        setStatusError(null);
        setUpdatedAt(new Date());
      } catch (error) {
        if (!mounted.current || controller.signal.aborted) {
          return;
        }
        if (sequence !== lastAppliedSeq.current) {
          return;
        }
        setStatusError(
          error instanceof Error
            ? error.message
            : "Não foi possível consultar o status do hotspot.",
        );
      } finally {
        if (statusController.current === controller) {
          statusController.current = null;
          if (mounted.current) {
            setLoading(false);
          }
        }
      }
    },
    [api],
  );

  const loadHealth = useCallback(async () => {
    let next: HealthResponse | null = null;
    try {
      next = await api.health();
    } catch {
      next = null;
    }

    if (!mounted.current) {
      return;
    }

    setHealth(next);
    setHealthChecked(true);
  }, [api]);

  useEffect(() => {
    void loadStatus(query, { force: true });
    void loadHealth();

    const statusTimer = window.setInterval(() => {
      if (!document.hidden) {
        void loadStatus();
      }
    }, STATUS_POLL_MS);

    const healthTimer = window.setInterval(() => {
      if (!document.hidden) {
        void loadHealth();
      }
    }, HEALTH_POLL_MS);

    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(healthTimer);
    };
  }, [query, loadStatus, loadHealth]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadStatus(queryRef.current, { force: true }),
      loadHealth(),
    ]);
  }, [loadStatus, loadHealth]);

  const settle = useCallback(
    async (target?: StatusQuery) => {
      if (target) {
        queryRef.current = target;
      }
      await loadStatus(target, { force: true });
      void loadHealth();
    },
    [loadStatus, loadHealth],
  );

  // Confirma rapidamente que a API está respondendo (timeout de 8 s) antes de
  // disparar uma mutação. Evita que o botão fique girando por até 45 s quando
  // o servidor está pendurado/sem resposta.
  const checkApi = useCallback(async () => {
    await api.health();
  }, [api]);

  const create = useCallback(
    async (
      input: HotspotCreateInput,
      target?: StatusQuery,
    ): Promise<HotspotCreateResult> => {
      setPending("create");
      try {
        await checkApi();
        const result = await api.create(input);
        if (mounted.current) {
          setLastCreated(result);
        }
        await settle(target);
        return result;
      } finally {
        if (mounted.current) {
          setPending(null);
        }
      }
    },
    [api, checkApi, settle],
  );

  const start = useCallback(
    async (
      input: HotspotStartInput,
      target?: StatusQuery,
    ): Promise<HotspotStartResult> => {
      setPending("start");
      try {
        await checkApi();
        const result = await api.start(input);
        await settle(target);
        return result;
      } finally {
        if (mounted.current) {
          setPending(null);
        }
      }
    },
    [api, checkApi, settle],
  );

  const stop = useCallback(
    async (
      input: HotspotStopInput,
      target?: StatusQuery,
    ): Promise<HotspotStopResult> => {
      setPending("stop");
      try {
        await checkApi();
        const result = await api.stop(input);
        await settle(target);
        return result;
      } finally {
        if (mounted.current) {
          setPending(null);
        }
      }
    },
    [api, checkApi, settle],
  );

  const saveConfig = useCallback(
    async (input: HotspotConfigInput): Promise<HotspotConfig> => {
      setPending("save");
      try {
        await checkApi();
        return await api.saveConfig(input);
      } finally {
        if (mounted.current) {
          setPending(null);
        }
      }
    },
    [api, checkApi],
  );

  const teardown = useCallback(
    async (
      target: StatusQuery,
      options: { deleteProfile: boolean; useSudo: boolean },
    ): Promise<HotspotTeardownResult> => {
      setPending("teardown");
      try {
        await checkApi();
        const result = await api.teardown({
          interfaceName: target.interfaceName,
          profileName: target.profileName,
          deleteProfile: options.deleteProfile,
          useSudo: options.useSudo,
        });
        if (mounted.current) {
          setLastCreated(null);
        }
        await settle(target);
        return result;
      } finally {
        if (mounted.current) {
          setPending(null);
        }
      }
    },
    [api, checkApi, settle],
  );

  return {
    status,
    health,
    lastCreated,
    pending,
    loading,
    statusError,
    healthChecked,
    updatedAt,
    refresh,
    create,
    start,
    stop,
    saveConfig,
    teardown,
  };
}
