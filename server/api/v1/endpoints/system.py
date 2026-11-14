"""System information and diagnostics endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from api.deps import require_api_key
from api.v1.responses import AUTH_RESPONSE
from services import system_service

router = APIRouter(
    prefix="/system",
    tags=["System"],
    dependencies=[Depends(require_api_key)],
)


@router.get(
    "",
    summary="Host, database and backend information",
    responses={401: AUTH_RESPONSE},
)
def system_info() -> dict[str, Any]:
    return system_service.info()


@router.get(
    "/diagnostics",
    summary="Actionable diagnostics with per-check status",
    description=(
        "Each check is ok, warn, error or unsupported. Values come from real "
        "commands and files; nothing is assumed to work."
    ),
    responses={401: AUTH_RESPONSE},
)
def system_diagnostics() -> dict[str, Any]:
    return system_service.diagnostics()
