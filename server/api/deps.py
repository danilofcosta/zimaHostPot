"""Shared FastAPI dependencies."""

from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header

from core.config import settings
from core.exceptions import AuthenticationError
from services.health_service import HealthService
from services.hotspot_config_service import HotspotConfigService
from services.hotspot_service import HotspotService
from services.network_service import NetworkService


def require_api_key(
    x_api_key: Annotated[
        str | None,
        Header(
            alias="X-API-Key",
            description="Required only when API_KEY is configured on the server.",
        ),
    ] = None,
) -> None:
    """Reject the request when an API key is configured and does not match."""

    if settings.api_key is None:
        return

    if not x_api_key or not secrets.compare_digest(x_api_key, settings.api_key):
        raise AuthenticationError(
            "Invalid or missing API key.",
            headers={"WWW-Authenticate": "ApiKey"},
        )


@lru_cache(maxsize=1)
def get_hotspot_service() -> HotspotService:
    return HotspotService()


@lru_cache(maxsize=1)
def get_hotspot_config_service() -> HotspotConfigService:
    return HotspotConfigService()


@lru_cache(maxsize=1)
def get_network_service() -> NetworkService:
    return NetworkService()


@lru_cache(maxsize=1)
def get_health_service() -> HealthService:
    return HealthService()


HotspotServiceDep = Annotated[HotspotService, Depends(get_hotspot_service)]
HotspotConfigServiceDep = Annotated[
    HotspotConfigService, Depends(get_hotspot_config_service)
]
NetworkServiceDep = Annotated[NetworkService, Depends(get_network_service)]
HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
ApiKeyDep = Depends(require_api_key)
