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
#   .\scripts\init-env.ps1              # cria se não existir, mantém se existir
#   .\scripts\init-env.ps1 -Force       # sobrescreve o .env atual
#   $env:HOST_IP = "192.168.0.10"; .\scripts\init-env.ps1
#
# O IP do servidor também pode ser forçado com a variável de ambiente HOST_IP.
# ---------------------------------------------------------------------------
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$Template = Join-Path $RootDir ".env.example"
$Target = Join-Path $RootDir ".env"

if (-not (Test-Path -LiteralPath $Template)) {
    Write-Error "$Template nao encontrado."
    exit 1
}

if ((Test-Path -LiteralPath $Target) -and -not $Force) {
    Write-Host "[env] .env ja existe; nada a fazer (use -Force para regenerar)."
    exit 0
}

function New-RandomHex {
    param([int]$Bytes = 32)

    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
    }
    finally {
        $rng.Dispose()
    }
    return (-join ($buffer | ForEach-Object { $_.ToString("x2") }))
}

function Get-ServerIp {
    if ($env:HOST_IP) {
        return $env:HOST_IP
    }

    # Prefere a interface que tem o gateway padrão (evita adaptadores virtuais
    # do Docker/Hyper-V/WSL, que normalmente não são a rota da LAN).
    $config = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
        Select-Object -First 1
    if ($config) {
        $address = $config.IPv4Address | Select-Object -First 1
        if ($address -and $address.IPAddress) {
            return $address.IPAddress
        }
    }

    # Fallback: resolve o próprio hostname e escolhe o primeiro IPv4 privado.
    try {
        $candidates = [System.Net.Dns]::GetHostAddresses(
            [System.Net.Dns]::GetHostName()
        ) | Where-Object {
            $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
            -not $_.IPAddressToString.StartsWith("127.") -and
            -not $_.IPAddressToString.StartsWith("169.254.")
        }
        $first = $candidates | Select-Object -First 1
        if ($first) {
            return $first.IPAddressToString
        }
    }
    catch {
        # Sem resolução de nome: cai no loopback.
    }

    return "127.0.0.1"
}

$ApiKey = New-RandomHex
$BetterAuthSecret = New-RandomHex
$ServerIp = Get-ServerIp
$CorsOrigins = "http://${ServerIp}:8080,http://localhost:8080,http://127.0.0.1:8080"
$NextPublicApiUrl = "http://${ServerIp}:6565"

$lines = Get-Content -LiteralPath $Template
$output = foreach ($line in $lines) {
    if ($line -match '^API_KEY=') {
        "API_KEY=$ApiKey"
    }
    elseif ($line -match '^BETTER_AUTH_SECRET=') {
        "BETTER_AUTH_SECRET=$BetterAuthSecret"
    }
    elseif ($line -match '^CORS_ORIGINS=') {
        "CORS_ORIGINS=$CorsOrigins"
    }
    elseif ($line -match '^HOTSPOT_ADMIN_PASSWORD=') {
        "HOTSPOT_ADMIN_PASSWORD=admin"
    }
    elseif ($line -match '^DEFAULT_INTERFACE=') {
        "DEFAULT_INTERFACE=wlan0"
    }
    elseif ($line -match '^NEXT_PUBLIC_API_URL=') {
        "NEXT_PUBLIC_API_URL=$NextPublicApiUrl"
    }
    else {
        $line
    }
}

# Sem BOM: o docker compose lê a primeira linha como chave/valor.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($Target, $output, $utf8NoBom)

Write-Host "[env] .env criado a partir de .env.example."
Write-Host "[env] IP do servidor: $ServerIp"
Write-Host "[env] Painel: http://${ServerIp}:8080  (usuario: casaos, senha: admin)"
Write-Host "[env] API:    http://${ServerIp}:6565"
Write-Host "[env] Edite o .env se quiser trocar a senha inicial ou a interface."
