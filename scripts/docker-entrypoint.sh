#!/bin/sh
# Entrypoint comum da API e da UI: garante os segredos compartilhados antes de
# iniciar o processo principal.
set -eu

if [ -f /usr/local/bin/runtime-env.sh ]; then
  # shellcheck source=/dev/null
  . /usr/local/bin/runtime-env.sh
fi

exec "$@"
