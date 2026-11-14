"""Persisted event log endpoints."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from api.deps import require_api_key
from api.v1.responses import AUTH_RESPONSE
from core.database import now_ms
from services import event_service

router = APIRouter(
    prefix="/events",
    tags=["Events"],
    dependencies=[Depends(require_api_key)],
)


@router.get(
    "",
    summary="List persisted events",
    responses={401: AUTH_RESPONSE},
)
def list_events(
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    event_type: Annotated[str | None, Query(max_length=64)] = None,
    severity: Annotated[str | None, Query(max_length=16)] = None,
    mac: Annotated[str | None, Query(max_length=17)] = None,
    since_hours: Annotated[int | None, Query(ge=1, le=24 * 365)] = None,
) -> dict[str, Any]:
    since_ms = now_ms() - since_hours * 3600 * 1000 if since_hours else None
    return event_service.list_events(
        limit=limit,
        offset=offset,
        event_type=event_type,
        severity=severity,
        mac=mac,
        since_ms=since_ms,
    )


@router.get(
    "/counts",
    summary="Event counts grouped by type",
    responses={401: AUTH_RESPONSE},
)
def event_counts(
    since_hours: Annotated[int, Query(ge=1, le=24 * 365)] = 24,
) -> dict[str, Any]:
    since_ms = now_ms() - since_hours * 3600 * 1000
    return {
        "since_hours": since_hours,
        "counts": event_service.counts_by_type(since_ms),
    }
