"""Network inspection and NetworkManager profile orchestration."""

from __future__ import annotations

import funs

from services.nmcli_execution import Result, execute


class NetworkService:
    """Read and manage the host network through ``nmcli``."""

    def list_interfaces(self) -> Result:
        """List the network interfaces known to NetworkManager."""

        return execute("interfaces.list", funs.list_interfaces)

    def interface_details(self, interface: str) -> Result:
        """Return details for a single network interface."""

        return execute("interfaces.get", funs.get_interface_details, interface=interface)

    def scan_wifi(self, *, interface: str | None, rescan: bool) -> Result:
        """Scan and list the visible Wi-Fi networks."""

        return execute(
            "wifi.scan",
            funs.scan_wifi_networks,
            interface=interface,
            rescan=rescan,
        )

    def analyze_wifi_channels(
        self, *, interface: str | None, band: str | None
    ) -> Result:
        """Recommend the least congested Wi-Fi channel."""

        return execute(
            "wifi.channels",
            funs.analyze_wifi_channels,
            interface=interface,
            band=band,
        )

    def list_profiles(self, *, profile_type: str | None) -> Result:
        """List the saved NetworkManager connection profiles."""

        return execute(
            "profiles.list",
            funs.list_profiles,
            profile_type=profile_type,
        )

    def profile_details(self, profile_name: str) -> Result:
        """Return the settings of a saved connection profile."""

        return execute(
            "profiles.get",
            funs.get_profile_details,
            profile_name=profile_name,
        )

    def delete_profile(self, *, profile_name: str, use_sudo: bool) -> Result:
        """Delete a saved connection profile."""

        return execute(
            "profiles.delete",
            funs.delete_profile,
            profile_name=profile_name,
            use_sudo=use_sudo,
        )
