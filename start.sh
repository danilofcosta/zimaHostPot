#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# Sobe o stack completo com zero configuração.
#
#   1. Gera o .env da raiz (se ainda não existir) com segredos aleatórios e o
#      IP deste servidor em CORS_ORIGINS / NEXT_PUBLIC_API_URL.
#   2. Executa `docker compose up -d --build`.
#
# Uso:
#   ./start.sh              # primeira subida / rebuild
#   ./start.sh --force      # regenera o .env (troca API_KEY e segredo)
#
# Para acompanhar os logs: docker compose logs -f
# ---------------------------------------------------------------------------
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

FORCE=0
if [ "${1:-}" = "--force" ] || [ "${1:-}" = "-f" ]; then
  FORCE=1
  shift
fi

if [ "$FORCE" -eq 1 ]; then
  "$ROOT_DIR/scripts/init-env.sh" --force
else
  "$ROOT_DIR/scripts/init-env.sh"
fi

cd "$ROOT_DIR"
exec docker compose up -d --build
