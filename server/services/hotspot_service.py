"""Typed orchestration layer around the nmcli helpers in ``funs.py``.

The original ``funs.py`` helpers are preserved; this module only adapts their
dictionaries and exceptions to the HTTP domain errors used by the API.
"""

from __future__ import annotations

from typing import Any, Callable

import funs

from core.exceptions import HotspotOperationError
from models.hotspot import (
    HotspotCreateRequest,
    HotspotRestartRequest,
    HotspotStartRequest,
    HotspotStopRequest,
)
from services.nmcli_execution import Result, execute


class HotspotService:
    """High-level hotspot operations backed by ``nmcli``."""

    def create(self, payload: HotspotCreateRequest) -> Result:
        """Create and activate a new hotspot."""

        return self._execute(
            "create",
            funs.create_hostapot,
            name=payload.name,
            password=payload.password,
            interface=payload.interface,
            band=payload.band.value,
            channel=payload.channel,
            use_sudo=payload.use_sudo,
            profile_name=payload.profile_name,
        )

    def start(self, payload: HotspotStartRequest) -> Result:
        """Activate an existing profile or create one when needed."""

        result = self._execute(
            "start",
            funs.start_hotspot,
            name=payload.name,
            password=payload.password,
            interface=payload.interface,
            profile_name=payload.profile_name,
            use_sudo=payload.use_sudo,
        )
        return self._require_success(result, "start")

    def stop(self, payload: HotspotStopRequest) -> Result:
        """Deactivate the hotspot while keeping its saved profile."""

        result = self._execute(
            "stop",
            funs.stop_hotspot,
            interface=payload.interface,
            profile_name=payload.profile_name,
            use_sudo=payload.use_sudo,
        )
        return self._require_success(result, "stop")

    def teardown(
        self,
        *,
        interface: str,
        profile_name: str,
        delete_profile: bool,
        use_sudo: bool,
    ) -> Result:
        """Stop the hotspot and, optionally, delete its saved profile."""

        return self._execute(
            "teardown",
            funs.stop_hostapd,
            interface=interface,
            profile_name=profile_name,
            delete_profile=delete_profile,
            use_sudo=use_sudo,
        )

    def status(self, *, interface: str, profile_name: str) -> Result:
        """Return the current hotspot status."""

        return self._execute(
            "status",
            funs.get_hotspot_status,
            interface=interface,
            profile_name=profile_name,
        )

    def restart(self, payload: HotspotRestartRequest) -> Result:
        """Restart an existing hotspot profile."""

        result = self._execute(
            "restart",
            funs.restart_hotspot,
            interface=payload.interface,
            profile_name=payload.profile_name,
            use_sudo=payload.use_sudo,
        )
        return self._require_success(result, "restart")

    def clients(self, *, interface: str) -> Result:
        """List the clients known by the interface's neighbor table."""

        return self._execute(
            "clients",
            funs.list_hotspot_clients,
            interface=interface,
        )

    def _execute(
        self,
        operation: str,
        function: Callable[..., Result],
        **kwargs: Any,
    ) -> Result:
        """Run a ``funs`` helper and translate its errors to domain errors."""

        return execute(f"hotspot.{operation}", function, **kwargs)

    @staticmethod
    def _require_success(result: Result, action: str) -> Result:
        if result.get("status") == "error":
            raise HotspotOperationError(
                str(result.get("message") or f"Failed to {action} the hotspot.")
            )
        return result
