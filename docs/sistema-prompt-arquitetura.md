# Sistema PROMPT — arquitetura do funil

Funil automatizado que parte de uma tendência cultural e entrega, sem intervenção
manual: conceito, imagens demonstrativas, os prompts que as geraram, o carrossel,
uma keyword exclusiva, a automação de Direct no OpenReply, a landing de captura e
o material prometido.

O usuário final percebe só isto:

```
vê → deseja reproduzir → comenta → recebe → cadastra-se → acessa
```

Base: **csltia** (Next 16 · Supabase · OpenAI · Listmonk · Meta Graph) +
**OpenReply** (NextAuth · Prisma · worker). ~60% da infra já existe.

> **Princípio central.** O Desbuguei não publica "um prompt" — publica o
> resultado desejável que o prompt produz. A pessoa vê primeiro o que poderia
> criar; o prompt aparece como a ferramenta para chegar lá. Toda decisão abaixo
> serve a essa ordem.

---

## Diagrama de sistema

Dois sistemas, uma conta do Instagram. O csltia produz e publica; o OpenReply —
que já escuta essa mesma conta via webhook — transforma comentário em Direct. A
**keyword** é o único fio que amarra uma campanha atravessando os dois lados e
volta a alimentar a pontuação da próxima tendência.

```
 csltia ────────────────────────────────────────────────────────────────────
   Trend ──► Imagens+Prompts ──► Carrossel ──► [KEYWORD] ──► Publica no IG
  (1-3)          (4-5)             (6)           (7)          (Meta Graph)
                                                  │                 │
                                     POST /automations       comentário
                                                  │            → webhook
 OpenReply ───────────────────────────────────────▼─────────────────▼───────
                                          Automação ──config──► Worker
                                       (keyword → fluxo DM)   (match+dedup)
                                                                    │
                          Direct + link rastreado ◄────────────────┘
                          (etapa 9 · TrackedLink)
                                     │  ?k=KEYWORD
 csltia ─────────────────────────────▼──────────────────────────────────────
   Landing dinâmica ──► Captura ──► Entrega ──► Analytics + Loop (13-14)
       (10)              (11)        (12)              ▲   ▲
                                            DmLog·LinkClick │
                                                            │
   └──────── o que converteu realimenta a pontuação de tendência ──────────┘
```

A keyword nasce na etapa 7, cria a automação no OpenReply (`POST`), viaja no link
do Direct até a landing (`?k=`), identifica cada evento do funil e fecha o ciclo
alimentando o Trend Intelligence. A banda do meio é a única parte que roda fora
do csltia.

---

## As 14 etapas do pipeline

A numeração é a ordem real de execução. `reusa` = código existente aproveitado
como está · `estende` = módulo existente ganha capacidade nova · `novo` = do zero.

### 1. Trend Intelligence · `estende`

Varre assuntos em alta, cultura pop, lançamentos, memes, filmes/séries, games,
tendências visuais e formatos emergentes de IA. Um passo de triagem por LLM só
promove a candidata quando existe **associação visual reproduzível** — "dá pra
fazer alguém querer refazer isso?". Grava em `prompt_trends`.

Estende o padrão de `src/lib/server/newsroom/collector.ts` e
`src/lib/server/tutorials/topic-sources.ts`. Fontes: entrada manual no admin +
coletores opcionais (Google Trends RSS, Reddit, catálogo de estreias). Busca de
hashtag do Instagram segue bloqueada pela Meta — ver `aprendizados-e-incidentes.md`.

### 2. Trend Jacking criativo · `novo`

Passo de LLM que pergunta: *"como alguém usaria IA para participar dessa
conversa?"* — e sai com um conceito + lista de aplicações reproduzíveis (pessoa
comum, casal, pet, cidade brasileira, profissão, produto, personagem original). A
tendência é a porta de entrada; a aplicação é o conteúdo.

Usa `src/lib/server/newsroom/ai-provider.ts`. Saída em `prompt_concepts`.

### 3. Originalidade e propriedade intelectual · `novo`

Guardrail que bloqueia: reprodução de logos, key art, pôsteres e assets
protegidos; enquadrar imagem gerada como "material oficial". Quando a tendência
envolve franquia/artista/marca, o conceito tem que ser inspirado em
**características visuais gerais**, nunca cópia de peça oficial.

Mesmo mecanismo do QA de alucinação do newsroom (`qaResult.passed` em
`newsroom-service.ts`) e da política de marca já registrada em
`aprendizados-e-incidentes.md` (risco de parecer afiliação não autorizada).

### 4. Geração visual · `estende`

Antes de gerar, fixa uma `visual_direction` por conceito: composição,
enquadramento, iluminação, cenário, tratamento, textura, atmosfera, elementos
recorrentes. Toda imagem do carrossel herda essa direção. Gera N imagens = N
aplicações distintas do mesmo conceito — nunca variações quase idênticas só pra
encher slide.

Estende `src/lib/server/social/instagram/opendesign-renderer.ts` (já usa
`gpt-image-1`, já resolve `b64_json`).

### 5. Prompt como asset · `novo`

Restrição dura: o prompt **exato** de cada imagem mostrada é persistido no momento
da geração, nunca reconstruído depois. O material entregue tem que corresponder ao
método real. Pacote organizado por aplicação — `PROMPT BASE`, `PROMPT RETRATO`,
`PROMPT CASAL`, `PROMPT PRODUTO`, `PROMPT PERSONALIZAÇÃO` — com instruções curtas
do que o usuário substitui.

Nova tabela `prompt_assets`, escrita pelo mesmo worker que chama a geração de
imagem.

### 6. Carrossel · `reusa`

Template do formato PROMPT: slide 1 = resultado mais forte + hook; 2–6 =
resultados e aplicações; 7 = contexto/personalização (só quando necessário); 8 =
CTA com a keyword. Contagem de slides variável — não preenche pra bater número.

Reusa `src/lib/server/social/instagram/renderer.ts`, `pipeline.ts` e
`scheduler.ts` com um novo `SYSTEM` prompt. O pipeline atual já gera capa com
prompt de imagem e CTA de comentário.

### 7. Keyword individual · `novo`

Toda publicação tem uma keyword exclusiva — curta, relacionada ao assunto,
memorável, fácil de digitar, sem acento. É também o identificador de campanha.
Exemplos conceituais: `GTA26`, `VICE26`, `FOTO87`, `PIXEL31`. O sistema
**verifica disponibilidade antes de publicar** — nunca presume.

Checagem de unicidade dupla: contra `prompt_campaigns.keyword` (histórico próprio)
e contra as automações existentes do OpenReply (via API). Nunca reusa uma keyword
já associada a outro conteúdo.

### 8. OpenReply · `novo`

Definida a keyword, o csltia cria a automação correspondente no OpenReply:
comentário contendo a keyword → inicia o fluxo de Direct daquela campanha. Como o
post é publicado pela mesma conta Meta que o OpenReply já escuta via webhook, o
webhook + worker do OpenReply cuidam de comentário→DM sem configuração extra.

Grava a identidade da campanha (uma linha em `prompt_campaigns`): `post_id`,
`campaign_id`, `keyword`, data, tema, formato, URL da LP, status, origem.

### 9. Direct · `novo`

Nada de resposta robótica longa. Só: confirma o pedido + entrega o acesso.
*"achei você 👀 — preparei os prompts + exemplos desse post aqui: [ACESSAR]"*,
adaptado à voz editorial do Desbuguei. O botão aponta para um `TrackedLink` do
OpenReply, que redireciona pra landing.

Config, não código: os campos `dmMessage` / `openingDmMessage` da automação. A
copy é gerada pelo csltia e empurrada junto com a criação da automação (etapa 8).

### 10. Landing page dinâmica · `novo`

Rota `casaloti.ia.br/ultraprompts/[keyword]`, dirigida pelo registro da campanha.
Preserva a continuidade visual do post (mesma `visual_direction`). Estrutura:
headline ligada ao benefício · preview dos resultados · descrição curta ·
formulário · CTA · entrega.

A página `src/app/ultraprompts/page.tsx` hoje é um stub — vira o container
dinâmico. Renderização por campanha, sem deploy por post.

### 11. Captura · `novo`

Formulário pede nome, e-mail, WhatsApp. Campos ocultos de atribuição:
`campaign_id`, `post_id`, `keyword`, `source`, `timestamp` — é isso que permite
medir depois qual conteúdo realmente gera lead.

Reusa `src/components/TurnstileWidget.tsx` (anti-spam) e
`src/lib/server/listmonk.ts` (adiciona o lead a uma lista). Grava `prompt_leads`.

### 12. Entrega · `novo`

Após o cadastro, rota `.../ultraprompts/[keyword]/material` liberada por cookie
assinado. Por aplicação: resultado visual + prompt + botão `COPIAR PROMPT`.
Prompts separados por aplicação quando houver vários. Imagens de
referência/preview disponíveis.

Gate reusa a abordagem de cookie assinado de
`src/lib/server/admin-session.ts`. Conteúdo vem de `prompt_assets`.

### 13. Analytics · `novo`

Atribuição individual por etapa: publicação → comentário → Direct → clique →
visita à LP → cadastro → acesso ao prompt. A keyword é a chave de junção — não é
só escolha editorial, é parte do sistema de atribuição.

Comentário / Direct / clique vêm do OpenReply (`DmLog`, `LinkClick`) por pull
periódico; visita / cadastro / acesso vêm dos eventos do csltia
(`platform-events.ts`, `/api/events/pageview`). Superfície no
`src/components/AdminAnalyticsDashboard.tsx`.

### 14. Loop editorial · `novo`

Registro por conceito: tema, tendência, hook, estética, keyword, alcance,
salvamentos, compartilhamentos, comentários, Directs iniciados, cliques, leads,
taxa de conversão. O sistema aprende quais combinações de **tendência + aplicação
+ visual + hook** convertem — e realimenta a pontuação da etapa 1.

Não otimiza só para alcance: um conteúdo com menos views e muitos leads vale mais
que um viral que não converte. Alcance/saves vêm do Meta Graph insights;
conversão vem do funil.

---

## Decisões de arquitetura

### D1 · Como o csltia autentica na API do OpenReply

As rotas do OpenReply (`POST /api/automations`) são autenticadas por sessão de
navegador — não há token de serviço.

| Opção | O que é | Custo |
|---|---|---|
| **A — fork mínimo** | rota aditiva `POST /api/service/automations` protegida por token estático (`PROMPT_SYSTEM_API_TOKEN`) | ~1 dia, fácil de rebasear contra o upstream |
| **B — escrita direta no Postgres** do OpenReply (`Automation` / `TrackedLink`) | sem fork | pula a validação e a lógica do OpenReply; acopla no schema dele |
| **C — n8n como cola** | o container n8n já existe na VPS; guarda a credencial e expõe um webhook | desacopla, mas é mais uma peça móvel |

**Recomendação: A.** Aditiva, versionável, e o token fica fora do surface de
ataque do navegador. A opção B vira dívida no primeiro `prisma migrate` do
OpenReply.

### D2 · Onde o pipeline PROMPT roda

O csltia já tem infra de cron + worker (newsroom, instagram worker).

- Pipeline novo e separado: `/api/cron/prompt-system`, com portões de aprovação
  humana entre estágios — igual ao portão de QA do newsroom.
- Estágios 1–7 podem rodar como rascunho automático; publicação (8+) exige clique
  no admin no início, relaxa depois que estabilizar.

**Recomendação:** mesma infra de cron/worker do csltia, pipeline próprio. Não
misturar com o newsroom — assunto, cadência e formato diferentes.

### D3 · Landing e entrega

- `/ultraprompts/[keyword]` — a landing (casa com o stub que já existe).
- `/ultraprompts/[keyword]/material` — a entrega, atrás de gate.
- Gate: cookie assinado emitido no submit do formulário, mesma abordagem de
  `admin-session.ts`.

**Recomendação:** renderização dinâmica por campanha, um único par de rotas —
nunca deploy por post.

### D4 · Chave de atribuição

- `campaign_id` (uuid) é a PK. `keyword` (normalizada em maiúsculas) é índice
  único e o identificador humano.
- No OpenReply, `DmLog.matchedKeyword` e `TrackedLink.slug` amarram na keyword.
  Todo evento de funil carrega `campaign_id`.

**Recomendação:** keyword como slug público e chave de junção entre sistemas;
`campaign_id` como PK interna estável.

---

## Tabelas novas (Supabase / csltia)

Sete tabelas, prefixo `prompt_`, seguindo a convenção das migrations em
`supabase/migrations/`.

| Tabela | Colunas principais |
|---|---|
| `prompt_trends` | id · source · raw_title · category · captured_at · opportunity_score · visual_hook · status |
| `prompt_concepts` | id · trend_id → · concept · hook · applications jsonb · visual_direction jsonb · ip_check jsonb · status |
| `prompt_campaigns` | id · concept_id → · keyword **unique** · theme · format · status · ig_media_id · openreply_automation_id · lp_url · source · created_at · published_at |
| `prompt_assets` | id · campaign_id → · label · prompt_text · model · image_url · substitution_notes · generated_at |
| `prompt_leads` | id · campaign_id → · name · email · whatsapp · attribution jsonb · listmonk_synced · created_at |
| `prompt_funnel_events` | id · campaign_id → · stage · external_id · occurred_at · payload jsonb |
| `prompt_concept_results` | id · campaign_id → · reach · saves · shares · comments · dms_started · clicks · leads · conversion_rate · snapshot_at |

---

## Contrato csltia ↔ OpenReply

```
csltia → OpenReply   criar automação
  { keyword, postId: ig_media_id, dmMessage, openingDmMessage,
    trackedLink: { slug, destinationUrl }, publicReplyMessages[], requireFollow }

csltia → OpenReply   checar keyword
  GET /api/service/automations?keyword=X  → 200 livre / 409 em uso

OpenReply → csltia   pull periódico de DmLog + LinkClick por matchedKeyword / slug
  → grava prompt_funnel_events (stage = comment | dm | click)

Meta (compartilhado)  csltia publica o post · o webhook do OpenReply recebe os
  comentários → uma única inscrição de webhook, sem duplicação
```

Referência do schema do OpenReply relevante para o contrato: o model `Automation`
já tem `keywords[]`, `dmMessage`, `openingDmMessage`, `publicReplyMessages[]`,
`requireFollow`, `followUpEnabled`/`followUpDelayMinutes`, e relação com
`TrackedLink` (slug → destinationUrl) + `LinkClick` (ipHash, userAgent, referrer,
createdAt). `DmLog` registra entrega por comentário com `matchedKeyword` e
`DmStatus`.

---

## Ordem de implementação

Construir a espinha primeiro: uma campanha feita à mão tem que ir de ponta a
ponta antes de qualquer automação de ideação.

| Fase | Escopo | Resultado |
|---|---|---|
| **0** ✅ | Schema (7 tabelas) + registro de campanha + gatilho manual no admin | Destrava tudo o resto; nenhum risco em produção |
| **1** | Etapas 7 + 8 + 9 — keyword, automação no OpenReply, copy do Direct (inclui o fork D1) | Testável com um conceito criado à mão. É a espinha do funil |
| **2** | Etapas 10 + 11 + 12 — landing dinâmica, captura, entrega | O funil fecha ponta a ponta: dá pra rodar PROMPT posts com produção manual |
| **3** | Etapas 4 + 5 + 6 — geração visual, prompt como asset, carrossel | Produção de conteúdo deixa de ser manual |
| **4** | Etapas 1 + 2 + 3 — trend intelligence, trend jacking, guardrail de PI | Topo do funil automatizado; o sistema propõe pautas sozinho |
| **5** | Etapas 13 + 14 — analytics de funil e loop editorial | Fecha o ciclo: os resultados passam a decidir as próximas pautas |

---

## Fase 0 — estado real (2026-09-03)

> **O schema `prompt_*` já está em produção e não veio deste repositório.**
> Foi aplicado direto no banco, fora do histórico de `supabase/migrations/`, e
> nenhum arquivo aqui o descreve. Ele é **mais rico** que o desenho das seções
> acima. Onde os dois discordarem, **o banco manda** — as seções anteriores
> passam a ser a intenção original, não a especificação.

### O que está no banco, e não estava previsto

| Tabela | Colunas além do previsto |
|---|---|
| `prompt_campaigns` | `campaign_type`, `opening_dm_message`, `follow_up_enabled`, `follow_up_delay_minutes`, `follow_up_message` — sequência de Direct |
| `prompt_leads` | `email_sequence_stage`, `email_sequence_next_at` — régua de e-mail |
| `prompt_concept_results` | `performance_score`, `is_explore` — explore/exploit no loop |
| `prompt_concepts` | `hook_pattern` |
| **`prompt_learnings`** | tabela inteira: `period_start/end`, `top_combo`, `bottom_combo`, `summary_text`, `applied_to_prompt` |

E o que o desenho original previa mas **não existe**: `prompt_campaigns.updated_at`
e `prompt_campaigns.error_message` (então falha de campanha não tem onde gravar
o motivo), `prompt_assets.position` e `.image_path`,
`prompt_concept_results.snapshot_date` (só `snapshot_at`).

### O que a Fase 0 entregou no código

| Arquivo | Papel |
|---|---|
| `src/lib/prompt-system/keyword.ts` | Normalização e validação da keyword. Compartilhado: o formulário do painel usa a mesma função que a rota, então o navegador nunca propõe uma keyword que o servidor recusa |
| `src/lib/prompt-system/vocabulary.ts` | **Único** lugar com os valores de `status`/`format`/`campaign_type`/`source`. Popula os menus do painel — não valida |
| `src/lib/server/prompt-system/campaigns.ts` | Registro contra as colunas reais: listar, criar, checar keyword, mudar status, remover |
| `src/app/api/admin/prompt-campaigns/` | `GET`/`POST` da lista, `GET keyword` (200 livre / 409 em uso), `PATCH`/`DELETE` por id |
| `src/components/AdminPromptCampaignsManager.tsx` | Aba **Sistema PROMPT** do painel |

### Três decisões

**Os CHECKs não são duplicados em TypeScript.** `status`, `format`,
`campaign_type` e `source` têm CHECK no banco. Como o schema foi aplicado fora
do repo, uma lista espelhada aqui divergiria no primeiro `ALTER` que ninguém
copiasse — e daria ilusão de validação. Quem recusa é o Postgres; a rota
traduz o erro em 400. O `vocabulary.ts` existe só para os menus.

**Campanha publicada não é apagável pela rota.** Fora de `draft`,
`keyword_reserved` e `failed` existe um post no Instagram e uma automação no
OpenReply apontando para a linha: a rota responde 409 e manda arquivar.

**`checkKeywordAvailability` devolve `checkedOpenReply: false`.** A etapa 7
exige checagem dupla — histórico local **e** automações do OpenReply. A Fase 0
só tem a primeira metade, e o campo diz isso a quem consome em vez de parecer
completo. A segunda entra na Fase 1 com a rota de serviço (decisão D1).

### Pendência que bloqueia confiar no registro

O schema aplicado não foi auditado: **não se sabe se existe
`unique (project_id, keyword)`** em `prompt_campaigns`. Sem ela, duas campanhas
nascem com a mesma keyword e o funil da etapa 7 fura na origem — o código trata
o erro `23505` como "keyword em uso", mas se a constraint não existir o insert
duplicado simplesmente passa. Mesma dúvida para o dedupe de
`prompt_funnel_events (campaign_id, stage, external_id)`, para a unicidade de
`prompt_leads (campaign_id, email)` e para os índices de chave estrangeira.

Auditoria:

```sql
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid::regclass::text like 'prompt_%' and contype in ('c','u','p')
union all
select tablename::regclass, indexname, indexdef
from pg_indexes where tablename like 'prompt_%'
order by tabela, conname;
```

`docs/propostas/prompt-system-invariantes.sql` guarda os invariantes desenhados
e testados para essas tabelas (CHECK da keyword, unicidades de dedupe, índices
de FK, RLS, `conversion_rate` como coluna gerada). **Não é uma migração
aplicada** — mora fora de `supabase/migrations/` de propósito, porque criaria um
schema diferente do de produção num banco novo. Serve como referência do que
falta conferir e, se faltar, acrescentar por `ALTER`.

### Dívida operacional que isto revelou

O banco de produção tem estrutura que o repositório não descreve. Enquanto isso
durar, `supabase/migrations/` não reproduz produção — um ambiente novo nasce
diferente, e ninguém tem como saber o que está no ar sem consultar o banco. O
conserto é uma migração-baseline que documente o schema aplicado, e ela depende
da auditoria acima.
