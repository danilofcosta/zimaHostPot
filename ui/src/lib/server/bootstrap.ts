/**
 * First-run bootstrap for the only account this appliance ships with.
 *
 * The admin is created *only* when the user table is empty. It is never
 * recreated or reset afterwards: changing the password in the UI is permanent,
 * even across container rebuilds, because the database lives in a volume.
 *
 * Sign-up is disabled on purpose, so the row is inserted directly with the
 * same shape Better Auth uses for a credential account.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { getDatabase } from "./db";

const DEFAULT_USERNAME = "casaos";
// Sem INITIAL_ADMIN_PASSWORD no ambiente, a conta nasce com "admin" e o
// primeiro login obriga a troca (ver mustChangePassword). O compose também
// injeta "admin" como padrão.
const DEFAULT_PASSWORD = "admin";

let inFlight: Promise<void> | null = null;

interface CountRow {
  total: number;
}

export async function ensureInitialAdmin(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const db = getDatabase();
    const row = db
      .prepare('SELECT COUNT(*) AS total FROM "user"')
      .get() as CountRow | undefined;

    if (row && Number(row.total) > 0) {
      return;
    }

    const username = (process.env.INITIAL_ADMIN_USERNAME || DEFAULT_USERNAME)
      .trim()
      .toLowerCase();
    const password = (
      process.env.INITIAL_ADMIN_PASSWORD || DEFAULT_PASSWORD
    ).trim() || DEFAULT_PASSWORD;

    // A senha inicial pode ser curta (o padrão é "admin"), mas o primeiro
    // login continua obrigando a troca por uma senha de 12+ caracteres.
    if (password.length < 12) {
      console.warn(
        "[bootstrap] INITIAL_ADMIN_PASSWORD has fewer than 12 characters; the first login must set a stronger password.",
      );
    }

    const passwordHash = await hashPassword(password);
    const now = Date.now();
    const userId = randomUUID();
    const accountId = randomUUID();
    const displayName = username === DEFAULT_USERNAME ? "Administrador" : username;

    const create = db.transaction(() => {
      const current = db
        .prepare('SELECT COUNT(*) AS total FROM "user"')
        .get() as CountRow | undefined;
      if (current && Number(current.total) > 0) {
        return false;
      }

      db.prepare(
        'INSERT INTO "user" ("id", "name", "email", "emailVerified", ' +
          '"createdAt", "updatedAt", "username", "displayUsername", ' +
          '"mustChangePassword") VALUES (?, ?, ?, 1, ?, ?, ?, ?, 1)',
      ).run(
        userId,
        displayName,
        `${username}@zima-hotspot.local`,
        now,
        now,
        username,
        username,
      );

      db.prepare(
        'INSERT INTO "account" ("id", "accountId", "providerId", "userId", ' +
          '"password", "createdAt", "updatedAt") ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(accountId, userId, "credential", userId, passwordHash, now, now);

      try {
        db.prepare(
          'INSERT INTO "setting" ("key", "value", "updated_at") VALUES (?, ?, ?) ' +
            'ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", ' +
            '"updated_at" = excluded."updated_at"',
        ).run("initial_admin_created_at", String(now), now);
      } catch {
        // The setting table belongs to the Python runtime; failing to record
        // the timestamp must not abort the admin creation.
      }

      return true;
    });

    const created = create();
    if (created) {
      console.info(
        `[bootstrap] Initial admin "${username}" created. The first login must change the password.`,
      );
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
