"""HTTP-level tests of the real FastAPI application."""

from __future__ import annotations

import asyncio
import threading
from dataclasses import replace

from api import deps
from api.v1.endpoints import monitoring as monitoring_endpoint
from core import database
from services import device_service, monitoring_service

MAC = "aa:bb:cc:dd:ee:ff"


def _stub_network(monkeypatch):
    monkeypatch.setattr(
        device_service.net_collector,
        "station_dump",
        lambda interface: [{"mac": MAC, "signal_dbm": -40}],
    )
    monkeypatch.setattr(
        device_service.net_collector, "neighbours", lambda interface=None: []
    )
    monkeypatch.setattr(
        device_service.net_collector, "dhcp_leases", lambda interface=None: []
    )
    monkeypatch.setattr(
        device_service.net_collector, "wireless_interfaces", lambda: [{"name": "wlan0"}]
    )
    monkeypatch.setattr(device_service.net_collector, "device_status", lambda: [])
    monkeypatch.setattr(
        device_service.net_collector, "tool_available", lambda name: False
    )


def test_service_info(client):
    response = client.get("/")

    assert response.status_code == 200
    body = response.json()
    assert body["name"]
    assert body["environment"] == "development"
    assert body["health"] == "/health"


def test_health_endpoint_never_fails_when_nmcli_is_missing(client):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert body["nmcli_available"] is (body["status"] == "ok")


def test_api_key_is_enforced_when_configured(client, monkeypatch):
    monkeypatch.setattr(deps, "settings", replace(deps.settings, api_key="secret"))

    unauthenticated = client.get("/api/v1/devices/summary")
    wrong_key = client.get(
        "/api/v1/devices/summary", headers={"X-API-Key": "wrong"}
    )
    authenticated = client.get(
        "/api/v1/devices/summary", headers={"X-API-Key": "secret"}
    )

    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["error"]["code"] == "unauthorized"
    assert "ApiKey" in unauthenticated.headers["WWW-Authenticate"]
    assert wrong_key.status_code == 401
    assert authenticated.status_code == 200


def test_connected_endpoint_does_not_persist(client, monkeypatch):
    _stub_network(monkeypatch)

    response = client.get("/api/v1/devices/connected", params={"interface": "wlan0"})

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["clients"][0]["mac"] == MAC
    assert database.query_one("SELECT COUNT(*) AS n FROM device")["n"] == 0
    assert database.query_one("SELECT COUNT(*) AS n FROM device_connection")["n"] == 0


def test_invalid_mac_returns_structured_validation_error(client):
    response = client.get("/api/v1/devices/not-a-mac")

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_sse_stream_runs_snapshot_off_the_event_loop(monkeypatch):
    seen: dict[str, int] = {}

    def fake_snapshot(interface, **kwargs):
        seen["thread"] = threading.get_ident()
        seen["interface"] = interface  # type: ignore[assignment]
        return {"interface": interface, "ok": True}

    class FakeRequest:
        def __init__(self) -> None:
            self.calls = 0

        async def is_disconnected(self) -> bool:
            self.calls += 1
            return self.calls > 1

    async def no_sleep(seconds: float) -> None:
        return None

    monkeypatch.setattr(monitoring_service, "snapshot", fake_snapshot)
    monkeypatch.setattr(monitoring_endpoint.asyncio, "sleep", no_sleep)

    async def consume() -> list[str]:
        response = await monitoring_endpoint.monitoring_stream(
            FakeRequest(), interface="wlan0", interval=2
        )
        return [chunk async for chunk in response.body_iterator]

    chunks = asyncio.run(consume())

    events = [chunk for chunk in chunks if chunk.startswith("event: sample")]
    assert len(events) == 1
    assert '"ok": true' in events[0]
    assert seen["thread"] != threading.get_ident()
    assert seen["interface"] == "wlan0"
