"""SQLite helpers shared by every Python service.

The schema is owned by ``server/db/schema.sql`` and also applied by the Node
runtime, so the two processes always agree on the table layout. Every
connection enables WAL and a busy timeout because the API server and the
background sampler write concurrently.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Sequence

from core.config import settings

logger = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "db" / "schema.sql"
_init_lock = threading.Lock()
_initialised = False


def now_ms() -> int:
    """Current Unix time in milliseconds (the format stored in SQLite)."""

    return int(time.time() * 1000)


def _connect(path: Path | None = None) -> sqlite3.Connection:
    db_path = path or settings.db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(
        db_path,
        timeout=10,
        isolation_level=None,  # autocommit; explicit transactions when needed
        check_same_thread=False,
    )
    connection.row_factory = sqlite3.Row
    # Switching the journal mode takes a write lock. Only do it when the
    # database is not already in WAL mode, otherwise every short-lived
    # connection would contend with the sampler for a lock.
    current_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
    if str(current_mode).lower() != "wal":
        connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA busy_timeout = 10000")
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _ensure_column(
    connection: sqlite3.Connection, table: str, column: str, definition: str
) -> None:
    """Add a column when an older database is missing it (idempotent)."""

    rows = connection.execute(f'PRAGMA table_info("{table}")').fetchall()
    existing = {row["name"] for row in rows}
    if column not in existing:
        logger.info("Adding column %s.%s", table, column)
        connection.execute(
            f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}'
        )


def init_db(path: Path | None = None) -> None:
    """Create the schema when missing. Safe to call from every process."""

    global _initialised
    with _init_lock:
        if _initialised and path is None:
            return

        schema = SCHEMA_PATH.read_text(encoding="utf-8")
        connection = _connect(path)
        try:
            connection.executescript(schema)

            # Defensive migrations for databases created by an older build.
            _ensure_column(
                connection, "user", "username", "TEXT"
            )
            _ensure_column(
                connection, "user", "displayUsername", "TEXT"
            )
            _ensure_column(
                connection, "user", "mustChangePassword", "INTEGER NOT NULL DEFAULT 1"
            )
            _ensure_column(
                connection, "device", "nickname", "TEXT"
            )
            _ensure_column(
                connection, "device", "device_type",
                "TEXT NOT NULL DEFAULT 'unknown'",
            )
            _ensure_column(
                connection, "device", "vendor", "TEXT"
            )
            _ensure_column(
                connection, "device", "internet_blocked",
                "INTEGER NOT NULL DEFAULT 0",
            )
            _ensure_column(
                connection, "device", "banned", "INTEGER NOT NULL DEFAULT 0"
            )
            _ensure_column(
                connection, "device", "notes", "TEXT"
            )

            connection.execute(
                "INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, "
                "updated_at = excluded.updated_at",
                ("schema_version", "1", now_ms()),
            )
        finally:
            connection.close()

        if path is None:
            _initialised = True


@contextmanager
def get_db(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Yield a connection with row access by name."""

    connection = _connect(path)
    try:
        yield connection
    finally:
        connection.close()


@contextmanager
def transaction(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Yield a connection inside an explicit write transaction.

    Several writes performed in one operation (device discovery is the main
    example) must share a transaction: opening one connection per statement
    amplifies WAL churn and makes the operation non-atomic.
    """

    connection = _connect(path)
    try:
        connection.execute("BEGIN IMMEDIATE")
        try:
            yield connection
        except BaseException:
            connection.execute("ROLLBACK")
            raise
        else:
            connection.execute("COMMIT")
    finally:
        connection.close()


def query(sql: str, params: Sequence[Any] = ()) -> list[sqlite3.Row]:
    with get_db() as connection:
        return connection.execute(sql, tuple(params)).fetchall()


def query_one(sql: str, params: Sequence[Any] = ()) -> sqlite3.Row | None:
    with get_db() as connection:
        return connection.execute(sql, tuple(params)).fetchone()


def execute(sql: str, params: Sequence[Any] = ()) -> int:
    """Run a statement and return ``lastrowid`` (0 when not applicable)."""

    with get_db() as connection:
        cursor = connection.execute(sql, tuple(params))
        return int(cursor.lastrowid or 0)


def get_setting(key: str, default: str | None = None) -> str | None:
    row = query_one("SELECT value FROM setting WHERE key = ?", (key,))
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    execute(
        "INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, "
        "updated_at = excluded.updated_at",
        (key, value, now_ms()),
    )


def setting_json(key: str, default: Any) -> Any:
    raw = get_setting(key)
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return default
