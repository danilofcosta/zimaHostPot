"""Device discovery, history and management.

Sources (all real, all optional):
  * ``iw dev <iface> station dump`` - associated Wi-Fi stations
  * ``ip neigh``                   - ARP/NDP neighbours
  * dnsmasq lease files            - DHCP assignments and hostnames
  * ``/sys/class/net``             - interface counters
  * ``nmcli``                      - which interfaces are managed/connected

A device is never fabricated: an entry only exists because one of those
sources reported its MAC. ``sources`` and ``state`` tell the UI exactly what
was observed, so "associated to Wi-Fi", "has a DHCP lease" and "inactive ARP
entry" are never conflated.
"""

from __future__ import annotations

import logging
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.config import settings
from core.database import execute, now_ms, query, query_one, transaction
from core.exceptions import (
    DeviceNotFoundError,
    DeviceOperationError,
    FirewallUnavailableError,
)
from services import event_service, net_collector, oui
from services.firewall_service import FirewallService

logger = logging.getLogger(__name__)

ACTIVE_NEIGH_STATES = {"REACHABLE", "DELAY", "PROBE", "PERMANENT"}
INACTIVE_NEIGH_STATES = {"STALE"}

# States that mean "the device is actively present right now". A DHCP lease or
# a stale ARP entry is evidence that the device existed, not that it is online.
ONLINE_STATES = {"associated", "active"}

DEVICE_TYPES = {
    "unknown",
    "phone",
    "tablet",
    "computer",
    "tv",
    "iot",
    "network",
    "printer",
    "other",
}

_TYPE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("phone", re.compile(r"(iphone|android|galaxy|pixel|oneplus|xiaomi|redmi|moto|phone)", re.I)),
    ("tablet", re.compile(r"(ipad|tablet|tab-|sm-t)", re.I)),
    ("tv", re.compile(r"(tv|roku|chromecast|firetv|appletv|bravia|webos|tizen)", re.I)),
    ("printer", re.compile(r"(printer|hp-|epson|canon|brother)", re.I)),
    ("network", re.compile(r"(router|access-?point|repeater|mesh|ubiquiti|mikrotik)", re.I)),
    ("computer", re.compile(r"(macbook|laptop|desktop|notebook|pc-|windows|linux|thinkpad)", re.I)),
    ("iot", re.compile(r"(esp|shelly|tasmota|sonoff|tuya|plug|bulb|camera|sensor|echo|alexa|home)", re.I)),
]

_TYPE_BY_VENDOR: list[tuple[str, re.Pattern[str]]] = [
    ("phone", re.compile(r"(apple|samsung|xiaomi|huawei|motorola|oneplus|oppo|vivo)", re.I)),
    ("tv", re.compile(r"(roku|google|amazon|sony|lg electronics|philips)", re.I)),
    ("iot", re.compile(r"(espressif|tuya|shelly|sonoff|signify|philips lighting)", re.I)),
    ("computer", re.compile(r"(intel|dell|hp inc|lenovo|asus|acer|vmware|parallels)", re.I)),
    ("network", re.compile(r"(tp-link|d-link|ubiquiti|mikrotik|netgear)", re.I)),
]

_DEVICE_LOCK = threading.Lock()


def _iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(
        timespec="seconds"
    )


def infer_device_type(hostname: str | None, vendor: str | None) -> str:
    for label, pattern in _TYPE_PATTERNS:
        if hostname and pattern.search(hostname):
            return label
    for label, pattern in _TYPE_BY_VENDOR:
        if vendor and pattern.search(vendor):
            return label
    return "unknown"


def _target_interfaces() -> list[str]:
    names: set[str] = set()
    for interface in net_collector.wireless_interfaces():
        names.add(interface["name"])
    for device in net_collector.device_status():
        if device["type"] == "wifi":
            names.add(device["name"])
    if settings.default_interface:
        names.add(settings.default_interface)

    available = (
        {entry.name for entry in Path("/sys/class/net").iterdir()}
        if Path("/sys/class/net").exists()
        else set()
    )
    return sorted(name for name in names if not available or name in available)


def capabilities() -> dict[str, Any]:
    interfaces = _target_interfaces()
    return {
        "iw": net_collector.tool_available("iw"),
        "ip": net_collector.tool_available("ip"),
        "nmcli": net_collector.tool_available("nmcli"),
        "nftables": net_collector.tool_available("nft"),
        "wireless_interfaces": interfaces,
        "wifi_disconnect": bool(net_collector.tool_available("iw") and interfaces),
        "internet_block": net_collector.tool_available("nft"),
        "dhcp_leases_readable": bool(net_collector.dhcp_leases()),
    }


def _merge_entry(
    entries: dict[str, dict[str, Any]],
    mac: str,
) -> dict[str, Any]:
    return entries.setdefault(
        mac,
        {
            "mac": mac,
            "ip": None,
            "hostname": None,
            "interface": None,
            "sources": [],
            "wifi": None,
            "neighbor": None,
            "lease": None,
            "state": "inactive",
        },
    )


def _add_source(entry: dict[str, Any], source: str) -> None:
    if source not in entry["sources"]:
        entry["sources"].append(source)


def collect_entries(interface: str | None = None) -> dict[str, Any]:
    """Read every source once and merge entries by MAC."""

    interfaces = [interface] if interface else _target_interfaces()
    entries: dict[str, dict[str, Any]] = {}

    for name in interfaces:
        for station in net_collector.station_dump(name):
            entry = _merge_entry(entries, station["mac"])
            entry["interface"] = entry["interface"] or name
            entry["wifi"] = {**station, "interface": name}
            entry["wifi"]["signal_dbm"] = station.get("signal_dbm")
            entry["state"] = "associated"
            _add_source(entry, "wifi")

        for neighbor in net_collector.neighbours(name):
            entry = _merge_entry(entries, neighbor["mac"])
            entry["interface"] = entry["interface"] or name
            entry["neighbor"] = neighbor
            entry["ip"] = entry["ip"] or neighbor["ip"]
            _add_source(entry, "arp")
            if neighbor["state"] in ACTIVE_NEIGH_STATES and entry["state"] != "associated":
                entry["state"] = "active"
            elif neighbor["state"] in INACTIVE_NEIGH_STATES and entry["state"] == "inactive":
                entry["state"] = "inactive"

    leases = net_collector.dhcp_leases(interface)
    for lease in leases:
        entry = _merge_entry(entries, lease["mac"])
        entry["lease"] = lease
        entry["ip"] = entry["ip"] or lease["ip"]
        if lease.get("hostname"):
            entry["hostname"] = entry["hostname"] or lease["hostname"]
        _add_source(entry, "dhcp")
        if entry["state"] == "inactive":
            entry["state"] = "dhcp_only"
        if not entry["interface"] and lease.get("source"):
            match = re.search(r"dnsmasq-(.+)\.leases", lease["source"])
            if match:
                entry["interface"] = match.group(1)

    now = now_ms()
    for entry in entries.values():
        mac = entry["mac"]
        vendor = oui.lookup(mac)
        entry["vendor"] = vendor
        entry["device_type"] = infer_device_type(entry.get("hostname"), vendor)
        entry["signal_dbm"] = (entry.get("wifi") or {}).get("signal_dbm")

    return {
        "interface": interface,
        "interfaces": interfaces,
        "entries": list(entries.values()),
        "collected_at": _iso(now),
        "collected_at_ms": now,
        "capabilities": capabilities(),
    }


def _upsert_device(
    connection: Any,
    entry: dict[str, Any],
    now: int,
    seen_active: bool,
) -> int:
    row = connection.execute(
        "SELECT * FROM device WHERE mac = ?", (entry["mac"],)
    ).fetchone()
    vendor = entry.get("vendor")
    hostname = entry.get("hostname")

    if row is None:
        cursor = connection.execute(
            "INSERT INTO device (mac, hostname, device_type, vendor, first_seen, "
            "last_seen, is_known, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
            (
                entry["mac"],
                hostname,
                entry.get("device_type") or "unknown",
                vendor,
                now,
                now,
                now,
            ),
        )
        event_service.record(
            "device_first_seen",
            f"Novo dispositivo {entry['mac']} detectado",
            mac=entry["mac"],
            ip=entry.get("ip"),
            interface=entry.get("interface"),
            connection=connection,
        )
        return int(cursor.lastrowid or 0)

    device_id = int(row["id"])
    # ``last_seen`` means "last time an active source saw this device". A DHCP
    # lease or a stale ARP entry must not keep a device marked as online.
    updates = ["updated_at = ?"]
    params: list[Any] = [now]
    if seen_active:
        updates.append("last_seen = ?")
        params.append(now)
    if hostname and hostname != row["hostname"]:
        updates.append("hostname = ?")
        params.append(hostname)
    if vendor and vendor != row["vendor"]:
        updates.append("vendor = ?")
        params.append(vendor)
    if row["device_type"] in (None, "", "unknown"):
        inferred = entry.get("device_type")
        if inferred and inferred != "unknown":
            updates.append("device_type = ?")
            params.append(inferred)
    params.append(entry["mac"])
    connection.execute(
        f"UPDATE device SET {', '.join(updates)} WHERE mac = ?", tuple(params)
    )
    return device_id


def _upsert_address(
    connection: Any, device_id: int, entry: dict[str, Any], now: int
) -> None:
    ip = entry.get("ip")
    if not ip:
        return
    # SQLite treats NULLs as distinct in a UNIQUE constraint, so using NULL for
    # an unknown interface would insert a duplicate row every cycle. Normalise
    # it to "" and convert back to null when reading.
    interface = entry.get("interface") or ""
    connection.execute(
        "INSERT INTO device_address (device_id, mac, ip, interface, first_seen, "
        "last_seen) VALUES (?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(mac, ip, interface) DO UPDATE SET "
        "last_seen = excluded.last_seen, device_id = excluded.device_id",
        (device_id, entry["mac"], ip, interface, now, now),
    )


def _upsert_connection(
    connection: Any, device_id: int, entry: dict[str, Any], now: int
) -> None:
    connection_type = "wifi" if entry.get("wifi") else "network"
    row = connection.execute(
        "SELECT id, state FROM device_connection WHERE mac = ? AND "
        "interface IS ? AND connection_type = ? AND disconnected_at IS NULL "
        "ORDER BY last_seen DESC LIMIT 1",
        (entry["mac"], entry.get("interface"), connection_type),
    ).fetchone()
    wifi = entry.get("wifi") or {}

    if row is None:
        connection.execute(
            "INSERT INTO device_connection (device_id, mac, ip, interface, "
            "connection_type, state, signal_dbm, rx_bytes, tx_bytes, "
            "connected_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                device_id,
                entry["mac"],
                entry.get("ip"),
                entry.get("interface"),
                connection_type,
                entry["state"],
                entry.get("signal_dbm"),
                wifi.get("rx_bytes"),
                wifi.get("tx_bytes"),
                now,
                now,
            ),
        )
    else:
        connection.execute(
            "UPDATE device_connection SET ip = COALESCE(?, ip), state = ?, "
            "signal_dbm = ?, rx_bytes = COALESCE(?, rx_bytes), "
            "tx_bytes = COALESCE(?, tx_bytes), last_seen = ? WHERE id = ?",
            (
                entry.get("ip"),
                entry["state"],
                entry.get("signal_dbm"),
                wifi.get("rx_bytes"),
                wifi.get("tx_bytes"),
                now,
                row["id"],
            ),
        )


def _close_stale_connections(
    connection: Any,
    now: int,
    seen_connections: set[tuple[str, str | None, str]],
    threshold_ms: int,
) -> None:
    rows = connection.execute(
        "SELECT id, mac, interface, connection_type FROM device_connection WHERE "
        "disconnected_at IS NULL AND last_seen < ? AND state IN "
        "('associated', 'active', 'dhcp_only', 'inactive')",
        (now - threshold_ms,),
    ).fetchall()
    seen_disconnected: set[tuple[str, str | None]] = set()
    for row in rows:
        mac = row["mac"]
        # Compare the full observation key: a device that still has a DHCP
        # lease but is no longer associated must have its Wi-Fi connection
        # closed instead of staying open forever.
        key_seen = (mac, row["interface"], row["connection_type"])
        if key_seen in seen_connections:
            continue
        connection.execute(
            "UPDATE device_connection SET disconnected_at = ?, state = 'disconnected' "
            "WHERE id = ?",
            (now, row["id"]),
        )
        key = (mac, row["interface"])
        if key not in seen_disconnected:
            seen_disconnected.add(key)
            event_service.record(
                "device_disconnected",
                f"Dispositivo {mac} desconectou",
                severity="warning",
                mac=mac,
                interface=row["interface"],
                connection=connection,
            )


def _flags_for(macs: list[str]) -> dict[str, dict[str, Any]]:
    if not macs:
        return {}
    placeholders = ",".join("?" for _ in macs)
    rows = query(
        f"SELECT mac, nickname, device_type, is_known, internet_blocked, banned, notes "
        f"FROM device WHERE mac IN ({placeholders})",
        tuple(macs),
    )
    return {row["mac"]: dict(row) for row in rows}


def _sort_state(entry: dict[str, Any]) -> int:
    return {"associated": 0, "active": 1, "dhcp_only": 2}.get(entry["state"], 3)


def collect_and_store(interface: str | None = None) -> dict[str, Any]:
    """Collect network state and persist it (device history + events).

    All writes for one collection cycle share a single transaction so the
    database never exposes a half-updated cycle and SQLite only takes the
    write lock once.
    """

    payload = collect_entries(interface)
    now = payload["collected_at_ms"]
    threshold = max(settings.monitor_interval * 3, 30) * 1000
    seen_connections = {
        (
            entry["mac"],
            entry.get("interface"),
            "wifi" if entry.get("wifi") else "network",
        )
        for entry in payload["entries"]
    }

    with _DEVICE_LOCK, transaction() as connection:
        for entry in payload["entries"]:
            seen_active = entry["state"] in ONLINE_STATES
            device_id = _upsert_device(connection, entry, now, seen_active)
            _upsert_address(connection, device_id, entry, now)
            _upsert_connection(connection, device_id, entry, now)
        _close_stale_connections(connection, now, seen_connections, threshold)

    flags = _flags_for([entry["mac"] for entry in payload["entries"]])
    payload["entries"] = [
        {**entry, "flags": flags.get(entry["mac"], {})} for entry in payload["entries"]
    ]
    payload["entries"].sort(
        key=lambda item: (_sort_state(item), _ip_sort_key(item.get("ip")))
    )
    return payload


def _ip_sort_key(value: str | None) -> tuple[int, int, int, int]:
    if not value:
        return (999, 999, 999, 999)
    parts = value.split(".")
    if len(parts) == 4 and all(part.isdigit() for part in parts):
        return tuple(int(part) for part in parts)  # type: ignore[return-value]
    return (998, 998, 998, 998)


def list_connected(interface: str | None = None) -> dict[str, Any]:
    """Return what is visible on the hotspot right now.

    Read-only on purpose: a GET must not create devices, connections or
    events. Persistence happens in the monitor loop (``collect_and_store``).
    """

    payload = collect_entries(interface)
    entries = payload["entries"]
    counts = {"associated": 0, "active": 0, "dhcp_only": 0, "inactive": 0}
    for entry in entries:
        counts[entry["state"]] = counts.get(entry["state"], 0) + 1

    macs = [entry["mac"] for entry in entries]
    flags = _flags_for(macs)
    history: dict[str, Any] = {}
    if macs:
        placeholders = ",".join("?" for _ in macs)
        rows = query(
            f"SELECT mac, first_seen, last_seen FROM device WHERE mac IN ({placeholders})",
            tuple(macs),
        )
        history = {row["mac"]: row for row in rows}

    clients = []
    for entry in entries:
        row = history.get(entry["mac"])
        clients.append(
            {
                **entry,
                "first_seen": _iso(row["first_seen"]) if row else None,
                # The collection itself is the observation: an entry in an
                # online state was seen active this instant, while a DHCP-only
                # entry reports the last time it was actually active.
                "last_seen": (
                    payload["collected_at"]
                    if entry["state"] in ONLINE_STATES or row is None
                    else _iso(row["last_seen"])
                ),
                "flags": flags.get(entry["mac"], {}),
            }
        )

    clients.sort(key=lambda item: (_sort_state(item), _ip_sort_key(item.get("ip"))))

    return {
        "interface": payload["interface"],
        "interfaces": payload["interfaces"],
        "count": len(clients),
        "counts": counts,
        "capabilities": payload["capabilities"],
        "clients": clients,
        "checked_at": payload["collected_at"],
    }


def _device_or_404(mac: str) -> dict[str, Any]:
    row = query_one("SELECT * FROM device WHERE mac = ?", (mac.lower(),))
    if row is None:
        raise DeviceNotFoundError(f"Device {mac} has never been seen.")
    return dict(row)


def list_known(
    *,
    search: str | None = None,
    device_type: str | None = None,
    only_blocked: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> dict[str, Any]:
    clauses: list[str] = []
    params: list[Any] = []
    if search:
        like = f"%{search.lower()}%"
        clauses.append(
            "(lower(mac) LIKE ? OR lower(COALESCE(nickname, '')) LIKE ? "
            "OR lower(COALESCE(hostname, '')) LIKE ? OR lower(COALESCE(vendor, '')) LIKE ?)"
        )
        params.extend([like] * 4)
    if device_type:
        clauses.append("device_type = ?")
        params.append(device_type)
    if only_blocked:
        clauses.append("(internet_blocked = 1 OR banned = 1)")

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = query(
        "SELECT d.*, "
        "(SELECT ip FROM device_address a WHERE a.device_id = d.id "
        " ORDER BY last_seen DESC LIMIT 1) AS last_ip, "
        "(SELECT NULLIF(interface, '') FROM device_address a WHERE a.device_id = d.id "
        " ORDER BY last_seen DESC LIMIT 1) AS last_interface, "
        "(SELECT state FROM device_connection c WHERE c.device_id = d.id "
        " ORDER BY last_seen DESC LIMIT 1) AS last_state, "
        "(SELECT MAX(last_seen) FROM device_connection c WHERE c.device_id = d.id) "
        "AS connection_last_seen "
        f"FROM device d{where} ORDER BY d.last_seen DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    )
    total_row = query_one(f"SELECT COUNT(*) AS total FROM device{where}", tuple(params))
    threshold = max(settings.monitor_interval * 3, 30) * 1000
    now = now_ms()
    devices = []
    for row in rows:
        item = dict(row)
        last_seen = item["last_seen"]
        devices.append(
            {
                **item,
                "first_seen": _iso(item["first_seen"]),
                "last_seen": _iso(last_seen),
                "connection_last_seen": _iso(item.get("connection_last_seen")),
                # Being recently updated is not enough: the last state must
                # also be an active one. A DHCP-only or stale ARP device is
                # known, but not online.
                "is_online": bool(
                    item.get("last_state") in ONLINE_STATES
                    and last_seen
                    and now - last_seen < threshold
                ),
                "is_known": bool(item["is_known"]),
                "internet_blocked": bool(item["internet_blocked"]),
                "banned": bool(item["banned"]),
            }
        )
    return {
        "count": len(devices),
        "total": int(total_row["total"]) if total_row else 0,
        "limit": limit,
        "offset": offset,
        "devices": devices,
    }


def get_device(mac: str) -> dict[str, Any]:
    device = _device_or_404(mac)
    addresses = query(
        "SELECT ip, interface, first_seen, last_seen FROM device_address "
        "WHERE mac = ? ORDER BY last_seen DESC",
        (mac.lower(),),
    )
    connections = query(
        "SELECT * FROM device_connection WHERE mac = ? ORDER BY last_seen DESC LIMIT 50",
        (mac.lower(),),
    )
    event_rows = query(
        "SELECT * FROM event WHERE mac = ? ORDER BY created_at DESC LIMIT 50",
        (mac.lower(),),
    )
    return {
        **device,
        "first_seen": _iso(device["first_seen"]),
        "last_seen": _iso(device["last_seen"]),
        "internet_blocked": bool(device["internet_blocked"]),
        "banned": bool(device["banned"]),
        "is_known": bool(device["is_known"]),
        "addresses": [
            {
                **dict(row),
                "interface": row["interface"] or None,
                "first_seen": _iso(row["first_seen"]),
                "last_seen": _iso(row["last_seen"]),
            }
            for row in addresses
        ],
        "connections": [
            {
                **dict(row),
                "connected_at": _iso(row["connected_at"]),
                "disconnected_at": _iso(row["disconnected_at"]),
                "last_seen": _iso(row["last_seen"]),
            }
            for row in connections
        ],
        "events": [
            {
                "id": row["id"],
                "type": row["type"],
                "severity": row["severity"],
                "message": row["message"],
                "created_at": _iso(row["created_at"]),
            }
            for row in event_rows
        ],
    }


def update_device(
    mac: str,
    *,
    nickname: str | None = None,
    device_type: str | None = None,
    notes: str | None = None,
    is_known: bool | None = None,
) -> dict[str, Any]:
    device = _device_or_404(mac)
    updates: list[str] = ["updated_at = ?"]
    params: list[Any] = [now_ms()]

    if nickname is not None:
        updates.append("nickname = ?")
        params.append(nickname.strip() or None)
    if device_type is not None:
        if device_type not in DEVICE_TYPES:
            raise ValueError(
                f"Invalid device type {device_type!r}; expected one of {sorted(DEVICE_TYPES)}"
            )
        updates.append("device_type = ?")
        params.append(device_type)
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes.strip() or None)
    if is_known is not None:
        updates.append("is_known = ?")
        params.append(1 if is_known else 0)

    params.append(mac.lower())
    execute(f"UPDATE device SET {', '.join(updates)} WHERE mac = ?", tuple(params))
    event_service.record(
        "device_updated",
        f"Dispositivo {mac} atualizado",
        mac=mac.lower(),
        metadata={
            "nickname": nickname,
            "device_type": device_type,
            "is_known": is_known,
        },
    )
    return get_device(mac)


def set_internet_blocked(mac: str, blocked: bool) -> dict[str, Any]:
    device = _device_or_404(mac)
    firewall = FirewallService()
    if blocked:
        if not firewall.available:
            raise FirewallUnavailableError(
                "nftables is not available; the device was not blocked."
            )
        firewall.add(device["mac"])
    else:
        # Removing a rule must never fail the request: if nftables is gone the
        # rule is gone too, so clearing the flag is the correct end state.
        try:
            firewall.remove(device["mac"])
        except FirewallUnavailableError:
            logger.warning(
                "nftables unavailable; clearing the block flag for %s anyway",
                device["mac"],
            )

    execute(
        "UPDATE device SET internet_blocked = ?, updated_at = ? WHERE mac = ?",
        (1 if blocked else 0, now_ms(), device["mac"]),
    )
    event_service.record(
        "device_internet_blocked" if blocked else "device_internet_unblocked",
        f"Internet {'bloqueada' if blocked else 'liberada'} para {device['mac']}",
        severity="warning" if blocked else "info",
        mac=device["mac"],
        metadata={"scope": "internet", "nft_table": firewall.table},
    )
    return {
        "mac": device["mac"],
        "internet_blocked": blocked,
        "banned": bool(device["banned"]),
        "applied": True,
        "scope": "internet",
    }


def disconnect_device(mac: str) -> dict[str, Any]:
    device = _device_or_404(mac)
    if not net_collector.tool_available("iw"):
        raise DeviceOperationError(
            "'iw' is not available; disconnecting a station is not supported."
        )

    row = query_one(
        "SELECT interface FROM device_connection WHERE mac = ? AND "
        "disconnected_at IS NULL ORDER BY last_seen DESC LIMIT 1",
        (device["mac"],),
    )
    candidates = []
    if row and row["interface"]:
        candidates.append(row["interface"])
    candidates.extend(_target_interfaces())
    candidates = list(dict.fromkeys(candidates))

    errors: list[str] = []
    for interface in candidates:
        station_macs = {station["mac"] for station in net_collector.station_dump(interface)}
        if device["mac"] not in station_macs:
            continue
        result = net_collector.station_disconnect(interface, device["mac"])
        if result.ok:
            execute(
                "UPDATE device_connection SET disconnected_at = ?, state = 'disconnected' "
                "WHERE mac = ? AND interface = ? AND disconnected_at IS NULL",
                (now_ms(), device["mac"], interface),
            )
            event_service.record(
                "device_disconnected",
                f"Dispositivo {device['mac']} desconectado de {interface}",
                severity="warning",
                mac=device["mac"],
                interface=interface,
            )
            return {
                "mac": device["mac"],
                "disconnected": True,
                "interface": interface,
                "detail": None,
            }
        errors.append(f"{interface}: {result.detail or 'failed'}")

    raise DeviceOperationError(
        "The device is not associated to a Wi-Fi interface or the driver does "
        "not support removing stations.",
        details={"attempts": errors},
    )


def set_banned(mac: str, banned: bool) -> dict[str, Any]:
    device = _device_or_404(mac)
    firewall = FirewallService()

    if banned:
        if not firewall.available:
            raise FirewallUnavailableError(
                "nftables is not available; the device was not banned."
            )
        firewall.add(device["mac"])
        execute(
            "UPDATE device SET banned = 1, internet_blocked = 1, updated_at = ? "
            "WHERE mac = ?",
            (now_ms(), device["mac"]),
        )
        disconnected = None
        try:
            disconnected = disconnect_device(device["mac"])
        except DeviceOperationError as exc:
            disconnected = {"disconnected": False, "detail": exc.message}
        event_service.record(
            "device_banned",
            f"Dispositivo {device['mac']} banido (internet + Wi-Fi)",
            severity="warning",
            mac=device["mac"],
            metadata={"disconnect": disconnected},
        )
        return {
            "mac": device["mac"],
            "banned": True,
            "internet_blocked": True,
            "disconnect": disconnected,
        }

    try:
        firewall.remove(device["mac"])
    except FirewallUnavailableError:
        logger.warning(
            "nftables unavailable; clearing ban flags for %s anyway", device["mac"]
        )
    execute(
        "UPDATE device SET banned = 0, internet_blocked = 0, updated_at = ? "
        "WHERE mac = ?",
        (now_ms(), device["mac"]),
    )
    event_service.record(
        "device_unbanned",
        f"Dispositivo {device['mac']} desbanido",
        mac=device["mac"],
    )
    return {
        "mac": device["mac"],
        "banned": False,
        "internet_blocked": False,
        "disconnect": None,
    }


def restore_firewall() -> None:
    """Re-apply internet blocks after a restart."""

    rows = query(
        "SELECT mac FROM device WHERE internet_blocked = 1 OR banned = 1"
    )
    FirewallService().sync(row["mac"] for row in rows)


def prune_history(retention_hours: int | None = None) -> None:
    """Drop old connection/event rows.

    Traffic samples have their own retention (``MONITOR_RETENTION_HOURS``) and
    are pruned by ``monitoring_service``; deleting them here would make the
    traffic chart shorter than the configured window.
    """

    hours = retention_hours or settings.event_retention_hours
    cutoff = now_ms() - hours * 3600 * 1000
    execute(
        "DELETE FROM device_connection WHERE last_seen < ? AND disconnected_at IS NOT NULL",
        (cutoff,),
    )
    execute("DELETE FROM event WHERE created_at < ?", (cutoff,))


def summary() -> dict[str, Any]:
    now = now_ms()
    threshold = max(settings.monitor_interval * 3, 30) * 1000
    row = query_one("SELECT COUNT(*) AS total FROM device")
    online = query_one(
        "SELECT COUNT(*) AS total FROM device d WHERE d.last_seen >= ? AND "
        "(SELECT state FROM device_connection c WHERE c.device_id = d.id "
        " ORDER BY last_seen DESC LIMIT 1) IN ('associated', 'active')",
        (now - threshold,),
    )
    blocked = query_one(
        "SELECT COUNT(*) AS total FROM device WHERE internet_blocked = 1 OR banned = 1"
    )
    return {
        "total_devices": int(row["total"]) if row else 0,
        "online_devices": int(online["total"]) if online else 0,
        "blocked_devices": int(blocked["total"]) if blocked else 0,
    }
