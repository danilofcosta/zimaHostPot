# ZimaOS Network Manager

Gerenciador de rede com interface web para ZimaOS, permitindo monitorar interfaces Ethernet e Wi-Fi, visualizar endereços IP e ligar ou desligar o Hotspot Wi-Fi quando disponível.

## Instalação

### 1. Clonar o repositório

```bash
git clone https://github.com/danilofcosta/zimaHostPot
```

### 2. Entrar na pasta do projeto

```bash
cd zimaHospt
```

### 3. Construir e iniciar o Docker Compose

```bash
docker compose up -d --build
```

### 4. Verificar os containers

```bash
docker compose ps
```

### 5. Acessar o gerenciador

No navegador, acesse:

```text
http://IP_DO_ZIMAOS:8080
```

Exemplo:

```text
http://192.168.1.100:8080
```

## Funcionalidades

- Visualização das interfaces de rede.
- Monitoramento de Ethernet e Wi-Fi.
- Identificação dos endereços IP.
- Ligar e desligar o Hotspot Wi-Fi, caso suportado.
- Interface web para gerenciamento da rede.

## Requisitos

- ZimaOS.
- Git.
- Docker e Docker Compose.
- Placa Wi-Fi compatível com modo Access Point (AP), para utilizar o Hotspot.

## Observação importante

A instalação pode exigir configuração manual devido às restrições de permissões administrativas (`sudo`) do ZimaOS.

As operações de gerenciamento de rede podem exigir permissões específicas no host. O container deve possuir acesso controlado aos recursos necessários.

## Comandos úteis

Visualizar logs:

```bash
docker compose logs -f
```

Reiniciar:

```bash
docker compose restart
```

Parar:

```bash
docker compose down
```
