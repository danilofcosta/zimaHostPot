#!/bin/sh
# ---------------------------------------------------------------------------
# Gera (uma única vez) os segredos compartilhados entre a API e a UI.
#
# O arquivo vive no volume compartilhado (./server/data no host), por isso os
# dois containers leem exatamente os mesmos valores mesmo sem `.env`:
#
#   API_KEY                 -> 32 bytes aleatórios
#   BETTER_AUTH_SECRET      -> 32 bytes aleatórios
#   HOTSPOT_ADMIN_PASSWORD  -> admin
#   DEFAULT_INTERFACE       -> wlan0
#   CORS_ORIGINS            -> http://<ip-do-servidor>:8080 + localhost
#   NEXT_PUBLIC_API_URL     -> http://<ip-do-servidor>:6565
#
# Variáveis já definidas no ambiente (pelo compose, `.env` ou stack) sempre
# vencem: o arquivo só preenche o que estiver vazio/ausente.
#
# Uso (via entrypoint das imagens): `. /usr/local/bin/runtime-env.sh`
# ---------------------------------------------------------------------------
set -eu

ENV_FILE="${RUNTIME_ENV_FILE:-/app/data/runtime.env}"
DATA_DIR=$(dirname "$ENV_FILE")

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif [ -r /dev/urandom ] && command -v od >/dev/null 2>&1; then
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
  else
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

write_candidate() {
  target=$1
  server_ip=$(detect_ip)
  {
    printf 'API_KEY=%s\n' "$(random_hex)"
    printf 'BETTER_AUTH_SECRET=%s\n' "$(random_hex)"
    printf 'HOTSPOT_ADMIN_PASSWORD=admin\n'
    printf 'DEFAULT_INTERFACE=wlan0\n'
    printf 'CORS_ORIGINS=http://%s:8080,http://localhost:8080,http://127.0.0.1:8080\n' "$server_ip"
    printf 'NEXT_PUBLIC_API_URL=http://%s:6565\n' "$server_ip"
  } > "$target"
  chmod 600 "$target" 2>/dev/null || true
}

ensure_env_file() {
  mkdir -p "$DATA_DIR" 2>/dev/null || true
  [ -f "$ENV_FILE" ] && return 0

  candidate="$ENV_FILE.tmp.$$"
  write_candidate "$candidate"

  # link()/ln é atômico: só um container publica o arquivo; o outro lê o mesmo
  # conteúdo, então API e UI nunca ficam com segredos diferentes.
  if ln "$candidate" "$ENV_FILE" 2>/dev/null; then
    rm -f "$candidate"
    echo "[runtime-env] Segredos gerados em $ENV_FILE."
    return 0
  fi
  rm -f "$candidate"

  if [ -f "$ENV_FILE" ]; then
    return 0
  fi

  # Filesystem sem suporte a hard link (alguns bind mounts): lock + rename.
  lock="$ENV_FILE.lock"
  attempt=0
  while [ "$attempt" -lt 20 ]; do
    if mkdir "$lock" 2>/dev/null; then
      trap 'rmdir "$lock" 2>/dev/null || true' EXIT INT TERM
      if [ ! -f "$ENV_FILE" ]; then
        candidate="$ENV_FILE.tmp.$$"
        write_candidate "$candidate"
        mv "$candidate" "$ENV_FILE"
        echo "[runtime-env] Segredos gerados em $ENV_FILE."
      fi
      rmdir "$lock" 2>/dev/null || true
      trap - EXIT INT TERM
      return 0
    fi

    # Outro container está gerando o arquivo: espera até ~10s.
    [ -f "$ENV_FILE" ] && return 0
    sleep 0.5 2>/dev/null || sleep 1
    attempt=$((attempt + 1))
  done

  if [ ! -f "$ENV_FILE" ]; then
    echo "[runtime-env] Não foi possível criar $ENV_FILE." >&2
    return 1
  fi
}

ensure_env_file

# Aplica os valores do arquivo sem sobrescrever o que veio do ambiente.
while IFS='=' read -r key value; do
  case "$key" in
    ''|'#'*) continue ;;
  esac
  if [ -z "$(printenv "$key" 2>/dev/null || true)" ]; then
    export "$key=$value"
  fi
done < "$ENV_FILE"

# A UI lê INITIAL_ADMIN_PASSWORD; o arquivo compartilhado usa o mesmo nome do
# `.env` (HOTSPOT_ADMIN_PASSWORD).
if [ -z "${INITIAL_ADMIN_PASSWORD:-}" ] && [ -n "${HOTSPOT_ADMIN_PASSWORD:-}" ]; then
  export INITIAL_ADMIN_PASSWORD="$HOTSPOT_ADMIN_PASSWORD"
fi
