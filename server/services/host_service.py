"""Identify the machine this service is running on and its Wi-Fi hardware.

Everything here is read-only and best-effort: when the host does not expose a
source (Windows, a container without ``/sys``, a machine without DMI, ...) the
corresponding field is ``None`` instead of an invented value. The result is
logged once at startup and exposed by ``/api/v1/system`` and the diagnostics
endpoint, so an operator can tell *which* machine is running and whether it has
a Wi-Fi adapter without opening a shell on the host.
"""

from __future__ import annotations

import logging
import platform
import re
import time
from pathlib import Path
from typing import Any

from services import net_collector

logger = logging.getLogger(__name__)

DMI_ROOT = Path("/sys/class/dmi/id")
SYS_NET_ROOT = Path("/sys/class/net")
PCI_ROOT = Path("/sys/bus/pci/devices")
OS_RELEASE = Path("/etc/os-release")
DEVICE_TREE_MODEL = Path("/proc/device-tree/model")
CPUINFO = Path("/proc/cpuinfo")
DOCKERENV = Path("/.dockerenv")
CGROUP = Path("/proc/1/cgroup")

_PCI_SLOT_RE = re.compile(
    r"^(?:[0-9a-fA-F]{4}:)?[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-9a-fA-F]$"
)

# Only used to turn a bare PCI/USB vendor id into a readable name when
# ``lspci`` is not installed (it is not part of the server image).
_WIFI_VENDORS = {
    "8086": "Intel",
    "14e4": "Broadcom",
    "10ec": "Realtek",
    "168c": "Qualcomm Atheros",
    "14c3": "MediaTek",
    "1814": "Ralink",
    "0bda": "Realtek",
    "0cf3": "Qualcomm Atheros",
    "0e8d": "MediaTek",
}


# ---------------------------------------------------------------------------
# Small parsers (kept pure so they are easy to test)
# ---------------------------------------------------------------------------


def _read_text(path: Path) -> str | None:
    try:
        value = path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return None
    return value or None


def parse_os_release(text: str) -> dict[str, str]:
    """Parse an ``os-release`` file into a dictionary."""

    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, raw_value = line.partition("=")
        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def parse_cpu_model(text: str) -> str | None:
    """Extract the CPU description from ``/proc/cpuinfo`` (x86 and ARM)."""

    for raw in text.splitlines():
        key, _, value = raw.partition(":")
        key = key.strip().lower()
        value = value.strip()
        if not value or key not in {"model name", "hardware", "cpu model", "processor"}:
            continue
        # ARM lists numbered cores under "processor: 0"; those are not models.
        if key == "processor" and value.isdigit():
            continue
        return value
    return None


def parse_lspci(output: str) -> dict[str, str]:
    """Map PCI slots to their description from ``lspci -nn`` output."""

    devices: dict[str, str] = {}
    for raw in output.splitlines():
        line = raw.strip()
        match = re.match(r"^(?P<slot>[0-9a-fA-F:.]+)\s+(?P<desc>\S.*)$", line)
        if not match:
            continue
        slot = match.group("slot").lower()
        if ":" not in slot:
            continue
        devices[slot] = match.group("desc").strip()
    return devices


def _lookup_pci_model(models: dict[str, str], slot: str) -> str | None:
    slot = slot.lower()
    if slot in models:
        return models[slot]
    if slot.startswith("0000:") and slot[5:] in models:
        return models[slot[5:]]
    for key, description in models.items():
        if slot.endswith(key) or key.endswith(slot):
            return description
    return None


def _hex_id(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().lower()
    return value if value.startswith("0x") else f"0x{value}"


def _vendor_name(vendor_id: str | None) -> str | None:
    if not vendor_id:
        return None
    return _WIFI_VENDORS.get(vendor_id.removeprefix("0x").lower())


def _resolve(path: Path) -> Path | None:
    try:
        return path.resolve(strict=True)
    except (OSError, RuntimeError):
        return None


def _resolve_name(path: Path) -> str | None:
    resolved = _resolve(path)
    return resolved.name if resolved is not None else None


def _find_parent_value(path: Path, filename: str, depth: int = 4) -> str | None:
    """Look for a sysfs attribute on the device itself or one of its parents."""

    current = path
    for _ in range(depth + 1):
        value = _read_text(current / filename)
        if value:
            return value
        if current.parent == current:
            break
        current = current.parent
    return None


# ---------------------------------------------------------------------------
# Machine identity
# ---------------------------------------------------------------------------


def _is_container() -> bool:
    if DOCKERENV.exists():
        return True
    cgroup = _read_text(CGROUP) or ""
    return any(
        marker in cgroup for marker in ("docker", "kubepods", "containerd", "lxc")
    )


def _machine_summary(
    vendor: str | None,
    model: str | None,
    os_name: str,
    architecture: str,
    hostname: str,
) -> str:
    title = " ".join(part for part in (vendor, model) if part).strip()
    if not title:
        title = hostname
    return f"{title} · {os_name} · {architecture}"


def machine(
    *,
    dmi_root: Path = DMI_ROOT,
    os_release_path: Path = OS_RELEASE,
    device_tree_model: Path = DEVICE_TREE_MODEL,
    cpuinfo_path: Path = CPUINFO,
) -> dict[str, Any]:
    """Describe the physical machine (vendor/model/OS/CPU) running the API."""

    release = parse_os_release(_read_text(os_release_path) or "")
    vendor = _read_text(dmi_root / "sys_vendor")
    model = _read_text(dmi_root / "product_name")
    board = _read_text(dmi_root / "board_name")
    board_vendor = _read_text(dmi_root / "board_vendor")

    # ARM boards (Raspberry Pi, many SBCs) do not expose DMI.
    if not model:
        model = _read_text(device_tree_model)

    cpu = parse_cpu_model(_read_text(cpuinfo_path) or "")
    if not cpu:
        cpu = platform.processor() or None

    os_name = release.get("PRETTY_NAME") or release.get("NAME") or platform.system()
    os_version = release.get("VERSION_ID")
    hostname = net_collector.hostname()
    architecture = platform.machine()

    haystack = " ".join(
        part
        for part in (
            vendor,
            model,
            board,
            board_vendor,
            release.get("ID"),
            release.get("NAME"),
            release.get("PRETTY_NAME"),
        )
        if part
    ).lower()

    return {
        "hostname": hostname,
        "vendor": vendor,
        "model": model,
        "board": " ".join(part for part in (board_vendor, board) if part) or None,
        "os": os_name,
        "os_version": os_version,
        "kernel": platform.release(),
        "architecture": architecture,
        "cpu": cpu,
        "container": _is_container(),
        "is_zimaos": "zima" in haystack,
        "summary": _machine_summary(vendor, model, os_name, architecture, hostname),
    }


# ---------------------------------------------------------------------------
# Wi-Fi hardware
# ---------------------------------------------------------------------------


def _lspci_models() -> dict[str, str]:
    if not net_collector.tool_available("lspci"):
        return {}
    result = net_collector.run(["lspci", "-nn"], timeout=5)
    if not result.ok:
        return {}
    return parse_lspci(result.stdout)


def _interface_details(
    name: str,
    *,
    sys_net_root: Path,
    lspci: dict[str, str],
) -> dict[str, Any]:
    base = sys_net_root / name
    device = base / "device"
    target = _resolve(device)
    driver = _resolve_name(device / "driver")

    bus: str | None = None
    vendor_id: str | None = None
    device_id: str | None = None
    model: str | None = None

    if target is not None:
        if _PCI_SLOT_RE.match(target.name):
            bus = "pci"
            vendor_id = _hex_id(_read_text(device / "vendor"))
            device_id = _hex_id(_read_text(device / "device"))
            model = _lookup_pci_model(lspci, target.name)
        else:
            usb_vendor = _find_parent_value(target, "idVendor")
            if usb_vendor is not None:
                bus = "usb"
                vendor_id = _hex_id(usb_vendor)
                device_id = _hex_id(_find_parent_value(target, "idProduct"))
                manufacturer = _find_parent_value(target, "manufacturer")
                product = _find_parent_value(target, "product")
                model = (
                    " ".join(part for part in (manufacturer, product) if part) or None
                )
            else:
                # Platform/virtual device (e.g. mac80211_hwsim).
                bus = "other"
                model = _find_parent_value(target, "name")

    if model is None:
        vendor = _vendor_name(vendor_id)
        if vendor:
            model = vendor + (f" [{device_id}]" if device_id else "")
        elif target is not None:
            model = f"Controlador em {target.name}"

    return {
        "name": name,
        "driver": driver,
        "bus": bus,
        "vendor_id": vendor_id,
        "device_id": device_id,
        "model": model,
    }


def _pci_wireless_controllers(
    pci_root: Path, lspci: dict[str, str]
) -> list[dict[str, Any]]:
    """Find Wi-Fi controllers (PCI class 0x0280) even without an interface."""

    try:
        entries = sorted(pci_root.iterdir())
    except OSError:
        return []

    controllers: list[dict[str, Any]] = []
    for entry in entries:
        device_class = (_read_text(entry / "class") or "").lower()
        if not device_class.startswith("0x0280"):
            continue
        controllers.append(
            {
                "slot": entry.name,
                "vendor_id": _hex_id(_read_text(entry / "vendor")),
                "device_id": _hex_id(_read_text(entry / "device")),
                "driver": _resolve_name(entry / "driver"),
                "model": _lookup_pci_model(lspci, entry.name),
            }
        )
    return controllers


def _wifi_summary(
    interfaces: list[dict[str, Any]], controllers: list[dict[str, Any]]
) -> str:
    if interfaces:
        parts: list[str] = []
        for interface in interfaces:
            label = interface["model"] or interface["name"]
            details = [interface["name"]]
            if interface["driver"]:
                details.append(interface["driver"])
            parts.append(f"{label} ({', '.join(details)})")
        return "; ".join(parts)
    if controllers:
        labels = [
            controller.get("model") or controller["slot"] for controller in controllers
        ]
        return (
            f"{len(controllers)} controlador(es) Wi-Fi PCI sem interface ativa "
            f"({', '.join(labels)}); o driver/interface pode estar desligado"
        )
    return "Nenhuma placa Wi-Fi detectada"


def wifi(
    *,
    sys_net_root: Path = SYS_NET_ROOT,
    pci_root: Path = PCI_ROOT,
) -> dict[str, Any]:
    """Detect Wi-Fi adapters through sysfs, nmcli and iw."""

    names: set[str] = set()

    # sysfs: modern kernels expose /sys/class/net/<if>/wireless (and phy80211).
    try:
        net_entries = list(sys_net_root.iterdir())
    except OSError:
        net_entries = []
    for entry in net_entries:
        if (entry / "wireless").exists() or (entry / "phy80211").exists():
            names.add(entry.name)

    # nmcli/iw cover hosts where sysfs is not mounted in the container.
    for device in net_collector.device_status():
        if device.get("type") == "wifi" and device.get("name"):
            names.add(device["name"])
    for interface in net_collector.wireless_interfaces():
        name = interface.get("name")
        if name:
            names.add(name)

    lspci = _lspci_models()
    interfaces = [
        _interface_details(name, sys_net_root=sys_net_root, lspci=lspci)
        for name in sorted(names)
    ]
    controllers = _pci_wireless_controllers(pci_root, lspci)

    return {
        "present": bool(interfaces or controllers),
        "count": len(interfaces),
        "interfaces": interfaces,
        "controllers": controllers,
        "summary": _wifi_summary(interfaces, controllers),
    }


def detect() -> dict[str, Any]:
    """Return the full hardware snapshot used by startup, API and diagnostics."""

    return {
        "machine": machine(),
        "wifi": wifi(),
        "detected_at": net_collector.utc_iso(int(time.time() * 1000)),
    }
