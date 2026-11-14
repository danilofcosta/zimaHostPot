"""Application settings loaded from environment variables (and ``.env``)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)


def _env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or not value.strip() else value.strip()


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(
            f"Environment variable {name!r} must be an integer, got {value!r}."
        ) from exc


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_tuple(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return tuple(item.strip() for item in value.split(",") if item.strip())


def _env_path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return Path(value.strip()).expanduser()


def _optional_str(name: str) -> str | None:
    value = os.getenv(name)
    if value is None or not value.strip():
        return None
    return value.strip()


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable application configuration."""

    app_name: str
    version: str
    environment: str
    host: str
    port: int
    log_level: str
    docs_enabled: bool
    reload: bool
    api_key: str | None
    cors_origins: tuple[str, ...]
    default_interface: str
    default_profile_name: str
    api_v1_prefix: str
    data_dir: Path
    hotspot_config_file: Path
    db_path: Path
    monitor_interval: int
    monitor_retention_hours: int
    event_retention_hours: int
    traffic_history_minutes: int
    firewall_table: str
    oui_file: Path | None
    zimaos_api_url: str | None
    zimaos_api_key: str | None
    allow_insecure_production: bool

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def docs_url(self) -> str | None:
        return "/docs" if self.docs_enabled else None

    @property
    def openapi_url(self) -> str | None:
        return "/openapi.json" if self.docs_enabled else None


def _build_settings() -> Settings:
    environment = _env_str("ENVIRONMENT", "development")
    is_production = environment.lower() == "production"
    api_key_value = os.getenv("API_KEY")
    api_key = api_key_value.strip() if api_key_value and api_key_value.strip() else None
    cors_origins = _env_tuple("CORS_ORIGINS", ("*",))
    allow_insecure = _env_bool("ALLOW_INSECURE_PRODUCTION", False)

    built = Settings(
        app_name=_env_str("APP_NAME", "Zima Hotspot API"),
        version=_env_str("APP_VERSION", "1.0.0"),
        environment=environment,
        host=_env_str("HOST", "0.0.0.0"),
        port=_env_int("PORT", 8000),
        log_level=_env_str("LOG_LEVEL", "INFO").upper(),
        # Documentation is useful in development, but exposing it by default in
        # production leaks the full contract of a privileged local API.
        docs_enabled=_env_bool("DOCS_ENABLED", not is_production),
        reload=_env_bool("RELOAD", False),
        api_key=api_key,
        cors_origins=cors_origins,
        default_interface=_env_str("DEFAULT_INTERFACE", "wlan0"),
        default_profile_name=_env_str("DEFAULT_PROFILE_NAME", "Hotspot"),
        api_v1_prefix=_env_str("API_V1_PREFIX", "/api/v1"),
        data_dir=_env_path("DATA_DIR", PROJECT_ROOT / "data"),
        hotspot_config_file=_env_path(
            "HOTSPOT_CONFIG_FILE", PROJECT_ROOT / "data" / "hotspot.json"
        ),
        db_path=_env_path("DB_PATH", PROJECT_ROOT / "data" / "database.db"),
        monitor_interval=max(2, _env_int("MONITOR_INTERVAL_SECONDS", 10)),
        monitor_retention_hours=max(1, _env_int("MONITOR_RETENTION_HOURS", 72)),
        event_retention_hours=max(1, _env_int("EVENT_RETENTION_HOURS", 168)),
        traffic_history_minutes=max(1, _env_int("TRAFFIC_HISTORY_MINUTES", 60)),
        firewall_table=_env_str("FIREWALL_TABLE", "zima_hotspot"),
        oui_file=_env_path("OUI_FILE", PROJECT_ROOT / "data" / "oui.txt")
        if os.getenv("OUI_FILE")
        else None,
        zimaos_api_url=_optional_str("ZIMAOS_API_URL"),
        zimaos_api_key=_optional_str("ZIMAOS_API_KEY"),
        allow_insecure_production=allow_insecure,
    )

    _validate_settings(built)
    return built


def _validate_settings(value: Settings) -> None:
    """Refuse unsafe production configuration instead of only warning.

    The API can run privileged networking commands on the host, so starting it
    in production without authentication (or with a wildcard CORS policy that
    lets any web page call it) is treated as a configuration error. Set
    ``ALLOW_INSECURE_PRODUCTION=true`` only for a deliberately isolated lab.
    """

    if not value.is_production or value.allow_insecure_production:
        return

    problems: list[str] = []
    if not value.api_key:
        problems.append("API_KEY must be set in production")
    if "*" in value.cors_origins:
        problems.append("CORS_ORIGINS must not contain '*' in production")

    if problems:
        raise ValueError(
            "Unsafe production configuration: "
            + "; ".join(problems)
            + ". Set ALLOW_INSECURE_PRODUCTION=true to override (not recommended)."
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached application settings."""

    return _build_settings()


settings = get_settings()
