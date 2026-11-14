/**
 * Same-origin proxy shared by every /api/<service>/... route handler.
 *
 * Flow: browser -> Next route handler (Better Auth session + password-change
 * gate) -> Python FastAPI (X-API-Key). The browser keeps only its own origin
 * cookies; the API key never reaches the client bundle.
 */
import "server-only";

import { createBackendHeaders, pythonBaseUrl } from "./python-api";
import { getRequestSession } from "./session";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
  "set-cookie",
]);

export interface ProxyOptions {
  /** Allow the call while the user still has to change the initial password. */
  allowBeforePasswordChange?: boolean;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function proxyToBackend(
  request: Request,
  basePath: string,
  segments: string[] | undefined,
  options: ProxyOptions = {},
): Promise<Response> {
  const session = await getRequestSession(request);
  if (!session) {
    return jsonError(
      401,
      "unauthorized",
      "Sessão inválida. Entre novamente para continuar.",
    );
  }

  if (!options.allowBeforePasswordChange && session.user.mustChangePassword) {
    return jsonError(
      428,
      "password_change_required",
      "Troque a senha inicial antes de usar o hotspot.",
    );
  }

  const url = new URL(request.url);
  const suffix =
    segments && segments.length > 0
      ? `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`
      : "";
  const target = `${pythonBaseUrl()}${basePath}${suffix}${url.search}`;

  const headers = createBackendHeaders();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const accept = request.headers.get("accept");
  if (accept) {
    headers.set("accept", accept);
  }

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return jsonError(
      502,
      "backend_unreachable",
      `A API do hotspot não respondeu: ${detail}`,
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json; charset=utf-8");
  }
  responseHeaders.set("Cache-Control", "no-store");

  if (upstream.status === 204 || upstream.body === null) {
    return new Response(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
