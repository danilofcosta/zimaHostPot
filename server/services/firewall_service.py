"""nftables-based internet blocking for known devices.

A single dedicated table (``inet zima_hotspot`` by default) is used so the
rules never mix with the host firewall. Only the ``forward`` hook is filtered:
traffic that the hotspot routes to/from the internet is dropped for blocked
MACs, while LAN traffic and the hotspot UI keep working.

When nftables is not available the operation fails loudly instead of silently
pretending a device was blocked.
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
from typing import Iterable

from core.config import settings
from core.exceptions import FirewallUnavailableError

logger = logging.getLogger(__name__)

MAC_RE = re.compile(r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}$")


def _valid_mac(mac: str) -> str:
    value = mac.strip().lower()
    if not MAC_RE.match(value):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    return value


def _run(script: str, *, timeout: float = 10.0) -> tuple[bool, str]:
    if shutil.which("nft") is None:
        return False, "'nft' is not installed on this host."
    try:
        completed = subprocess.run(
            ["nft", "-f", "-"],
            input=script,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)
    detail = (completed.stderr or completed.stdout or "").strip()
    return completed.returncode == 0, detail


def _run_command(args: list[str], *, timeout: float = 10.0) -> tuple[bool, str]:
    if shutil.which("nft") is None:
        return False, "'nft' is not installed on this host."
    try:
        completed = subprocess.run(
            ["nft", *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)
    detail = (completed.stderr or completed.stdout or "").strip()
    return completed.returncode == 0, detail


class FirewallService:
    @property
    def table(self) -> str:
        # Only a plain identifier is accepted, so it is safe to interpolate.
        value = settings.firewall_table.strip()
        if not re.match(r"^[A-Za-z0-9_]+$", value):
            return "zima_hotspot"
        return value

    @property
    def available(self) -> bool:
        return shutil.which("nft") is not None

    def table_exists(self) -> bool:
        return _run_command(["list", "table", "inet", self.table])[0]

    def _ensure(self) -> None:
        if not self.available:
            raise FirewallUnavailableError(
                "nftables is not installed in the container; internet blocking "
                "cannot be enforced."
            )

        if not self.table_exists():
            ok, detail = _run(
                "\n".join(
                    [
                        f"add table inet {self.table}",
                        f"add set inet {self.table} blocked_macs {{ type ether_addr; }}",
                        f"add chain inet {self.table} forward "
                        "{ type filter hook forward priority filter; policy accept; }",
                        f"add rule inet {self.table} forward "
                        "ether saddr @blocked_macs drop",
                    ]
                )
            )
            if not ok:
                raise FirewallUnavailableError(
                    f"Could not create the nftables table: {detail or 'unknown error'}"
                )
            return

        # The table may come from an older version: repair missing pieces.
        set_ok, _ = _run_command(
            ["list", "set", "inet", self.table, "blocked_macs"]
        )
        if not set_ok:
            _run(f"add set inet {self.table} blocked_macs {{ type ether_addr; }}")
        chain_ok, _ = _run_command(
            ["list", "chain", "inet", self.table, "forward"]
        )
        if not chain_ok:
            _run(
                f"add chain inet {self.table} forward "
                "{ type filter hook forward priority filter; policy accept; }"
            )
        listing_ok, listing = _run_command(
            ["list", "chain", "inet", self.table, "forward"]
        )
        if listing_ok and "blocked_macs" not in listing:
            _run(
                f"add rule inet {self.table} forward "
                "ether saddr @blocked_macs drop"
            )

    def list_blocked(self) -> list[str]:
        if not self.available:
            return []
        ok, output = _run_command(
            ["list", "set", "inet", self.table, "blocked_macs"]
        )
        if not ok:
            return []
        return sorted(set(match.lower() for match in MAC_RE.findall(output)))

    def add(self, mac: str) -> None:
        self._ensure()
        value = _valid_mac(mac)
        ok, detail = _run(
            f"add element inet {self.table} blocked_macs {{ {value} }}"
        )
        if not ok and "File exists" not in detail:
            raise FirewallUnavailableError(
                f"Could not block {value}: {detail or 'unknown error'}"
            )

    def remove(self, mac: str) -> None:
        self._ensure()
        value = _valid_mac(mac)
        ok, detail = _run(
            f"delete element inet {self.table} blocked_macs {{ {value} }}"
        )
        if not ok and "No such file or directory" not in detail:
            raise FirewallUnavailableError(
                f"Could not unblock {value}: {detail or 'unknown error'}"
            )

    def sync(self, macs: Iterable[str]) -> None:
        """Replace the set with the given MACs (used at startup)."""

        if not self.available:
            return
        try:
            self._ensure()
        except FirewallUnavailableError:
            logger.warning("nftables unavailable; blocked devices stay blocked in the database only")
            return

        values = []
        for mac in macs:
            try:
                values.append(_valid_mac(mac))
            except ValueError:
                continue

        _run_command(["flush", "set", "inet", self.table, "blocked_macs"])
        if not values:
            return
        elements = ", ".join(values)
        ok, detail = _run(
            f"add element inet {self.table} blocked_macs {{ {elements} }}"
        )
        if not ok:
            logger.warning("Could not restore blocked MACs: %s", detail)
