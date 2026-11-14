import { normalizeBaseUrl } from "./utils";

export const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:6565";

const STORAGE_KEY = "zima.hotspot.api-config";
const MEMORY_MARKER = "__in_memory__";

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: DEFAULT_API_URL,
  apiKey: "",
};

let cachedRaw: string | null = null;
let cachedConfig: ApiConfig = DEFAULT_CONFIG;
const listeners = new Set<() => void>();

function parseConfig(raw: string | null): ApiConfig {
  if (!raw) {
    return DEFAULT_CONFIG;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ApiConfig>;
    return {
      baseUrl: normalizeBaseUrl(parsed.baseUrl ?? "") || DEFAULT_API_URL,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function getSnapshot(): ApiConfig {
  if (typeof window === "undefined") {
    return DEFAULT_CONFIG;
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedConfig;
  }

  if (raw === cachedRaw) {
    return cachedConfig;
  }

  if (raw === null && cachedRaw === MEMORY_MARKER) {
    return cachedConfig;
  }

  cachedRaw = raw;
  cachedConfig = parseConfig(raw);
  return cachedConfig;
}

export function getServerSnapshot(): ApiConfig {
  return DEFAULT_CONFIG;
}

export function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      listener();
    }
  };

  listeners.add(listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function saveConfig(next: ApiConfig): ApiConfig {
  const normalized: ApiConfig = {
    baseUrl: normalizeBaseUrl(next.baseUrl) || DEFAULT_API_URL,
    apiKey: next.apiKey.trim(),
  };

  try {
    const raw = JSON.stringify(normalized);
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
  } catch {
    cachedRaw = MEMORY_MARKER;
  }

  cachedConfig = normalized;
  listeners.forEach((listener) => listener());
  return normalized;
}
