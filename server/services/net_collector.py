"""Read-only access to the host network state.

Everything here shells out to the same tools NetworkManager itself uses
(``iw``, ``ip``, ``nmcli``) or reads kernel/NetworkManager files. No value is
invented: when a source is unavailable the corresponding field is ``None`` and
the caller decides how to present it.
"""

from __future__ import annotations

import glob
import logging
import re
import shutil
import socket
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CommandResult:
    ok: bool
    stdout: str
    stderr: str
    error: str | None = None

    @property
    def detail(self) -> str | None:
        if self.ok:
            return None
        return (self.stderr or self.stdout or self.error or "").strip() or None


def run(args: list[str], *, timeout: float = 10.0) -> CommandResult:
    """Run a command without raising; report failures in the result."""

    if shutil.which(args[0]) is None:
        return CommandResult(
            ok=False,
            stdout="",
            stderr="",
            error=f"'{args[0]}' is not installed on this host.",
        )

    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.debug("Command %s failed: %s", args, exc)
        return CommandResult(ok=False, stdout="", stderr="", error=str(exc))

    return CommandResult(
        ok=completed.returncode == 0,
        stdout=completed.stdout or "",
        stderr=completed.stderr or "",
        error=None if completed.returncode == 0 else "command failed",
    )


def tool_available(name: str) -> bool:
    return shutil.which(name) is not None


# ---------------------------------------------------------------------------
# iw: wireless interfaces and associated stations
# ---------------------------------------------------------------------------


def parse_iw_dev(output: str) -> list[dict[str, Any]]:
    interfaces: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for raw in output.splitlines():
        line = raw.strip()
        match = re.match(r"^Interface\s+(\S+)$", line)
        if match:
            current = {"name": match.group(1)}
            interfaces.append(current)
            continue
        if current is None:
            continue
        if line.startswith("addr "):
            current["mac"] = line.split(None, 1)[1].strip().lower()
        elif line.startswith("type "):
            current["type"] = line.split(None, 1)[1].strip()
        elif line.startswith("channel "):
            match = re.match(r"^channel\s+(\d+)", line)
            if match:
                current["channel"] = int(match.group(1))
        elif line.startswith("txpower "):
            match = re.match(r"^txpower\s+([\d.]+)", line)
            if match:
                current["txpower_dbm"] = float(match.group(1))

    return interfaces


def wireless_interfaces() -> list[dict[str, Any]]:
    """Return interfaces reported by ``iw dev`` (empty when iw is missing)."""

    result = run(["iw", "dev"], timeout=5)
    if not result.ok:
        return []
    return parse_iw_dev(result.stdout)


def parse_station_dump(output: str) -> list[dict[str, Any]]:
    stations: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for raw in output.splitlines():
        line = raw.strip()
        if line.startswith("Station "):
            mac = line.split(None, 1)[1].strip().lower()
            current = {"mac": mac}
            stations.append(current)
            continue
        if current is None or ":" not in line:
            continue

        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()

        if key == "signal":
            match = re.match(r"^(-?\d+)", value)
            if match:
                current["signal_dbm"] = int(match.group(1))
        elif key == "connected time":
            match = re.match(r"^(\d+)", value)
            if match:
                current["connected_seconds"] = int(match.group(1))
        elif key == "inactive time":
            match = re.match(r"^(\d+)", value)
            if match:
                current["inactive_ms"] = int(match.group(1))
        elif key in {"rx bytes", "tx bytes", "rx packets", "tx packets"}:
            match = re.match(r"^(\d+)", value)
            if match:
                current[key.replace(" ", "_")] = int(match.group(1))

    return stations


def station_dump(interface: str) -> list[dict[str, Any]]:
    result = run(["iw", "dev", interface, "station", "dump"], timeout=10)
    if not result.ok:
        return []
    return parse_station_dump(result.stdout)


def station_disconnect(interface: str, mac: str) -> CommandResult:
    """Kick a station from a SoftAP, when the driver supports it."""

    return run(["iw", "dev", interface, "station", "del", mac], timeout=10)


# ---------------------------------------------------------------------------
# ip neigh: ARP/NDP neighbours
# ---------------------------------------------------------------------------


_NEIGH_RE = re.compile(
    r"^(?P<ip>\S+)\s+dev\s+(?P<iface>\S+)(?:\s+lladdr\s+(?P<mac>[0-9a-fA-F:]{17}))?"
    r"(?:\s+(?P<rest>.*))?$"
)

IGNORED_NEIGH_STATES = {"FAILED", "INCOMPLETE", "NOARP"}


def parse_neigh(output: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for line in output.splitlines():
        match = _NEIGH_RE.match(line.strip())
        if not match:
            continue
        mac = (match.group("mac") or "").lower()
        if not mac:
            continue
        rest = (match.group("rest") or "").strip()
        state = rest.split()[-1].upper() if rest else "UNKNOWN"
        if state in IGNORED_NEIGH_STATES:
            continue
        entries.append(
            {
                "ip": match.group("ip"),
                "mac": mac,
                "interface": match.group("iface"),
                "state": state,
            }
        )
    return entries


def neighbours(interface: str | None = None) -> list[dict[str, Any]]:
    args = ["ip", "neigh", "show"]
    if interface:
        args += ["dev", interface]
    result = run(args, timeout=10)
    if not result.ok:
        return []
    return parse_neigh(result.stdout)


# ---------------------------------------------------------------------------
# DHCP leases (dnsmasq written by NetworkManager)
# ---------------------------------------------------------------------------


def parse_leases(text: str, origin: str | None = None) -> list[dict[str, Any]]:
    leases: list[dict[str, Any]] = []
    for line in text.splitlines():
        fields = line.split()
        if len(fields) < 3:
            continue
        expiry, mac, ip = fields[0], fields[1].lower(), fields[2]
        hostname = fields[3] if len(fields) > 3 else "*"
        if not re.match(r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}$", mac):
            continue
        try:
            expires_at = int(expiry) * 1000 if int(expiry) > 0 else None
        except ValueError:
            expires_at = None
        leases.append(
            {
                "mac": mac,
                "ip": ip,
                "hostname": None if hostname in {"", "*"} else hostname,
                "expires_at": expires_at,
                "source": origin,
            }
        )
    return leases


def dhcp_leases(interface: str | None = None) -> list[dict[str, Any]]:
    patterns = [
        "/var/lib/NetworkManager/dnsmasq-*.leases",
        "/var/lib/misc/dnsmasq.leases",
        "/run/NetworkManager/dnsmasq-*.leases",
    ]
    if interface:
        patterns.insert(0, f"/var/lib/NetworkManager/dnsmasq-{interface}.leases")
        patterns.insert(0, f"/run/NetworkManager/dnsmasq-{interface}.leases")

    seen: set[tuple[str, str]] = set()
    leases: list[dict[str, Any]] = []
    for pattern in patterns:
        for path in sorted(glob.glob(pattern)):
            try:
                text = Path(path).read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for lease in parse_leases(text, path):
                key = (lease["mac"], lease["ip"])
                if key in seen:
                    continue
                seen.add(key)
                leases.append(lease)
    return leases


# ---------------------------------------------------------------------------
# sysfs counters and host information
# ---------------------------------------------------------------------------


def read_counters(interface: str) -> dict[str, int] | None:
    base = Path("/sys/class/net") / interface / "statistics"
    values: dict[str, int] = {}
    for name in ("rx_bytes", "tx_bytes", "rx_packets", "tx_packets"):
        try:
            values[name] = int((base / name).read_text().strip())
        except (OSError, ValueError):
            return None
    return values


def interface_link_info(interface: str) -> dict[str, Any]:
    base = Path("/sys/class/net") / interface
    info: dict[str, Any] = {"name": interface}
    try:
        info["operstate"] = (base / "operstate").read_text().strip()
    except OSError:
        info["operstate"] = None
    try:
        info["mac"] = (base / "address").read_text().strip().lower()
    except OSError:
        info["mac"] = None
    try:
        info["mtu"] = int((base / "mtu").read_text().strip())
    except (OSError, ValueError):
        info["mtu"] = None
    return info


# ---------------------------------------------------------------------------
# nmcli: NetworkManager state
# ---------------------------------------------------------------------------


def _split_terse(line: str) -> list[str]:
    fields: list[str] = []
    current: list[str] = []
    escaped = False
    for char in line:
        if escaped:
            current.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == ":":
            fields.append("".join(current))
            current = []
        else:
            current.append(char)
    if escaped:
        current.append("\\")
    fields.append("".join(current))
    return fields


def device_status() -> list[dict[str, Any]]:
    result = run(
        ["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"],
        timeout=10,
    )
    if not result.ok:
        return []
    devices: list[dict[str, Any]] = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        fields = _split_terse(line) + [""] * 4
        devices.append(
            {
                "name": fields[0],
                "type": fields[1],
                "state": fields[2],
                "connection": fields[3] or None,
            }
        )
    return devices


def active_connections() -> list[dict[str, str]]:
    result = run(
        ["nmcli", "-t", "-f", "NAME,UUID,TYPE,DEVICE", "connection", "show", "--active"],
        timeout=10,
    )
    if not result.ok:
        return []
    connections: list[dict[str, str]] = []
    for line in result.stdout.splitlines():
        fields = _split_terse(line) + [""] * 4
        if not fields[0]:
            continue
        connections.append(
            {
                "name": fields[0],
                "uuid": fields[1],
                "type": fields[2],
                "device": fields[3],
            }
        )
    return connections


def nmcli_general_status() -> dict[str, str]:
    result = run(["nmcli", "-t", "general", "status"], timeout=5)
    if not result.ok:
        return {}
    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            values[key.strip().lower()] = value.strip()
    return values


def default_route_interface() -> str | None:
    result = run(["ip", "route", "show", "default"], timeout=5)
    if not result.ok:
        return None
    match = re.search(r"\bdev\s+(\S+)", result.stdout)
    return match.group(1) if match else None


# ---------------------------------------------------------------------------
# Local identity
# ---------------------------------------------------------------------------


def hostname() -> str:
    try:
        return socket.gethostname()
    except OSError:
        return "unknown"


def utc_iso(timestamp_ms: int | None = None) -> str | None:
    if timestamp_ms is None:
        return None
    return datetime.fromtimestamp(
        timestamp_ms / 1000, tz=timezone.utc
    ).isoformat(timespec="seconds")
