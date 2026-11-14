/**
 * Server-to-server client for the Python FastAPI backend.
 *
 * The browser never talks to the Python API directly: every call goes through
 * the route handlers under /api/*, which authenticate the Better Auth session
 * and attach the shared API key here. Cookies from the browser are never
 * forwarded, so the Python service only accepts requests that came from the
 * BFF and knows the shared secret.
 */
import "server-only";

const DEFAULT_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "http://host.docker.internal:6565"
    : "http://127.0.0.1:6565";

export function pythonBaseUrl(): string {
  const configured =
    process.env.HOTSPOT_API_URL ??
    process.env.HOTSPOT_SERVER_URL ??
    DEFAULT_BASE_URL;
  return configured.replace(/\/+$/, "");
}

export class PythonApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "PythonApiError";
    this.status = status;
  }
}

export function createBackendHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set("Accept", "application/json");
  const apiKey = process.env.API_KEY?.trim();
  if (apiKey) {
    headers.set("X-API-Key", apiKey);
  }
  return headers;
}

export async function pythonFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${pythonBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    return await fetch(url, {
      ...init,
      headers: createBackendHeaders(init.headers),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PythonApiError(
      `Não foi possível falar com a API do hotspot em ${pythonBaseUrl()}: ${detail}`,
    );
  }
}

export async function pythonJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await pythonFetch(path, init);
  const body = await response.text();
  let payload: unknown = null;
  if (body) {
    try {
      payload = JSON.parse(body);
    } catch {
      payload = body;
    }
  }
  if (!response.ok) {
    const envelope = payload as {
      error?: { message?: string };
      detail?: string;
    } | null;
    throw new PythonApiError(
      envelope?.error?.message ??
        envelope?.detail ??
        `A API do hotspot respondeu HTTP ${response.status}.`,
      response.status,
    );
  }
  return payload as T;
}
