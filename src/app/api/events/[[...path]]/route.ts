import { proxyToBackend } from "@/lib/server/proxy";

export const dynamic = "force-dynamic";

async function handler(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  return proxyToBackend(request, "/api/v1/events", path);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
