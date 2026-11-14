"""Host health checks used by the ``/health`` endpoint."""

from __future__ import annotations

import logging
import shutil
import subprocess

logger = logging.getLogger(__name__)


class HealthService:
    """Inspect the availability of the hotspot backend."""

    def nmcli_available(self) -> bool:
        return shutil.which("nmcli") is not None

    def nmcli_version(self) -> str | None:
        if not self.nmcli_available():
            return None

        try:
            result = subprocess.run(
                ["nmcli", "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("Could not determine the nmcli version: %s", exc)
            return None

        if result.returncode != 0:
            return None

        return result.stdout.strip() or None
