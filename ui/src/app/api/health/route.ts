import { NextResponse } from "next/server";

import { pythonFetch } from "@/lib/server/python-api";

export const dynamic = "force-dynamic";

/**
 * Lightweight health probe for the UI. It never returns the API key and is
 * safe to call from the login screen.
 */
export async function GET() {
  try {
    const response = await pythonFetch("/health", {
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        status: "degraded",
        service: "Zima Hotspot API",
        version: "unknown",
        environment: process.env.NODE_ENV ?? "unknown",
        nmcli_available: false,
        nmcli_version: null,
        timestamp: new Date().toISOString(),
        error: message,
      },
      { status: 503 },
    );
  }
}
