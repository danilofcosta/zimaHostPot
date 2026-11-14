"""Interface traffic sampling and rate calculation.

Rates are always derived from two real counter samples (``/sys/class/net``)
with their timestamps. If a counter goes backwards (interface reset, driver
reload, container restart) the sample is marked as reset and no rate is
reported instead of showing a nonsense value.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from core.config import settings
from core.database import execute, now_ms, query, query_one
from services import net_collector

logger = logging.getLogger(__name__)


def _iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(
        timespec="seconds"
    )


def interfaces() -> list[str]:
    names = {entry["name"] for entry in net_collector.wireless_interfaces()}
    for device in net_collector.device_status():
        if device["type"] == "wifi":
            names.add(device["name"])
    names.add(settings.default_interface)
    return sorted(name for name in names if name)


def _known_interface(name: str) -> bool:
    return net_collector.read_counters(name) is not None


def sample(interface: str) -> dict[str, Any] | None:
    counters = net_collector.read_counters(interface)
    if counters is None:
        return None
    sampled_at = now_ms()
    execute(
        "INSERT INTO traffic_sample (interface, rx_bytes, tx_bytes, rx_packets, "
        "tx_packets, sampled_at) VALUES (?, ?, ?, ?, ?, ?)",
        (
            interface,
            counters["rx_bytes"],
            counters["tx_bytes"],
            counters["rx_packets"],
            counters["tx_packets"],
            sampled_at,
        ),
    )
    return {
        "interface": interface,
        **counters,
        "sampled_at": sampled_at,
    }


def sample_all() -> list[dict[str, Any]]:
    samples = []
    for interface in interfaces():
        result = sample(interface)
        if result:
            samples.append(result)
    return samples


def _counter_delta(current: int, previous: int) -> tuple[int, bool]:
    if current < previous:
        return 0, True
    return current - previous, False


def snapshot(
    interface: str,
    *,
    window_seconds: int = 60,
    history_points: int = 60,
) -> dict[str, Any]:
    available = _known_interface(interface)
    latest = query_one(
        "SELECT * FROM traffic_sample WHERE interface = ? ORDER BY sampled_at DESC LIMIT 1",
        (interface,),
    )

    if latest is None:
        # A GET is read-only: never insert a sample here. Right after boot the
        # sampler may not have run yet, so report the current counters without
        # a rate and let the next sample create the history point.
        counters = net_collector.read_counters(interface)
        return {
            "interface": interface,
            "available": available,
            "counters": (
                {
                    "rx_bytes": counters["rx_bytes"],
                    "tx_bytes": counters["tx_bytes"],
                    "rx_packets": counters["rx_packets"],
                    "tx_packets": counters["tx_packets"],
                }
                if counters
                else None
            ),
            "rates": None,
            "reset_detected": False,
            "window_seconds": window_seconds,
            "sampled_at": None,
            "sampling_since": None,
            "history": [],
            "clients": None,
            "hotspot": None,
            "checked_at": _iso(now_ms()),
            "message": (
                "No sample stored yet; rates appear after the next collection."
                if counters
                else "Interface counters are not readable (interface missing or "
                "container without host network)."
            ),
        }

    previous = query_one(
        "SELECT * FROM traffic_sample WHERE interface = ? AND sampled_at <= ? "
        "ORDER BY sampled_at DESC LIMIT 1",
        (interface, latest["sampled_at"] - window_seconds * 1000),
    )
    if previous is None or previous["sampled_at"] == latest["sampled_at"]:
        previous = query_one(
            "SELECT * FROM traffic_sample WHERE interface = ? AND sampled_at < ? "
            "ORDER BY sampled_at DESC LIMIT 1",
            (interface, latest["sampled_at"]),
        )

    rates = None
    reset = False
    if previous is not None:
        elapsed_ms = latest["sampled_at"] - previous["sampled_at"]
        if elapsed_ms > 0:
            rx_delta, rx_reset = _counter_delta(
                int(latest["rx_bytes"]), int(previous["rx_bytes"])
            )
            tx_delta, tx_reset = _counter_delta(
                int(latest["tx_bytes"]), int(previous["tx_bytes"])
            )
            rxp_delta, rxp_reset = _counter_delta(
                int(latest["rx_packets"]), int(previous["rx_packets"])
            )
            txp_delta, txp_reset = _counter_delta(
                int(latest["tx_packets"]), int(previous["tx_packets"])
            )
            reset = any([rx_reset, tx_reset, rxp_reset, txp_reset])
            if not reset:
                seconds = elapsed_ms / 1000
                rates = {
                    "rx_bytes_per_second": round(rx_delta / seconds, 2),
                    "tx_bytes_per_second": round(tx_delta / seconds, 2),
                    "rx_packets_per_second": round(rxp_delta / seconds, 2),
                    "tx_packets_per_second": round(txp_delta / seconds, 2),
                    "rx_bits_per_second": round((rx_delta * 8) / seconds, 2),
                    "tx_bits_per_second": round((tx_delta * 8) / seconds, 2),
                    "interval_seconds": round(seconds, 3),
                }

    first = query_one(
        "SELECT sampled_at FROM traffic_sample WHERE interface = ? ORDER BY sampled_at ASC LIMIT 1",
        (interface,),
    )
    history_rows = query(
        "SELECT rx_bytes, tx_bytes, rx_packets, tx_packets, sampled_at "
        "FROM traffic_sample WHERE interface = ? ORDER BY sampled_at DESC LIMIT ?",
        (interface, history_points),
    )

    station_count = len(net_collector.station_dump(interface))
    active = [
        connection
        for connection in net_collector.active_connections()
        if connection["device"] == interface
        and connection["name"] == settings.default_profile_name
    ]

    return {
        "interface": interface,
        "available": available,
        "counters": {
            "rx_bytes": int(latest["rx_bytes"]),
            "tx_bytes": int(latest["tx_bytes"]),
            "rx_packets": int(latest["rx_packets"]),
            "tx_packets": int(latest["tx_packets"]),
        },
        "rates": rates,
        "reset_detected": reset,
        "window_seconds": window_seconds,
        "sampled_at": _iso(latest["sampled_at"]),
        "sampling_since": _iso(first["sampled_at"] if first else None),
        "history": [
            {
                "rx_bytes": int(row["rx_bytes"]),
                "tx_bytes": int(row["tx_bytes"]),
                "rx_packets": int(row["rx_packets"]),
                "tx_packets": int(row["tx_packets"]),
                "sampled_at": _iso(row["sampled_at"]),
                "sampled_at_ms": row["sampled_at"],
            }
            for row in reversed(history_rows)
        ],
        "clients": {
            "wifi_stations": station_count,
        },
        "hotspot": {
            "active": bool(active),
            "connection": active[0]["name"] if active else None,
        },
        "checked_at": _iso(now_ms()),
    }


def history(interface: str, *, minutes: int = 60, limit: int = 720) -> dict[str, Any]:
    since = now_ms() - minutes * 60 * 1000
    rows = query(
        "SELECT rx_bytes, tx_bytes, rx_packets, tx_packets, sampled_at "
        "FROM traffic_sample WHERE interface = ? AND sampled_at >= ? "
        "ORDER BY sampled_at ASC LIMIT ?",
        (interface, since, limit),
    )
    return {
        "interface": interface,
        "minutes": minutes,
        "count": len(rows),
        "samples": [
            {
                "rx_bytes": int(row["rx_bytes"]),
                "tx_bytes": int(row["tx_bytes"]),
                "rx_packets": int(row["rx_packets"]),
                "tx_packets": int(row["tx_packets"]),
                "sampled_at": _iso(row["sampled_at"]),
                "sampled_at_ms": row["sampled_at"],
            }
            for row in rows
        ],
    }


def prune() -> None:
    cutoff = now_ms() - settings.monitor_retention_hours * 3600 * 1000
    execute("DELETE FROM traffic_sample WHERE sampled_at < ?", (cutoff,))
