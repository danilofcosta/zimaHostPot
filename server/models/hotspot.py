"""Request and response schemas for the hotspot endpoints."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Linux network interface names are limited to 15 characters by IFNAMSIZ.
IFNAME_PATTERN = r"^[A-Za-z0-9_.:-]{1,15}$"


class Band(str, Enum):
    """Wi-Fi band supported by ``nmcli device wifi hotspot``."""

    BG = "bg"  # 2.4 GHz - wider range
    A = "a"  # 5 GHz - higher throughput


class _APIRequest(BaseModel):
    """Base for request bodies: unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class _APIResponse(BaseModel):
    """Base for responses: extra backend fields are safely ignored."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=False)


def _validate_ssid(value: str) -> str:
    if not value.strip():
        raise ValueError("SSID must not be empty.")
    if len(value.encode("utf-8")) > 32:
        raise ValueError("SSID cannot exceed 32 bytes.")
    return value


class HotspotCreateRequest(_APIRequest):
    """Payload used to create and activate a brand new hotspot."""

    name: str = Field(
        min_length=1,
        max_length=32,
        description="Hotspot SSID (up to 32 bytes in UTF-8).",
        examples=["Zima-Hotspot"],
    )
    password: str = Field(
        min_length=8,
        max_length=63,
        description="WPA2 password (8 to 63 characters).",
        examples=["super-secret-123"],
    )
    interface: str = Field(
        default="wlan0",
        pattern=IFNAME_PATTERN,
        description="Wireless interface used to broadcast the hotspot.",
        examples=["wlan0"],
    )
    profile_name: str = Field(
        default="Hotspot",
        min_length=1,
        max_length=64,
        description="NetworkManager connection profile name.",
        examples=["Hotspot"],
    )
    band: Band = Field(
        default=Band.BG,
        description="'bg' for 2.4 GHz (longer range) or 'a' for 5 GHz (faster).",
    )
    channel: int | None = Field(
        default=None,
        ge=1,
        le=196,
        description="Optional Wi-Fi channel. Omit to let NetworkManager choose.",
        examples=[6],
    )
    use_sudo: bool = Field(
        default=True,
        description="Whether the nmcli commands should be run through sudo.",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _validate_ssid(value)

    @model_validator(mode="after")
    def validate_channel_for_band(self) -> "HotspotCreateRequest":
        if self.channel is None:
            return self
        if self.band is Band.BG and self.channel > 14:
            raise ValueError(
                "Channel must be between 1 and 14 for the 'bg' (2.4 GHz) band."
            )
        if self.band is Band.A and self.channel < 32:
            raise ValueError(
                "Channel must be between 32 and 196 for the 'a' (5 GHz) band."
            )
        return self


class HotspotStartRequest(_APIRequest):
    """Payload used to activate an existing profile or create one on the fly.

    ``name``/``password`` are optional: when omitted the last saved
    configuration is used, so the UI never has to keep the Wi-Fi password in
    the browser. Both are required only when nothing has been saved yet.
    """

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=32,
        description="Hotspot SSID. Falls back to the saved configuration.",
        examples=["Zima-Hotspot"],
    )
    password: str | None = Field(
        default=None,
        min_length=8,
        max_length=63,
        description="WPA2 password. Falls back to the saved configuration.",
        examples=["super-secret-123"],
    )
    interface: str = Field(
        default="wlan0",
        pattern=IFNAME_PATTERN,
        description="Wireless interface used to broadcast the hotspot.",
    )
    profile_name: str = Field(
        default="Hotspot",
        min_length=1,
        max_length=64,
        description="NetworkManager connection profile name.",
    )
    use_sudo: bool = Field(
        default=True,
        description="Whether the nmcli commands should be run through sudo.",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        return _validate_ssid(value) if value is not None else None


class HotspotStopRequest(_APIRequest):
    """Payload used to deactivate the hotspot while keeping its profile."""

    interface: str = Field(
        default="wlan0",
        pattern=IFNAME_PATTERN,
        description="Wireless interface that is broadcasting the hotspot.",
    )
    profile_name: str = Field(
        default="Hotspot",
        min_length=1,
        max_length=64,
        description="NetworkManager connection profile name.",
    )
    use_sudo: bool = Field(
        default=True,
        description="Whether the nmcli commands should be run through sudo.",
    )


class HotspotRestartRequest(_APIRequest):
    """Payload used to restart an existing hotspot profile."""

    interface: str = Field(
        default="wlan0",
        pattern=IFNAME_PATTERN,
        description="Wireless interface that is broadcasting the hotspot.",
    )
    profile_name: str = Field(
        default="Hotspot",
        min_length=1,
        max_length=64,
        description="NetworkManager connection profile name.",
    )
    use_sudo: bool = Field(
        default=True,
        description="Whether the nmcli commands should be run through sudo.",
    )


class HotspotNetwork(_APIResponse):
    """Details of the network that was created."""

    ssid: str
    password: str
    security: str = Field(description="Security mode, e.g. 'WPA-PSK'.")
    mode: str = Field(description="Wi-Fi mode, e.g. 'ap'.")
    band: str | None = None
    channel: str | int
    qr_code_string: str = Field(
        description="Wi-Fi QR Code payload for clients (WIFI:T:WPA;S:...;P:...;;)."
    )


class InterfaceSummary(_APIResponse):
    """Basic state of the wireless interface."""

    name: str
    state: str
    mac_address: str | None = None


class InterfaceDetails(InterfaceSummary):
    """Full IPv4 details of the interface after the hotspot is created.

    Fields are optional on purpose: when NetworkManager did not report a
    value the API returns ``null`` instead of inventing an address or a DHCP
    range.
    """

    ipv4_address: str | None = None
    ipv4_cidr: str | None = None
    gateway: str | None = None
    dhcp_range: str | None = None


class HotspotCreateResponse(_APIResponse):
    """Result of creating a hotspot."""

    status: str
    message: str
    return_code: int
    connection_uuid: str | None = None
    profile_name: str
    created_at: datetime
    network: HotspotNetwork
    interface_details: InterfaceDetails
    raw_output: str = ""


class HotspotStartResponse(_APIResponse):
    """Result of starting a hotspot."""

    status: str
    message: str
    ssid: str
    interface: str
    activated_at: datetime
    raw_output: str = ""


class HotspotStopResponse(_APIResponse):
    """Result of stopping a hotspot, keeping its saved profile."""

    status: str
    message: str
    stopped_at: datetime
    raw_output: str = ""


class HotspotTeardownResponse(_APIResponse):
    """Result of stopping a hotspot and optionally deleting its profile."""

    status: str
    message: str
    was_active: bool
    previous_uuid: str | None = None
    profile_name: str
    profile_deleted: bool
    stopped_at: datetime
    interface_details: InterfaceSummary
    raw_output: str = ""


class HotspotStatusResponse(_APIResponse):
    """Current hotspot state."""

    active: bool
    status_text: str
    interface: str
    connection_name: str | None = None
    connection_uuid: str | None = None
    device_state: str
    ip_address: str | None = None


class HotspotRestartResponse(_APIResponse):
    """Result of restarting a hotspot profile."""

    status: str
    message: str
    interface: str
    profile_name: str
    restarted_at: datetime
    raw_output: str = ""


class HotspotClient(_APIResponse):
    """A client seen in the interface's neighbor table."""

    ip_address: str = Field(description="IPv4 address of the client.")
    mac_address: str | None = Field(
        default=None,
        description="MAC address, when the neighbor entry has one.",
    )
    hostname: str | None = Field(
        default=None,
        description=(
            "Hostname reported by the client to the DHCP server, when a "
            "dnsmasq lease file is readable."
        ),
    )
    state: str = Field(
        description="Neighbor state, e.g. 'REACHABLE', 'STALE' or 'FAILED'."
    )
    is_active: bool = Field(
        default=False,
        description="True when the neighbor entry was confirmed recently.",
    )
    first_seen: datetime | None = Field(
        default=None,
        description="First time this server saw the MAC address (in-memory).",
    )
    last_seen: datetime | None = Field(
        default=None,
        description="Last time this server saw the MAC address (in-memory).",
    )
    lease_expires_at: datetime | None = Field(
        default=None,
        description="When the DHCP lease expires, when known.",
    )


class HotspotClientsResponse(_APIResponse):
    """Clients currently known on the hotspot interface."""

    interface: str
    count: int
    active_count: int = Field(
        default=0,
        description="Clients whose neighbor entry was confirmed recently.",
    )
    clients: list[HotspotClient]
    checked_at: datetime
