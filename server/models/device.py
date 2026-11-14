"""Request schemas for device management endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DeviceType = Literal[
    "unknown", "phone", "tablet", "computer", "tv", "iot", "network", "printer", "other"
]


class _APIRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class DeviceUpdateRequest(_APIRequest):
    nickname: str | None = Field(default=None, max_length=64)
    device_type: DeviceType | None = None
    notes: str | None = Field(default=None, max_length=500)
    is_known: bool | None = None


class InternetBlockRequest(_APIRequest):
    blocked: bool


class BanRequest(_APIRequest):
    banned: bool
