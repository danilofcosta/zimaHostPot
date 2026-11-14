/**
 * SQLite access for Better Auth and the small amount of server-side auth data
 * the BFF needs. The schema lives in server/db/schema.sql and is applied here
 * idempotently, so both runtimes share exactly the same layout.
 */
import "server-only";

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

let database: Database.Database | null = null;

function candidatePaths(fileName: string, envValue?: string): string[] {
  const roots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    "/app",
  ];
  const candidates: string[] = [];
  if (envValue) {
    candidates.push(path.isAbsolute(envValue) ? envValue : path.resolve(process.cwd(), envValue));
  }
  for (const root of roots) {
    candidates.push(path.join(root, fileName));
    candidates.push(path.join(root, "server", fileName));
    candidates.push(path.join(root, "db", path.basename(fileName)));
  }
  return [...new Set(candidates)];
}

function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }

  const candidates = [
    "/app/data/database.db",
    path.resolve(process.cwd(), "data/database.db"),
    path.resolve(process.cwd(), "../server/data/database.db"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.dirname(candidate))) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), "data/database.db");
}

function resolveExisting(candidates: string[], label: string): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Could not find ${label}. Looked in:\n${candidates.join("\n")}`,
  );
}

export function getDatabase(): Database.Database {
  if (database) {
    return database;
  }

  const dbPath = resolveDatabasePath();
  const schemaPath = resolveExisting(
    candidatePaths("db/schema.sql", process.env.SCHEMA_PATH),
    "schema.sql",
  );

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(schemaPath, "utf8"));

  database = db;
  return db;
}

export function getDatabasePath(): string {
  return resolveDatabasePath();
}

export function closeDatabase(): void {
  database?.close();
  database = null;
}
