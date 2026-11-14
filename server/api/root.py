"""Root endpoints: service discovery and health checks."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from api.deps import HealthServiceDep
from core.config import settings
from models.common import HealthResponse, ServiceInfoResponse

router = APIRouter(tags=["Service"])


@router.get(
    "/",
    response_model=ServiceInfoResponse,
    summary="Service information",
    description="Returns basic metadata and links for this API.",
)
def service_info() -> ServiceInfoResponse:
    return ServiceInfoResponse(
        name=settings.app_name,
        version=settings.version,
        environment=settings.environment,
        docs=settings.docs_url,
        openapi=settings.openapi_url,
        api_prefix=settings.api_v1_prefix,
        health="/health",
    )


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description=(
        "Reports whether the service is up and whether the 'nmcli' backend is "
        "available. The service is marked as 'degraded' when nmcli is missing."
    ),
)
def health(service: HealthServiceDep) -> HealthResponse:
    available = service.nmcli_available()
    return HealthResponse(
        status="ok" if available else "degraded",
        service=settings.app_name,
        version=settings.version,
        environment=settings.environment,
        nmcli_available=available,
        nmcli_version=service.nmcli_version(),
        timestamp=datetime.now(),
    )
