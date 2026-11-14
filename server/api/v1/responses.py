"""Shared OpenAPI response documentation for v1 endpoints."""

from __future__ import annotations

from models.common import ErrorResponse

AUTH_RESPONSE = {
    "model": ErrorResponse,
    "description": "Invalid or missing API key (only when API_KEY is configured).",
}
VALIDATION_RESPONSE = {
    "model": ErrorResponse,
    "description": "Request payload or query parameters are invalid.",
}
NOT_FOUND_RESPONSE = {
    "model": ErrorResponse,
    "description": "The requested NetworkManager profile does not exist.",
}
BACKEND_UNAVAILABLE_RESPONSE = {
    "model": ErrorResponse,
    "description": "The 'nmcli' backend is not available on this host.",
}
OPERATION_FAILED_RESPONSE = {
    "model": ErrorResponse,
    "description": "NetworkManager accepted the request but the operation failed.",
}
INTERNAL_ERROR_RESPONSE = {
    "model": ErrorResponse,
    "description": "Unexpected server error.",
}
