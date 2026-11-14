import functools
import glob
import os
import shutil
import subprocess
import re
import threading
from datetime import datetime, timezone


class NmcliProfileNotFoundError(Exception):
    """Raised when a NetworkManager connection profile does not exist."""


# NetworkManager operations that change state must not overlap: a create
# deletes and recreates the same profile, so two concurrent requests would
# otherwise race and leave the host in an inconsistent state.
_NMCLI_MUTATION_LOCK = threading.RLock()


def _serialized(function):
    """Serialize NetworkManager mutations across request threads."""

    @functools.wraps(function)
    def wrapper(*args, **kwargs):
        with _NMCLI_MUTATION_LOCK:
            return function(*args, **kwargs)

    return wrapper


def _sudo_prefix(sudo: bool) -> list[str]:
    """Return the sudo prefix to use, or an empty list.

    Running as root (the container scenario) needs no sudo. Otherwise use
    ``sudo -n`` so the call fails immediately instead of waiting for a password
    on a terminal that does not exist. If sudo is not installed the command is
    still attempted without it, which keeps the previous behaviour on hosts
    where the process already has the required privileges.
    """

    if not sudo:
        return []
    geteuid = getattr(os, "geteuid", None)
    if geteuid is not None and geteuid() == 0:
        return []
    if shutil.which("sudo") is None:
        return []
    return ["sudo", "-n"]


def _utc_now() -> str:
    """Current UTC timestamp in ISO-8601, consistent with the rest of the API."""

    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def nmcli(*args, sudo=False):
    cmd = [*_sudo_prefix(sudo), "nmcli", *args]
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=20
    )

@_serialized
def create_hostapot(
    name: str,
    password: str,
    interface: str = "wlan0",
    band: str = "bg",          # "bg" (2.4GHz - maior alcance) ou "a" (5GHz - mais rápido)
    channel: int | None = None, # Ex: 1, 6, 11 (ou None para automático)
    use_sudo: bool = True,
    profile_name: str = "Hotspot",
) -> dict:
    # 1. Validações de entrada
    if not name or not password:
        raise ValueError("SSID and password must be provided")
    if len(name.encode("utf-8")) > 32:
        raise ValueError("SSID cannot exceed 32 bytes")
    if not (8 <= len(password) <= 63):
        raise ValueError("Password must be between 8 and 63 characters long")

    # 2. Derruba e apaga o perfil anterior para evitar conflito de perfis duplicados
    nmcli("connection", "down", profile_name, sudo=use_sudo)
    nmcli("connection", "delete", profile_name, sudo=use_sudo)

    # 3. Monta o comando de criação do Hotspot
    cmd_args = [
        "device", "wifi", "hotspot",
        "ifname", interface,
        "con-name", profile_name,
        "ssid", name,
        "password", password,
        "band", band,
    ]
    if channel is not None:
        cmd_args.extend(["channel", str(channel)])

    s = nmcli(*cmd_args, sudo=use_sudo)

    if s.returncode != 0:
        error_msg = s.stderr.strip() or s.stdout.strip()
        raise RuntimeError(f"Failed to create hotspot: {error_msg}")

    # 4. Extrai o UUID da conexão direto da saída do comando (ex: 'c4f7ef92-67f2-...')
    uuid_match = re.search(r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})", s.stdout)
    connection_uuid = uuid_match.group(1) if uuid_match else None

    # 5. Coleta detalhes reais da interface (IP, MAC, Estado, Gateway)
    dev_info = nmcli(
        "-t", "-f",
        "GENERAL.HWADDR,GENERAL.STATE,IP4.ADDRESS,IP4.GATEWAY",
        "device", "show", interface,
        sudo=use_sudo
    )
    details = {}
    for line in dev_info.stdout.splitlines():
        if ":" in line:
            key, val = line.split(":", 1)
            details[key.strip()] = val.strip()

    # 6. Coleta detalhes de canal/frequência e taxa da conexão Wi-Fi ativa
    con_info = nmcli(
        "-t", "-f",
        "802-11-wireless.band,802-11-wireless.channel,802-11-wireless.mode,802-11-wireless-security.key-mgmt",
        "connection", "show", profile_name,
        sudo=use_sudo
    )
    for line in con_info.stdout.splitlines():
        if ":" in line:
            key, val = line.split(":", 1)
            details[key.strip()] = val.strip()

    # Never invent addressing values: when NetworkManager did not report them
    # the API returns null and the UI shows an unknown value instead of a fake
    # 10.42.0.x network.
    ip_cidr = details.get("IP4.ADDRESS[1]") or None
    ip_address = ip_cidr.split("/")[0] if ip_cidr and "/" in ip_cidr else ip_cidr

    # 7. Gera string padrão de QR Code Wi-Fi (pode ser usada no frontend para desenhar QR Code)
    qr_code_payload = f"WIFI:T:WPA;S:{name};P:{password};;"

    return {
        "status": "success",
        "message": f"Hotspot '{name}' created successfully on interface '{interface}'",
        "return_code": s.returncode,
        "connection_uuid": connection_uuid,
        "profile_name": profile_name,
        "created_at": _utc_now(),
        "network": {
            "ssid": name,
            "password": password,
            "security": details.get("802-11-wireless-security.key-mgmt", "wpa-psk").upper(),
            "mode": details.get("802-11-wireless.mode", "ap"),
            "band": details.get("802-11-wireless.band") or band,
            "channel": details.get("802-11-wireless.channel") or "auto",
            "qr_code_string": qr_code_payload,
        },
        "interface_details": {
            "name": interface,
            "state": details.get("GENERAL.STATE") or "unknown",
            "mac_address": details.get("GENERAL.HWADDR") or None,
            "ipv4_address": ip_address,
            "ipv4_cidr": ip_cidr,
            "gateway": details.get("IP4.GATEWAY") or None,
            "dhcp_range": None,
        },
        "raw_output": s.stdout.strip().replace("\x1b[2K\n", "")
    }

@_serialized
def stop_hostapd(
    interface: str = "wlan0",
    profile_name: str = "Hotspot",
    delete_profile: bool = False,
    use_sudo: bool = True
) -> dict:
    # 1. Verifica conexões ativas antes de parar (para capturar o UUID se estiver ligado)
    active_con = nmcli(
        "-t", "-f", "NAME,UUID,DEVICE",
        "connection", "show", "--active",
        sudo=use_sudo
    )
    
    active_uuid = None
    was_active = False
    for line in active_con.stdout.splitlines():
        parts = line.split(":")
        # Only the hotspot profile itself counts as active: a regular Wi-Fi
        # uplink on the same interface must not be reported as a hotspot.
        if len(parts) >= 3 and parts[0] == profile_name and parts[2] == interface:
            was_active = True
            active_uuid = parts[1]
            break

    # 2. Tenta desligar pelo nome do perfil ("Hotspot")
    s = nmcli("connection", "down", profile_name, sudo=use_sudo)

    # Fallback: se o perfil tiver outro nome, desconecta a interface wlan0 diretamente
    if s.returncode != 0:
        s = nmcli("device", "disconnect", interface, sudo=use_sudo)

    if s.returncode != 0 and was_active:
        error_msg = s.stderr.strip() or s.stdout.strip()
        raise RuntimeError(f"Failed to stop hotspot: {error_msg}")

    # 3. Opcional: apagar o perfil salvo do NetworkManager após desligar
    profile_deleted = False
    if delete_profile:
        del_res = nmcli("connection", "delete", profile_name, sudo=use_sudo)
        profile_deleted = (del_res.returncode == 0)

    # 4. Consulta o estado atual da placa de rede após desligar
    dev_info = nmcli(
        "-t", "-f", "GENERAL.STATE,GENERAL.HWADDR",
        "device", "show", interface,
        sudo=use_sudo
    )
    details = {}
    for line in dev_info.stdout.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            details[k.strip()] = v.strip()

    return {
        "status": "stopped",
        "message": f"Hotspot '{profile_name}' on interface '{interface}' stopped successfully" if was_active else f"Hotspot was already stopped on '{interface}'",
        "was_active": was_active,
        "previous_uuid": active_uuid,
        "profile_name": profile_name,
        "profile_deleted": profile_deleted,
        "stopped_at": _utc_now(),
        "interface_details": {
            "name": interface,
            "state": details.get("GENERAL.STATE", "30 (disconnected)"),
            "mac_address": details.get("GENERAL.HWADDR", "unknown")
        },
        "raw_output": s.stdout.strip().replace("\x1b[2K\n", "")
    }

def get_hotspot_status(interface: str = "wlan0", profile_name: str = "Hotspot") -> dict:
    # 1. Verifica as conexões ativas no momento
    active_con = nmcli("-t", "-f", "NAME,UUID,TYPE,DEVICE", "connection", "show", "--active")
    
    is_active = False
    active_uuid = None

    for line in active_con.stdout.splitlines():
        parts = line.split(":")
        # Match the profile name *and* the interface: an ordinary Wi-Fi
        # connection on wlan0 is not a hotspot.
        if len(parts) >= 4 and parts[0] == profile_name and parts[3] == interface:
            is_active = True
            active_uuid = parts[1]
            break

    # 2. Pega o estado e o IP atual da placa wlan0
    dev_info = nmcli("-t", "-f", "GENERAL.STATE,GENERAL.CONNECTION,IP4.ADDRESS", "device", "show", interface)
    details = {}
    for line in dev_info.stdout.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            details[k.strip()] = v.strip()

    return {
        "active": is_active,
        "status_text": "ATIVO (Ligado)" if is_active else "INATIVO (Desligado)",
        "interface": interface,
        "connection_name": details.get("GENERAL.CONNECTION", None) or None,
        "connection_uuid": active_uuid,
        "device_state": details.get("GENERAL.STATE", "unknown"),
        "ip_address": details.get("IP4.ADDRESS[1]", None)
    }
@_serialized
def start_hotspot(
    name: str = "MeuHotspot",
    password: str = "MinhaSenha123",
    interface: str = "wlan0",
    profile_name: str = "Hotspot",
    use_sudo: bool = True
) -> dict:
    """Liga ou cria e ativa o hotspot Wi-Fi."""
    if not name or not password:
        raise ValueError("SSID and password must be provided.")
    if not (8 <= len(password) <= 63):
        raise ValueError("Password must be between 8 and 63 characters long.")

    # 1. Tenta subir o perfil caso já exista salvo no NetworkManager
    res = nmcli("connection", "up", profile_name, "ifname", interface, sudo=use_sudo)

    # 2. Se o perfil não existir ou falhar, cria um novo usando o comando direto do device wifi hotspot
    if res.returncode != 0:
        # Garante limpeza de perfis duplicados antes de criar
        nmcli("connection", "down", profile_name, sudo=use_sudo)
        nmcli("connection", "delete", profile_name, sudo=use_sudo)

        res = nmcli(
            "device", "wifi", "hotspot",
            "ifname", interface,
            "con-name", profile_name,
            "ssid", name,
            "password", password,
            sudo=use_sudo
        )

    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        return {
            "status": "error",
            "message": f"Falha ao ligar o hotspot: {error_msg}"
        }

    return {
        "status": "success",
        "message": f"Hotspot '{name}' ligado com sucesso na interface '{interface}'.",
        "ssid": name,
        "interface": interface,
        "activated_at": _utc_now(),
        "raw_output": res.stdout.strip().replace("\x1b[2K\n", "")
    }
@_serialized
def stop_hotspot(
    interface: str = "wlan0",
    profile_name: str = "Hotspot",
    use_sudo: bool = True
) -> dict:
    """Desliga o hotspot ativo."""
    # 1. Tenta derrubar pelo nome do perfil
    res = nmcli("connection", "down", profile_name, sudo=use_sudo)

    # 2. Fallback: Se falhar, desconecta diretamente a interface de rede
    if res.returncode != 0:
        res = nmcli("device", "disconnect", interface, sudo=use_sudo)

    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        return {
            "status": "error",
            "message": f"Falha ao desligar o hotspot: {error_msg}"
        }

    return {
        "status": "success",
        "message": f"Hotspot na interface '{interface}' desligado com sucesso.",
        "stopped_at": _utc_now(),
        "raw_output": res.stdout.strip().replace("\x1b[2K\n", "")
    }


@_serialized
def restart_hotspot(
    interface: str = "wlan0",
    profile_name: str = "Hotspot",
    use_sudo: bool = True
) -> dict:
    """Reinicia um perfil de hotspot já salvo (down + up)."""
    # O down é best-effort: se o perfil já estiver parado, o up ainda deve rodar.
    nmcli("connection", "down", profile_name, sudo=use_sudo)

    res = nmcli("connection", "up", profile_name, "ifname", interface, sudo=use_sudo)
    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        raise RuntimeError(f"Failed to restart hotspot: {error_msg}")

    return {
        "status": "success",
        "message": f"Hotspot '{profile_name}' reiniciado com sucesso na interface '{interface}'.",
        "interface": interface,
        "profile_name": profile_name,
        "restarted_at": _utc_now(),
        "raw_output": res.stdout.strip().replace("\x1b[2K\n", "")
    }


# Neighbor states that mean "the client answered recently". STALE entries are
# still listed (they may be idle) but are not counted as active.
_ACTIVE_NEIGH_STATES = {"REACHABLE", "DELAY", "PROBE", "PERMANENT"}
_IGNORED_NEIGH_STATES = {"FAILED", "INCOMPLETE"}

# dnsmasq writes one line per lease. NetworkManager's shared mode keeps its own
# copy, and the path varies between distributions, so several are tried.
_LEASE_PATHS = (
    "/var/lib/NetworkManager/dnsmasq-{interface}.leases",
    "/var/lib/NetworkManager/dnsmasq.leases",
    "/run/NetworkManager/dnsmasq-{interface}.leases",
    "/var/lib/misc/dnsmasq.leases",
    "/run/dnsmasq.leases",
)

# MAC -> first/last time seen by this process. Kept in memory only: it is a
# best-effort signal that survives page reloads, not server restarts.
_CLIENT_SEEN: dict[str, dict[str, str]] = {}
_CLIENT_SEEN_LOCK = threading.Lock()
_CLIENT_SEEN_LIMIT = 512


def _parse_leases(text: str) -> dict[str, dict]:
    """Parse dnsmasq lease lines (``expiry mac ip hostname client-id``).

    Returns a mapping of lower-case MAC to hostname/IP/expiry. Lines that do
    not look like a lease are ignored, so a truncated file is harmless.
    """

    leases: dict[str, dict] = {}
    for line in text.splitlines():
        fields = line.split()
        if len(fields) < 3:
            continue

        expiry, mac, ip = fields[0], fields[1], fields[2]
        hostname = fields[3] if len(fields) > 3 else "*"

        expires_at = None
        try:
            timestamp = int(expiry)
        except ValueError:
            timestamp = 0
        if timestamp > 0:
            try:
                expires_at = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat(timespec="seconds")
            except (OSError, OverflowError, ValueError):
                expires_at = None

        leases[mac.lower()] = {
            "hostname": None if hostname in {"", "*"} else hostname,
            "ip_address": ip,
            "lease_expires_at": expires_at,
        }

    return leases


def _read_dhcp_leases(interface: str) -> dict[str, dict]:
    """Merge every readable dnsmasq lease file for the given interface."""

    candidates = [path.format(interface=interface) for path in _LEASE_PATHS]
    candidates.extend(sorted(glob.glob("/var/lib/NetworkManager/dnsmasq-*.leases")))

    leases: dict[str, dict] = {}
    for path in dict.fromkeys(candidates):
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                text = handle.read()
        except OSError:
            continue
        # The first file that knows a MAC wins; later ones only fill gaps.
        for mac, lease in _parse_leases(text).items():
            leases.setdefault(mac, lease)

    return leases


def _parse_neigh_output(text: str) -> list[dict]:
    """Parse ``ip neigh show`` output into IP/MAC/state entries."""

    entries: list[dict] = []
    for line in text.splitlines():
        parts = line.split()
        if not parts or "lladdr" not in parts:
            continue

        mac_index = parts.index("lladdr")
        if mac_index + 1 >= len(parts):
            continue

        state = parts[-1].upper()
        if state in _IGNORED_NEIGH_STATES:
            continue

        entries.append(
            {
                "ip_address": parts[0],
                "mac_address": parts[mac_index + 1].lower(),
                "state": state,
            }
        )

    return entries


def _ip_sort_key(ip_address: str) -> tuple[int, int, int, int]:
    """Sort IPv4 addresses numerically instead of lexicographically."""

    parts = ip_address.split(".")
    if len(parts) == 4 and all(part.isdigit() for part in parts):
        return tuple(int(part) for part in parts)  # type: ignore[return-value]
    return (999, 999, 999, 999)


def list_hotspot_clients(interface: str = "wlan0") -> dict:
    """Lista os clientes da interface, com hostname do DHCP e última atividade."""
    # FileNotFoundError/TimeoutExpired are translated to 503 by the service.
    res = subprocess.run(
        ["ip", "neigh", "show", "dev", interface],
        capture_output=True,
        text=True,
        timeout=10,
    )

    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        raise RuntimeError(f"Failed to list clients on '{interface}': {error_msg}")

    entries = _parse_neigh_output(res.stdout)
    leases = _read_dhcp_leases(interface)

    now = _utc_now()
    clients: list[dict] = []

    with _CLIENT_SEEN_LOCK:
        if len(_CLIENT_SEEN) > _CLIENT_SEEN_LIMIT:
            _CLIENT_SEEN.clear()

        for entry in entries:
            mac = entry["mac_address"]
            seen = _CLIENT_SEEN.setdefault(
                mac, {"first_seen": now, "last_seen": now}
            )
            seen["last_seen"] = now

            lease = leases.get(mac, {})
            clients.append(
                {
                    "ip_address": entry["ip_address"],
                    "mac_address": mac,
                    "hostname": lease.get("hostname"),
                    "state": entry["state"],
                    "is_active": entry["state"] in _ACTIVE_NEIGH_STATES,
                    "first_seen": seen["first_seen"],
                    "last_seen": seen["last_seen"],
                    "lease_expires_at": lease.get("lease_expires_at"),
                }
            )

    clients.sort(
        key=lambda client: (
            not client["is_active"],
            _ip_sort_key(client["ip_address"]),
        )
    )

    return {
        "interface": interface,
        "count": len(clients),
        "active_count": sum(1 for client in clients if client["is_active"]),
        "clients": clients,
        "checked_at": now,
    }


def _split_terse(line: str) -> list[str]:
    """Divide uma linha de ``nmcli -t`` em campos, respeitando ``\\:``."""
    fields: list[str] = []
    current: list[str] = []
    escaped = False

    for char in line:
        if escaped:
            current.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == ":":
            fields.append("".join(current))
            current = []
        else:
            current.append(char)

    if escaped:
        current.append("\\")
    fields.append("".join(current))
    return fields


def _unescape_terse(value: str) -> str:
    """Desfaz os escapes ``\\:`` e ``\\\\`` usados por ``nmcli -t``."""
    return value.replace("\\:", ":").replace("\\\\", "\\")


def _parse_terse_kv(output: str) -> dict[str, list[str]]:
    values: dict[str, list[str]] = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        values.setdefault(key.strip(), []).append(
            _unescape_terse(value.strip())
        )
    return values


def _first_value(values: dict[str, list[str]], key: str, default=None):
    items = values.get(key)
    return items[0] if items else default


def _indexed_values(values: dict[str, list[str]], prefix: str) -> list[str]:
    result: list[str] = []
    for key, items in values.items():
        if key.startswith(prefix):
            result.extend(items)
    return result


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def list_interfaces() -> dict:
    """Lista as interfaces de rede conhecidas pelo NetworkManager."""
    res = nmcli("-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status")
    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        raise RuntimeError(f"Failed to list network interfaces: {error_msg}")

    interfaces = []
    for line in res.stdout.splitlines():
        if not line.strip():
            continue
        fields = _split_terse(line)
        fields += [""] * (4 - len(fields))
        device, device_type, state, connection = fields[:4]
        interfaces.append({
            "name": device,
            "type": device_type,
            "state": state,
            "connection": connection or None,
        })

    return {"count": len(interfaces), "interfaces": interfaces}


def get_interface_details(interface: str = "wlan0") -> dict:
    """Retorna os detalhes de uma interface específica."""
    res = nmcli(
        "-t", "-f",
        "GENERAL.DEVICE,GENERAL.TYPE,GENERAL.STATE,GENERAL.CONNECTION,"
        "GENERAL.HWADDR,GENERAL.MTU,IP4.ADDRESS,IP4.GATEWAY,IP4.DNS",
        "device", "show", interface,
    )
    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        raise RuntimeError(f"Failed to inspect interface '{interface}': {error_msg}")

    values = _parse_terse_kv(res.stdout)
    mtu_raw = _first_value(values, "GENERAL.MTU")

    return {
        "name": _first_value(values, "GENERAL.DEVICE", interface),
        "type": _first_value(values, "GENERAL.TYPE", "unknown"),
        "state": _first_value(values, "GENERAL.STATE", "unknown"),
        "connection": _first_value(values, "GENERAL.CONNECTION") or None,
        "mac_address": _first_value(values, "GENERAL.HWADDR") or None,
        "mtu": int(mtu_raw) if mtu_raw and mtu_raw.isdigit() else None,
        "ipv4_addresses": _indexed_values(values, "IP4.ADDRESS["),
        "ipv4_gateway": _first_value(values, "IP4.GATEWAY") or None,
        "ipv4_dns": _indexed_values(values, "IP4.DNS["),
    }


def scan_wifi_networks(interface: str | None = None, rescan: bool = True) -> dict:
    """Escaneia e lista as redes Wi-Fi visíveis."""
    args = [
        "-t", "-f",
        "IN-USE,SSID,BSSID,MODE,CHAN,RATE,SIGNAL,SECURITY",
        "device", "wifi", "list",
    ]
    if interface:
        args.extend(["ifname", interface])
    args.extend(["--rescan", "yes" if rescan else "no"])

    res = nmcli(*args)
    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        raise RuntimeError(f"Failed to scan Wi-Fi networks: {error_msg}")

    networks = []
    for line in res.stdout.splitlines():
        if not line.strip():
            continue

        fields = _split_terse(line)
        fields += [""] * (8 - len(fields))
        in_use, ssid, bssid, mode, channel, rate, signal, security = fields[:8]

        networks.append({
            "in_use": in_use.strip() == "*",
            "ssid": ssid,
            "bssid": bssid,
            "mode": mode,
            "channel": int(channel) if channel.isdigit() else None,
            "rate": rate,
            "signal": int(signal) if signal.isdigit() else None,
            "security": security or "open",
        })

    networks.sort(
        key=lambda item: item["signal"] if item["signal"] is not None else -1,
        reverse=True,
    )

    return {
        "interface": interface,
        "rescan": rescan,
        "count": len(networks),
        "networks": networks,
        "scanned_at": _utc_now(),
    }


BAND_CHANNELS: dict[str, tuple[int, ...]] = {
    "bg": (1, 6, 11),
    "a": (36, 40, 44, 48, 149, 153, 157, 161, 165),
}

# How far apart two channels must be to stop interfering. 2.4 GHz channels are
# 5 MHz apart but roughly 20 MHz wide, so a network up to four channels away
# still overlaps; 5 GHz channels are already non-overlapping.
_MAX_OVERLAP_DISTANCE = {"bg": 4, "a": 0}


def channel_band(channel: int) -> str:
    """Return ``'bg'`` for 2.4 GHz channels and ``'a'`` for 5 GHz ones."""

    return "bg" if channel <= 14 else "a"


def _overlap_weight(distance: int, band: str) -> float:
    """Share of a network's signal that still reaches the candidate channel."""

    limit = _MAX_OVERLAP_DISTANCE[band]
    if distance > limit:
        return 0.0
    if limit == 0:
        return 1.0
    return 1.0 - (distance / (limit + 1))


def _build_channel_analysis(
    networks: list[dict],
    *,
    interface: str | None,
    scan_mode: str,
    scanned_at: str,
    bands: tuple[str, ...] = ("bg", "a"),
) -> dict:
    """Rank the non-overlapping channels of each band by congestion.

    ``interference`` is a 0-100+ score where 0 means no overlapping network was
    detected. It weights every network by its signal and by how much it overlaps
    the candidate channel, so a strong network four channels away counts less
    than a weak one on the same channel.

    The network the scan interface is currently connected to (``in_use``) is
    skipped: it is either the hotspot being configured or the uplink, and it
    must not count as congestion against itself.
    """

    observed = [
        net
        for net in networks
        if net.get("channel") is not None and not net.get("in_use")
    ]

    channels: list[dict] = []
    recommendations: list[dict] = []

    for band in bands:
        candidates = BAND_CHANNELS[band]
        rows: list[dict] = []

        for channel in candidates:
            exact = [net for net in observed if net["channel"] == channel]
            interference = 0.0

            for net in observed:
                weight = _overlap_weight(abs(net["channel"] - channel), band)
                if weight <= 0:
                    continue
                interference += weight * ((net.get("signal") or 0) / 100.0)

            rows.append(
                {
                    "channel": channel,
                    "band": band,
                    "networks": len(exact),
                    "strongest_signal": max(
                        (net.get("signal") or 0 for net in exact), default=None
                    ),
                    "interference": round(interference * 100, 1),
                    "recommended": False,
                }
            )

        best = min(
            rows,
            key=lambda row: (
                row["interference"],
                row["networks"],
                row["channel"],
            ),
        )
        best["recommended"] = True

        if not observed:
            reason = f"no other networks detected in the {band} band"
        elif best["interference"] == 0:
            reason = f"no overlapping network detected on channel {best['channel']}"
        else:
            reason = (
                "least congested of channels "
                + ", ".join(str(channel) for channel in candidates)
            )

        recommendations.append(
            {
                "band": band,
                "channel": best["channel"],
                "networks": best["networks"],
                "strongest_signal": best["strongest_signal"],
                "interference": best["interference"],
                "reason": reason,
            }
        )
        channels.extend(rows)

    return {
        "interface": interface,
        "scan_mode": scan_mode,
        "scanned_at": scanned_at,
        "networks": len(observed),
        "channels": channels,
        "recommendations": recommendations,
    }


def analyze_wifi_channels(
    interface: str | None = None,
    band: str | None = None,
) -> dict:
    """Scan the visible networks and recommend the least congested channel.

    When the hotspot is already running the radio is locked to its channel, so
    a fresh scan may fail. In that case the cached scan results are used and
    ``scan_mode`` is reported as ``'cached'``.
    """

    if band is not None and band not in BAND_CHANNELS:
        raise ValueError("Band must be 'bg' (2.4 GHz) or 'a' (5 GHz).")

    scan_mode = "fresh"
    try:
        scan = scan_wifi_networks(interface=interface, rescan=True)
    except RuntimeError:
        scan_mode = "cached"
        try:
            scan = scan_wifi_networks(interface=interface, rescan=False)
        except RuntimeError as exc:
            raise RuntimeError(
                "Could not scan Wi-Fi channels. When the hotspot is running the "
                "radio is locked to its channel, and no cached scan is available."
            ) from exc

    return _build_channel_analysis(
        scan["networks"],
        interface=scan.get("interface"),
        scan_mode=scan_mode,
        scanned_at=scan["scanned_at"],
        bands=(band,) if band else ("bg", "a"),
    )


def list_profiles(profile_type: str | None = None) -> dict:
    """Lista os perfis de conexão salvos no NetworkManager."""
    res = nmcli("-t", "-f", "NAME,UUID,TYPE,DEVICE", "connection", "show")
    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        raise RuntimeError(f"Failed to list connection profiles: {error_msg}")

    profiles = []
    for line in res.stdout.splitlines():
        if not line.strip():
            continue

        fields = _split_terse(line)
        fields += [""] * (4 - len(fields))
        name, uuid, type_, device = fields[:4]

        if profile_type and type_ != profile_type:
            continue

        profiles.append({
            "name": name,
            "uuid": uuid,
            "type": type_,
            "device": device or None,
        })

    return {"count": len(profiles), "profiles": profiles}


def get_profile_details(profile_name: str) -> dict:
    """Retorna as configurações de um perfil de conexão."""
    res = nmcli("-t", "connection", "show", profile_name)
    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        if "unknown connection" in error_msg.lower() or "not found" in error_msg.lower():
            raise NmcliProfileNotFoundError(
                f"Profile '{profile_name}' was not found."
            )
        raise RuntimeError(f"Failed to inspect profile '{profile_name}': {error_msg}")

    values = _parse_terse_kv(res.stdout)
    settings = {key: items[-1] for key, items in values.items()}

    channel_raw = settings.get("802-11-wireless.channel")
    autoconnect_raw = settings.get("connection.autoconnect")

    return {
        "name": settings.get("connection.id", profile_name),
        "uuid": settings.get("connection.uuid"),
        "type": settings.get("connection.type", "unknown"),
        "device": settings.get("connection.interface-name") or None,
        "autoconnect": (
            autoconnect_raw.strip().lower() in {"yes", "true", "1"}
            if autoconnect_raw is not None
            else None
        ),
        "ssid": settings.get("802-11-wireless.ssid") or None,
        "mode": settings.get("802-11-wireless.mode") or None,
        "band": settings.get("802-11-wireless.band") or None,
        "channel": int(channel_raw) if channel_raw and channel_raw.isdigit() else None,
        "security": settings.get("802-11-wireless-security.key-mgmt") or None,
        "ipv4_method": settings.get("ipv4.method") or None,
        "ipv4_addresses": _split_csv(settings.get("ipv4.addresses")),
        "ipv4_gateway": settings.get("ipv4.gateway") or None,
        "ipv4_dns": _split_csv(settings.get("ipv4.dns")),
        "settings": settings,
    }


@_serialized
def delete_profile(profile_name: str, use_sudo: bool = True) -> dict:
    """Apaga um perfil de conexão salvo no NetworkManager."""
    res = nmcli("connection", "delete", profile_name, sudo=use_sudo)
    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip()
        if "unknown connection" in error_msg.lower() or "not found" in error_msg.lower():
            raise NmcliProfileNotFoundError(
                f"Profile '{profile_name}' was not found."
            )
        raise RuntimeError(f"Failed to delete profile '{profile_name}': {error_msg}")

    return {
        "status": "success",
        "message": f"Profile '{profile_name}' deleted successfully.",
        "profile_name": profile_name,
        "deleted": True,
        "deleted_at": _utc_now(),
        "raw_output": res.stdout.strip(),
    }

