-- Zima Hotspot - shared SQLite schema.
--
-- This file is the single source of truth for the database layout and is
-- applied idempotently by both runtimes:
--   * Python -> server/core/database.py (network collection, events, traffic)
--   * Node   -> ui/src/lib/server/db.ts        (Better Auth)
--
-- Dates are stored as Unix epoch milliseconds (INTEGER), which is what Better
-- Auth expects for SQLite. Booleans are stored as 0/1.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Better Auth core tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "username" TEXT UNIQUE,
  "displayUsername" TEXT,
  "mustChangePassword" INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

-- ---------------------------------------------------------------------------
-- Application tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "device" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "mac" TEXT NOT NULL UNIQUE,
  "hostname" TEXT,
  "nickname" TEXT,
  "device_type" TEXT NOT NULL DEFAULT 'unknown',
  "vendor" TEXT,
  "first_seen" INTEGER NOT NULL,
  "last_seen" INTEGER NOT NULL,
  "is_known" INTEGER NOT NULL DEFAULT 0,
  "internet_blocked" INTEGER NOT NULL DEFAULT 0,
  "banned" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "updated_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "device_last_seen_idx" ON "device" ("last_seen");

CREATE TABLE IF NOT EXISTS "device_address" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "device_id" INTEGER NOT NULL REFERENCES "device" ("id") ON DELETE CASCADE,
  "mac" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "interface" TEXT,
  "first_seen" INTEGER NOT NULL,
  "last_seen" INTEGER NOT NULL,
  UNIQUE ("mac", "ip", "interface")
);
CREATE INDEX IF NOT EXISTS "device_address_mac_idx" ON "device_address" ("mac");
CREATE INDEX IF NOT EXISTS "device_address_device_idx" ON "device_address" ("device_id");

CREATE TABLE IF NOT EXISTS "device_connection" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "device_id" INTEGER NOT NULL REFERENCES "device" ("id") ON DELETE CASCADE,
  "mac" TEXT NOT NULL,
  "ip" TEXT,
  "interface" TEXT,
  "connection_type" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "signal_dbm" INTEGER,
  "rx_bytes" INTEGER,
  "tx_bytes" INTEGER,
  "connected_at" INTEGER,
  "disconnected_at" INTEGER,
  "last_seen" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "device_connection_mac_idx" ON "device_connection" ("mac", "last_seen");
CREATE INDEX IF NOT EXISTS "device_connection_device_idx" ON "device_connection" ("device_id", "last_seen");

CREATE TABLE IF NOT EXISTS "traffic_sample" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "interface" TEXT NOT NULL,
  "rx_bytes" INTEGER NOT NULL,
  "tx_bytes" INTEGER NOT NULL,
  "rx_packets" INTEGER NOT NULL,
  "tx_packets" INTEGER NOT NULL,
  "sampled_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "traffic_sample_if_idx" ON "traffic_sample" ("interface", "sampled_at");

CREATE TABLE IF NOT EXISTS "event" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "message" TEXT NOT NULL,
  "mac" TEXT,
  "ip" TEXT,
  "interface" TEXT,
  "metadata" TEXT,
  "created_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "event_created_idx" ON "event" ("created_at");
CREATE INDEX IF NOT EXISTS "event_type_idx" ON "event" ("type");
CREATE INDEX IF NOT EXISTS "event_mac_idx" ON "event" ("mac");

CREATE TABLE IF NOT EXISTS "setting" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" INTEGER NOT NULL
);
