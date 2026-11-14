"""Common response models (errors, health and service metadata)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Machine-readable error description."""

    code: str = Field(description="Stable error code, e.g. 'validation_error'.")
    message: str = Field(description="Human-readable error message.")
    details: Any | None = Field(
        default=None,
        description="Optional structured details, such as field validation errors.",
    )
    request_id: str | None = Field(
        default=None,
        description="Identifier of the request, useful when contacting support.",
    )


class ErrorResponse(BaseModel):
    """Error envelope returned by every failing request."""

    error: ErrorDetail


class HealthResponse(BaseModel):
    """Liveness/readiness information."""

    status: Literal["ok", "degraded"]
    service: str
    version: str
    environment: str
    nmcli_available: bool = Field(
        description="Whether the 'nmcli' binary is available on this host."
    )
    nmcli_version: str | None = Field(
        default=None,
        description="Version reported by 'nmcli --version', when available.",
    )
    timestamp: datetime


class ServiceInfoResponse(BaseModel):
    """Service discovery payload returned by the root endpoint."""

    name: str
    version: str
    environment: str
    docs: str | None = Field(default=None, description="Swagger UI URL.")
    openapi: str | None = Field(default=None, description="OpenAPI schema URL.")
    api_prefix: str
    health: str
