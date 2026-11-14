# syntax=docker/dockerfile:1

FROM python:3.12-slim

# Python: sem buffer e sem .pyc (logs aparecem na hora no `docker logs`).
# HOST/PORT são os defaults do servidor; o compose pode sobrescrever.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive \
    HOST=0.0.0.0 \
    PORT=6565 \
    DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket

WORKDIR /app

# `network-manager` fornece o nmcli. O container NÃO inicia um NetworkManager
# próprio: o nmcli apenas conversa com o NetworkManager do host via D-Bus.
# `pciutils` (lspci) permite nomear a placa Wi-Fi no startup; sem ele a
# detecção ainda funciona por sysfs/nmcli, mas mostra apenas o vendor id.
# O policy-rc.d evita que os postinst do apt tentem subir serviços no build.
RUN set -eux; \
    printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        dbus \
        iproute2 \
        network-manager \
        pciutils; \
    rm -f /usr/sbin/policy-rc.d; \
    rm -rf /var/lib/apt/lists/*

# Copia primeiro só as dependências para aproveitar o cache de layers.
COPY server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Agora o servidor completo (main.py, funs.py, api/, core/, models/, services/).
# `server/.env` fica de fora via .dockerignore; use variáveis de ambiente.
COPY server/ /app/

EXPOSE 6565

# O /health responde mesmo quando o nmcli está indisponível (status "degraded"),
# então ele serve para saber se o processo HTTP está de pé.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import os, sys, urllib.request; port = os.getenv('PORT', '6565'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=4).status == 200 else 1)"]

CMD ["python", "-u", "main.py"]
