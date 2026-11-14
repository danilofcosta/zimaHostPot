"""Persistent event log for hotspot, device and administrative activity."""

from __future__ import annotations

import json
import logging
import sqlite3
from typing import Any

from core.database import execute, now_ms, query, query_one

logger = logging.getLogger(__name__)

SEVERITIES = {"info", "warning", "error", "success"}


def record(
    event_type: str,
    message: str,
    *,
    severity: str = "info",
    mac: str | None = None,
    ip: str | None = None,
    interface: str | None = None,
    metadata: dict[str, Any] | None = None,
    connection: sqlite3.Connection | None = None,
) -> None:
    """Append an event. Never raises: logging must not break the caller.

    ``connection`` lets a caller that already holds a write transaction insert
    the event on the same connection. Opening a second connection there would
    wait on the write lock held by the caller.
    """

    if severity not in SEVERITIES:
        severity = "info"
    params = (
        event_type,
        severity,
        message,
        mac,
        ip,
        interface,
        json.dumps(metadata, ensure_ascii=False) if metadata else None,
        now_ms(),
    )
    statement = (
        "INSERT INTO event (type, severity, message, mac, ip, interface, "
        "metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    try:
        if connection is not None:
            connection.execute(statement, params)
        else:
            execute(statement, params)
    except Exception:  # pragma: no cover - defensive
        logger.exception("Could not persist event %s", event_type)


def _row_to_event(row: Any) -> dict[str, Any]:
    metadata = None
    if row["metadata"]:
        try:
            metadata = json.loads(row["metadata"])
        except (TypeError, ValueError):
            metadata = None
    return {
        "id": row["id"],
        "type": row["type"],
        "severity": row["severity"],
        "message": row["message"],
        "mac": row["mac"],
        "ip": row["ip"],
        "interface": row["interface"],
        "metadata": metadata,
        "created_at": row["created_at"],
    }


def list_events(
    *,
    limit: int = 100,
    offset: int = 0,
    event_type: str | None = None,
    severity: str | None = None,
    mac: str | None = None,
    since_ms: int | None = None,
) -> dict[str, Any]:
    clauses: list[str] = []
    params: list[Any] = []
    if event_type:
        clauses.append("type = ?")
        params.append(event_type)
    if severity:
        clauses.append("severity = ?")
        params.append(severity)
    if mac:
        clauses.append("mac = ?")
        params.append(mac.lower())
    if since_ms:
        clauses.append("created_at >= ?")
        params.append(since_ms)

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = query(
        f"SELECT * FROM event{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    )
    total_row = query_one(f"SELECT COUNT(*) AS total FROM event{where}", tuple(params))
    total = int(total_row["total"]) if total_row else 0

    return {
        "count": len(rows),
        "total": total,
        "limit": limit,
        "offset": offset,
        "events": [_row_to_event(row) for row in rows],
    }


def counts_by_type(since_ms: int) -> dict[str, int]:
    rows = query(
        "SELECT type, COUNT(*) AS total FROM event WHERE created_at >= ? "
        "GROUP BY type ORDER BY total DESC",
        (since_ms,),
    )
    return {row["type"]: int(row["total"]) for row in rows}
