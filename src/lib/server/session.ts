/**
 * Session helpers shared by pages, layouts and route handlers.
 *
 * The session is verified on every protected render and on every BFF request,
 * close to the data. The UI checks are only a convenience: the route handlers
 * never trust the client.
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export type AppSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getSession(): Promise<AppSession> {
  return auth.api.getSession({ headers: await headers() });
}

/** Requires a valid session, redirecting anonymous visitors to the login page. */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * Requires the first-login password change to be done. Every administrative
 * page is behind this check, and the BFF refuses to forward requests until
 * the flag is cleared.
 */
export async function requirePasswordChanged() {
  const session = await requireSession();
  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }
  return session;
}

/** Session from a raw request (used by route handlers). */
export async function getRequestSession(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}
