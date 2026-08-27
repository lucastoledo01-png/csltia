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

## Pendente

- **Segredos em texto no banco.** `project_credentials.config` guarda os valores
  em claro. O acesso é restrito ao papel de serviço, mas o endurecimento é mover
  para o Supabase Vault e deixar aqui apenas a referência.
- **Credenciais ainda não conectadas.** A tabela existe, mas `meta-client` e
  `listmonk` continuam lendo do ambiente global. A ligação entra na fase Fluxo,
  junto com os reparos de publicação.
- **`DEFAULT` das colunas `project_id`.** Remover quando todo call site passar o
  projeto.
