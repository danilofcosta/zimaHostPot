"""Configuration defaults and production safety checks."""

from __future__ import annotations

import pytest

from core.config import _build_settings


def _clear_security_env(monkeypatch: pytest.MonkeyPatch, **values: str | None) -> None:
    for name, value in values.items():
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)


def test_production_requires_api_key(monkeypatch):
    _clear_security_env(
        monkeypatch,
        ENVIRONMENT="production",
        API_KEY=None,
        CORS_ORIGINS="https://ui.example",
        ALLOW_INSECURE_PRODUCTION=None,
    )

    with pytest.raises(ValueError, match="API_KEY"):
        _build_settings()


def test_production_rejects_wildcard_cors(monkeypatch):
    _clear_security_env(
        monkeypatch,
        ENVIRONMENT="production",
        API_KEY="super-secret",
        CORS_ORIGINS="*",
        ALLOW_INSECURE_PRODUCTION=None,
    )

    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        _build_settings()


def test_production_disables_docs_by_default(monkeypatch):
    _clear_security_env(
        monkeypatch,
        ENVIRONMENT="production",
        API_KEY="super-secret",
        CORS_ORIGINS="https://ui.example",
        DOCS_ENABLED=None,
        ALLOW_INSECURE_PRODUCTION=None,
    )

    settings = _build_settings()

    assert settings.is_production is True
    assert settings.docs_enabled is False
    assert settings.docs_url is None
    assert settings.openapi_url is None


def test_production_can_opt_in_to_docs(monkeypatch):
    _clear_security_env(
        monkeypatch,
        ENVIRONMENT="production",
        API_KEY="super-secret",
        CORS_ORIGINS="https://ui.example",
        DOCS_ENABLED="true",
        ALLOW_INSECURE_PRODUCTION=None,
    )

    assert _build_settings().docs_enabled is True


def test_insecure_production_escape_hatch(monkeypatch):
    _clear_security_env(
        monkeypatch,
        ENVIRONMENT="production",
        API_KEY=None,
        CORS_ORIGINS="*",
        ALLOW_INSECURE_PRODUCTION="true",
    )

    settings = _build_settings()

    assert settings.api_key is None
    assert settings.cors_origins == ("*",)
    assert settings.allow_insecure_production is True


def test_development_defaults(monkeypatch):
    _clear_security_env(
        monkeypatch,
        ENVIRONMENT="development",
        API_KEY=None,
        CORS_ORIGINS=None,
        DOCS_ENABLED=None,
        ALLOW_INSECURE_PRODUCTION=None,
    )

    settings = _build_settings()

    assert settings.api_key is None
    assert settings.cors_origins == ("*",)
    assert settings.docs_enabled is True
    assert settings.event_retention_hours >= settings.monitor_retention_hours


def test_invalid_integer_is_rejected(monkeypatch):
    monkeypatch.setenv("PORT", "not-a-number")

    with pytest.raises(ValueError, match="PORT"):
        _build_settings()
