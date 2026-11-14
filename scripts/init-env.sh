#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# Cria o `.env` da raiz a partir do `.env.example` quando ele ainda não existe.
#
# Valores padrão gerados:
#   API_KEY                 -> 32 bytes aleatórios
#   BETTER_AUTH_SECRET      -> 32 bytes aleatórios
#   CORS_ORIGINS            -> http://<ip-do-servidor>:8080 + localhost
#   NEXT_PUBLIC_API_URL     -> http://<ip-do-servidor>:6565
#   HOTSPOT_ADMIN_PASSWORD  -> admin
#   DEFAULT_INTERFACE       -> wlan0
#
# Uso:
#   ./scripts/init-env.sh            # cria se não existir, mantém se existir
#   ./scripts/init-env.sh --force    # sobrescreve o .env atual
#   HOST_IP=192.168.0.10 ./scripts/init-env.sh
#
# O IP do servidor também pode ser forçado com a variável HOST_IP.
# ---------------------------------------------------------------------------
set -eu

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    --help|-h)
      sed -n '3,19p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "[env] Argumento desconhecido: $arg (use --help)." >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TEMPLATE="$ROOT_DIR/.env.example"
TARGET="$ROOT_DIR/.env"

if [ ! -f "$TEMPLATE" ]; then
  echo "[env] $TEMPLATE não encontrado." >&2
  exit 1
fi

if [ -f "$TARGET" ] && [ "$FORCE" -ne 1 ]; then
  echo "[env] .env já existe; nada a fazer (use --force para regenerar)."
  exit 0
fi

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif [ -r /dev/urandom ] && command -v od >/dev/null 2>&1; then
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
  else
    # Último recurso (sem openssl e sem /dev/urandom).
    printf '%s-%s' "$(date +%s)" "$$" | cksum | tr -cd '0-9'
  fi
}

detect_ip() {
  if [ -n "${HOST_IP:-}" ]; then
    printf '%s' "$HOST_IP"
    return 0
  fi

  ip=""
  if command -v ip >/dev/null 2>&1; then
    ip=$(ip -4 route get 1.1.1.1 2>/dev/null \
      | awk '{ for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }')
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{ print $1 }')
  fi
  if [ -z "$ip" ] && command -v ifconfig >/dev/null 2>&1; then
    ip=$(ifconfig 2>/dev/null \
      | awk '/inet / { print $2 }' \
      | grep -v '^127\.' \
      | head -n 1)
  fi

  printf '%s' "${ip:-127.0.0.1}"
}

API_KEY=$(random_hex)
BETTER_AUTH_SECRET=$(random_hex)
SERVER_IP=$(detect_ip)
CORS_ORIGINS="http://$SERVER_IP:8080,http://localhost:8080,http://127.0.0.1:8080"
NEXT_PUBLIC_API_URL="http://$SERVER_IP:6565"

TMP="$TARGET.tmp.$$"
trap 'rm -f "$TMP"' EXIT INT TERM

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    API_KEY=*) line="API_KEY=$API_KEY" ;;
    BETTER_AUTH_SECRET=*) line="BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" ;;
    CORS_ORIGINS=*) line="CORS_ORIGINS=$CORS_ORIGINS" ;;
    HOTSPOT_ADMIN_PASSWORD=*) line="HOTSPOT_ADMIN_PASSWORD=admin" ;;
    DEFAULT_INTERFACE=*) line="DEFAULT_INTERFACE=wlan0" ;;
    NEXT_PUBLIC_API_URL=*) line="NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" ;;
  esac
  printf '%s\n' "$line"
done < "$TEMPLATE" > "$TMP"

mv "$TMP" "$TARGET"
trap - EXIT INT TERM
chmod 600 "$TARGET" 2>/dev/null || true

echo "[env] .env criado a partir de .env.example."
echo "[env] IP do servidor: $SERVER_IP"
echo "[env] Painel: http://$SERVER_IP:8080  (usuário: casaos, senha: admin)"
echo "[env] API:    http://$SERVER_IP:6565"
echo "[env] Edite o .env se quiser trocar a senha inicial ou a interface."
