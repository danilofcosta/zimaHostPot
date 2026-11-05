# Zima Hotspot UI

Painel em **Next.js 16 + React 19 + Tailwind CSS 4** para gerenciar o hotspot
Wi-Fi através da API FastAPI do projeto (`server/`).

## O que o painel faz

- Mostra o **status em tempo real** do hotspot (ativo/inativo, IP, interface,
  perfil e estado do dispositivo), com atualização automática a cada 5 s.
- Exibe a **saúde da API** no topo (`API online`, `nmcli indisponível` ou
  `API offline`).
- **Cria e ativa** um hotspot com SSID, senha, interface, perfil, banda
  (2,4/5 GHz), canal e opção de sudo.
- **Liga** um perfil existente, **desliga** mantendo o perfil e **remove** o
  hotspot apagando o perfil do NetworkManager (com confirmação).
- Gera **senha forte** com um clique.
- Mostra **QR Code** de conexão, dados de rede (IP, gateway, MAC, faixa DHCP)
  e botões de copiar SSID, senha e payload do QR Code.
- Permite configurar **URL da API** e **API key** (`X-API-Key`) em runtime;
  as preferências ficam no `localStorage`.

## Requisitos

- Node.js 20+ (recomendado 22).
- API rodando (por padrão em `http://localhost:6565`).

## Como rodar

Na pasta `server/`:

```bash
python main.py
```

Na pasta `ui/`:

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Configuração

Crie/edite `.env.local` (ou use o `.env.example`):

```env
NEXT_PUBLIC_API_URL=http://localhost:6565
```

Também é possível trocar a URL e informar a API key pelo botão
**Configurações** no painel, sem reiniciar o app. A chave só é necessária se
`API_KEY` estiver definida no servidor.

> `NEXT_PUBLIC_*` é embutida no build. Para produção, defina a variável antes de
> `npm run build`.

## Estrutura

```
src/
├── app/
│   ├── layout.tsx          # metadata, fonte e tema
│   ├── page.tsx            # composição da página
│   └── globals.css         # tema, scrollbar e animações
├── components/
│   ├── hotspot/
│   │   ├── hotspot-dashboard.tsx   # orquestra estado e ações
│   │   ├── dashboard-header.tsx    # logo, health pill, docs
│   │   ├── status-card.tsx         # status + polling
│   │   ├── hotspot-form.tsx        # criação do hotspot
│   │   ├── control-panel.tsx       # ligar/desligar/remover
│   │   ├── connection-details.tsx  # QR Code e dados da rede
│   │   ├── api-settings-dialog.tsx
│   │   └── confirm-dialog.tsx
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── field.tsx
│   │   ├── modal.tsx
│   │   └── toast.tsx
│   └── icons.tsx
├── hooks/
│   ├── use-hotspot.ts       # polling, mutações e erros
│   ├── use-api-config.ts    # URL/API key persistidas
│   └── use-toasts.ts
└── lib/
    ├── api.ts               # client tipado da API
    ├── types.ts             # contratos espelhando o backend
    ├── hotspot-form.ts      # defaults e validação do formulário
    └── utils.ts
```

Fluxo: **componentes → useHotspot → HotspotApi → FastAPI (`/api/v1/hotspot`)**.

## Endpoints usados

| Ação no painel | Requisição |
| --- | --- |
| Status / polling | `GET /api/v1/hotspot/status` |
| Saúde | `GET /health` |
| Criar | `POST /api/v1/hotspot` |
| Ligar | `POST /api/v1/hotspot/start` |
| Desligar | `POST /api/v1/hotspot/stop` |
| Remover | `DELETE /api/v1/hotspot?delete_profile=true` |

## Scripts

```bash
npm run dev     # desenvolvimento (Turbopack)
npm run build   # build de produção
npm run start   # servir o build
npm run lint    # ESLint
```

## Observações

- O servidor já libera CORS por padrão (`CORS_ORIGINS=*`). Em produção,
  restrinja essa variável no backend.
- Se a UI for servida via HTTPS, a API também precisa estar em HTTPS para
  evitar bloqueio de mixed content.
- O `nmcli` só existe em Linux com NetworkManager. Em outros sistemas a API
  responde `503` e o painel sinaliza `nmcli indisponível`.
