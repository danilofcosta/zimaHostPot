import type {
  ApiErrorEnvelope,
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
} from "./types";

const DEFAULT_TIMEOUT = 12_000;
const MUTATION_TIMEOUT = 45_000;

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
 * Typed client for the Zima Hotspot API.
 * Every method throws an {@link ApiError} when the request fails.
 */
export class HotspotApi {
  readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey.trim();
  }

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

    if (this.apiKey) {
      headers.set("X-API-Key", this.apiKey);
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
      response = await fetch(`${this.baseUrl}${path}`, {
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
          message: `A API não respondeu em ${Math.round(timeout / 1000)}s. Verifique se o servidor está rodando.`,
        });
      }

      throw new ApiError({
        status: 0,
        code: "network_error",
        message: `Não foi possível conectar à API em ${this.baseUrl}. Verifique se o servidor está rodando e se o endereço está correto.`,
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
    return this.request<HealthResponse>("/health", { signal }, 8_000);
  }

  getConfig(signal?: AbortSignal): Promise<HotspotConfig> {
    return this.request<HotspotConfig>(
      "/api/v1/hotspot/config",
      { signal },
    );
  }

  saveConfig(input: HotspotConfigInput): Promise<HotspotConfig> {
    return this.request<HotspotConfig>(
      "/api/v1/hotspot/config",
      { method: "PUT", body: JSON.stringify(input) },
      MUTATION_TIMEOUT,
    );
  }

  resetConfig(): Promise<HotspotConfig> {
    return this.request<HotspotConfig>(
      "/api/v1/hotspot/config",
      { method: "DELETE" },
      MUTATION_TIMEOUT,
    );
  }

  getStatus(
    query: StatusQuery,
    signal?: AbortSignal,
  ): Promise<HotspotStatus> {
    const search = new URLSearchParams({
      interface: query.interfaceName,
      profile_name: query.profileName,
    });

    return this.request<HotspotStatus>(
      `/api/v1/hotspot/status?${search}`,
      { signal },
    );
  }

  create(input: HotspotCreateInput): Promise<HotspotCreateResult> {
    return this.request<HotspotCreateResult>(
      "/api/v1/hotspot",
      { method: "POST", body: JSON.stringify(input) },
      MUTATION_TIMEOUT,
    );
  }

  start(input: HotspotStartInput): Promise<HotspotStartResult> {
    return this.request<HotspotStartResult>(
      "/api/v1/hotspot/start",
      { method: "POST", body: JSON.stringify(input) },
      MUTATION_TIMEOUT,
    );
  }

  stop(input: HotspotStopInput): Promise<HotspotStopResult> {
    return this.request<HotspotStopResult>(
      "/api/v1/hotspot/stop",
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
      `/api/v1/hotspot?${search}`,
      { method: "DELETE" },
      MUTATION_TIMEOUT,
    );
  }
}
