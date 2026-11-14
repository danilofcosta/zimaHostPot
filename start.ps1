# ---------------------------------------------------------------------------
# Sobe o stack completo com zero configuração (Windows/PowerShell).
#
#   1. Gera o .env da raiz (se ainda não existir) com segredos aleatórios e o
#      IP deste servidor em CORS_ORIGINS / NEXT_PUBLIC_API_URL.
#   2. Executa `docker compose up -d --build`.
#
# Uso:
#   .\start.ps1                 # primeira subida / rebuild
#   .\start.ps1 -Force          # regenera o .env (troca API_KEY e segredo)
#
# Para acompanhar os logs: docker compose logs -f
#
# Se o PowerShell bloquear scripts, rode:
#   powershell -ExecutionPolicy Bypass -File .\start.ps1
# ---------------------------------------------------------------------------
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

& (Join-Path $RootDir "scripts\init-env.ps1") -Force:$Force

Push-Location $RootDir
try {
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
