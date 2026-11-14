import type {
  ApiErrorEnvelope,
  Band,
  ConnectedDevicesResponse,
  DeviceCapabilities,
  DeviceDetails,
  DeviceSummary,
  DiagnosticsResponse,
  EventsResponse,
  HealthResponse,
  HotspotClientsResponse,
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
  KnownDevicesResponse,
  MonitoringHistoryResponse,
  MonitoringSnapshot,
  SystemInfo,
  WifiChannelAnalysis,
} from "./types";

const DEFAULT_TIMEOUT = 12_000;
const MUTATION_TIMEOUT = 45_000;
// A fresh scan makes the radio hop through every channel, which routinely takes
// longer than a normal read.
const SCAN_TIMEOUT = 30_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

interface StatusQuery {
  interfaceName: string;
  profileName: string;
}

/**
 * Typed client for the Zima Hotspot BFF.
 *
 * Every request goes to the same origin (`/api/...`), so no API key or backend
 * address is ever shipped to the browser. The Next.js route handlers add the
 * server-to-server credentials.
 */
export class HotspotApi {
  private async request<T>(
    path: string,
    init: RequestInit = {},
    timeout = DEFAULT_TIMEOUT,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");

    if (init.body) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;

    // Combina o timeout interno com um possível cancelamento externo (ex.: um
    // novo poll de status que substitui o anterior). Sem isso, com a API
    // pendurada, os requests se acumulam e a UI nunca sai do estado de loading.
    const controller = new AbortController();
    const externalSignal = init.signal ?? null;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    const forwardAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", forwardAbort, { once: true });
      }
    }

    try {
      response = await fetch(path, {
        ...init,
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      if (externalSignal?.aborted) {
        throw new ApiError({
          status: 0,
          code: "aborted",
          message: "Requisição cancelada.",
        });
      }

      if (timedOut) {
        throw new ApiError({
          status: 0,
          code: "timeout",
          message: `O painel não respondeu em ${Math.round(timeout / 1000)}s. Tente novamente.`,
        });
      }

      throw new ApiError({
        status: 0,
        code: "network_error",
        message:
          "Não foi possível conectar ao painel. Verifique se o container da UI está rodando.",
      });
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", forwardAbort);
    }

    const rawBody = await response.text();
    let payload: unknown = null;

    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = rawBody;
      }
    }

    if (!response.ok) {
      const envelope = payload as ApiErrorEnvelope | null;
      const error = envelope?.error;

      throw new ApiError({
        status: response.status,
        code: error?.code ?? "http_error",
        message:
          error?.message ??
          (typeof payload === "string" && payload
            ? payload
            : `Erro HTTP ${response.status}.`),
        details: error?.details,
        requestId: error?.request_id,
      });
    }

    return payload as T;
  }

  health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request<HealthResponse>("/api/health", { signal }, 8_000);
  }

  // -------------------------------------------------------------------------
  // Hotspot
  // -------------------------------------------------------------------------

  getConfig(
    includePassword = false,
    signal?: AbortSignal,
  ): Promise<HotspotConfig> {
    const suffix = includePassword ? "?include_password=true" : "";
    return this.request<HotspotConfig>(
      `/api/hotspot/config${suffix}`,
      { signal },
    );
  }

  saveConfig(input: HotspotConfigInput): Promise<HotspotConfig> {
    return this.request<HotspotConfig>(
      "/api/hotspot/config",
      { method: "PUT", body: JSON.stringify(input) },
      MUTATION_TIMEOUT,
    );
  }

  resetConfig(): Promise<HotspotConfig> {
    return this.request<HotspotConfig>(
      "/api/hotspot/config",
      { method: "DELETE" },
      MUTATION_TIMEOUT,
    );
  }

  getStatus(query: StatusQuery, signal?: AbortSignal): Promise<HotspotStatus> {
    const search = new URLSearchParams({
      interface: query.interfaceName,
      profile_name: query.profileName,
    });

    return this.request<HotspotStatus>(
      `/api/hotspot/status?${search}`,
      { signal },
    );
  }

  create(input: HotspotCreateInput): Promise<HotspotCreateResult> {
    return this.request<HotspotCreateResult>(
      "/api/hotspot",
      { method: "POST", body: JSON.stringify(input) },
      MUTATION_TIMEOUT,
    );
  }

  start(input: HotspotStartInput): Promise<HotspotStartResult> {
    return this.request<HotspotStartResult>(
      "/api/hotspot/start",
      { method: "POST", body: JSON.stringify(input) },
      MUTATION_TIMEOUT,
    );
  }

  stop(input: HotspotStopInput): Promise<HotspotStopResult> {
    return this.request<HotspotStopResult>(
      "/api/hotspot/stop",
      { method: "POST", body: JSON.stringify(input) },
      MUTATION_TIMEOUT,
    );
  }

  restart(input: HotspotStopInput): Promise<HotspotStartResult> {
    return this.request<HotspotStartResult>(
      "/api/hotspot/restart",
      { method: "POST", body: JSON.stringify(input) },
      MUTATION_TIMEOUT,
    );
  }

  teardown(query: {
    interfaceName: string;
    profileName: string;
    deleteProfile: boolean;
    useSudo: boolean;
  }): Promise<HotspotTeardownResult> {
    const search = new URLSearchParams({
      interface: query.interfaceName,
      profile_name: query.profileName,
      delete_profile: String(query.deleteProfile),
      use_sudo: String(query.useSudo),
    });

    return this.request<HotspotTeardownResult>(
      `/api/hotspot?${search}`,
      { method: "DELETE" },
      MUTATION_TIMEOUT,
    );
  }

  getClients(
    interfaceName: string,
    signal?: AbortSignal,
  ): Promise<HotspotClientsResponse> {
    const search = new URLSearchParams({ interface: interfaceName });

    return this.request<HotspotClientsResponse>(
      `/api/hotspot/clients?${search}`,
      { signal },
    );
  }

  analyzeChannels(
    interfaceName?: string,
    band?: Band,
    signal?: AbortSignal,
  ): Promise<WifiChannelAnalysis> {
    const search = new URLSearchParams();
    if (interfaceName) {
      search.set("interface", interfaceName);
    }
    if (band) {
      search.set("band", band);
    }

    const query = search.toString();
    const suffix = query ? `?${query}` : "";

    return this.request<WifiChannelAnalysis>(
      `/api/network/wifi/channels${suffix}`,
      { signal },
      SCAN_TIMEOUT,
    );
  }

  // -------------------------------------------------------------------------
  // Devices
  // -------------------------------------------------------------------------

  deviceCapabilities(signal?: AbortSignal): Promise<DeviceCapabilities> {
    return this.request<DeviceCapabilities>("/api/devices/capabilities", {
      signal,
    });
  }

  deviceSummary(signal?: AbortSignal): Promise<DeviceSummary> {
    return this.request<DeviceSummary>("/api/devices/summary", { signal });
  }

  connectedDevices(
    interfaceName?: string,
    signal?: AbortSignal,
  ): Promise<ConnectedDevicesResponse> {
    const suffix = interfaceName
      ? `?interface=${encodeURIComponent(interfaceName)}`
      : "";
    return this.request<ConnectedDevicesResponse>(
      `/api/devices/connected${suffix}`,
      { signal },
    );
  }

  knownDevices(
    params: {
      search?: string;
      deviceType?: string;
      onlyBlocked?: boolean;
      limit?: number;
      offset?: number;
    } = {},
    signal?: AbortSignal,
  ): Promise<KnownDevicesResponse> {
    const search = new URLSearchParams();
    if (params.search) search.set("search", params.search);
    if (params.deviceType) search.set("device_type", params.deviceType);
    if (params.onlyBlocked) search.set("only_blocked", "true");
    if (params.limit) search.set("limit", String(params.limit));
    if (params.offset) search.set("offset", String(params.offset));
    const suffix = search.toString() ? `?${search}` : "";
    return this.request<KnownDevicesResponse>(`/api/devices/known${suffix}`, {
      signal,
    });
  }

  device(mac: string, signal?: AbortSignal): Promise<DeviceDetails> {
    return this.request<DeviceDetails>(`/api/devices/${mac}`, { signal });
  }

  updateDevice(
    mac: string,
    patch: {
      nickname?: string | null;
      device_type?: string;
      notes?: string | null;
      is_known?: boolean;
    },
  ): Promise<DeviceDetails> {
    return this.request<DeviceDetails>(
      `/api/devices/${mac}`,
      { method: "PATCH", body: JSON.stringify(patch) },
      MUTATION_TIMEOUT,
    );
  }

  blockInternet(mac: string, blocked: boolean): Promise<unknown> {
    return this.request(
      `/api/devices/${mac}/internet-block`,
      { method: "POST", body: JSON.stringify({ blocked }) },
      MUTATION_TIMEOUT,
    );
  }

  disconnectDevice(mac: string): Promise<unknown> {
    return this.request(
      `/api/devices/${mac}/disconnect`,
      { method: "POST" },
      MUTATION_TIMEOUT,
    );
  }

  banDevice(mac: string, banned: boolean): Promise<unknown> {
    return this.request(
      `/api/devices/${mac}/ban`,
      { method: "POST", body: JSON.stringify({ banned }) },
      MUTATION_TIMEOUT,
    );
  }

  // -------------------------------------------------------------------------
  // Monitoring
  // -------------------------------------------------------------------------

  monitoringInterfaces(signal?: AbortSignal): Promise<{ interfaces: string[] }> {
    return this.request<{ interfaces: string[] }>(
      "/api/monitoring/interfaces",
      { signal },
    );
  }

  monitoringSnapshot(
    interfaceName?: string,
    window = 60,
    points = 60,
    signal?: AbortSignal,
  ): Promise<MonitoringSnapshot> {
    const search = new URLSearchParams({
      window: String(window),
      points: String(points),
    });
    if (interfaceName) search.set("interface", interfaceName);
    return this.request<MonitoringSnapshot>(`/api/monitoring?${search}`, {
      signal,
    });
  }

  monitoringHistory(
    interfaceName?: string,
    minutes = 60,
    signal?: AbortSignal,
  ): Promise<MonitoringHistoryResponse> {
    const search = new URLSearchParams({ minutes: String(minutes) });
    if (interfaceName) search.set("interface", interfaceName);
    return this.request<MonitoringHistoryResponse>(
      `/api/monitoring/history?${search}`,
      { signal },
    );
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  events(
    params: {
      limit?: number;
      offset?: number;
      eventType?: string;
      severity?: string;
      mac?: string;
      sinceHours?: number;
    } = {},
    signal?: AbortSignal,
  ): Promise<EventsResponse> {
    const search = new URLSearchParams();
    if (params.limit) search.set("limit", String(params.limit));
    if (params.offset) search.set("offset", String(params.offset));
    if (params.eventType) search.set("event_type", params.eventType);
    if (params.severity) search.set("severity", params.severity);
    if (params.mac) search.set("mac", params.mac);
    if (params.sinceHours) search.set("since_hours", String(params.sinceHours));
    const suffix = search.toString() ? `?${search}` : "";
    return this.request<EventsResponse>(`/api/events${suffix}`, { signal });
  }

  eventCounts(
    sinceHours = 24,
    signal?: AbortSignal,
  ): Promise<{ since_hours: number; counts: Record<string, number> }> {
    return this.request(`/api/events/counts?since_hours=${sinceHours}`, {
      signal,
    });
  }

  // -------------------------------------------------------------------------
  // System
  // -------------------------------------------------------------------------

  systemInfo(signal?: AbortSignal): Promise<SystemInfo> {
    return this.request<SystemInfo>("/api/system", { signal });
  }

  diagnostics(signal?: AbortSignal): Promise<DiagnosticsResponse> {
    return this.request<DiagnosticsResponse>("/api/system/diagnostics", {
      signal,
    });
  }
}
