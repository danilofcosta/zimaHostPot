"""Zima Hotspot API - FastAPI entry point.

Run from the ``server`` directory:
    python main.py
    uvicorn main:app --reload

Or from the repository root:
    uvicorn server.main:app --reload
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Make sibling packages (api, core, models, services, funs) importable both when
# this file is executed directly and when it is imported as ``server.main``.
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.deps import get_health_service
from api.root import router as root_router
from api.v1.router import api_router
from core.config import settings
from core.database import init_db
from core.exceptions import register_exception_handlers
from core.logging import configure_logging
from core.middleware import RequestContextMiddleware
from services import event_service, host_service
from services.sampler import sampler

logger = logging.getLogger(__name__)

DESCRIPTION = """
API to manage a Wi-Fi hotspot through NetworkManager (``nmcli``).

## Features
- **Create** a hotspot from scratch (SSID, password, band and channel).
- **Start**, **stop** and **restart** an existing profile.
- **Tear down** the hotspot and optionally delete its profile.
- **Inspect** the current status, IP address and connected profile.
- **List** network interfaces and their IPv4 details.
- **Scan** visible Wi-Fi networks.
- **List**, **inspect** and **delete** saved NetworkManager profiles.
- **List** the clients seen on the hotspot interface.
- **Remember** the last SSID, password and radio settings in a JSON file so the
  UI starts from them instead of the built-in defaults.

All operations are executed on the host running this service, therefore
``nmcli`` and the required permissions (sudo) must be available.
"""

TAGS_METADATA = [
    {
        "name": "Service",
        "description": "Service metadata and health checks.",
    },
    {
        "name": "Hotspot",
        "description": "Create, start, stop, restart, tear down and inspect the Wi-Fi hotspot.",
    },
    {
        "name": "Network",
        "description": "Inspect interfaces, scan Wi-Fi networks and manage NetworkManager profiles.",
    },
    {
        "name": "Devices",
        "description": "Observed devices, persisted history, naming and per-device blocking.",
    },
    {
        "name": "Monitoring",
        "description": "Traffic counters, rates, history and SSE stream.",
    },
    {
        "name": "Events",
        "description": "Persisted hotspot, device and administrative events.",
    },
    {
        "name": "System",
        "description": "Host, database and backend diagnostics.",
    },
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info(
        "%s v%s starting (environment=%s, port=%s)",
        settings.app_name,
        settings.version,
        settings.environment,
        settings.port,
    )
    hardware = host_service.detect()
    machine = hardware["machine"]
    wifi = hardware["wifi"]
    logger.info(
        "Máquina detectada: %s (hostname=%s, container=%s)",
        machine["summary"],
        machine["hostname"],
        "sim" if machine["container"] else "não",
    )
    logger.info("Hardware Wi-Fi: %s", wifi["summary"])
    detected_wifi = [interface["name"] for interface in wifi["interfaces"]]
    if detected_wifi and settings.default_interface not in detected_wifi:
        logger.warning(
            "DEFAULT_INTERFACE=%s não corresponde a nenhuma interface Wi-Fi "
            "detectada (%s). Ajuste o .env se este host usar outro nome.",
            settings.default_interface,
            ", ".join(detected_wifi),
        )
    if not wifi["present"]:
        logger.warning(
            "Nenhuma placa Wi-Fi detectada nesta máquina. As rotas de hotspot "
            "vão falhar até um adaptador Wi-Fi (com driver) aparecer no host. "
            "Detalhes em GET %s/system/diagnostics.",
            settings.api_v1_prefix,
        )
    init_db()
    logger.info("SQLite ready at %s", settings.db_path)
    if not get_health_service().nmcli_available():
        logger.warning(
            "'nmcli' was not found on this host. Hotspot endpoints will return 503."
        )
    if settings.allow_insecure_production:
        logger.warning(
            "ALLOW_INSECURE_PRODUCTION=true: production safeguards are disabled "
            "(API_KEY/CORS are not enforced)."
        )
    elif not settings.api_key:
        logger.warning(
            "API_KEY is not set: port %s accepts unauthenticated requests "
            "(development only; prohibited in production).",
            settings.port,
        )
    event_service.record(
        "service_started",
        f"{settings.app_name} v{settings.version} iniciado",
        severity="info",
        metadata={
            "environment": settings.environment,
            "machine": machine["summary"],
            "wifi_present": wifi["present"],
            "wifi": wifi["summary"],
        },
    )
    sampler.start()
    try:
        yield
    finally:
        sampler.stop()
        logger.info("%s shutting down", settings.app_name)


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""

    configure_logging()

    application = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=DESCRIPTION,
        openapi_tags=TAGS_METADATA,
        docs_url=settings.docs_url,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url=settings.openapi_url,
        lifespan=lifespan,
    )

    application.add_middleware(RequestContextMiddleware)

    if settings.cors_origins:
        allow_any_origin = "*" in settings.cors_origins
        application.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=not allow_any_origin,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-ID", "X-Process-Time-Ms"],
        )

    register_exception_handlers(application)

    application.include_router(root_router)
    application.include_router(api_router, prefix=settings.api_v1_prefix)

    return application


app = create_app()


def _reload_target() -> str:
    """Import string used by uvicorn when reload is enabled."""

    return f"{__package__}.main:app" if __package__ else "main:app"


if __name__ == "__main__":
    if settings.reload:
        uvicorn.run(
            _reload_target(),
            host=settings.host,
            port=settings.port,
            reload=True,
            log_level=settings.log_level.lower(),
        )
    else:
        uvicorn.run(
            app,
            host=settings.host,
            port=settings.port,
            log_level=settings.log_level.lower(),
        )
