# Zima Hotspot API

API REST profissional em **FastAPI** para controlar um hotspot Wi-Fi via
**NetworkManager (`nmcli`)**. As funções originais de `funs.py` foram
preservadas; novas funções foram adicionadas para inspeção de interfaces,
scan de Wi-Fi e gestão de perfis. A API apenas valida, orquestra e documenta
as chamadas.

## Estrutura

```
server/
├── main.py                         # Entry point (create_app + uvicorn)
├── funs.py                         # Funções nmcli (hotspot, scan, perfis)
├── requirements.txt                # Dependências de runtime (fixadas)
├── requirements-dev.txt            # pytest/httpx para os testes
├── pyproject.toml                  # Configuração do pytest/coverage
├── .env.example
├── db/
│   └── schema.sql                  # Schema SQLite compartilhado com a UI
├── core/
│   ├── config.py                   # Settings + validação de produção
│   ├── database.py                 # Conexão, schema, transações e queries
│   ├── exceptions.py               # Erros de domínio + handlers HTTP
│   ├── logging.py                  # Configuração de logs
│   └── middleware.py               # Request ID, timing e access log (ASGI)
├── models/                         # Schemas Pydantic
├── services/
│   ├── hotspot_service.py          # Camada de serviço do hotspot
│   ├── network_service.py          # Interfaces, scan e perfis
│   ├── net_collector.py            # iw/ip/nmcli/sysfs/dnsmasq (somente leitura)
│   ├── device_service.py           # Descoberta e histórico de dispositivos
│   ├── monitoring_service.py       # Amostras de tráfego e taxas
│   ├── firewall_service.py         # Bloqueio via nftables
│   ├── event_service.py            # Eventos persistidos
│   ├── host_service.py             # Identidade da máquina + placa Wi-Fi
│   ├── system_service.py           # Diagnóstico do host/banco
│   ├── sampler.py                  # Thread de coleta em background
│   └── ...
├── api/
│   ├── deps.py                     # Dependências (API key, services)
│   ├── root.py                     # GET / e GET /health
│   └── v1/                         # Endpoints (hotspot, devices, monitoring...)
└── tests/                          # Suíte pytest
```

Fluxo: `HTTP -> endpoint -> service -> funs.py/net_collector -> host`.

## Instalação

Requer **Linux** com `NetworkManager`/`nmcli` para executar as operações.
Em outros sistemas a API sobe normalmente, mas os endpoints de hotspot
respondem `503 hotspot_backend_unavailable`.

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt   # runtime + pytest/httpx
cp .env.example .env
```

Para executar apenas a API (sem ferramentas de teste), use
`pip install -r requirements.txt`.

## Execução

```bash
# a partir de server/
python main.py

# ou
uvicorn main:app --reload
```

Também funciona a partir da raiz do repositório:

```bash
uvicorn server.main:app --reload
```

- Swagger UI: `http://localhost:6565/docs`
- ReDoc: `http://localhost:6565/redoc`
- OpenAPI: `http://localhost:6565/openapi.json`

### Detecção da máquina e do Wi-Fi no startup

Ao subir, a API lê a identidade da máquina (fabricante/modelo via DMI ou
`/proc/device-tree/model`, SO, kernel, CPU e se está dentro de container) e
procura adaptadores Wi-Fi em `/sys/class/net`, `nmcli` e `iw`. O resultado vai
para o log:

```
Máquina detectada: ZimaBoard 832 · ZimaOS 1.4 · x86_64 (hostname=zima, container=não)
Hardware Wi-Fi: Intel Wireless 8265 / 8275 (wlan0, iwlwifi)
```

Se nenhuma placa Wi-Fi for encontrada, um `WARNING` deixa claro que o hotspot
não vai funcionar até o adaptador/driver aparecer no host. Nada é inventado: o
que o host não expõe vem como `null`. A mesma informação aparece em
`GET /api/v1/system` (`machine` e `wifi`) e como a checagem
`wifi_adapter` em `GET /api/v1/system/diagnostics`.

## Configuração (`.env`)

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `APP_NAME` | `Zima Hotspot API` | Nome exibido na documentação |
| `APP_VERSION` | `1.0.0` | Versão da API |
| `ENVIRONMENT` | `development` | `development`, `staging` ou `production` |
| `HOST` | `0.0.0.0` | Host do uvicorn |
| `PORT` | `8000` | Porta do uvicorn (seu `.env` usa `6565`) |
| `LOG_LEVEL` | `INFO` | Nível de log |
| `DOCS_ENABLED` | `true` em dev, `false` em produção | Habilita `/docs`, `/redoc` e `/openapi.json` |
| `RELOAD` | `false` | Hot reload do uvicorn |
| `API_KEY` | *(vazio)* | Se definido, exige o header `X-API-Key`. **Obrigatório em produção.** |
| `CORS_ORIGINS` | `*` | Origens permitidas, separadas por vírgula. **Produção rejeita `*`.** |
| `ALLOW_INSECURE_PRODUCTION` | `false` | Escape hatch de laboratório: permite produção sem `API_KEY`/com CORS `*` |
| `DEFAULT_INTERFACE` | `wlan0` | Interface padrão |
| `DEFAULT_PROFILE_NAME` | `Hotspot` | Perfil padrão do NetworkManager |
| `HOTSPOT_CONFIG_FILE` | `<server>/data/hotspot.json` | JSON com a última configuração salva |
| `DATA_DIR` | `<server>/data` | Diretório usado pelos dados persistentes |
| `DB_PATH` | `<server>/data/database.db` | Banco SQLite (histórico, eventos e amostras) |
| `MONITOR_INTERVAL_SECONDS` | `10` | Intervalo da coleta em background |
| `MONITOR_RETENTION_HOURS` | `72` | Retenção das amostras de tráfego |
| `EVENT_RETENTION_HOURS` | `168` | Retenção de eventos e conexões encerradas |
| `TRAFFIC_HISTORY_MINUTES` | `60` | Janela padrão do histórico de tráfego |
| `FIREWALL_TABLE` | `zima_hotspot` | Nome da tabela `inet` do nftables |
| `ZIMAOS_API_URL` / `ZIMAOS_API_KEY` | *(vazio)* | Integração opcional; a chave é enviada como `Bearer` |

Em **produção** a API recusa iniciar quando `API_KEY` está vazia ou
`CORS_ORIGINS` contém `*`. A documentação interativa também fica desabilitada
por padrão. Use `ALLOW_INSECURE_PRODUCTION=true` somente em uma rede isolada.

## Endpoints

| Método | Rota | Função em `funs.py` | Descrição |
| --- | --- | --- | --- |
| `GET` | `/` | — | Metadados do serviço |
| `GET` | `/health` | — | Saúde do serviço e disponibilidade do `nmcli` |
| `POST` | `/api/v1/hotspot` | `create_hostapot` | Cria e ativa um hotspot |
| `POST` | `/api/v1/hotspot/start` | `start_hotspot` | Liga um perfil existente ou cria um |
| `POST` | `/api/v1/hotspot/stop` | `stop_hotspot` | Desliga mantendo o perfil salvo |
| `POST` | `/api/v1/hotspot/restart` | `restart_hotspot` | Reinicia um perfil salvo (`down` + `up`) |
| `DELETE` | `/api/v1/hotspot` | `stop_hostapd` | Desliga e opcionalmente apaga o perfil |
| `GET` | `/api/v1/hotspot/status` | `get_hotspot_status` | Status atual do hotspot |
| `GET` | `/api/v1/hotspot/config` | — | Configuração salva (SSID, senha, banda...) |
| `PUT` | `/api/v1/hotspot/config` | — | Salva a configuração em JSON |
| `DELETE` | `/api/v1/hotspot/config` | — | Apaga o JSON e volta aos padrões |
| `GET` | `/api/v1/hotspot/clients` | `list_hotspot_clients` | Clientes conectados (hostname via DHCP + atividade) |
| `GET` | `/api/v1/network/interfaces` | `list_interfaces` | Interfaces conhecidas pelo NetworkManager |
| `GET` | `/api/v1/network/interfaces/{interface}` | `get_interface_details` | Detalhes/IPv4 de uma interface |
| `GET` | `/api/v1/network/wifi/networks` | `scan_wifi_networks` | Escaneia redes Wi-Fi visíveis |
| `GET` | `/api/v1/network/wifi/channels` | `analyze_wifi_channels` | Ocupação dos canais e canal recomendado |
| `GET` | `/api/v1/network/profiles` | `list_profiles` | Perfis de conexão salvos |
| `GET` | `/api/v1/network/profiles/{profile_name}` | `get_profile_details` | Configurações de um perfil |
| `DELETE` | `/api/v1/network/profiles/{profile_name}` | `delete_profile` | Apaga um perfil salvo |
| `GET` | `/api/v1/devices/connected` | `collect_entries` | Aparelhos vistos agora (somente leitura) |
| `GET` | `/api/v1/devices/known` | `list_known` | Histórico persistido, com busca e filtros |
| `GET` | `/api/v1/devices/{mac}` | `get_device` | Endereços, conexões e eventos do aparelho |
| `PATCH` | `/api/v1/devices/{mac}` | `update_device` | Apelido, tipo, notas e "conhecido" |
| `POST` | `/api/v1/devices/{mac}/ban` | `set_banned` | Bloqueia internet e tenta desconectar |
| `POST` | `/api/v1/devices/{mac}/internet-block` | `set_internet_blocked` | Bloqueia/libera somente a internet |
| `POST` | `/api/v1/devices/{mac}/disconnect` | `disconnect_device` | Remove a estação do Wi-Fi |
| `GET` | `/api/v1/monitoring` | `snapshot` | Contadores e taxas atuais |
| `GET` | `/api/v1/monitoring/history` | `history` | Amostras de tráfego persistidas |
| `GET` | `/api/v1/monitoring/stream` | `snapshot` | SSE com uma amostra por intervalo |
| `GET` | `/api/v1/events` | — | Eventos persistidos |
| `GET` | `/api/v1/system` | `system_info` | Máquina, Wi-Fi, host, banco e backend |
| `GET` | `/api/v1/system/diagnostics` | `diagnostics` | Checagens com dicas de correção |

`GET /devices/connected` e `GET /monitoring` **não escrevem no banco**: apenas
o coletor em background persiste histórico. `last_seen` de um dispositivo
significa "última observação ativa" (Wi-Fi associado ou ARP ativo); um lease
DHCP isolado ou uma entrada ARP `STALE` não marca o aparelho como online.

### Exemplos

Criar hotspot:

```bash
curl -X POST http://localhost:6565/api/v1/hotspot \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Zima-Hotspot",
    "password": "super-secret-123",
    "interface": "wlan0",
    "band": "bg",
    "channel": 6,
    "use_sudo": true
  }'
```

Ligar hotspot:

```bash
curl -X POST http://localhost:6565/api/v1/hotspot/start \
  -H "Content-Type: application/json" \
  -d '{"name": "Zima-Hotspot", "password": "super-secret-123"}'
```

Status:

```bash
curl "http://localhost:6565/api/v1/hotspot/status?interface=wlan0&profile_name=Hotspot"
```

Desligar mantendo o perfil:

```bash
curl -X POST http://localhost:6565/api/v1/hotspot/stop \
  -H "Content-Type: application/json" \
  -d '{"interface": "wlan0", "profile_name": "Hotspot"}'
```

Remover tudo:

```bash
curl -X DELETE "http://localhost:6565/api/v1/hotspot?delete_profile=true"
```

Reiniciar o hotspot:

```bash
curl -X POST http://localhost:6565/api/v1/hotspot/restart \
  -H "Content-Type: application/json" \
  -d '{"interface": "wlan0", "profile_name": "Hotspot"}'
```

Clientes conectados (tabela ARP/neighbor + hostname do DHCP):

```bash
curl "http://localhost:6565/api/v1/hotspot/clients?interface=wlan0"
```

Interfaces e detalhes:

```bash
curl http://localhost:6565/api/v1/network/interfaces
curl http://localhost:6565/api/v1/network/interfaces/wlan0
```

Escanear redes Wi-Fi (use `rescan=false` para reaproveitar o cache):

```bash
curl "http://localhost:6565/api/v1/network/wifi/networks?interface=wlan0&rescan=true"
```

Analisar canais e recomendar o menos congestionado (as duas bandas por padrão;
use `band=bg` ou `band=a` para filtrar):

```bash
curl "http://localhost:6565/api/v1/network/wifi/channels?interface=wlan0"
curl "http://localhost:6565/api/v1/network/wifi/channels?interface=wlan0&band=bg"
```

A resposta traz `channels` com a ocupação de cada canal candidato e
`recommendations` com o melhor canal de cada banda. Enquanto o hotspot está
ligado o rádio fica preso ao canal atual, então o scan pode cair para o cache
do NetworkManager (`scan_mode=cached`).

Perfis salvos:

```bash
curl http://localhost:6565/api/v1/network/profiles
curl "http://localhost:6565/api/v1/network/profiles?type=802-11-wireless"
curl http://localhost:6565/api/v1/network/profiles/Hotspot
curl -X DELETE http://localhost:6565/api/v1/network/profiles/Hotspot
```

Com API key habilitada, adicione `-H "X-API-Key: sua-chave"`.

## Formato de erro

Todas as falhas usam o mesmo envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      {
        "type": "string_too_short",
        "loc": ["body", "password"],
        "msg": "String should have at least 8 characters",
        "input": "123"
      }
    ],
    "request_id": "6f1c1e2b8a9d4f0e9d3c7a1b2c3d4e5f"
  }
}
```

| HTTP | `code` | Quando acontece |
| --- | --- | --- |
| `401` | `unauthorized` | `API_KEY` configurada e header ausente/incorreto |
| `404` | `profile_not_found` | Perfil do NetworkManager não existe |
| `422` | `validation_error` | Payload/query inválidos |
| `422` | `invalid_hotspot_configuration` | Regra de negócio inválida (ex.: SSID > 32 bytes) |
| `502` | `hotspot_operation_failed` | `nmcli` falhou ao executar a operação |
| `503` | `hotspot_backend_unavailable` | `nmcli`/`ip` ausente ou timeout |
| `500` | `internal_error` | Erro inesperado |

Toda resposta inclui `X-Request-ID` e `X-Process-Time-Ms`.

## Observações

- Operações que alteram o NetworkManager (`create`, `start`, `stop`,
  `restart`, `delete_profile`) são serializadas por um lock: duas requisições
  concorrentes não recriam o mesmo perfil ao mesmo tempo.
- `use_sudo=true` só usa `sudo -n` quando o processo **não** é root e o
  binário `sudo` existe. Como root (container) nada é prefixado; sem `sudo`
  o comando é tentado diretamente, sem travar esperando senha.
- `GET /api/v1/hotspot/clients` usa `ip neigh` (iproute2), não `nmcli`; em
  hosts sem o comando a resposta é `503`. O hostname vem dos arquivos de lease
  do dnsmasq (vários caminhos são tentados, incluindo
  `/var/lib/NetworkManager/dnsmasq-*.leases`); se nenhum for legível, o campo
  fica `null`.
- Valores de rede nunca são inventados: quando o NetworkManager não informa
  IPv4/gateway/faixa DHCP, a API devolve `null` em vez de `10.42.0.x`.
- Desbloquear/desbanir é *best-effort*: se o nftables não estiver disponível,
  as flags do banco são limpas mesmo assim (a regra também não existe).
- A resposta de criação inclui a senha e o payload do QR Code, exatamente como
  retornado por `create_hostapot`. Proteja esse endpoint (use `API_KEY`) e
  evite expô-lo publicamente.
- Em produção, defina `API_KEY`, restrinja `CORS_ORIGINS` e mantenha
  `DOCS_ENABLED=false` (já é o padrão). A API se recusa a iniciar fora dessas
  condições, a menos que `ALLOW_INSECURE_PRODUCTION=true` seja usado.

## Testes

A suíte usa `pytest` e cobre configuração, banco/transações, middleware,
descoberta de dispositivos, retenção, amostragem de tráfego, `sudo`/locks do
`funs.py` e os endpoints HTTP principais.

```bash
# a partir de server/ (Linux)
.venv/bin/python -m pytest
.venv/bin/python -m pytest --cov --cov-report=term-missing

# Windows (PowerShell)
.\.venv\Scripts\python.exe -m pytest
```

Os testes usam um banco SQLite temporário (`DB_PATH` apontando para um
diretório em `%TEMP%`) e substituem `iw`/`ip`/`nmcli` por fakes: nenhum
comando privilegiado é executado e nenhum dado real é tocado.

## Docker / Compose (ZimaOS)

O `Dockerfile` na raiz empacota **somente a API** (`server/`). O
`Dockerfile.ui` empacota o painel Next.js, e o `compose.yml` sobe os dois
serviços (API na `6565`, UI na `8080`).

Pré-requisitos no host: Docker + Docker Compose, NetworkManager ativo e o
socket `/run/dbus/system_bus_socket` presente.

```bash
# na raiz do projeto
./start.sh            # Linux/ZimaOS/macOS
.\start.ps1           # Windows (PowerShell)
```

> Se `./start.sh` responder "permission denied", rode `sh start.sh`. No Windows,
> se o PowerShell bloquear scripts, use
> `powershell -ExecutionPolicy Bypass -File .\start.ps1`.

Não é preciso criar o `.env` na mão. O `start.sh`/`start.ps1` gera o arquivo
automaticamente quando ele não existe, com estes padrões:

| Variável | Padrão gerado |
| --- | --- |
| `API_KEY` | 32 bytes aleatórios |
| `BETTER_AUTH_SECRET` | 32 bytes aleatórios |
| `CORS_ORIGINS` | `http://<ip-do-servidor>:8080` + `localhost` |
| `NEXT_PUBLIC_API_URL` | `http://<ip-do-servidor>:6565` |
| `HOTSPOT_ADMIN_PASSWORD` | `admin` (troca obrigatória no 1º login) |
| `DEFAULT_INTERFACE` | `wlan0` |

O IP é o da interface com rota padrão; use `HOST_IP=192.168.0.10 ./start.sh`
(ou `$env:HOST_IP = "192.168.0.10"; .\start.ps1`) para forçar outro. O login
inicial é `casaos` / `admin`.

Para gerar apenas o `.env` (sem subir os containers):

```bash
./scripts/init-env.sh          # Linux/ZimaOS/macOS
.\scripts\init-env.ps1         # Windows
```

O `.env` existente nunca é sobrescrito; para regenerá-lo (novos segredos):

```bash
./start.sh --force
```

Depois disso, para acompanhar os containers:

```bash
docker compose logs -f
```

A API fica em `http://<ip-do-zimaos>:6565` (Swagger em `/docs`).

O `compose.yml` usa:

- `network_mode: host` para o `nmcli` enxergar as interfaces reais do host;
- bind mount de `/run/dbus` para falar com o NetworkManager do host;
- bind mount somente leitura de `/var/lib/NetworkManager` e
  `/run/NetworkManager` para ler os leases do dnsmasq e exibir o hostname dos
  clientes;
- `user: "0:0"` para o polkit autorizar o `nmcli` — é o equivalente ao
  `sudo` que você usava ao rodar o servidor direto no host.

> O `.env` da raiz é lido pelo `docker compose` e alimenta os dois serviços:
> `API_KEY`/`CORS_ORIGINS`/`DEFAULT_INTERFACE` na API, e
> `BETTER_AUTH_SECRET`/`HOTSPOT_ADMIN_PASSWORD` na UI. Fora do Docker, a API
> continua lendo `server/.env` quando executada diretamente.

Teste o backend de rede dentro do container:

```bash
docker compose exec zima-hotspot nmcli general status
docker compose exec zima-hotspot nmcli device status
```

Se o `nmcli` não conectar, confira o socket no host:

```bash
ls -l /run/dbus/system_bus_socket
```

Se o NetworkManager do host exigir autorização mesmo para root, adicione
`privileged: true` ao serviço (com cautela) ou uma regra polkit.

### UI apontando para o ZimaOS

No PC local, configure a URL da API em `ui/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://<ip-do-zimaos>:6565
```

Ou use o diálogo de configuração da API na própria interface.

Se você definir `API_KEY` em `server/.env`, informe a mesma chave nesse
diálogo. Se restringir `CORS_ORIGINS`, inclua a origem onde a UI roda
(por exemplo, `http://localhost:3000`).

> Pare o servidor que hoje roda como `sudo` no host antes de subir o
> container, pois os dois usam a porta 6565.
