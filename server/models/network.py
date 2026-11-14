"""Request and response schemas for the network endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class _APIResponse(BaseModel):
    """Base for responses: extra backend fields are safely ignored."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=False)


class InterfaceInfo(_APIResponse):
    """Summary of a network interface."""

    name: str = Field(description="Interface name, e.g. 'wlan0'.", examples=["wlan0"])
    type: str = Field(description="Interface type, e.g. 'wifi' or 'ethernet'.")
    state: str = Field(description="NetworkManager state, e.g. 'connected'.")
    connection: str | None = Field(
        default=None,
        description="Active connection profile name, when connected.",
    )


class InterfaceListResponse(_APIResponse):
    """All interfaces known to NetworkManager."""

    count: int
    interfaces: list[InterfaceInfo]


class InterfaceDetailsResponse(_APIResponse):
    """Detailed IPv4/device information for one interface."""

    name: str
    type: str
    state: str
    connection: str | None = None
    mac_address: str | None = None
    mtu: int | None = None
    ipv4_addresses: list[str] = Field(
        default_factory=list,
        description="IPv4 addresses in CIDR notation.",
    )
    ipv4_gateway: str | None = None
    ipv4_dns: list[str] = Field(default_factory=list)


class WifiNetwork(_APIResponse):
    """A Wi-Fi network found by a scan."""

    in_use: bool = Field(description="Whether the interface is using this network.")
    ssid: str = Field(description="Network name; empty for hidden networks.")
    bssid: str = Field(description="Access point MAC address.")
    mode: str = Field(description="Wi-Fi mode, e.g. 'Infra'.")
    channel: int | None = Field(default=None, description="Wi-Fi channel.")
    rate: str = Field(description="Advertised bit rate, e.g. '130 Mbit/s'.")
    signal: int | None = Field(
        default=None,
        description="Signal strength from 0 to 100.",
    )
    security: str = Field(
        description="Security mode, e.g. 'WPA2' or 'open'.",
    )


class WifiScanResponse(_APIResponse):
    """Result of a Wi-Fi scan."""

    interface: str | None = Field(
        default=None,
        description="Interface used for the scan; null means the default one.",
    )
    rescan: bool = Field(description="Whether a new scan was requested.")
    count: int
    networks: list[WifiNetwork] = Field(
        description="Networks sorted by signal strength (strongest first)."
    )
    scanned_at: datetime


class WifiChannelUsage(_APIResponse):
    """Congestion score of one candidate channel."""

    channel: int = Field(description="Channel number.", examples=[6])
    band: str = Field(description="'bg' for 2.4 GHz or 'a' for 5 GHz.")
    networks: int = Field(
        description="Networks detected exactly on this channel."
    )
    strongest_signal: int | None = Field(
        default=None,
        description="Strongest signal (0-100) among those networks, if any.",
    )
    interference: float = Field(
        description=(
            "0-100+ congestion score. Overlapping networks are weighted by "
            "signal strength and distance; lower is better."
        ),
    )
    recommended: bool = Field(
        default=False,
        description="True for the best channel of its band.",
    )


class WifiChannelRecommendation(_APIResponse):
    """Best channel found for one band."""

    band: str
    channel: int | None = None
    networks: int
    strongest_signal: int | None = None
    interference: float | None = None
    reason: str = Field(description="Human readable justification.")


class WifiChannelAnalysisResponse(_APIResponse):
    """Channel occupancy and recommendations for the visible networks."""

    interface: str | None = None
    scan_mode: str = Field(
        description="'fresh' when a new scan ran, 'cached' when it fell back to "
        "NetworkManager's cached results (common while the hotspot is active).",
    )
    scanned_at: datetime
    networks: int = Field(description="Number of networks considered.")
    channels: list[WifiChannelUsage]
    recommendations: list[WifiChannelRecommendation]


class ProfileInfo(_APIResponse):
    """Summary of a saved NetworkManager connection profile."""

    name: str
    uuid: str
    type: str = Field(description="Connection type, e.g. '802-11-wireless'.")
    device: str | None = Field(
        default=None,
        description="Interface currently using the profile, when active.",
    )


class ProfileListResponse(_APIResponse):
    """Saved NetworkManager connection profiles."""

    count: int
    profiles: list[ProfileInfo]


class ProfileDetailsResponse(_APIResponse):
    """Settings of a saved connection profile."""

    name: str
    uuid: str | None = None
    type: str
    device: str | None = None
    autoconnect: bool | None = None
    ssid: str | None = None
    mode: str | None = None
    band: str | None = None
    channel: int | None = None
    security: str | None = None
    ipv4_method: str | None = None
    ipv4_addresses: list[str] = Field(default_factory=list)
    ipv4_gateway: str | None = None
    ipv4_dns: list[str] = Field(default_factory=list)
    settings: dict[str, str] = Field(
        description=(
            "Every setting reported by 'nmcli connection show'. Secrets such as "
            "the Wi-Fi password are masked by NetworkManager (****)."
        )
    )


class ProfileDeleteResponse(_APIResponse):
    """Result of deleting a connection profile."""

    status: str
    message: str
    profile_name: str
    deleted: bool
    deleted_at: datetime
    raw_output: str = ""
