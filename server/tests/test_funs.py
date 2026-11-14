"""Helper-level behaviour: sudo usage, timestamps and mutation locking."""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from types import SimpleNamespace

import funs


def test_sudo_prefix_is_empty_when_running_as_root(monkeypatch):
    monkeypatch.setattr(funs.os, "geteuid", lambda: 0, raising=False)

    assert funs._sudo_prefix(True) == []


def test_sudo_prefix_uses_non_interactive_sudo(monkeypatch):
    monkeypatch.setattr(funs.os, "geteuid", lambda: 1000, raising=False)
    monkeypatch.setattr(funs.shutil, "which", lambda name: "/usr/bin/sudo")

    assert funs._sudo_prefix(True) == ["sudo", "-n"]


def test_sudo_prefix_falls_back_when_sudo_is_missing(monkeypatch):
    monkeypatch.setattr(funs.os, "geteuid", lambda: 1000, raising=False)
    monkeypatch.setattr(funs.shutil, "which", lambda name: None)

    assert funs._sudo_prefix(True) == []


def test_sudo_prefix_ignored_when_not_requested(monkeypatch):
    monkeypatch.setattr(funs.os, "geteuid", lambda: 1000, raising=False)
    monkeypatch.setattr(funs.shutil, "which", lambda name: "/usr/bin/sudo")

    assert funs._sudo_prefix(False) == []


def test_nmcli_command_includes_non_interactive_sudo(monkeypatch):
    captured: dict[str, list[str]] = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = list(cmd)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(funs.os, "geteuid", lambda: 1000, raising=False)
    monkeypatch.setattr(funs.shutil, "which", lambda name: "/usr/bin/sudo")
    monkeypatch.setattr(funs.subprocess, "run", fake_run)

    funs.nmcli("-t", "general", "status", sudo=True)

    assert captured["cmd"] == ["sudo", "-n", "nmcli", "-t", "general", "status"]


def test_utc_now_is_timezone_aware():
    parsed = datetime.fromisoformat(funs._utc_now())

    assert parsed.utcoffset() == timedelta(0)


def test_mutating_operations_never_overlap(monkeypatch):
    active = 0
    max_active = 0
    state_lock = threading.Lock()

    def fake_nmcli(*args, **kwargs):
        nonlocal active, max_active
        with state_lock:
            active += 1
            max_active = max(max_active, active)
        try:
            time.sleep(0.05)
        finally:
            with state_lock:
                active -= 1
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(funs, "nmcli", fake_nmcli)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda index: funs.delete_profile(f"p{index}"), range(6)))

    assert max_active == 1
    assert all(result["deleted"] for result in results)
