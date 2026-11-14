"""Request context middleware: ids, timing headers and error correlation."""

from __future__ import annotations

import re

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from core.exceptions import DeviceNotFoundError, register_exception_handlers
from core.middleware import RequestContextMiddleware, sanitize_request_id


def _build_client() -> TestClient:
    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)

    @app.get("/")
    def index(request: Request) -> dict[str, str]:
        return {"request_id": request.state.request_id}

    @app.get("/missing")
    def missing() -> None:
        raise DeviceNotFoundError("no such device")

    return TestClient(app)


def test_sanitize_request_id_removes_unsafe_characters():
    assert sanitize_request_id("abc/../\n xyz") == "abc..xyz"
    assert sanitize_request_id("") == ""
    assert len(sanitize_request_id("a" * 100)) == 64


def test_client_request_id_is_echoed_and_exposed_in_state():
    client = _build_client()

    response = client.get("/", headers={"X-Request-ID": "trace-123"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "trace-123"
    assert response.json() == {"request_id": "trace-123"}
    assert float(response.headers["X-Process-Time-Ms"]) >= 0


def test_invalid_request_id_is_sanitized():
    client = _build_client()

    response = client.get("/", headers={"X-Request-ID": "bad id/../x"})

    assert response.headers["X-Request-ID"] == sanitize_request_id("bad id/../x")
    assert response.json()["request_id"] == sanitize_request_id("bad id/../x")


def test_generated_request_id_is_present():
    client = _build_client()

    response = client.get("/")

    request_id = response.headers["X-Request-ID"]
    assert re.fullmatch(r"[0-9a-f]{32}", request_id)
    assert response.json()["request_id"] == request_id


def test_error_payload_contains_request_id():
    client = _build_client()

    response = client.get("/missing", headers={"X-Request-ID": "trace-404"})

    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == "device_not_found"
    assert payload["error"]["request_id"] == "trace-404"
