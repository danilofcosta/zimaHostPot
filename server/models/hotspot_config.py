"""Schemas for the hotspot configuration persisted on disk."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.hotspot import Band, HotspotCreateRequest


class HotspotConfigRequest(HotspotCreateRequest):
    """Payload used to persist the hotspot settings.

    It reuses the validation rules of :class:`HotspotCreateRequest` (SSID,
    password, interface, band and channel) and adds the NetworkManager profile
    name so the UI can restore the exact configuration used last time.
    """

    profile_name: str = Field(
        default="Hotspot",
        min_length=1,
        max_length=64,
        description="NetworkManager connection profile name.",
        examples=["Hotspot"],
    )


class HotspotConfigResponse(BaseModel):
    """Hotspot settings restored by the UI.

    ``password`` may be empty when no configuration has been saved yet, which
    is why this model does not enforce the 8-character minimum.
    """

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=False)

    name: str = Field(description="Hotspot SSID.")
    password: str = Field(
        description="WPA2 password, empty unless explicitly requested with include_password=true."
    )
    password_set: bool = Field(
        default=False,
        description="True when a password is stored on the server.",
    )
    interface: str = Field(description="Wireless interface used by the hotspot.")
    profile_name: str = Field(description="NetworkManager connection profile name.")
    band: Band = Field(description="'bg' for 2.4 GHz or 'a' for 5 GHz.")
    channel: int | None = Field(
        default=None,
        description="Wi-Fi channel, or null to let NetworkManager choose.",
    )
    use_sudo: bool = Field(description="Whether nmcli runs through sudo.")
    updated_at: datetime | None = Field(
        default=None,
        description="When the configuration was saved; null for the built-in defaults.",
    )
    is_default: bool = Field(
        default=False,
        description="True when no configuration has been saved yet.",
    )
