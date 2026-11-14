"""Persist the last hotspot configuration in a JSON file.

The JSON file is the source of truth for the UI: it stores the SSID, password,
interface, band, channel and profile name so the form is prefilled with the
values used last time instead of always starting from ``Zima-Hotspot``.

The file contains the Wi-Fi password in plain text, so it is written with
``0600`` permissions (best effort) and must not be committed to version
control. Mount a volume for its directory in Docker to survive rebuilds.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.config import settings
from core.exceptions import HotspotConfigStorageError
from models.hotspot import Band
from models.hotspot_config import HotspotConfigRequest

logger = logging.getLogger(__name__)


class HotspotConfigService:
    """Read and write the persisted hotspot configuration."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = Path(path) if path is not None else settings.hotspot_config_file
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        """Absolute path of the JSON file."""

        return self._path

    def load(self) -> dict[str, Any]:
        """Return the saved configuration, or the built-in defaults."""

        with self._lock:
            record = self._read()

        if record is None:
            return self._defaults()

        return record

    def save(self, payload: HotspotConfigRequest | dict[str, Any]) -> dict[str, Any]:
        """Validate and persist the configuration, returning the stored record."""

        request = (
            payload
            if isinstance(payload, HotspotConfigRequest)
            else HotspotConfigRequest.model_validate(payload)
        )

        record: dict[str, Any] = request.model_dump(mode="json")
        record["updated_at"] = datetime.now(timezone.utc).isoformat()

        with self._lock:
            self._write(record)

        return {**record, "is_default": False}

    def reset(self) -> dict[str, Any]:
        """Delete the saved file and return the built-in defaults."""

        with self._lock:
            try:
                self._path.unlink()
            except FileNotFoundError:
                pass
            except OSError as exc:
                raise HotspotConfigStorageError(
                    f"Could not remove the hotspot configuration file: {exc}"
                ) from exc

        return self._defaults()

    def _defaults(self) -> dict[str, Any]:
        return {
            # No saved configuration yet: leave the SSID empty so the UI asks
            # for it instead of always suggesting "Zima-Hotspot".
            "name": "",
            "password": "",
            "interface": settings.default_interface,
            "profile_name": settings.default_profile_name,
            "band": Band.BG.value,
            "channel": None,
            "use_sudo": True,
            "updated_at": None,
            "is_default": True,
        }

    def _read(self) -> dict[str, Any] | None:
        try:
            raw = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.warning(
                "Could not read the hotspot configuration at %s: %s", self._path, exc
            )
            return None

        try:
            record = json.loads(raw)
            if not isinstance(record, dict):
                raise ValueError("The configuration file must contain a JSON object.")
            # ``updated_at`` is metadata written alongside the settings; drop it
            # before validating because the request model forbids extra fields.
            config = HotspotConfigRequest.model_validate(
                {key: value for key, value in record.items() if key != "updated_at"}
            )
        except (ValueError, TypeError) as exc:
            # A corrupt/legacy file must not break the API: fall back to the
            # defaults and let the next save overwrite it.
            logger.warning(
                "Ignoring invalid hotspot configuration at %s: %s", self._path, exc
            )
            return None

        updated_at = record.get("updated_at") if isinstance(record, dict) else None
        return {
            **config.model_dump(mode="json"),
            "updated_at": updated_at,
            "is_default": False,
        }

    def _write(self, record: dict[str, Any]) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_path = tempfile.mkstemp(
                dir=self._path.parent,
                prefix=f".{self._path.name}.",
                suffix=".tmp",
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    json.dump(record, handle, ensure_ascii=False, indent=2)
                    handle.write("\n")
                try:
                    os.chmod(tmp_path, 0o600)
                except OSError:
                    pass
                os.replace(tmp_path, self._path)
            except BaseException:
                Path(tmp_path).unlink(missing_ok=True)
                raise
        except OSError as exc:
            raise HotspotConfigStorageError(
                f"Could not save the hotspot configuration: {exc}"
            ) from exc
