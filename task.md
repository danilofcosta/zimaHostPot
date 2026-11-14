# Backlog — Zima Hotspot

Lista de tarefas derivada da análise do projeto (API FastAPI + painel Next.js).

**Legenda**

- **P0** — fazer antes de expor na rede (segurança)
- **P1** — confiabilidade e correção de comportamento
- **P2** — produto, qualidade e manutenção
- `[ ]` pendente · `[x]` feito · `[~]` em andamento

---

## P0 — Segurança

### [ ] P0-1 · Exigir API key
**Por quê:** `server/.env` define apenas `PORT`; a API sobe em `network_mode: host` na porta 6565 e qualquer máquina da rede pode chamá-la.

**Onde:** `server/.env`, `compose.yml`, `ui/src/components/hotspot/api-settings-dialog.tsx`

**Passos**
1. Gerar uma chave forte e definir `API_KEY=<chave>` em `server/.env`.
2. Informar a mesma chave no painel (botão **Configurações** → API key).
3. Documentar no `server/README.md` que a UI precisa da chave quando ela está ativa.

**Aceite:** sem `X-API-Key` os endpoints de `/api/v1/*` retornam `401 unauthorized`; com a chave, funcionam normalmente.

---

### [ ] P0-2 · Restringir CORS e desabilitar docs em produção
**Por quê:** `ENVIRONMENT=production` convive com `CORS_ORIGINS=*` e `DOCS_ENABLED=true`.

**Onde:** `server/.env`, `compose.yml`, `server/core/config.py`

**Passos**
1. `CORS_ORIGINS=http://<ip-ou-host-da-ui>:8080` (lista explícita, sem `*`).
2. `DOCS_ENABLED=false` — ou manter `true` apenas se a documentação for pública de propósito.
3. Avaliar um aviso no startup quando `is_production` e `cors_origins` contiver `*`.

**Aceite:** requisição de origem não listada é bloqueada pelo browser; `/docs` responde 404 em produção.

---

### [ ] P0-3 · Parar de expor a senha do Wi-Fi em texto puro
**Por quê:** `GET /api/v1/hotspot/config` devolve `password`, e o arquivo `server/data/hotspot.json` guarda a senha em claro.

**Onde:** `server/api/v1/endpoints/hotspot.py:77`, `server/services/hotspot_config_service.py`, `server/models/hotspot_config.py`, `ui/src/lib/types.ts`

**Passos**
1. Decidir o comportamento: (a) omitir/mascarar `password` no `GET`, ou (b) manter e exigir `API_KEY` obrigatoriamente.
2. Se mascarar, ajustar `formValuesFromConfig` para não sobrescrever a senha digitada com `"********"`.
3. Avaliar persistir apenas SSID/interface/banda/canal e nunca a senha.
4. Atualizar README e tipos da UI.

**Aceite:** um `GET /config` sem credencial não revela a senha; a UI continua permitindo criar/ligar o hotspot.

---

### [ ] P0-4 · Remover o `.env` legado da raiz
**Por quê:** `.env` na raiz contém `HOTSPOT_ADMIN_PASSWORD`, herança do `hotspot.py` antigo, sem uso pela API atual.

**Onde:** `.env` (raiz)

**Passos**
1. Confirmar que nenhum arquivo lê essa variável (`grep`).
2. Apagar o arquivo e registrar no README que a configuração fica em `server/.env`.

**Aceite:** nenhuma referência a `HOTSPOT_ADMIN_PASSWORD`; compose continua subindo.

---

## P1 — Correção e confiabilidade

### [ ] P1-1 · Status do hotspot deve validar o perfil, não só a interface
**Por quê:** `get_hotspot_status` marca `active: true` quando qualquer conexão está ativa em `wlan0` (ex.: Wi-Fi doméstico), fazendo a UI exibir "Hotspot ativo" e pollar clientes indevidamente.

**Onde:** `server/funs.py:190` (`get_hotspot_status`), `server/funs.py:123` (`stop_hostapd`)

**Passos**
1. Considerar ativo apenas quando `NAME == profile_name` **ou** a conexão ativa for do tipo hotspot no perfil esperado.
2. Revisar a mesma heurística em `stop_hostapd` (`was_active`).
3. Adicionar teste cobrindo os dois casos.

**Aceite:** com `wlan0` conectado a uma rede comum, `GET /hotspot/status` retorna `active: false`.

---

### [ ] P1-2 · Resolver `use_sudo` (implementar ou remover)
**Por quê:** em `funs.py` o bloco do `sudo` está comentado; a flag percorre schema, query e UI sem efeito nenhum.

**Onde:** `server/funs.py:11-19`, `server/models/hotspot.py`, `server/api/v1/endpoints/*.py`, `ui/src/components/hotspot/hotspot-form.tsx`

**Passos (escolher uma opção)**
- **A — implementar:** `cmd = ["sudo", "-n", *cmd]` quando `sudo=True`; documentar que exige sudoers sem senha no host.
- **B — remover:** eliminar `use_sudo` dos modelos, endpoints, client e UI; no Docker o container já roda como root.

**Aceite:** nenhuma opção da UI/documentação promete um comportamento que não existe.

---

### [ ] P1-3 · Tornar SSID/senha obrigatórios em `POST /hotspot/start`
**Por quê:** `HotspotStartRequest` tem defaults `MeuHotspot` / `MinhaSenha123`; um POST sem body cria uma rede com senha conhecida.

**Onde:** `server/models/hotspot.py:105`, `server/api/v1/endpoints/hotspot.py:182`

**Passos**
1. Remover os defaults de `name` e `password`, ou preencher a partir de `HotspotConfigService.load()` quando ausentes.
2. Se a config salva estiver vazia (`is_default`), retornar `422`.

**Aceite:** `POST /api/v1/hotspot/start` sem body não cria rede com senha padrão.

---

### [ ] P1-4 · Não inventar dados de rede quando o `nmcli` falha
**Por quê:** `create_hostapot` usa `10.42.0.1/24`, gateway = IP e `dhcp_range` hardcoded como fallback; a UI exibe isso como real.

**Onde:** `server/funs.py:89-118`, `server/models/hotspot.py`

**Passos**
1. Tornar `ipv4_address`, `ipv4_cidr`, `gateway`, `dhcp_range` opcionais (`null`) quando indisponíveis.
2. Propagar `null` no `InterfaceDetails` e tratar na UI (`connection-details.tsx`) com "—".
3. Nunca fabricar faixa DHCP.

**Aceite:** com detalhe indisponível, a resposta tem `null` e a UI não mostra valores fictícios.

---

### [ ] P1-5 · Recarregar a configuração salva quando a API voltar
**Por quê:** `api.getConfig()` roda só no mount; se a API estiver offline nesse instante, o SSID/perfil salvos nunca são restaurados sem refresh da página.

**Onde:** `ui/src/components/hotspot/hotspot-dashboard.tsx:67`

**Passos**
1. Disparar o carregamento quando `health` passar de `null`/offline para online.
2. Evitar sobrescrever o formulário se o usuário já o editou (flag `dirty`).

**Aceite:** abrir a UI com a API desligada, ligar a API e ver o formulário preenchido sem recarregar.

---

### [ ] P1-6 · Criar testes automatizados
**Por quê:** não há nenhum teste; a API executa operações privilegiadas no host.

**Onde:** raiz do repo (`server/tests/`), `requirements-dev.txt` ou `pyproject.toml`

**Passos**
1. Adicionar `pytest` + `httpx` (TestClient).
2. Cobrir parsers puros: `_split_terse`, `_parse_leases`, `_parse_neigh_output`, `_build_channel_analysis`, `_ip_sort_key`.
3. Cobrir endpoints com `subprocess.run` mockado: create/start/stop/status/config e tradução de erros (422/502/503/404).
4. Opcional: teste de contrato do client TS (Vitest) para o parsing do envelope de erro.

**Aceite:** `pytest` verde e executando em CI.

---

### [ ] P1-7 · Fixar dependências Python
**Por quê:** `requirements.txt` usa `>=`; builds não são reprodutíveis.

**Onde:** `server/requirements.txt`

**Passos**
1. Fixar versões exatas (`fastapi==x.y.z`, `uvicorn==...`, `python-dotenv==...`).
2. Opcional: gerar `requirements.lock` com `pip-compile`.
3. Validar build da imagem `Dockerfile`.

**Aceite:** dois builds consecutivos instalam o mesmo conjunto de versões.

---

### [ ] P1-8 · Versionar o projeto (git)
**Por quê:** o diretório não é um repositório git; não há histórico nem revisão.

**Onde:** raiz

**Passos**
1. `git init` e criar `.gitignore` na raiz (o `server/.gitignore` não cobre `ui/`).
2. Ignorar `.env`, `server/data/`, `ui/node_modules`, `ui/.next`, `*.tsbuildinfo`, `__pycache__`.
3. Commit inicial.

**Aceite:** `git status` limpo, sem segredos rastreados.

---

### [ ] P1-9 · Corrigir a URL da API no build do container
**Por quê:** `NEXT_PUBLIC_API_URL` default é `localhost:6565`; ao abrir o painel de outro PC, `localhost` aponta para o navegador do usuário, não para o ZimaOS.

**Onde:** `compose.yml:62`, `Dockerfile.ui:32`, `ui/.env.local`

**Passos**
1. Documentar/forçar `NEXT_PUBLIC_API_URL=http://<ip-do-zimaos>:6565` no build.
2. Ou usar `depends_on`/proxy reverso para servir a API e a UI na mesma origem.
3. Deixar claro no README que trocar a URL pelo diálogo funciona sem rebuild.

**Aceite:** painel acessado de outro dispositivo conecta na API sem configuração manual.

---

## P2 — Produto e qualidade

### [ ] P2-1 · Expor na UI os endpoints já disponíveis
**Por quê:** a API tem interfaces, scan Wi-Fi e perfis NM, mas nenhuma tela consome isso.

**Onde:** `ui/src/lib/api.ts`, novos componentes em `ui/src/components/hotspot/`

**Passos**
1. Client: `listInterfaces`, `scanWifi`, `listProfiles`, `getProfile`, `deleteProfile`.
2. Seletor de interface alimentado por `/network/interfaces` (hoje é texto livre).
3. Lista de perfis salvos com opção de excluir (com confirmação).
4. Opcional: tela de scan de redes próximas.

**Aceite:** o usuário escolhe a interface da lista e vê/exclui perfis salvos.

---

### [ ] P2-2 · Usar `recommendation.reason` do backend
**Por quê:** `channel-analysis.tsx` recalcula o motivo da recomendação, duplicando a regra do servidor.

**Onde:** `ui/src/components/hotspot/channel-analysis.tsx:49`

**Passos**
1. Exibir `recommendation.reason` e remover a lógica duplicada (ou mover para um helper compartilhado).

**Aceite:** texto da UI vem do backend em todos os cenários (analisado, cache, sem redes).

---

### [ ] P2-3 · Reconstruir o QR Code a partir da config salva
**Por quê:** `lastCreated` vive só na sessão; recarregar a página perde QR/credenciais.

**Onde:** `ui/src/components/hotspot/hotspot-dashboard.tsx`, `connection-details.tsx`

**Passos**
1. Quando o hotspot estiver ativo e não houver `lastCreated`, montar o payload `WIFI:T:WPA;S:...;P:...;;` com os dados da config + status.
2. Avaliar risco de expor a senha na tela (depende de P0-3).

**Aceite:** recarregar a página com hotspot ativo ainda mostra QR e SSID.

---

### [ ] P2-4 · Remover código morto e incons­tências
**Onde:**
- `ui/src/lib/api.ts:188` — `resetConfig()` nunca é usado (ou criar botão "Restaurar padrões").
- `server/funs.py` — padronizar falhas: `create`/`restart` levantam exceção; `start`/`stop` retornam `{"status":"error"}`. Unificar em exceções.
- `server/funs.py` — mensagens em PT/EN misturadas e funções sem docstring.

**Aceite:** sem exports não utilizados; um único padrão de erro nos helpers.

---

### [ ] P2-5 · Endurecer o serviço de configuração
**Onde:** `server/services/hotspot_config_service.py`

**Passos**
1. Diferenciar "arquivo ausente" (defaults) de "arquivo ilegível" (erro 500) — hoje ambos caem nos defaults em silêncio.
2. Documentar que o `threading.Lock` só protege um processo; se houver múltiplos workers, usar lock de arquivo ou banco.
3. Expor no `GET /config` que a configuração veio de fallback por corrupção (log já existe).

**Aceite:** volume corrompido/sem permissão gera erro visível, não defaults silenciosos.

---

### [ ] P2-6 · Melhorar observabilidade
**Passos**
1. Log estruturado (JSON opcional) com `request_id`, operação e duração.
2. Métrica/contador simples de falhas de `nmcli` por operação.
3. Healthcheck de readiness separado do liveness (hoje `/health` retorna 200 mesmo degradado — correto para liveness, mas não para "pode operar").

**Aceite:** dá para diagnosticar uma falha de hotspot só pelos logs do container.

---s

### [ ] P2-7 · Documentação
**Passos**
1. Criar `README.md` na raiz (hoje só há READMEs de `server/` e `ui/`): arquitetura, como subir com Docker Compose, variáveis e troubleshooting.
2. Atualizar a tabela de variáveis com `API_V1_PREFIX` (existe em `config.py`, não está documentada).
3. Registrar o comportamento destrutivo do `create` (apaga o perfil existente) também no README da UI.

**Aceite:** alguém consegue subir o projeto do zero seguindo apenas o README da raiz.

---

## Checklist de conclusão

- [ ] Nenhum endpoint sensível acessível sem `X-API-Key`
- [ ] Senha do Wi-Fi não trafega nem repousa em claro
- [ ] `active` reflete o perfil do hotspot, não a interface
- [ ] `use_sudo` funciona ou não existe
- [ ] `pytest` verde e rodando em CI
- [ ] Dependências Python fixadas
- [ ] Repositório git inicializado sem segredos
- [ ] Painel acessível de outro dispositivo sem configuração manual
