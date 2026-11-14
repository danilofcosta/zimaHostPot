"""Background sampler: traffic counters, device discovery and events.

Runs in a daemon thread started by the FastAPI lifespan. A failure in one cycle
is logged and retried; it never kills the API process.
"""

from __future__ import annotations

import logging
import threading

from core.config import settings
from services import device_service, event_service, monitoring_service, net_collector

logger = logging.getLogger(__name__)


class Sampler:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._last_hotspot_active: bool | None = None
        self._cycles = 0

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="zima-hotspot-sampler", daemon=True
        )
        self._thread.start()
        logger.info(
            "Sampler started (interval=%ss, retention=%sh)",
            settings.monitor_interval,
            settings.monitor_retention_hours,
        )

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
        logger.info("Sampler stopped")

    def _run(self) -> None:
        try:
            device_service.restore_firewall()
        except Exception:
            logger.exception("Could not restore the nftables blocklist")

        while not self._stop.is_set():
            try:
                self.cycle()
            except Exception:
                logger.exception("Sampler cycle failed")
            self._stop.wait(settings.monitor_interval)

    def cycle(self) -> None:
        monitoring_service.sample_all()
        device_service.collect_and_store()
        self._track_hotspot_state()

        self._cycles += 1
        if self._cycles % 60 == 0:
            monitoring_service.prune()
            device_service.prune_history()

    def _track_hotspot_state(self) -> None:
        active = any(
            connection["name"] == settings.default_profile_name
            and connection["device"] != ""
            for connection in net_collector.active_connections()
        )
        if self._last_hotspot_active is None:
            self._last_hotspot_active = active
            return
        if active != self._last_hotspot_active:
            self._last_hotspot_active = active
            event_service.record(
                "hotspot_started" if active else "hotspot_stopped",
                "Hotspot ativado" if active else "Hotspot desativado",
                severity="success" if active else "warning",
                metadata={"profile": settings.default_profile_name},
            )


sampler = Sampler()
