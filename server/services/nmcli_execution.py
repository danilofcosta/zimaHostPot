"""Shared execution/error translation for services backed by ``nmcli``."""

from __future__ import annotations

import logging
import subprocess
from typing import Any, Callable

import funs

from core.exceptions import (
    HotspotBackendUnavailableError,
    HotspotConfigurationError,
    HotspotOperationError,
    ProfileNotFoundError,
)

logger = logging.getLogger(__name__)

Result = dict[str, Any]


def execute(
    operation: str,
    function: Callable[..., Result],
    **kwargs: Any,
) -> Result:
    """Run a ``funs`` helper and translate its errors to domain errors."""

    logger.info(
        "nmcli.%s requested (interface=%s, profile=%s)",
        operation,
        kwargs.get("interface"),
        kwargs.get("profile_name"),
    )

    try:
        result = function(**kwargs)
    except ValueError as exc:
        logger.warning("nmcli.%s rejected: %s", operation, exc)
        raise HotspotConfigurationError(str(exc)) from exc
    except FileNotFoundError as exc:
        logger.error("nmcli.%s failed: a required command was not found", operation)
        raise HotspotBackendUnavailableError(
            "The 'nmcli' command is not available on this host."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        logger.error(
            "nmcli.%s timed out after %s seconds", operation, exc.timeout
        )
        raise HotspotBackendUnavailableError(
            "The 'nmcli' command timed out."
        ) from exc
    except funs.NmcliProfileNotFoundError as exc:
        logger.warning("nmcli.%s not found: %s", operation, exc)
        raise ProfileNotFoundError(str(exc)) from exc
    except RuntimeError as exc:
        logger.error("nmcli.%s failed: %s", operation, exc)
        raise HotspotOperationError(str(exc)) from exc

    if not isinstance(result, dict):
        logger.error(
            "nmcli.%s returned an unexpected payload: %r", operation, result
        )
        raise HotspotOperationError(
            "The hotspot backend returned an unexpected response."
        )

    logger.info("nmcli.%s finished with status=%s", operation, result.get("status"))
    return result
