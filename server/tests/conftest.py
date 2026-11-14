"""Shared pytest configuration.

``core.config`` reads the environment exactly once, at import time. The
environment is therefore pointed at a throw-away data directory *before* any
application module is imported, so running the suite never touches a real
database or ``hotspot.json``.
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

_TEST_DATA = Path(tempfile.mkdtemp(prefix="zima-hotspot-tests-"))
os.environ["ENVIRONMENT"] = "development"
os.environ["DATA_DIR"] = str(_TEST_DATA)
os.environ["DB_PATH"] = str(_TEST_DATA / "test.db")
os.environ["HOTSPOT_CONFIG_FILE"] = str(_TEST_DATA / "hotspot.json")
os.environ["CORS_ORIGINS"] = "http://localhost:3000"
os.environ["DEFAULT_INTERFACE"] = "wlan0"
os.environ["MONITOR_INTERVAL_SECONDS"] = "10"
os.environ.pop("API_KEY", None)
os.environ.pop("ALLOW_INSECURE_PRODUCTION", None)
os.environ.pop("DOCS_ENABLED", None)


def pytest_sessionfinish(session, exitstatus) -> None:  # noqa: ARG001
    shutil.rmtree(_TEST_DATA, ignore_errors=True)


@pytest.fixture(autouse=True)
def fresh_database():
    """Give every test an empty database with the real schema applied."""

    from core import database
    from core.config import settings

    database._initialised = False
    for suffix in ("", "-wal", "-shm"):
        Path(str(settings.db_path) + suffix).unlink(missing_ok=True)
    database.init_db()

    yield

    database._initialised = False


@pytest.fixture()
def app():
    """The real FastAPI application, without running the background sampler."""

    from api import deps
    from main import app as application

    deps.get_hotspot_service.cache_clear()
    deps.get_hotspot_config_service.cache_clear()
    deps.get_network_service.cache_clear()
    deps.get_health_service.cache_clear()
    return application


@pytest.fixture()
def client(app):
    """A TestClient that does not run the lifespan (and therefore no sampler)."""

    from fastapi.testclient import TestClient

    return TestClient(app)
