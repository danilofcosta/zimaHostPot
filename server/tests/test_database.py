"""Schema and transaction helpers."""

from __future__ import annotations

import sqlite3

import pytest

from core import database


def test_schema_creates_expected_indexes():
    rows = database.query("SELECT name FROM sqlite_master WHERE type = 'index'")
    names = {row["name"] for row in rows}

    assert {
        "device_address_device_idx",
        "device_connection_device_idx",
        "event_mac_idx",
    } <= names


def test_database_uses_wal_and_foreign_keys():
    with database.get_db() as connection:
        assert connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_transaction_commits(tmp_path):
    path = tmp_path / "commit.db"
    database.init_db(path)

    with database.transaction(path) as connection:
        connection.execute(
            "INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)",
            ("feature", "on", 1),
        )

    with database.get_db(path) as connection:
        row = connection.execute(
            "SELECT value FROM setting WHERE key = ?", ("feature",)
        ).fetchone()
    assert row["value"] == "on"


def test_transaction_rolls_back_on_error(tmp_path):
    path = tmp_path / "rollback.db"
    database.init_db(path)

    with pytest.raises(RuntimeError):
        with database.transaction(path) as connection:
            connection.execute(
                "INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)",
                ("partial", "on", 1),
            )
            raise RuntimeError("boom")

    with database.get_db(path) as connection:
        count = connection.execute(
            "SELECT COUNT(*) FROM setting WHERE key = ?", ("partial",)
        ).fetchone()[0]
    assert count == 0


def test_transaction_keeps_wal_mode(tmp_path):
    path = tmp_path / "wal.db"
    database.init_db(path)

    with database.transaction(path) as connection:
        assert connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"

    assert path.exists()


def test_connect_does_not_fail_when_database_is_already_wal(tmp_path):
    path = tmp_path / "already-wal.db"
    database.init_db(path)

    # Several sequential connections must all work; a journal_mode switch on
    # every connection used to take a write lock and contend with writers.
    for _ in range(5):
        with database.get_db(path) as connection:
            assert isinstance(connection, sqlite3.Connection)
