# Operação diária: newsletter e posts

Como o disparo roda todo dia, e o que precisa estar configurado em cada
máquina.

## Por que duas máquinas

A renderização dos slides usa Chromium. Hospedagem compartilhada não roda
Chromium: não há root para instalar as bibliotecas do sistema, não há Docker e
a memória disponível não comporta o navegador.

| Máquina | Papel |
|---|---|
| Hostinger (Next.js) | Site, painel, redação e newsletter. Agenda os posts do dia. |
| VPS | Worker: gera o roteiro, renderiza os slides, sobe as imagens e publica. |

As duas falam com o mesmo Supabase. A comunicação entre elas é a tabela
`social_posts`: a Hostinger cria as vagas, a VPS as consome.

## Fluxo do dia

```
06:03 (Hostinger)   cron -> /api/cron/newsroom
                    coleta -> pipeline editorial -> grava news_editions
                    -> publica no portal -> cria campanha no Listmonk
                    -> agenda N posts em social_posts (status scheduled)

a cada 15 min (VPS) worker -> busca vagas vencidas
                    -> gera roteiro da pauta -> renderiza slides
                    -> sobe para o Storage -> publica na Meta
                    -> status published (ou failed, com o motivo gravado)
```

Uma pauta por post. A edição de 5 notícias vira o e-mail com o resumo de todas
e 4 posts que aprofundam uma cada.

## Horários

Os horários são locais ao fuso do projeto (`projects.timezone`). Os padrões são
09:30, 12:30, 16:00 e 19:00, ajustáveis por projeto:

```sql
update public.projects
set settings = jsonb_set(settings, '{instagram_post_times}',
  '["09:30","12:30","16:00","19:00"]'::jsonb)
where slug = 'desbuguei';
```

## Configuração na Hostinger

**1. Aplicar as migrações no Supabase** (SQL Editor, na ordem):

```
supabase/migrations/20260827020000_fix_public_assets_upload_policy.sql
supabase/migrations/20260827030000_multi_project_base.sql
supabase/migrations/20260829001300_carousel_design.sql
supabase/migrations/20260901000000_prompt_system_baseline.sql
supabase/migrations/20260903120000_prompt_system_invariantes.sql
supabase/migrations/20260903130000_prompt_snapshot_date_not_null.sql
supabase/migrations/20260903140000_prompt_conversion_rate_gerada.sql
supabase/migrations/20260903150000_carousel_tokens_por_formato.sql
supabase/migrations/20260904140000_news_editions_qa_detalhe.sql
supabase/migrations/20260904160000_social_posts_campanha.sql
supabase/migrations/20260904180000_prompt_trends_notas.sql
```

**2. Variáveis de ambiente.** Sem elas as rotas respondem 500, não liberam:

```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   (ou SUPABASE_SECRET_KEY)
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
CRON_SECRET
OPENAI_API_KEY
LISTMONK_URL / LISTMONK_API_USER / LISTMONK_API_TOKEN / LISTMONK_DEFAULT_LIST_ID
```

**3. Cron — no crontab da VPS, usuário `deploy`** (`crontab -e`):

```
3 9 * * * /usr/bin/curl -fsS -m 60 -X POST -H "Authorization: Bearer SEU_CRON_SECRET" https://casaloti.ia.br/api/cron/newsroom >> /home/deploy/newsroom-cron.log 2>&1
0 8 * * * /usr/bin/curl -fsS -m 60 -X POST -H "Authorization: Bearer SEU_CRON_SECRET" https://casaloti.ia.br/api/cron/refresh-instagram-token >> /home/deploy/meta-token-cron.log 2>&1
```

> **Não é mais no hPanel da Hostinger.** A aplicação roda na VPS desde a
> migração, e o cron vive lá. Em 2026-09-03 a produção foi encontrada parada
> havia seis dias porque o cron da Hostinger foi desligado na migração e o da
> VPS nunca chegou a ser criado — ver `aprendizados-e-incidentes.md`.

A VPS está em **UTC** (`Etc/UTC`), então `3 9` é 06:03 em Brasília. Confirme
com `date` antes de mudar o horário.

O token da Meta é renovado **antes** da redação de propósito: se estiver para
vencer, a renovação acontece antes de o worker precisar dele para publicar.

Os dois redirecionam para log em `/home/deploy/`. Como usam `curl -f`, uma
resposta de erro — 401 por segredo errado, 404 por rota ausente — aparece lá.
É o primeiro lugar a olhar quando um dia não sair edição.

A segunda linha checa o token de longa duração da Meta todo dia, renova quando
falta pouco e alerta no Telegram se não conseguir (ver "Observabilidade" abaixo).

A rota responde 202 em segundos e continua trabalhando em segundo plano, então
o `-m 60` não corta a execução — ele só limita a espera pela resposta. O
resultado é acompanhado em `newsroom_runs` e no painel de logs.

Para aguardar o fim numa execução manual, acrescente `?wait=1`.

## Configuração na VPS

```bash
git clone <repo> csltia && cd csltia
npm ci                                   # inclui devDependencies
npx playwright install --with-deps chromium
```

Crie o `.env.local` com as mesmas variáveis do Supabase e da OpenAI, mais:

```
INSTAGRAM_ACCOUNT_ID
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_AUTO_POST=true

# Recomendado: para o worker avisar no Telegram quando um post falha.
# TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID   (ver "Observabilidade")

# Opcional: só se o Chromium não estiver no registro do Playwright
# (imagem de contêiner, pacote do sistema).
# PLAYWRIGHT_CHROMIUM_EXECUTABLE=/caminho/para/chrome
```

Medido em teste: **5 slides levam cerca de 75 segundos** para renderizar. Um
carrossel de 8 slides passa de dois minutos, e o worker processa até 5 vagas
por giro — dimensione o intervalo do cron com folga.

Cron do worker:

```
*/15 * * * * cd /caminho/csltia && /usr/bin/npm run worker:instagram >> /var/log/csltia-worker.log 2>&1
```

O worker processa até 5 vagas vencidas por giro e encerra. Falha numa vaga não
interrompe as demais: o motivo fica em `social_posts.error_message`.

## Verificação antes do primeiro disparo

```bash
# 1. Credenciais do Instagram válidas
npm run instagram:verify

# 2. Redação completa sem publicar (na VPS ou local)
npm run newsroom:dry

# 3. Disparo real da redação, aguardando o fim
curl -fsS -X POST -H "Authorization: Bearer SEU_CRON_SECRET" \
  "https://SEU_DOMINIO/api/cron/newsroom?wait=1"

# 4. Prévia do roteiro de um post, sem renderizar nem publicar
npm run instagram:preview -- 2026-08-28 0

# 5. Um giro do worker
npm run worker:instagram
```

## Diagnóstico

```sql
-- Execuções da redação
select started_at, status, stories_selected, cost_estimate_usd, error_message
from newsroom_runs order by started_at desc limit 10;

-- Posts do dia e seu estado
select scheduled_at, status, title, provider_post_id, error_message
from social_posts where edition_date = current_date order by scheduled_at;

-- Reprocessar uma vaga que falhou
update social_posts set status = 'scheduled', error_message = null
where id = '<id>';
```

## Observabilidade (Tier 0)

Todas as variáveis abaixo são **opcionais** — sem elas o sistema roda igual, só
não avisa quando algo quebra. Configure na Hostinger (redação/tutorial) e na VPS
(worker).

### Telegram — alertas

1. No Telegram, fale com o **@BotFather** → `/newbot` → guarde o token.
2. Mande qualquer mensagem pro seu bot novo.
3. Abra `https://api.telegram.org/bot<TOKEN>/getUpdates` e copie o
   `message.chat.id`.
4. No `.env`: `TELEGRAM_BOT_TOKEN=` e `TELEGRAM_CHAT_ID=`.

Chega alerta quando: a redação falha ou não gera edição, a edição fica retida no
QA, um post do Instagram falha, o cron do token da Meta não consegue renovar.

### healthchecks.io — "o cron não rodou"

1. Conta grátis em healthchecks.io → crie 3 checks:
   - **redacao** — schedule `3 9 * * *`, grace 30 min
   - **tutorial** — mesmo horário do seu cron de tutorial
   - **instagram-token** — schedule `0 8 * * *`, grace 60 min
2. Copie a *ping URL* de cada um pro `.env`:
   `HEALTHCHECK_NEWSROOM_URL=`, `HEALTHCHECK_TUTORIAL_URL=`,
   `HEALTHCHECK_INSTAGRAM_URL=`.

O cron pinga a URL ao terminar com sucesso (e `.../fail` quando dá erro). Se o
healthchecks não receber ping até o horário + grace, **ele** te avisa — cobre o
caso de a VPS/container estar fora no horário.

### Renovação do token da Meta

`META_APP_ID` e `META_APP_SECRET` (dashboard do app em developers.facebook.com →
Configurações → Básico). Com eles, o cron `refresh-instagram-token` troca o token
automaticamente via `fb_exchange_token` antes de expirar. Sem eles, o cron ainda
**avisa** quando falta pouco, mas a troca é manual.

O token efetivo passa a vir de `project_credentials` (provider `instagram`),
com `INSTAGRAM_ACCESS_TOKEN` servindo de semente na primeira execução.

## Limites conhecidos

- **A execução em segundo plano não sobrevive a reinício do processo.** Se a
  Hostinger reiniciar o Node no meio da redação, a execução se perde e não há
  retomada automática — rode o passo 3 da verificação manualmente. (O
  healthchecks.io avisa que o ping não chegou.)
- **Credenciais de outros provedores ainda vêm do ambiente**, não de
  `project_credentials` — só o token do Instagram foi migrado. O segundo projeto
  exige a ligação da tabela pros demais.
