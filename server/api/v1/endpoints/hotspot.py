"""Hotspot lifecycle endpoints."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status as http_status
from api.deps import HotspotConfigServiceDep, HotspotServiceDep, require_api_key
from api.v1.responses import (
    AUTH_RESPONSE,
    BACKEND_UNAVAILABLE_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    OPERATION_FAILED_RESPONSE,
    VALIDATION_RESPONSE,
)
from core.config import settings
from core.exceptions import AppError, HotspotConfigurationError
from models.hotspot import (
    HotspotClientsResponse,
    HotspotCreateRequest,
    HotspotCreateResponse,
    HotspotRestartRequest,
    HotspotRestartResponse,
    HotspotStartRequest,
    HotspotStartResponse,
    HotspotStatusResponse,
    HotspotStopRequest,
    HotspotStopResponse,
    HotspotTeardownResponse,
    IFNAME_PATTERN,
)
from models.hotspot_config import HotspotConfigRequest, HotspotConfigResponse
from services.hotspot_config_service import HotspotConfigService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/hotspot",
    tags=["Hotspot"],
    dependencies=[Depends(require_api_key)],
)


def _remember_config(
    service: HotspotConfigService,
    values: dict[str, object],
) -> None:
    """Persist the settings after a successful operation.

    Saving is best effort: a read-only volume must not turn a working hotspot
    into an HTTP error, so failures are only logged.
    """

    try:
        service.save(values)
    except (AppError, ValueError) as exc:
        logger.warning("Could not persist the hotspot configuration: %s", exc)


@router.get(
    "/config",
    response_model=HotspotConfigResponse,
    summary="Get the saved hotspot configuration",
    description=(
        "Returns the SSID, password, interface, band, channel and profile name "
        "saved by the last successful create/start, so the UI can prefill the "
        "form. When nothing has been saved yet, the built-in defaults are "
        "returned with 'is_default=true' and an empty password."
    ),
    responses={
        401: AUTH_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
    },
)
def get_hotspot_config(
    service: HotspotConfigServiceDep,
    include_password: Annotated[
        bool,
        Query(
            description=(
                "Return the stored Wi-Fi password. Off by default so a plain "
                "GET never exposes it. The BFF only requests it for the Share page."
            )
        ),
    ] = False,
) -> HotspotConfigResponse:
    """Return the persisted hotspot configuration."""

    config = service.load()
    stored_password = str(config.get("password") or "")
    if not include_password:
        config["password"] = ""
    response = HotspotConfigResponse.model_validate(config)
    response.password_set = bool(stored_password)
    return response


@router.put(
    "/config",
    response_model=HotspotConfigResponse,
    summary="Save the hotspot configuration",
    description=(
        "Validates and stores the hotspot settings in a JSON file on the "
        "server. The values are restored by 'GET /hotspot/config' and used by "
        "the UI on the next visit."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
    },
)
def save_hotspot_config(
    payload: HotspotConfigRequest,
    service: HotspotConfigServiceDep,
) -> HotspotConfigResponse:
    """Persist the hotspot settings."""

    return HotspotConfigResponse.model_validate(service.save(payload))


@router.delete(
    "/config",
    response_model=HotspotConfigResponse,
    summary="Reset the hotspot configuration",
    description=(
        "Removes the saved JSON file and returns the built-in defaults. The "
        "NetworkManager profile is not touched."
    ),
    responses={
        401: AUTH_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
    },
)
def reset_hotspot_config(service: HotspotConfigServiceDep) -> HotspotConfigResponse:
    """Delete the saved configuration and return the defaults."""

    return HotspotConfigResponse.model_validate(service.reset())


@router.post(
    "",
    response_model=HotspotCreateResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create a hotspot",
    description=(
        "Creates a new NetworkManager hotspot profile and activates it. "
        "The operation fails when an SSID/password is invalid or when nmcli fails."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def create_hotspot(
    payload: HotspotCreateRequest,
    service: HotspotServiceDep,
    config_service: HotspotConfigServiceDep,
) -> HotspotCreateResponse:
    """Create and activate a brand new Wi-Fi hotspot."""

    result = service.create(payload)
    _remember_config(
        config_service,
        {
            "name": payload.name,
            "password": payload.password,
            "interface": payload.interface,
            "profile_name": payload.profile_name,
            "band": payload.band.value,
            "channel": payload.channel,
            "use_sudo": payload.use_sudo,
        },
    )
    return HotspotCreateResponse.model_validate(result)


@router.post(
    "/start",
    response_model=HotspotStartResponse,
    summary="Start a hotspot",
    description=(
        "Activates the saved 'Hotspot' profile when it exists, otherwise creates "
        "a new profile with the supplied SSID and password."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def start_hotspot(
    payload: HotspotStartRequest,
    service: HotspotServiceDep,
    config_service: HotspotConfigServiceDep,
) -> HotspotStartResponse:
    """Start the hotspot from an existing profile or create one."""

    current = config_service.load()

    # Never fall back to hardcoded SSID/password: use the saved configuration
    # and fail with 422 when the caller did not provide one and none exists.
    name = payload.name or current.get("name")
    password = payload.password or current.get("password")
    if not name or not password:
        raise HotspotConfigurationError(
            "SSID and password are required: nothing has been saved yet."
        )

    resolved = payload.model_copy(update={"name": name, "password": password})
    result = service.start(resolved)

    # ``start`` does not carry band/channel, so keep whatever was saved before.
    _remember_config(
        config_service,
        {
            "name": name,
            "password": password,
            "interface": payload.interface,
            "profile_name": payload.profile_name,
            "band": current.get("band", "bg"),
            "channel": current.get("channel"),
            "use_sudo": payload.use_sudo,
        },
    )
    return HotspotStartResponse.model_validate(result)


@router.post(
    "/stop",
    response_model=HotspotStopResponse,
    summary="Stop a hotspot",
    description=(
        "Deactivates the hotspot but keeps the NetworkManager profile saved, so "
        "it can be started again later with 'POST /hotspot/start'."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def stop_hotspot(
    payload: HotspotStopRequest,
    service: HotspotServiceDep,
) -> HotspotStopResponse:
    """Deactivate the hotspot while keeping its profile."""

    return HotspotStopResponse.model_validate(service.stop(payload))


@router.delete(
    "",
    response_model=HotspotTeardownResponse,
    summary="Tear down a hotspot",
    description=(
        "Stops the hotspot and, when 'delete_profile=true', removes the saved "
        "NetworkManager profile as well. Use this to fully undo a creation."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def teardown_hotspot(
    service: HotspotServiceDep,
    interface: Annotated[
        str,
        Query(
            pattern=IFNAME_PATTERN,
            description="Wireless interface that is broadcasting the hotspot.",
        ),
    ] = settings.default_interface,
    profile_name: Annotated[
        str,
        Query(
            min_length=1,
            max_length=64,
            description="NetworkManager connection profile name.",
        ),
    ] = settings.default_profile_name,
    delete_profile: Annotated[
        bool,
        Query(description="Delete the saved NetworkManager profile after stopping."),
    ] = False,
    use_sudo: Annotated[
        bool,
        Query(description="Run the nmcli commands through sudo."),
    ] = True,
) -> HotspotTeardownResponse:
    """Stop the hotspot and optionally delete its profile."""

    result = service.teardown(
        interface=interface,
        profile_name=profile_name,
        delete_profile=delete_profile,
        use_sudo=use_sudo,
    )
    return HotspotTeardownResponse.model_validate(result)


@router.get(
    "/status",
    response_model=HotspotStatusResponse,
    summary="Get hotspot status",
    description="Reports whether the hotspot is active, its IP address and profile.",
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def hotspot_status(
    service: HotspotServiceDep,
    interface: Annotated[
        str,
        Query(
            pattern=IFNAME_PATTERN,
            description="Wireless interface to inspect.",
        ),
    ] = settings.default_interface,
    profile_name: Annotated[
        str,
        Query(
            min_length=1,
            max_length=64,
            description="NetworkManager connection profile name.",
        ),
    ] = settings.default_profile_name,
) -> HotspotStatusResponse:
    """Return the current hotspot status."""

    result = service.status(interface=interface, profile_name=profile_name)
    return HotspotStatusResponse.model_validate(result)


@router.post(
    "/restart",
    response_model=HotspotRestartResponse,
    summary="Restart a hotspot",
    description=(
        "Deactivates and reactivates the saved hotspot profile on the given "
        "interface, without recreating or changing its settings."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def restart_hotspot(
    payload: HotspotRestartRequest,
    service: HotspotServiceDep,
) -> HotspotRestartResponse:
    """Restart the hotspot profile."""

    return HotspotRestartResponse.model_validate(service.restart(payload))


@router.get(
    "/clients",
    response_model=HotspotClientsResponse,
    summary="List hotspot clients",
    description=(
        "Lists the clients known in the interface's neighbor (ARP) table, "
        "enriched with the hostname reported to the DHCP server (when a "
        "dnsmasq lease file is readable) and with the first/last time this "
        "server saw each MAC address. Entries in states such as 'FAILED' or "
        "'INCOMPLETE' are filtered out; idle 'STALE' entries are kept but "
        "reported with 'is_active=false'."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def hotspot_clients(
    service: HotspotServiceDep,
    interface: Annotated[
        str,
        Query(
            pattern=IFNAME_PATTERN,
            description="Wireless interface whose clients should be listed.",
        ),
    ] = settings.default_interface,
) -> HotspotClientsResponse:
    """List the clients seen on the hotspot interface."""

    return HotspotClientsResponse.model_validate(service.clients(interface=interface))
