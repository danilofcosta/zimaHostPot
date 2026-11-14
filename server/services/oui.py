"""Optional MAC vendor lookup.

The lookup table is read from ``OUI_FILE`` (CSV or the IEEE ``oui.txt``
format). A small built-in list of prefixes is used when no file is configured;
unknown prefixes return ``None`` instead of a guessed vendor.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path

from core.config import settings

logger = logging.getLogger(__name__)

# Prefix -> vendor. Only widely documented assignments used as a fallback.
_BUILTIN: dict[str, str] = {
    "b827eb": "Raspberry Pi Foundation",
    "dca632": "Raspberry Pi Trading",
    "e45f01": "Raspberry Pi Trading",
    "2ccf67": "Raspberry Pi Trading",
    "001a11": "Google LLC",
    "3c5ab4": "Google LLC",
    "f4f5d8": "Google LLC",
    "001788": "Philips Lighting",
    "18b430": "Nest Labs",
    "44650d": "Amazon Technologies",
    "74c246": "Amazon Technologies",
    "f0272d": "Amazon Technologies",
    "001b63": "Apple, Inc.",
    "3c22fb": "Apple, Inc.",
    "a483e7": "Apple, Inc.",
    "f01898": "Apple, Inc.",
    "000c29": "VMware, Inc.",
    "005056": "VMware, Inc.",
    "080027": "PCS Systemtechnik (VirtualBox)",
    "001c42": "Parallels, Inc.",
    "b4e62d": "Espressif Inc.",
    "240ac4": "Espressif Inc.",
    "30aea4": "Espressif Inc.",
    "84cca8": "Espressif Inc.",
    "84f3eb": "Espressif Inc.",
    "001dd1": "Shenzhen Bilian (TP-Link)",
    "50c7bf": "TP-Link Technologies",
    "001e58": "D-Link International",
    "f4f26d": "TP-Link Technologies",
    "b0be76": "TP-Link Technologies",
}


def _normalise(mac: str) -> str:
    return re.sub(r"[^0-9a-fA-F]", "", mac).lower()


def _load_file(path: Path) -> dict[str, str]:
    table: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.warning("Could not read OUI file %s: %s", path, exc)
        return table

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # IEEE oui.txt: "B8-27-EB   (hex)		Raspberry Pi Foundation"
        match = re.match(r"^([0-9A-Fa-f]{2})[-:]([0-9A-Fa-f]{2})[-:]([0-9A-Fa-f]{2})\s+\(hex\)\s+(.+)$", line)
        if match:
            prefix = (match.group(1) + match.group(2) + match.group(3)).lower()
            table[prefix] = match.group(4).strip()
            continue
        # CSV: "B8:27:EB,Raspberry Pi Foundation"
        parts = line.replace(";", ",").split(",", 1)
        if len(parts) == 2:
            prefix = _normalise(parts[0])
            if len(prefix) >= 6:
                table[prefix[:6]] = parts[1].strip()
    return table


@lru_cache(maxsize=1)
def _table() -> dict[str, str]:
    table = dict(_BUILTIN)
    if settings.oui_file and settings.oui_file.exists():
        table.update(_load_file(settings.oui_file))
    return table


def lookup(mac: str | None) -> str | None:
    if not mac:
        return None
    prefix = _normalise(mac)[:6]
    if len(prefix) != 6:
        return None
    return _table().get(prefix)
