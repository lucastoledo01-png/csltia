# Base multi-projeto

Cada projeto é uma marca operando num segmento: tem suas fontes de conteúdo,
sua identidade visual, sua conta de publicação e seu horário de disparo. Todo o
conteúdo é isolado por `project_id`.

## Tabelas

| Tabela | Papel |
|---|---|
| `projects` | Marca, segmento, fuso, identidade visual e horário de publicação |
| `project_news_sources` | Fontes RSS por projeto — antes era um array no código |
| `project_credentials` | Credenciais por projeto (Instagram, Listmonk, OpenAI, ChatbotX) |

O conteúdo (`articles`, `news_editions`, `news_candidates`, `newsroom_runs`,
`social_posts`, `newsletter_leads` e demais) ganhou `project_id` com chave
estrangeira para `projects`.

## Unicidades

As restrições globais foram trocadas por compostas. É a mudança que torna a
coexistência possível:

| Antes | Depois |
|---|---|
| `news_editions.edition_date` | `(project_id, edition_date)` |
| `news_candidates.url` | `(project_id, url)` |
| `articles.slug` | `(project_id, slug)` |
| `newsletter_leads.email` | `(project_id, email)` |
| `newsroom_runs.idempotency_key` | `(project_id, idempotency_key)` |
| `social_posts.idempotency_key` | `(project_id, idempotency_key)` |

## Projeto semente

O conteúdo que já existia foi todo produzido para a desbuguei.ia, então a
migração cria o projeto `desbuguei` com identificador fixo
`00000000-0000-4000-8000-000000000001` e vincula todas as linhas existentes a
ele.

Esse identificador é o `DEFAULT` das colunas `project_id`, o que mantém
funcionando o código que ainda não passa o projeto explicitamente. O `DEFAULT`
deve ser removido quando a migração do código terminar — enquanto ele existir,
um call site esquecido grava silenciosamente no projeto errado.

## Fuso horário

`projectToday(project)` devolve a data corrente no fuso do projeto. O pipeline
usava `new Date().toISOString()`, que é UTC: toda execução depois das 21h no
Brasil era gravada com a data do dia seguinte.

## Como adicionar um projeto

1. Inserir a linha em `projects` com slug, nome, segmento, fuso e identidade.
2. Inserir as fontes em `project_news_sources`.
3. Inserir as credenciais em `project_credentials`.
4. Agendar o disparo apontando para o projeto.

Os passos 1 a 3 ainda são SQL manual — a tela de gestão no painel entra junto
com a fase Motor.

## Capacidades por projeto

Fase 0 da plataforma, feita em 2026-09-12.

Até aqui todo interruptor era variável de ambiente, e variável de ambiente é
global ao deploy: ligar o social no projeto A ligava no projeto B junto. Com um
projeto só isso nunca doeu; com dois, era o bloqueio que impedia a plataforma de
existir.

A capacidade passou a morar em `projects.settings.capacidades`, que já é jsonb e
já é lido em produção, então **esta fase não exigiu migration nenhuma**.

```json
{ "capacidades": { "social": "enforce", "evergreen": "dry_run" } }
```

Cardápio: `coleta`, `newsletter`, `social`, `evergreen`, `visual`, `keyword`,
`landing`. Estados: `off`, `dry_run`, `enforce`.

**Precedência:** o projeto vence o ambiente. Capacidade não declarada devolve
`null`, e quem chama cai na variável de ambiente, então projeto que não declara
nada se comporta exatamente como antes desta mudança. Foi isso que permitiu subir
o alicerce sem alterar o ciclo que já rodava em produção.

**Valor declarado e irreconhecível vira `off`**, nunca `enforce` e nunca
fallback. É o mesmo contrato das flags de ambiente: erro de digitação no painel
não pode ligar publicação, e cair no ambiente seria pior, porque o operador veria
um valor na tela e outro valendo.

`src/lib/server/capacidades.ts` concentra a precedência numa função só, de
propósito: seis resolvedores repetindo a mesma condicional seriam seis lugares
para ela divergir.

### O que ainda falta para a plataforma

1. **Credenciais por projeto.** `INSTAGRAM_ACCOUNT_ID` e o Listmonk inteiro
   continuam globais. `project_credentials` tem os slots e só `instagram` é lido.
2. **O cron não itera.** Uma execução é um projeto, sempre o default, e a rota
   não aceita parâmetro de projeto. `listProjects()` continua sem chamador.
3. **Design por projeto.** `carousel_theme` e `carousel_format_config` não têm
   `project_id`: o design do carrossel é compartilhado. Isso exige migration.
4. **Sistema PROMPT com o UUID cravado** em `landing.ts`, `concepts.ts`,
   `trends.ts`, `visual.ts` e `carrossel-de-campanha.ts`.
5. **O `DEFAULT` do `project_id`** continua ativo nas 15 tabelas.

## Pendente

- **Segredos em texto no banco.** `project_credentials.config` guarda os valores
  em claro. O acesso é restrito ao papel de serviço, mas o endurecimento é mover
  para o Supabase Vault e deixar aqui apenas a referência.
- **Credenciais ainda não conectadas.** A tabela existe, mas `meta-client` e
  `listmonk` continuam lendo do ambiente global. A ligação entra na fase Fluxo,
  junto com os reparos de publicação.
- **`DEFAULT` das colunas `project_id`.** Remover quando todo call site passar o
  projeto.
