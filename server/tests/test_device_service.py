"""Device discovery, history semantics and best-effort unblocking.

The host tools (``iw``/``ip``/dnsmasq) are replaced by small fakes: the code
under test is the merge/persistence logic, which is what used to corrupt the
database and report wrong online states.
"""

from __future__ import annotations

import pytest

from core import database
from core.exceptions import FirewallUnavailableError
from services import device_service

MAC = "aa:bb:cc:dd:ee:ff"
OTHER_MAC = "11:22:33:44:55:66"
LEASE_FILE = "/var/lib/NetworkManager/dnsmasq-wlan0.leases"


@pytest.fixture()
def network(monkeypatch):
    state = {
        "stations": [],
        "neighbours": [],
        "leases": [],
        "tools": False,
    }

    monkeypatch.setattr(
        device_service.net_collector,
        "station_dump",
        lambda interface: list(state["stations"]),
    )
    monkeypatch.setattr(
        device_service.net_collector,
        "neighbours",
        lambda interface=None: list(state["neighbours"]),
    )
    monkeypatch.setattr(
        device_service.net_collector,
        "dhcp_leases",
        lambda interface=None: list(state["leases"]),
    )
    monkeypatch.setattr(
        device_service.net_collector,
        "wireless_interfaces",
        lambda: [{"name": "wlan0"}],
    )
    monkeypatch.setattr(device_service.net_collector, "device_status", lambda: [])
    monkeypatch.setattr(
        device_service.net_collector,
        "tool_available",
        lambda name: state["tools"],
    )
    monkeypatch.setattr(
        device_service.net_collector, "active_connections", lambda: []
    )
    monkeypatch.setattr(device_service.oui, "lookup", lambda mac: None)
    return state


def _station(mac: str = MAC) -> dict:
    return {"mac": mac, "signal_dbm": -42, "rx_bytes": 100, "tx_bytes": 200}


def _lease(mac: str = MAC, ip: str = "10.0.0.2") -> dict:
    return {
        "mac": mac,
        "ip": ip,
        "hostname": "phone",
        "source": LEASE_FILE,
        "expires_at": database.now_ms() + 3600_000,
    }


def _insert_device(mac: str = MAC, **overrides) -> int:
    now = database.now_ms()
    values = {
        "mac": mac,
        "hostname": "phone",
        "device_type": "phone",
        "vendor": "Acme",
        "first_seen": now,
        "last_seen": now,
        "is_known": 0,
        "internet_blocked": 0,
        "banned": 0,
        "updated_at": now,
    }
    values.update(overrides)
    with database.get_db() as connection:
        cursor = connection.execute(
            "INSERT INTO device (mac, hostname, device_type, vendor, first_seen, "
            "last_seen, is_known, internet_blocked, banned, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                values["mac"],
                values["hostname"],
                values["device_type"],
                values["vendor"],
                values["first_seen"],
                values["last_seen"],
                values["is_known"],
                values["internet_blocked"],
                values["banned"],
                values["updated_at"],
            ),
        )
        return int(cursor.lastrowid or 0)


def test_collect_and_store_persists_associated_device(network):
    network["stations"] = [_station()]

    payload = device_service.collect_and_store("wlan0")

    assert payload["entries"][0]["state"] == "associated"
    device = database.query_one("SELECT * FROM device WHERE mac = ?", (MAC,))
    assert device is not None
    connection = database.query_one(
        "SELECT * FROM device_connection WHERE mac = ?", (MAC,)
    )
    assert connection["state"] == "associated"
    assert connection["disconnected_at"] is None
    # A station dump has no IP: no address row must be invented.
    assert (
        database.query_one("SELECT * FROM device_address WHERE mac = ?", (MAC,))
        is None
    )

    events = database.query(
        "SELECT type FROM event WHERE mac = ? ORDER BY id", (MAC,)
    )
    assert [row["type"] for row in events] == ["device_first_seen"]


def test_device_seen_only_by_dhcp_is_not_online(network):
    network["stations"] = [_station()]
    device_service.collect_and_store("wlan0")

    stale_last_seen = database.now_ms() - 60_000
    database.execute(
        "UPDATE device SET last_seen = ? WHERE mac = ?", (stale_last_seen, MAC)
    )
    database.execute(
        "UPDATE device_connection SET last_seen = ? WHERE mac = ?",
        (stale_last_seen, MAC),
    )

    network["stations"] = []
    network["leases"] = [_lease()]
    device_service.collect_and_store("wlan0")

    device = database.query_one("SELECT last_seen FROM device WHERE mac = ?", (MAC,))
    assert device["last_seen"] == stale_last_seen

    known = device_service.list_known()["devices"][0]
    assert known["last_state"] == "dhcp_only"
    assert known["is_online"] is False
    assert device_service.summary()["online_devices"] == 0


def test_stale_associated_connection_is_closed_when_device_only_has_lease(network):
    network["stations"] = [_station()]
    device_service.collect_and_store("wlan0")

    old = database.now_ms() - 10 * 60 * 1000
    database.execute(
        "UPDATE device_connection SET last_seen = ? WHERE mac = ?", (old, MAC)
    )

    network["stations"] = []
    network["leases"] = [_lease()]
    device_service.collect_and_store("wlan0")

    wifi_connection = database.query_one(
        "SELECT * FROM device_connection WHERE mac = ? AND connection_type = 'wifi'",
        (MAC,),
    )
    assert wifi_connection["state"] == "disconnected"
    assert wifi_connection["disconnected_at"] is not None


def test_online_requires_recent_active_state(network):
    network["stations"] = [_station()]
    device_service.collect_and_store("wlan0")

    assert device_service.summary()["online_devices"] == 1

    old = database.now_ms() - 10 * 60 * 1000
    database.execute("UPDATE device SET last_seen = ? WHERE mac = ?", (old, MAC))
    assert device_service.summary()["online_devices"] == 0


def test_collect_and_store_is_atomic(network, monkeypatch):
    network["stations"] = [_station()]

    def explode(*args, **kwargs):
        raise RuntimeError("disk full")

    monkeypatch.setattr(device_service, "_upsert_connection", explode)

    with pytest.raises(RuntimeError, match="disk full"):
        device_service.collect_and_store("wlan0")

    assert database.query_one("SELECT COUNT(*) AS n FROM device")["n"] == 0
    assert database.query_one("SELECT COUNT(*) AS n FROM event")["n"] == 0


def test_list_connected_does_not_write(network):
    network["stations"] = [_station()]

    result = device_service.list_connected("wlan0")

    assert result["count"] == 1
    assert result["clients"][0]["flags"] == {}
    assert database.query_one("SELECT COUNT(*) AS n FROM device")["n"] == 0
    assert database.query_one("SELECT COUNT(*) AS n FROM device_connection")["n"] == 0
    assert database.query_one("SELECT COUNT(*) AS n FROM event")["n"] == 0


def test_list_connected_reports_last_active_observation(network):
    device_id = _insert_device(last_seen=database.now_ms() - 60_000)
    database.execute(
        "INSERT INTO device_connection (device_id, mac, interface, connection_type, "
        "state, connected_at, last_seen) VALUES (?, ?, 'wlan0', 'wifi', "
        "'associated', ?, ?)",
        (
            device_id,
            MAC,
            database.now_ms() - 60_000,
            database.now_ms() - 60_000,
        ),
    )
    network["leases"] = [_lease()]  # observed only through DHCP now

    client = device_service.list_connected("wlan0")["clients"][0]

    assert client["state"] == "dhcp_only"
    assert client["last_seen"] is not None
    assert client["last_seen"].endswith("+00:00")


def test_prune_history_keeps_traffic_samples_and_uses_event_retention():
    now = database.now_ms()
    old_100h = now - 100 * 3600 * 1000
    device_id = _insert_device(mac=MAC, last_seen=old_100h)
    database.execute(
        "INSERT INTO device_connection (device_id, mac, interface, connection_type, "
        "state, disconnected_at, last_seen) VALUES (?, ?, 'wlan0', 'wifi', "
        "'disconnected', ?, ?)",
        (device_id, MAC, old_100h, old_100h),
    )
    database.execute(
        "INSERT INTO event (type, severity, message, created_at) "
        "VALUES ('old', 'info', 'old event', ?)",
        (old_100h,),
    )
    database.execute(
        "INSERT INTO traffic_sample (interface, rx_bytes, tx_bytes, rx_packets, "
        "tx_packets, sampled_at) VALUES ('wlan0', 1, 1, 1, 1, ?)",
        (old_100h,),
    )

    # Default retention is 168h, so a 100h-old event survives.
    device_service.prune_history()
    assert database.query_one("SELECT COUNT(*) AS n FROM event")["n"] == 1
    assert database.query_one("SELECT COUNT(*) AS n FROM device_connection")["n"] == 1

    # An explicit window still never deletes traffic samples.
    device_service.prune_history(retention_hours=1)
    assert database.query_one("SELECT COUNT(*) AS n FROM event")["n"] == 0
    assert database.query_one("SELECT COUNT(*) AS n FROM device_connection")["n"] == 0
    assert database.query_one("SELECT COUNT(*) AS n FROM traffic_sample")["n"] == 1


class _UnavailableFirewall:
    table = "zima_hotspot"
    available = False

    def add(self, mac: str) -> None:
        raise FirewallUnavailableError("nftables is not installed")

    def remove(self, mac: str) -> None:
        raise FirewallUnavailableError("nftables is not installed")


def test_unblock_clears_flags_when_nftables_is_unavailable(monkeypatch):
    _insert_device(internet_blocked=1, banned=1)
    monkeypatch.setattr(device_service, "FirewallService", _UnavailableFirewall)

    result = device_service.set_internet_blocked(MAC, False)

    assert result["internet_blocked"] is False
    row = database.query_one(
        "SELECT internet_blocked, banned FROM device WHERE mac = ?", (MAC,)
    )
    assert (row["internet_blocked"], row["banned"]) == (0, 1)
    assert database.query_one(
        "SELECT COUNT(*) AS n FROM event WHERE type = 'device_internet_unblocked'"
    )["n"] == 1


def test_unban_clears_flags_when_nftables_is_unavailable(monkeypatch):
    _insert_device(internet_blocked=1, banned=1)
    monkeypatch.setattr(device_service, "FirewallService", _UnavailableFirewall)

    result = device_service.set_banned(MAC, False)

    assert result["banned"] is False
    row = database.query_one(
        "SELECT internet_blocked, banned FROM device WHERE mac = ?", (MAC,)
    )
    assert (row["internet_blocked"], row["banned"]) == (0, 0)
    assert database.query_one(
        "SELECT COUNT(*) AS n FROM event WHERE type = 'device_unbanned'"
    )["n"] == 1


def test_ban_still_fails_loudly_when_nftables_is_unavailable(monkeypatch):
    _insert_device()
    monkeypatch.setattr(device_service, "FirewallService", _UnavailableFirewall)

    with pytest.raises(FirewallUnavailableError):
        device_service.set_banned(MAC, True)

    row = database.query_one("SELECT banned FROM device WHERE mac = ?", (MAC,))
    assert row["banned"] == 0


def test_unknown_device_raises(monkeypatch):
    monkeypatch.setattr(device_service, "FirewallService", _UnavailableFirewall)

    with pytest.raises(device_service.DeviceNotFoundError):
        device_service.set_internet_blocked(OTHER_MAC, False)
