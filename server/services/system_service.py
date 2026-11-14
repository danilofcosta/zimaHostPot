"""Host, database and backend diagnostics.

Every check reports what was actually observed. ``unsupported`` means the tool
or permission is missing on this host, not that everything is fine.
"""

from __future__ import annotations

import logging
import os
import platform
import shutil
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.config import settings
from services import host_service, net_collector
from services.device_service import summary as device_summary
from services.firewall_service import FirewallService

logger = logging.getLogger(__name__)


def _iso(ms: int | None = None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(
        timespec="seconds"
    )


def _uptime_seconds() -> float | None:
    try:
        return float(Path("/proc/uptime").read_text().split()[0])
    except (OSError, ValueError, IndexError):
        return None


def _memory() -> dict[str, int] | None:
    try:
        lines = Path("/proc/meminfo").read_text().splitlines()
    except OSError:
        return None
    values: dict[str, int] = {}
    for line in lines:
        key, _, rest = line.partition(":")
        parts = rest.strip().split()
        if parts and parts[0].isdigit():
            values[key] = int(parts[0]) * 1024
    total = values.get("MemTotal")
    available = values.get("MemAvailable")
    if total is None:
        return None
    return {
        "total_bytes": total,
        "available_bytes": available or 0,
        "used_bytes": total - (available or 0),
    }


def _db_info(*, integrity: bool = False) -> dict[str, Any]:
    """Describe the database file.

    ``PRAGMA integrity_check`` reads the whole database, so it is only run by
    the diagnostics endpoint and never by the dashboard's ``/system/info``.
    """
    path = settings.db_path
    info: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
        "size_bytes": path.stat().st_size if path.exists() else None,
        "wal_size_bytes": (
            Path(str(path) + "-wal").stat().st_size
            if Path(str(path) + "-wal").exists()
            else None
        ),
        "integrity": None,
        "journal_mode": None,
        "sqlite_version": sqlite3.sqlite_version,
    }
    if not path.exists():
        return info
    try:
        connection = sqlite3.connect(path, timeout=5)
        try:
            if integrity:
                info["integrity"] = connection.execute(
                    "PRAGMA integrity_check"
                ).fetchone()[0]
            info["journal_mode"] = connection.execute("PRAGMA journal_mode").fetchone()[0]
        finally:
            connection.close()
    except sqlite3.Error as exc:
        info["integrity"] = f"error: {exc}"
    return info


def info() -> dict[str, Any]:
    disk = None
    try:
        usage = shutil.disk_usage(settings.data_dir)
        disk = {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
        }
    except OSError:
        pass

    nmcli_version = None
    version_result = net_collector.run(["nmcli", "--version"], timeout=5)
    if version_result.ok:
        nmcli_version = version_result.stdout.strip() or None

    hardware = host_service.detect()

    return {
        "hostname": net_collector.hostname(),
        "platform": platform.platform(),
        "system": platform.system(),
        "kernel": platform.release(),
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "environment": settings.environment,
        "machine": hardware["machine"],
        "wifi": hardware["wifi"],
        "uptime_seconds": _uptime_seconds(),
        "memory": _memory(),
        "disk": disk,
        "database": _db_info(),
        "backend": {
            "nmcli": net_collector.tool_available("nmcli"),
            "nmcli_version": nmcli_version,
            "iw": net_collector.tool_available("iw"),
            "ip": net_collector.tool_available("ip"),
            "nft": net_collector.tool_available("nft"),
            "network_manager": net_collector.nmcli_general_status(),
        },
        "network": {
            "interfaces": net_collector.device_status(),
            "wireless": net_collector.wireless_interfaces(),
            "default_route_interface": net_collector.default_route_interface(),
        },
        "devices": device_summary(),
        "timestamp": _iso(int(time.time() * 1000)),
    }


def _check(
    check_id: str,
    label: str,
    status: str,
    detail: str,
    hint: str | None = None,
) -> dict[str, Any]:
    return {
        "id": check_id,
        "label": label,
        "status": status,
        "detail": detail,
        "hint": hint,
    }


def _zimaos_check() -> dict[str, Any]:
    if not settings.zimaos_api_url:
        return _check(
            "zimaos",
            "Integração com a API do ZimaOS",
            "unsupported",
            "ZIMAOS_API_URL não configurada.",
            "A integração é opcional. Configure ZIMAOS_API_URL e ZIMAOS_API_KEY "
            "com um endpoint documentado pela sua versão do ZimaOS.",
        )
    headers = {"Accept": "application/json"}
    if settings.zimaos_api_key:
        # The key was previously read from the environment and never used,
        # which made authenticated ZimaOS endpoints always look unreachable.
        headers["Authorization"] = f"Bearer {settings.zimaos_api_key}"
    try:
        request = urllib.request.Request(
            settings.zimaos_api_url,
            method="GET",
            headers=headers,
        )
        with urllib.request.urlopen(request, timeout=3) as response:
            return _check(
                "zimaos",
                "Integração com a API do ZimaOS",
                "ok",
                f"Base URL respondeu HTTP {response.status}. "
                "Nenhum endpoint específico é chamado automaticamente.",
            )
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return _check(
            "zimaos",
            "Integração com a API do ZimaOS",
            "warn",
            f"Base URL configurada, mas não respondeu: {exc}",
        )


def diagnostics() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    if os.name == "posix":
        is_root = os.geteuid() == 0
        checks.append(
            _check(
                "privileges",
                "Permissões do processo",
                "ok" if is_root else "warn",
                "Executando como root." if is_root else "Executando sem root.",
                None if is_root else "nmcli e nft podem exigir root/CAP_NET_ADMIN.",
            )
        )
    else:
        checks.append(
            _check(
                "privileges",
                "Permissões do processo",
                "unsupported",
                "Fora do Linux não é possível inspecionar euid.",
            )
        )

    for tool, label in [("nmcli", "nmcli"), ("iw", "iw"), ("ip", "ip"), ("nft", "nft")]:
        available = net_collector.tool_available(tool)
        checks.append(
            _check(
                f"tool_{tool}",
                f"Ferramenta {label}",
                "ok" if available else "error",
                "Disponível." if available else "Não encontrada no PATH.",
                None if available else "Instale o pacote correspondente na imagem.",
            )
        )

    general = net_collector.nmcli_general_status()
    if general:
        checks.append(
            _check(
                "networkmanager",
                "NetworkManager do host",
                "ok",
                f"Estado: {general.get('state', 'desconhecido')}; "
                f"conectividade: {general.get('connectivity', 'desconhecida')}.",
            )
        )
    else:
        checks.append(
            _check(
                "networkmanager",
                "NetworkManager do host",
                "error",
                "`nmcli general status` não respondeu.",
                "Verifique o socket D-Bus em /run/dbus e o NetworkManager do host.",
            )
        )

    devices = net_collector.device_status()
    wifi = [device for device in devices if device["type"] == "wifi"]
    checks.append(
        _check(
            "wifi_interfaces",
            "Interfaces Wi-Fi",
            "ok" if wifi else "warn",
            ", ".join(
                f"{device['name']} ({device['state']})" for device in wifi
            )
            or "Nenhuma interface Wi-Fi encontrada.",
            None if wifi else "Verifique se o adaptador Wi-Fi está visível no host.",
        )
    )

    wireless = net_collector.wireless_interfaces()
    checks.append(
        _check(
            "iw_dev",
            "Interfaces via iw",
            "ok" if wireless else "warn",
            ", ".join(entry["name"] for entry in wireless) or "Nenhuma interface.",
        )
    )

    wifi_hardware = host_service.wifi()
    checks.append(
        _check(
            "wifi_adapter",
            "Placa Wi-Fi (hardware)",
            "ok" if wifi_hardware["present"] else "warn",
            wifi_hardware["summary"],
            None
            if wifi_hardware["present"]
            else "Nenhum adaptador Wi-Fi visível em /sys/class/net, nmcli ou iw. "
            "Confirme que a placa está instalada e o driver carregado no host.",
        )
    )

    dbus = Path("/run/dbus/system_bus_socket")
    checks.append(
        _check(
            "dbus",
            "Socket D-Bus do host",
            "ok" if dbus.exists() else "warn",
            f"{dbus} {'existe' if dbus.exists() else 'não existe'}.",
            None if dbus.exists() else "Monte /run/dbus no container (compose já faz isso).",
        )
    )

    db = _db_info(integrity=True)
    integrity_ok = db.get("integrity") == "ok"
    checks.append(
        _check(
            "database",
            "Banco SQLite",
            "ok" if integrity_ok else "error",
            f"{db['path']} ({db['size_bytes'] or 0} bytes), "
            f"journal={db.get('journal_mode')}, integrity={db.get('integrity')}.",
            None if integrity_ok else "Verifique permissões do volume ./server/data.",
        )
    )

    firewall = FirewallService()
    if firewall.available:
        try:
            table_ok = firewall.table_exists()
            blocked = firewall.list_blocked()
            checks.append(
                _check(
                    "firewall",
                    "Tabela nftables de bloqueio",
                    "ok",
                    f"Tabela inet {firewall.table} "
                    f"{'presente' if table_ok else 'será criada no primeiro bloqueio'}; "
                    f"{len(blocked)} MAC(s) bloqueado(s).",
                )
            )
        except Exception as exc:  # pragma: no cover - nft parse errors
            checks.append(
                _check(
                    "firewall",
                    "Tabela nftables de bloqueio",
                    "warn",
                    f"nft presente, mas a tabela não pôde ser lida: {exc}",
                )
            )
    else:
        checks.append(
            _check(
                "firewall",
                "Tabela nftables de bloqueio",
                "unsupported",
                "nft não está instalado; bloqueio de internet indisponível.",
                "Instale nftables na imagem e mantenha CAP_NET_ADMIN.",
            )
        )

    leases = net_collector.dhcp_leases()
    checks.append(
        _check(
            "dhcp_leases",
            "Leases DHCP",
            "ok" if leases else "warn",
            f"{len(leases)} lease(s) legível(is)."
            if leases
            else "Nenhum arquivo de lease legível.",
            None
            if leases
            else "Monte /var/lib/NetworkManager como somente leitura.",
        )
    )

    checks.append(
        _check(
            "api_key",
            "Autenticação da API Python",
            "ok" if settings.api_key else "warn",
            "API_KEY configurada." if settings.api_key else "API_KEY não configurada.",
            None
            if settings.api_key
            else "A UI fala com a API via BFF, mas a porta 6565 continua exposta na rede.",
        )
    )

    if settings.is_production and "*" in settings.cors_origins:
        checks.append(
            _check(
                "cors",
                "CORS",
                "warn",
                "Produção com CORS_ORIGINS=*.",
                "Restrinja às origens reais (ex.: http://<zimaos>:8080).",
            )
        )

    checks.append(_zimaos_check())

    summary = {"ok": 0, "warn": 0, "error": 0, "unsupported": 0}
    for check in checks:
        summary[check["status"]] = summary.get(check["status"], 0) + 1

    return {
        "summary": summary,
        "checks": checks,
        "database": db,
        "timestamp": _iso(int(time.time() * 1000)),
    }
