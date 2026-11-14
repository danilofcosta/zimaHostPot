"""Domain exceptions and the HTTP error envelope used by the API."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

_HTTP_CODES: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "too_many_requests",
    500: "internal_error",
    502: "bad_gateway",
    503: "service_unavailable",
}


class AppError(Exception):
    """Base class for errors that are safe to expose to API clients."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(
        self,
        message: str,
        *,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details
        self.headers = headers or {}


class HotspotConfigurationError(AppError):
    """The requested hotspot configuration is invalid."""

    status_code = 422
    code = "invalid_hotspot_configuration"


class HotspotOperationError(AppError):
    """The hotspot backend accepted the request but failed to execute it."""

    status_code = 502
    code = "hotspot_operation_failed"


class HotspotBackendUnavailableError(AppError):
    """The underlying ``nmcli`` backend cannot be used on this host."""

    status_code = 503
    code = "hotspot_backend_unavailable"


class ProfileNotFoundError(AppError):
    """The requested NetworkManager connection profile does not exist."""

    status_code = 404
    code = "profile_not_found"


class AuthenticationError(AppError):
    """The request is missing a valid API key."""

    status_code = 401
    code = "unauthorized"


class HotspotConfigStorageError(AppError):
    """The persisted hotspot configuration could not be read or written."""

    status_code = 500
    code = "hotspot_config_storage_failed"


class DeviceNotFoundError(AppError):
    """The requested device has never been seen."""

    status_code = 404
    code = "device_not_found"


class DeviceOperationError(AppError):
    """A device operation (disconnect, ban) is not supported or failed."""

    status_code = 502
    code = "device_operation_failed"


class FirewallUnavailableError(AppError):
    """nftables is not available, so blocking cannot be enforced."""

    status_code = 503
    code = "firewall_unavailable"


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def _payload(
    request: Request,
    *,
    code: str,
    message: str,
    details: Any = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": _request_id(request),
        }
    }


def _serialize_validation_errors(
    exc: RequestValidationError,
) -> list[dict[str, Any]]:
    """Make Pydantic validation errors JSON serializable."""

    errors: list[dict[str, Any]] = []
    for error in exc.errors():
        item = {key: value for key, value in error.items() if key != "ctx"}
        if "ctx" in error and error["ctx"]:
            item["ctx"] = {key: str(value) for key, value in error["ctx"].items()}
        errors.append(item)
    return errors


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    log = logger.error if exc.status_code >= 500 else logger.warning
    log("Application error [%s] on %s %s: %s", exc.code, request.method, request.url.path, exc.message)
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload(request, code=exc.code, message=exc.message, details=exc.details),
        headers=exc.headers or None,
    )


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    code = _HTTP_CODES.get(exc.status_code, "http_error")
    if isinstance(exc.detail, str):
        message, details = exc.detail, None
    else:
        message, details = "HTTP error.", exc.detail
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload(request, code=code, message=message, details=details),
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_payload(
            request,
            code="validation_error",
            message="Request validation failed.",
            details=_serialize_validation_errors(exc),
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled exception on %s %s", request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content=_payload(
            request,
            code="internal_error",
            message="An unexpected error occurred.",
        ),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach every exception handler to the application."""

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
