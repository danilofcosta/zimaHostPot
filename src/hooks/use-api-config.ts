"use client";

import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  saveConfig,
  subscribe,
  type ApiConfig,
} from "@/lib/api-config-store";

export type { ApiConfig };

export function useApiConfig() {
  const config = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return { config, saveConfig };
}
