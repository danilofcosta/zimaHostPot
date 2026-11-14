"""Network inspection and NetworkManager profile endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status as http_status

from api.deps import NetworkServiceDep, require_api_key
from api.v1.responses import (
    AUTH_RESPONSE,
    BACKEND_UNAVAILABLE_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
    OPERATION_FAILED_RESPONSE,
    VALIDATION_RESPONSE,
)
from models.hotspot import IFNAME_PATTERN
from models.network import (
    InterfaceDetailsResponse,
    InterfaceListResponse,
    ProfileDeleteResponse,
    ProfileDetailsResponse,
    ProfileListResponse,
    WifiChannelAnalysisResponse,
    WifiScanResponse,
)

router = APIRouter(
    prefix="/network",
    tags=["Network"],
    dependencies=[Depends(require_api_key)],
)


@router.get(
    "/interfaces",
    response_model=InterfaceListResponse,
    summary="List network interfaces",
    description=(
        "Lists every network interface known to NetworkManager, including its "
        "type, state and the connection profile currently in use."
    ),
    responses={
        401: AUTH_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def list_interfaces(service: NetworkServiceDep) -> InterfaceListResponse:
    """List the interfaces known to NetworkManager."""

    return InterfaceListResponse.model_validate(service.list_interfaces())


@router.get(
    "/interfaces/{interface}",
    response_model=InterfaceDetailsResponse,
    summary="Inspect a network interface",
    description=(
        "Returns device details and IPv4 information (addresses, gateway and "
        "DNS) for a single interface."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def interface_details(
    interface: Annotated[
        str,
        Path(
            pattern=IFNAME_PATTERN,
            description="Network interface name, e.g. 'wlan0'.",
        ),
    ],
    service: NetworkServiceDep,
) -> InterfaceDetailsResponse:
    """Return details for one interface."""

    return InterfaceDetailsResponse.model_validate(
        service.interface_details(interface)
    )


@router.get(
    "/wifi/networks",
    response_model=WifiScanResponse,
    summary="Scan Wi-Fi networks",
    description=(
        "Scans the visible Wi-Fi networks and returns SSID, BSSID, channel, "
        "signal, rate and security, sorted by signal strength. Set "
        "'rescan=false' to use NetworkManager's cached list instead of "
        "triggering a new scan."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def scan_wifi_networks(
    service: NetworkServiceDep,
    interface: Annotated[
        str | None,
        Query(
            pattern=IFNAME_PATTERN,
            description="Wireless interface to scan. Omit to use NetworkManager's default.",
        ),
    ] = None,
    rescan: Annotated[
        bool,
        Query(description="Trigger a new scan instead of using the cached list."),
    ] = True,
) -> WifiScanResponse:
    """Scan and list the visible Wi-Fi networks."""

    return WifiScanResponse.model_validate(
        service.scan_wifi(interface=interface, rescan=rescan)
    )


@router.get(
    "/wifi/channels",
    response_model=WifiChannelAnalysisResponse,
    summary="Analyze Wi-Fi channel congestion",
    description=(
        "Scans the visible Wi-Fi networks and ranks the non-overlapping "
        "channels of each band (1/6/11 for 2.4 GHz and the usual 5 GHz "
        "channels) by congestion, recommending the least busy one. Networks "
        "are weighted by signal strength and by how much they overlap the "
        "candidate channel. While the hotspot is running the radio is locked "
        "to its channel, so the response may be based on cached scan results "
        "('scan_mode=cached')."
    ),
    responses={
        401: AUTH_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def analyze_wifi_channels(
    service: NetworkServiceDep,
    interface: Annotated[
        str | None,
        Query(
            pattern=IFNAME_PATTERN,
            description="Wireless interface to scan. Omit to use NetworkManager's default.",
        ),
    ] = None,
    band: Annotated[
        str | None,
        Query(
            pattern="^(bg|a)$",
            description="Only analyze this band: 'bg' (2.4 GHz) or 'a' (5 GHz).",
        ),
    ] = None,
) -> WifiChannelAnalysisResponse:
    """Recommend the least congested channel."""

    return WifiChannelAnalysisResponse.model_validate(
        service.analyze_wifi_channels(interface=interface, band=band)
    )


@router.get(
    "/profiles",
    response_model=ProfileListResponse,
    summary="List connection profiles",
    description=(
        "Lists the connection profiles saved in NetworkManager. Use the "
        "'type' query parameter to filter, e.g. '802-11-wireless'."
    ),
    responses={
        401: AUTH_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def list_profiles(
    service: NetworkServiceDep,
    profile_type: Annotated[
        str | None,
        Query(
            alias="type",
            min_length=1,
            max_length=64,
            description="Only return profiles of this NetworkManager type.",
            examples=["802-11-wireless"],
        ),
    ] = None,
) -> ProfileListResponse:
    """List the saved connection profiles."""

    return ProfileListResponse.model_validate(
        service.list_profiles(profile_type=profile_type)
    )


@router.get(
    "/profiles/{profile_name}",
    response_model=ProfileDetailsResponse,
    summary="Inspect a connection profile",
    description=(
        "Returns the full settings of a saved profile, including Wi-Fi and "
        "IPv4 options. NetworkManager masks secrets such as the Wi-Fi password."
    ),
    responses={
        401: AUTH_RESPONSE,
        404: NOT_FOUND_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def profile_details(
    profile_name: Annotated[
        str,
        Path(
            min_length=1,
            max_length=64,
            description="NetworkManager connection profile name.",
        ),
    ],
    service: NetworkServiceDep,
) -> ProfileDetailsResponse:
    """Return the settings of one profile."""

    return ProfileDetailsResponse.model_validate(
        service.profile_details(profile_name)
    )


@router.delete(
    "/profiles/{profile_name}",
    response_model=ProfileDeleteResponse,
    status_code=http_status.HTTP_200_OK,
    summary="Delete a connection profile",
    description=(
        "Deletes a saved NetworkManager connection profile. If the profile is "
        "currently active, stop it first (POST /hotspot/stop)."
    ),
    responses={
        401: AUTH_RESPONSE,
        404: NOT_FOUND_RESPONSE,
        422: VALIDATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE,
        502: OPERATION_FAILED_RESPONSE,
        503: BACKEND_UNAVAILABLE_RESPONSE,
    },
)
def delete_profile(
    profile_name: Annotated[
        str,
        Path(
            min_length=1,
            max_length=64,
            description="NetworkManager connection profile name.",
        ),
    ],
    service: NetworkServiceDep,
    use_sudo: Annotated[
        bool,
        Query(description="Run the nmcli command through sudo."),
    ] = True,
) -> ProfileDeleteResponse:
    """Delete a saved profile."""

    return ProfileDeleteResponse.model_validate(
        service.delete_profile(profile_name=profile_name, use_sudo=use_sudo)
    )
