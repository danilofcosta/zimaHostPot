# Zima Hotspot UI

Painel em **Next.js 16 + React 19 + Tailwind CSS 4** para administrar o
hotspot Wi-Fi e os dispositivos da rede. A UI é também o **BFF** do projeto:
o navegador fala apenas com a própria origem e o servidor Next.js conversa com
a API FastAPI (`server/`) usando `X-API-Key`.

## O que o painel faz

- **Login** com usuário e senha (Better Auth, plugin *username*), sem cadastro
  público. A conta inicial é criada só no primeiro boot.
- **Troca de senha obrigatória** no primeiro acesso, com mínimo de 12 caracteres
  e invalidação das outras sessões.
- **Dashboard** com status do hotspot, saúde da API, dispositivos, eventos e
  tráfego (polling de 10 s).
- **Hotspot**: criar, ligar, desligar, reiniciar e remover; SSID, senha, banda,
  canal e interface; QR Code e dados reais da conexão.
- **Dispositivos conectados**: fontes reais (`iw station dump`, `ip neigh`,
  leases DHCP, `nmcli`), com estado explícito (associado, lease, inativo,
  desconectado, indisponível).
- **Dispositivos conhecidos**: histórico persistido, renomear, classificar,
  anotar, bloquear internet, banir e desconectar.
- **Monitoramento**: contadores e taxas derivados de amostras reais, com
  detecção de reset e histórico.
- **Eventos**: linha do tempo persistida de hotspot, rede, dispositivos e
  administração.
- **Compartilhar Wi-Fi**: QR Code e credenciais da configuração salva.
- **Diagnóstico / Sistema**: checagens do host, `nmcli`, banco e backend.
- **Configurações**: conta, troca de senha e logout.

## Arquitetura de segurança

```
browser ──▶ /api/auth/*        Better Auth (cookie de sessão)
        ──▶ /api/hotspot/*     ┐
        ──▶ /api/devices/*     │ sessão + gate de troca de senha
        ──▶ /api/network/*     ├─▶ Python FastAPI  (X-API-Key, server-side)
        ──▶ /api/monitoring/*  │
        ──▶ /api/events/*      │
        ──▶ /api/system/*      ┘
```

- `API_KEY` e `BETTER_AUTH_SECRET` ficam **somente no servidor**.
- Toda rota de proxy exige sessão; enquanto `mustChangePassword` for `true`,
  responde `HTTP 428 password_change_required`.
- `GET /hotspot/config` mascara a senha por padrão. Apenas Hotspot e
  Compartilhar pedem `include_password=true`.

## Requisitos

- Node.js 24 (a imagem usa `node:24-slim`).
- API Python em execução (`HOTSPOT_API_URL`).
- Banco SQLite compartilhado (`DATABASE_PATH`) e o schema em
  `server/db/schema.sql`.

## Como rodar

Com Docker Compose (recomendado), a partir da raiz do repositório:

```bash
docker compose up -d --build
# painel em http://<ip-do-zimaos>:8080
```

Localmente:

```bash
cd ui
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local` mínimo:

```dotenv
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<openssl rand -base64 48>
HOTSPOT_API_URL=http://127.0.0.1:6565
API_KEY=<a mesma chave da API>
DATABASE_PATH=../server/data/database.db
```

## Estrutura

```
src/
├── app/
│   ├── (auth)/                 # /login e /change-password
│   ├── (dashboard)/            # layout autenticado + 10 telas
│   └── api/                    # BFF: auth, conta e proxies
├── components/
│   ├── auth/                   # formulários de login e senha
│   ├── layout/                 # sidebar responsiva e logout
│   ├── pages/                  # uma composição por tela
│   ├── hotspot/                # componentes do hotspot
│   └── ui/                     # botões, cards, campos, toast...
├── hooks/use-polled-data.ts    # polling com pausa/erro
└── lib/
    ├── api.ts                  # client same-origin tipado
    ├── types.ts                # contratos da API
    ├── auth.ts / auth-client.ts
    ├── format.ts
    └── server/                 # db, sessão, proxy, bootstrap
```

## Endpoints do BFF

| Rota | Destino |
| --- | --- |
| `/api/auth/[...all]` | Better Auth (login, logout, sessão, senha) |
| `/api/account/password-changed` | Limpa `mustChangePassword` |
| `/api/hotspot/...` | `/api/v1/hotspot/...` |
| `/api/devices/...` | `/api/v1/devices/...` |
| `/api/network/...` | `/api/v1/network/...` |
| `/api/monitoring/...` | `/api/v1/monitoring/...` (inclui SSE) |
| `/api/events/...` | `/api/v1/events/...` |
| `/api/system/...` | `/api/v1/system/...` |
| `/api/health` | `/health` da API Python |

## Scripts

```bash
npm run dev     # desenvolvimento (Turbopack)
npm run build   # build de produção (standalone)
npm run start   # servir o build
npm run lint    # ESLint
```

## Observações

- O navegador nunca chama a API Python diretamente; não existe CORS nem
  `NEXT_PUBLIC_API_URL` no fluxo.
- O build gera `.next/standalone`; o `Dockerfile.ui` copia esse diretório e o
  schema SQLite.
- `better-sqlite3` é um módulo nativo e está em `serverExternalPackages`.
- A conta inicial (`casaos` / `casaosos`) só é criada se a tabela `user` estiver
  vazia; depois disso nunca é recriada nem redefinida.
