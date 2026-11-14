"""Hardware detection used at startup and by the system endpoints."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from services import host_service


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.fixture(autouse=True)
def _no_host_probes(monkeypatch):
    """Keep the tests independent from nmcli/iw/lspci installed on the runner."""

    monkeypatch.setattr(host_service.net_collector, "device_status", lambda: [])
    monkeypatch.setattr(host_service.net_collector, "wireless_interfaces", lambda: [])
    monkeypatch.setattr(host_service, "_lspci_models", lambda: {})


def test_parse_os_release_handles_quotes_and_comments():
    values = host_service.parse_os_release(
        '# comment\nNAME="ZimaOS"\nVERSION_ID=1.4\nPRETTY_NAME="ZimaOS 1.4"\n'
    )

    assert values == {
        "NAME": "ZimaOS",
        "VERSION_ID": "1.4",
        "PRETTY_NAME": "ZimaOS 1.4",
    }


def test_parse_cpu_model_ignores_arm_core_numbers():
    arm = "processor\t: 0\nmodel name\t: ARMv8 Processor rev 1 (v8l)\n"
    numbered = "processor\t: 0\nprocessor\t: 1\n"

    assert host_service.parse_cpu_model(arm) == "ARMv8 Processor rev 1 (v8l)"
    assert host_service.parse_cpu_model(numbered) is None


def test_parse_lspci_and_lookup():
    models = host_service.parse_lspci(
        "02:00.0 Network controller [0280]: Intel Corporation Wireless 8265 / 8275 [8086:24fd] (rev 78)\n"
    )

    assert models["02:00.0"].startswith("Network controller")
    assert "Intel Corporation" in host_service._lookup_pci_model(models, "0000:02:00.0")


def test_machine_reads_dmi_firmware_and_os(tmp_path):
    dmi = tmp_path / "dmi"
    _write(dmi / "sys_vendor", "ZimaBoard\n")
    _write(dmi / "product_name", "ZimaBoard 832\n")
    _write(dmi / "board_vendor", "ZimaBoard\n")
    _write(dmi / "board_name", "ZimaBoard 832\n")
    os_release = tmp_path / "os-release"
    _write(os_release, 'NAME="ZimaOS"\nPRETTY_NAME="ZimaOS 1.4"\nVERSION_ID="1.4"\n')
    cpuinfo = tmp_path / "cpuinfo"
    _write(cpuinfo, "model name\t: Intel(R) Celeron(R) CPU N3450 @ 1.10GHz\n")

    info = host_service.machine(
        dmi_root=dmi,
        os_release_path=os_release,
        device_tree_model=tmp_path / "model",
        cpuinfo_path=cpuinfo,
    )

    assert info["vendor"] == "ZimaBoard"
    assert info["model"] == "ZimaBoard 832"
    assert info["os"] == "ZimaOS 1.4"
    assert info["os_version"] == "1.4"
    assert info["cpu"].startswith("Intel(R) Celeron")
    assert info["is_zimaos"] is True
    assert "ZimaBoard 832" in info["summary"]
    assert "ZimaOS 1.4" in info["summary"]


def test_machine_falls_back_to_device_tree_model(tmp_path):
    _write(tmp_path / "model", "Raspberry Pi 4 Model B Rev 1.4\n")
    _write(tmp_path / "cpuinfo", "Hardware\t: BCM2835\n")

    info = host_service.machine(
        dmi_root=tmp_path / "dmi",
        os_release_path=tmp_path / "os-release",
        device_tree_model=tmp_path / "model",
        cpuinfo_path=tmp_path / "cpuinfo",
    )

    assert info["model"] == "Raspberry Pi 4 Model B Rev 1.4"
    assert info["cpu"] == "BCM2835"
    assert info["is_zimaos"] is False
    assert info["summary"].startswith("Raspberry Pi 4 Model B Rev 1.4")


def test_wifi_detects_sysfs_interface(tmp_path):
    sys_net = tmp_path / "net"
    (sys_net / "wlan0" / "wireless").mkdir(parents=True)
    (sys_net / "eth0").mkdir()

    result = host_service.wifi(
        sys_net_root=sys_net,
        pci_root=tmp_path / "pci",
    )

    assert result["present"] is True
    assert result["count"] == 1
    assert [interface["name"] for interface in result["interfaces"]] == ["wlan0"]
    assert "wlan0" in result["summary"]


@pytest.mark.skipif(
    os.name == "nt", reason="sysfs PCI slot names contain ':', invalid on Windows"
)
def test_wifi_detects_pci_controller_without_interface(tmp_path):
    device = tmp_path / "pci" / "0000:02:00.0"
    _write(device / "class", "0x028000\n")
    _write(device / "vendor", "0x8086\n")
    _write(device / "device", "0x24fd\n")

    result = host_service.wifi(
        sys_net_root=tmp_path / "net",
        pci_root=tmp_path / "pci",
    )

    assert result["present"] is True
    assert result["count"] == 0
    assert result["controllers"][0]["slot"] == "0000:02:00.0"
    assert result["controllers"][0]["vendor_id"] == "0x8086"
    assert "controlador" in result["summary"]


def test_wifi_reports_absence_instead_of_guessing(tmp_path):
    result = host_service.wifi(
        sys_net_root=tmp_path / "net",
        pci_root=tmp_path / "pci",
    )

    assert result["present"] is False
    assert result["count"] == 0
    assert result["interfaces"] == []
    assert result["summary"] == "Nenhuma placa Wi-Fi detectada"
