"""Diagnostics must not run expensive checks from the dashboard endpoint."""

from __future__ import annotations

from dataclasses import replace

from core.config import settings
from services import system_service


def test_db_info_skips_integrity_check_by_default():
    info = system_service._db_info()

    assert info["exists"] is True
    assert info["integrity"] is None
    assert info["journal_mode"] == "wal"


def test_db_info_runs_integrity_check_on_demand():
    info = system_service._db_info(integrity=True)

    assert info["integrity"] == "ok"


def test_db_info_reports_missing_file(tmp_path, monkeypatch):
    missing = tmp_path / "absent.db"
    monkeypatch.setattr(system_service, "settings", replace(settings, db_path=missing))

    info = system_service._db_info()

    assert info["exists"] is False
    assert info["size_bytes"] is None
