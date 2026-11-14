"""Traffic sampling: GET requests stay read-only and rates are real."""

from __future__ import annotations

import pytest

from core import database
from services import monitoring_service

COUNTERS = {
    "rx_bytes": 1000,
    "tx_bytes": 2000,
    "rx_packets": 10,
    "tx_packets": 20,
}


@pytest.fixture()
def network(monkeypatch):
    monkeypatch.setattr(
        monitoring_service.net_collector, "read_counters", lambda interface: dict(COUNTERS)
    )
    monkeypatch.setattr(
        monitoring_service.net_collector, "station_dump", lambda interface: []
    )
    monkeypatch.setattr(
        monitoring_service.net_collector, "active_connections", lambda: []
    )
    monkeypatch.setattr(
        monitoring_service.net_collector,
        "wireless_interfaces",
        lambda: [{"name": "wlan0"}],
    )
    monkeypatch.setattr(
        monitoring_service.net_collector, "device_status", lambda: []
    )


def _insert_sample(rx: int, tx: int, rxp: int, txp: int, sampled_at: int) -> None:
    database.execute(
        "INSERT INTO traffic_sample (interface, rx_bytes, tx_bytes, rx_packets, "
        "tx_packets, sampled_at) VALUES ('wlan0', ?, ?, ?, ?, ?)",
        (rx, tx, rxp, txp, sampled_at),
    )


def test_snapshot_without_samples_does_not_write(network):
    result = monitoring_service.snapshot("wlan0")

    assert result["available"] is True
    assert result["counters"] == COUNTERS
    assert result["rates"] is None
    assert result["history"] == []
    assert "next collection" in result["message"]
    assert database.query_one("SELECT COUNT(*) AS n FROM traffic_sample")["n"] == 0


def test_snapshot_without_readable_counters(network, monkeypatch):
    monkeypatch.setattr(
        monitoring_service.net_collector, "read_counters", lambda interface: None
    )

    result = monitoring_service.snapshot("wlan0")

    assert result["available"] is False
    assert result["counters"] is None
    assert "not readable" in result["message"]
    assert database.query_one("SELECT COUNT(*) AS n FROM traffic_sample")["n"] == 0


def test_snapshot_computes_rates_from_two_samples(network):
    now = database.now_ms()
    _insert_sample(0, 0, 0, 0, now - 60_000)
    _insert_sample(6_000, 12_000, 600, 1_200, now)

    result = monitoring_service.snapshot("wlan0", window_seconds=60, history_points=60)

    assert result["reset_detected"] is False
    assert result["rates"] == {
        "rx_bytes_per_second": 100.0,
        "tx_bytes_per_second": 200.0,
        "rx_packets_per_second": 10.0,
        "tx_packets_per_second": 20.0,
        "rx_bits_per_second": 800.0,
        "tx_bits_per_second": 1_600.0,
        "interval_seconds": 60.0,
    }
    assert [point["rx_bytes"] for point in result["history"]] == [0, 6_000]


def test_counter_reset_reports_no_rate(network):
    now = database.now_ms()
    _insert_sample(10_000, 10_000, 1_000, 1_000, now - 60_000)
    _insert_sample(500, 500, 50, 50, now)

    result = monitoring_service.snapshot("wlan0")

    assert result["reset_detected"] is True
    assert result["rates"] is None


def test_prune_removes_only_old_traffic_samples(network):
    now = database.now_ms()
    _insert_sample(1, 1, 1, 1, now - 100 * 3600 * 1000)
    _insert_sample(2, 2, 2, 2, now)

    monitoring_service.prune()

    rows = database.query("SELECT rx_bytes FROM traffic_sample ORDER BY rx_bytes")
    assert [row["rx_bytes"] for row in rows] == [2]
