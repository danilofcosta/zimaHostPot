"""Device discovery, history and management endpoints."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query

from api.deps import require_api_key
from api.v1.responses import (
    AUTH_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
    VALIDATION_RESPONSE,
)
from models.device import BanRequest, DeviceUpdateRequest, InternetBlockRequest
from services import device_service

router = APIRouter(
    prefix="/devices",
    tags=["Devices"],
    dependencies=[Depends(require_api_key)],
)

MacPath = Annotated[
    str,
    Path(
        pattern=r"^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$",
        description="Device MAC address, e.g. 'aa:bb:cc:dd:ee:ff'.",
    ),
]


@router.get(
    "/capabilities",
    summary="Which device operations this host supports",
    description=(
        "Reports the availability of iw, ip, nmcli, nftables, the wireless "
        "interfaces and whether Wi-Fi disconnect / internet blocking can be "
        "enforced. The UI uses this to disable unsupported actions."
    ),
    responses={401: AUTH_RESPONSE},
)
def device_capabilities() -> dict[str, Any]:
    return device_service.capabilities()


@router.get(
    "/summary",
    summary="Device counters used by the dashboard",
    responses={401: AUTH_RESPONSE},
)
def device_summary() -> dict[str, Any]:
    return device_service.summary()


@router.get(
    "/connected",
    summary="Devices currently observed on the hotspot",
    description=(
        "Merges iw station dump, ip neigh and DHCP leases. Each entry reports "
        "its sources and state: associated (Wi-Fi), active (ARP), dhcp_only or "
        "inactive. Nothing is fabricated when a source is unavailable."
    ),
    responses={401: AUTH_RESPONSE, 500: INTERNAL_ERROR_RESPONSE},
)
def connected_devices(
    interface: Annotated[
        str | None,
        Query(
            pattern=r"^[A-Za-z0-9_.:-]{1,15}$",
            description="Restrict to one interface; omit for all wireless interfaces.",
        ),
    ] = None,
) -> dict[str, Any]:
    return device_service.list_connected(interface)


@router.get(
    "/known",
    summary="Persisted device history",
    responses={401: AUTH_RESPONSE},
)
def known_devices(
    search: Annotated[str | None, Query(max_length=120)] = None,
    device_type: Annotated[str | None, Query(max_length=20)] = None,
    only_blocked: bool = False,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    return device_service.list_known(
        search=search,
        device_type=device_type,
        only_blocked=only_blocked,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{mac}",
    summary="Device details, addresses, connections and events",
    responses={401: AUTH_RESPONSE, 404: NOT_FOUND_RESPONSE},
)
def device_details(mac: MacPath) -> dict[str, Any]:
    return device_service.get_device(mac)


@router.patch(
    "/{mac}",
    summary="Rename, classify or mark a device as known",
    responses={
        401: AUTH_RESPONSE,
        404: NOT_FOUND_RESPONSE,
        422: VALIDATION_RESPONSE,
    },
)
def update_device(mac: MacPath, payload: DeviceUpdateRequest) -> dict[str, Any]:
    return device_service.update_device(
        mac,
        nickname=payload.nickname,
        device_type=payload.device_type,
        notes=payload.notes,
        is_known=payload.is_known,
    )


@router.post(
    "/{mac}/internet-block",
    summary="Block or unblock internet access for a device",
    description=(
        "Adds/removes the MAC in the dedicated nftables table inet "
        "<FIREWALL_TABLE> (forward hook). This blocks routed internet traffic "
        "only; it does not disconnect the device from Wi-Fi."
    ),
    responses={401: AUTH_RESPONSE, 404: NOT_FOUND_RESPONSE, 503: INTERNAL_ERROR_RESPONSE},
)
def block_internet(mac: MacPath, payload: InternetBlockRequest) -> dict[str, Any]:
    return device_service.set_internet_blocked(mac, payload.blocked)


@router.post(
    "/{mac}/disconnect",
    summary="Kick a Wi-Fi station (when the driver supports it)",
    description=(
        "Runs `iw dev <iface> station del <mac>`. The device may reconnect "
        "automatically; use ban to keep it blocked."
    ),
    responses={401: AUTH_RESPONSE, 404: NOT_FOUND_RESPONSE, 502: INTERNAL_ERROR_RESPONSE},
)
def disconnect(mac: MacPath) -> dict[str, Any]:
    return device_service.disconnect_device(mac)


@router.post(
    "/{mac}/ban",
    summary="Ban a device (internet block + Wi-Fi disconnect)",
    description=(
        "Adds the MAC to the nftables blocklist and tries to kick it from the "
        "SoftAP. Unbanning removes the firewall rule and clears both flags."
    ),
    responses={401: AUTH_RESPONSE, 404: NOT_FOUND_RESPONSE, 503: INTERNAL_ERROR_RESPONSE},
)
def ban(mac: MacPath, payload: BanRequest) -> dict[str, Any]:
    return device_service.set_banned(mac, payload.banned)
