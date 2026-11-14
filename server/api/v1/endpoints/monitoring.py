"""Traffic monitoring endpoints (polling and SSE)."""

from __future__ import annotations

import asyncio
import json
from typing import Annotated, Any, AsyncIterator

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from api.deps import require_api_key
from api.v1.responses import AUTH_RESPONSE
from services import monitoring_service

router = APIRouter(
    prefix="/monitoring",
    tags=["Monitoring"],
    dependencies=[Depends(require_api_key)],
)

InterfaceQuery = Annotated[
    str | None,
    Query(
        pattern=r"^[A-Za-z0-9_.:-]{1,15}$",
        description="Wireless interface; defaults to DEFAULT_INTERFACE.",
    ),
]


@router.get(
    "/interfaces",
    summary="Interfaces available for monitoring",
    responses={401: AUTH_RESPONSE},
)
def monitoring_interfaces() -> dict[str, Any]:
    return {"interfaces": monitoring_service.interfaces()}


@router.get(
    "",
    summary="Current counters and rates for an interface",
    description=(
        "Reads /sys/class/net counters and derives rates from two real "
        "samples. When a counter goes backwards the response is marked with "
        "reset_detected=true and rates are null."
    ),
    responses={401: AUTH_RESPONSE},
)
def monitoring_snapshot(
    interface: InterfaceQuery = None,
    window: Annotated[int, Query(ge=10, le=3600)] = 60,
    points: Annotated[int, Query(ge=10, le=600)] = 60,
) -> dict[str, Any]:
    from core.config import settings

    interface_name = interface or settings.default_interface
    return monitoring_service.snapshot(
        interface_name, window_seconds=window, history_points=points
    )


@router.get(
    "/history",
    summary="Stored traffic samples",
    responses={401: AUTH_RESPONSE},
)
def monitoring_history(
    interface: InterfaceQuery = None,
    minutes: Annotated[int, Query(ge=1, le=1440)] = 60,
    limit: Annotated[int, Query(ge=10, le=5000)] = 720,
) -> dict[str, Any]:
    from core.config import settings

    interface_name = interface or settings.default_interface
    return monitoring_service.history(interface_name, minutes=minutes, limit=limit)


@router.get(
    "/stream",
    summary="Server-Sent Events stream of traffic samples",
    description=(
        "Emits one `sample` event per interval. The interval is configurable "
        "per request (2-60 seconds). Use polling on /monitoring when SSE is "
        "blocked by a proxy."
    ),
    responses={401: AUTH_RESPONSE},
)
async def monitoring_stream(
    request: Request,
    interface: InterfaceQuery = None,
    interval: Annotated[int, Query(ge=2, le=60)] = 10,
) -> StreamingResponse:
    from core.config import settings

    interface_name = interface or settings.default_interface

    async def events() -> AsyncIterator[str]:
        while not await request.is_disconnected():
            # ``snapshot`` reads /sys, SQLite and NetworkManager: run it in a
            # worker thread so one stream never blocks the event loop (and
            # therefore every other request).
            payload = await asyncio.to_thread(
                monitoring_service.snapshot,
                interface_name,
                window_seconds=max(interval * 2, 10),
                history_points=30,
            )
            yield f"event: sample\ndata: {json.dumps(payload, default=str)}\n\n"
            await asyncio.sleep(interval)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
