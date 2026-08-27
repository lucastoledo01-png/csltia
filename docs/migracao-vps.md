# Migração para a VPS com Easypanel

Tira o site da hospedagem compartilhada e concentra tudo numa máquina: site,
redação, worker de renderização, Listmonk e, depois, ChatbotX.

## Por que centralizar

| Antes | Depois |
|---|---|
| Site na Hostinger, Listmonk na VPS | Tudo na VPS |
| Worker impossível (sem Chromium) | Worker roda ao lado |
| Requisição cortada pelo proxy em ~60s | Sem limite de proxy |
| Execução morre se o processo reinicia | Reinício automático pelo orquestrador |
| Duas máquinas para depurar | Um lugar, um conjunto de logs |

## Dois serviços, não um

O repositório traz dois Dockerfiles porque as necessidades são diferentes:

- **`Dockerfile`** — aplicação web. Build standalone do Next, sem Chromium.
  Imagem pequena, sobe rápido.
- **`Dockerfile.worker`** — worker. Instala Chromium na versão exata do
  `package-lock`. Imagem grande, mas só ela precisa disso.

Juntar os dois faria a aplicação web carregar ~400 MB de navegador que nunca
usaria, e um pico de renderização competiria com o atendimento do site.

## Serviço 1: aplicação web

No Easypanel, **Create Service → App**:

| Campo | Valor |
|---|---|
| Source | GitHub → `lucastoledo01-png/csltia`, branch `main` |
| Build | Dockerfile → `Dockerfile` |
| Port | `3000` |

Variáveis de ambiente:

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL_TRIAGE=gpt-4o-mini
OPENAI_MODEL_EDITOR=gpt-4o
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
CRON_SECRET=
LISTMONK_URL=
LISTMONK_API_USER=
LISTMONK_API_TOKEN=
LISTMONK_DEFAULT_LIST_ID=
NEWSLETTER_AUTO_SEND=true
```

Como o Listmonk passa a ser vizinho, `LISTMONK_URL` pode apontar para a rede
interna do Easypanel em vez de sair para a internet e voltar. Comece com a URL
pública, que já funciona, e troque depois de o resto estar estável.

## Serviço 2: worker

**Create Service → App**, mesmo repositório:

| Campo | Valor |
|---|---|
| Build | Dockerfile → `Dockerfile.worker` |
| Port | nenhuma — não atende requisição |

Variáveis:

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL_EDITOR=gpt-4o
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_AUTO_POST=true
WORKER_INTERVAL_SECONDS=900
```

Com `WORKER_INTERVAL_SECONDS` definido o worker roda em laço contínuo, um giro
a cada 15 minutos, e para de forma limpa ao receber SIGTERM. Sem a variável ele
faz uma passada e encerra — modo usado por cron do sistema.

## O disparo diário

O worker cuida dos posts. A redação continua sendo acionada por fora.

No terminal da VPS, `crontab -e`:

```
3 9 * * * curl -fsS -m 60 -X POST -H "Authorization: Bearer SEU_CRON_SECRET" https://casaloti.ia.br/api/cron/newsroom
```

Confirmado em produção: o cron da Hostinger em `3 9 * * *` disparou às 06:03:04
de Brasília, então o horário do servidor era UTC. **Confirme o fuso da VPS**
com `date` antes de fixar — se ela estiver em horário de Brasília, use `3 6`.

## Cortar o domínio sem risco

Não aponte `casaloti.ia.br` para a VPS de cara. O caminho sem sobressalto:

1. Suba os dois serviços com um domínio temporário (`novo.casaloti.ia.br`)
2. Confira: site abre, `/api/admin/logout` responde 200,
   `/api/cron/newsroom` sem autorização responde 401
3. Rode a redação apontando para o domínio temporário e veja a edição no banco
4. Só então mude o DNS de `casaloti.ia.br` para a VPS
5. Desligue o cron da Hostinger **antes** de ligar o da VPS, senão os dois
   disparam no mesmo dia

O passo 5 importa: a trava de idempotência é por dia e por projeto, então o
segundo disparo seria recusado — mas só depois de já ter coletado notícia e
gasto chamada de modelo.

## Depois da migração

- Cancelar o plano da Hostinger só depois de alguns dias rodando limpo
- **E-mail do domínio é serviço separado** do web hosting: confirme antes de
  cancelar qualquer coisa
- O Supabase continua na nuvem. Migrar banco gerenciado para a VPS
  multiplicaria o risco sem ganho proporcional
