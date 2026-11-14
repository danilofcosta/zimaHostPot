import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/server/db";
import { getRequestSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Called after the browser successfully changes the password through Better
 * Auth (/api/auth/change-password). Better Auth owns the credential update and
 * the session rotation; this handler only clears the first-login flag and logs
 * the event, so the BFF stops blocking administrative routes.
 */
export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sessão inválida." } },
      { status: 401 },
    );
  }

  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    'UPDATE "user" SET "mustChangePassword" = 0, "updatedAt" = ? WHERE "id" = ?',
  ).run(now, session.user.id);

  try {
    db.prepare(
      'INSERT INTO "event" ("type", "severity", "message", "created_at") ' +
        "VALUES (?, ?, ?, ?)",
    ).run(
      "admin_password_changed",
      "info",
      `Senha do usuário ${session.user.username ?? session.user.id} alterada`,
      now,
    );
  } catch {
    // The event table is optional from the UI's point of view.
  }

  return NextResponse.json({ ok: true, mustChangePassword: false });
}
