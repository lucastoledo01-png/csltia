# imigra.us: arquitetura do sistema

Documento de contexto, escrito para quem chega sem histórico do projeto, humano ou
modelo. Descreve o que o sistema é, como está montado, onde cada coisa mora e o
que está realmente ligado.

Repositório: `lucastoledo01-png/csltia` (privado). Primeiro commit em 20/08/2026,
323 commits, 367 arquivos TypeScript, cerca de 74 mil linhas, 1387 testes em 116
arquivos.

## 1. O que o sistema faz

É uma redação automática. Todo dia, sem operador, o sistema coleta notícias de
imigração americana, escolhe as pautas, escreve em português do Brasil com LLM,
audita o texto contra as fontes e publica em três canais: **newsletter**,
**portal** e **Instagram**.

A marca é **imigra.us**, voltada a brasileiros que querem morar, estudar ou
trabalhar nos Estados Unidos. Linha editorial positiva sobre os EUA e crítica
sobre o Brasil.

O princípio que organiza o sistema inteiro: **o texto precisa ter lastro na
fonte**. Há auditoria de alucinação na newsletter, no post e slide a slide no
carrossel, e todas elas podem impedir a publicação.

## 2. Stack

| Camada | Escolha |
|---|---|
| Aplicação | Next.js 16 App Router, React 19, TypeScript |
| Estilo | Tailwind 4, só via PostCSS, sem `tailwind.config.js` |
| Testes | Vitest, Testing Library, jsdom |
| Banco | Supabase (Postgres, PostgREST, Storage) |
| Renderização de imagem | Playwright com Chromium headless |
| Validação | Zod |
| Newsletter | Listmonk auto-hospedado |
| Publicação social | Meta Graph API |
| LLM | OpenAI, por `fetch` direto, sem SDK |

Sete dependências de produção: `next`, `react`, `react-dom`,
`@supabase/supabase-js`, `playwright-core`, `react-moveable`, `zod`. Sem SDK de
LLM e sem ORM. Toda integração externa é `fetch` com contrato próprio, o que
torna todas testáveis por injeção de `fetcher`. Essa é uma decisão de projeto
consciente, não uma lacuna.

**Regra da plataforma:** esta versão do Next tem mudanças de API em relação ao que
os modelos conhecem. O `AGENTS.md` obriga a ler `node_modules/next/dist/docs/`
antes de escrever código de framework.

## 3. Topologia de execução

VPS Hostinger gerenciado por **EasyPanel**, dois contêineres a partir do mesmo
repositório, mais serviços satélites.

```
              crontab do VPS (usuário deploy, tudo em UTC)
   3 9  * * *    POST /api/cron/newsroom               = 06:03 Brasília
   0 8  * * *    POST /api/cron/refresh-instagram-token (antes da redação, de propósito)
   0 23 * * 1-6  POST /api/cron/prompt-loop            (domingo agrega com ?agregar=1)
   a cada 15min  worker do Instagram
                              |
                              v
    +----------------------------------------------------+
    |  core/web       Dockerfile        node server.js    |
    |  site público, painel admin, rotas de API           |
    |  EXECUTA O CICLO DIÁRIO INTEIRO                     |
    +----------------------------------------------------+
                              |
              grava vagas de post em social_posts
                              v
    +----------------------------------------------------+
    |  core/worker    Dockerfile.worker                   |
    |  tsx src/scripts/instagram-worker.ts                |
    |  laço contínuo, WORKER_INTERVAL_SECONDS=900         |
    |  renderiza os slides e publica na Meta              |
    +----------------------------------------------------+

    Supabase (Postgres + Storage)   Listmonk   Meta Graph   OpenAI
    Satélites na mesma VPS: OpenReply, ChatbotX, Zernflow (deployment/*.yml)
```

Pontos que costumam surpreender:

- **O ciclo diário roda dentro do serviço web.** A rota `/api/cron/newsroom`
  responde 202 imediatamente e continua executando em segundo plano. Com `?wait=1`
  ela espera e devolve o resultado inteiro. O resultado normal só aparece em
  `newsroom_runs`.
- **O worker é só o braço de publicação do Instagram.** Não decide conteúdo,
  consome fila.
- **O host canônico ainda é `casaloti.ia.br`**, herdado da vertical anterior. É
  para lá que o cron aponta, é o que está em `MARCA.site`, nos logotipos usados
  pelo e-mail e no `remotePatterns` do `next.config.ts`.
- **Não há acesso a log de contêiner.** O usuário `deploy` não está no grupo
  `docker`. Consequência de projeto: diagnóstico que não vai para o banco não
  existe.
- `src/instrumentation.ts` confere os canais de alerta na subida do processo, o
  que existe porque três alertas críticos se perderam em 06, 07 e 08 de setembro.
- Deploy é por webhook do EasyPanel, um por serviço. Código compartilhado exige
  deployar os dois.
- `requireCron` autentica pelo cabeçalho `Authorization` e responde **401**.
  O segredo nunca vai na query string, porque vazaria em log de acesso, histórico
  e cabeçalho `Referer`.

## 4. Mapa do repositório

```
src/app/
  page.tsx, artigos/[slug]/, newsletter/     site público
  ultraprompts/[keyword]/                    landing do Sistema PROMPT
  formacoes/, automacao/                     páginas da vertical anterior
  admin/                                     painel com dez abas
  api/
    cron/{newsroom,tutorial,prompt-loop,refresh-instagram-token}
    admin/*                                  onze rotas do painel
    newsletter, comments, comments/vote
    events/pageview                          telemetria própria
    social/instagram/slide-image             serve o slide do Storage, sem auth

src/lib/
  marca.ts                identidade visual e verbal, usada por texto e arte
  editorial.ts            vertical anterior (IA), ainda viva no site público
  carousel-templates/     layout dos slides em HTML e CSS
    variants.ts           templates travados, inclusive a capa com destaque
    base-css.ts           CSS base
    format-defaults.ts    regra de produto por formato
    css-sem-crase.test.ts varredura mecânica de CSS
  prompt-system/          funil por palavra-chave
  server/
    newsroom/
      newsroom-service.ts orquestrador do dia
      collector.ts        coleta, janela por fonte, RSS e Atom
      fontes-oportunidade.ts   proposta medida de troca de fontes
    editorial/
      guarda.ts, classificador.ts, pontuacao.ts
      enriquecimento.ts, repeticao.ts, embeddings.ts, fingerprint.ts
      regras-duras.ts, url-canonica.ts, verificador.ts, history.ts
    editorial-quality.ts  auditoria antialucinação da newsletter
    social/
      ciclo-do-dia.ts     o dia do Instagram
      selecao.ts, gerador.ts, copy.ts, legenda.ts
      social-guard.ts     barra o texto do post
      carrossel/          estrutura.ts, copy.ts, guarda.ts, semantica.ts
      arte.ts, artefato.ts, agenda.ts, funil.ts
      instagram/          cliente da Meta, pipeline legado
      evergreen/          catálogo perene
    visual/               resolvedor de imagem V2
      wikidata.ts, wikimedia.ts, temporalidade.ts, centralidade.ts
      relevancia.ts, fonte-oficial.ts, licencas.ts
    prompt-system/        backend do funil, cliente do OpenReply
    tutorials/            geração de tutorial (vertical anterior)
    projects.ts, capacidades.ts, credenciais-do-projeto.ts
    leitura.ts            releitura de consulta que falha
    listmonk.ts, alerts.ts, api-auth.ts
    admin-auth.ts, admin-session.ts
    comment-filter.ts, platform-events.ts

src/scripts/              35 CLIs: dry runs, previews, medições, backfills
docs/                     documentação viva, incluindo 945 linhas de incidentes
deployment/               compose dos satélites (OpenReply, ChatbotX, Zernflow)
supabase/migrations/      histórico, NÃO reproduz produção
```

## 5. Os fluxos

### 5.1 Ciclo diário da redação

Orquestrador: `src/lib/server/newsroom/newsroom-service.ts`.

```
cron -> runNewsroom -> executarRedacaoDoDia

  1. resolve projeto, data no fuso do projeto, chave daily-edition-<data>
  2. idempotência: run com status success bloqueia; cancelled e failed não
  3. coleta (janela 24h para agregador, 72h para o resto)
  4. deduplicação (URL, dedupe_key, Jaccard >= 0,65 nos títulos)
  5. guarda editorial: classifica, aplica regras duras, enriquece,
     confere repetição contra o histórico, pontua, grava em news_candidates
     -> devolve o pool aprovado E a composição da newsletter
  6. INSTAGRAM roda aqui, sobre o pool aprovado, em try próprio
  7. se o pool não atinge o mínimo: grava run cancelled e encerra o dia
  8. monta o pacote factual das pautas selecionadas
  9. escreve a edição com LLM e audita (ver 5.2)
 10. persiste news_editions, editorial_history, articles, article_revisions
 11. cria a campanha no Listmonk e dispara se autoSend E sem risco de alucinação
 12. grava o run de sucesso em newsroom_runs
```

**Detalhe de arquitetura que explica muito:** o Instagram roda no passo 6, sobre
o pool aprovado, **antes** de qualquer decisão sobre a newsletter. Por isso os
posts continuam saindo em dias em que a edição é barrada pelo QA. Falha do social
vira alerta e diagnóstico, e a edição segue.

**Toda falha deixa linha.** `registrarFalhaDaRedacao` grava `failed` com chave
`<chave do dia>#falha-<instante>`, e `registrarDiaSemEdicao` grava `cancelled`
com `#sem-edicao`. Nenhuma das duas disputa a chave canônica. Isso existe porque
a linha de sucesso é gravada uma vez só, no fim, e sem isso um dia que quebra no
meio fica indistinguível de cron morto.

### 5.2 Auditoria antialucinação

Três conferências sobre a edição escrita, em `editorial-quality.ts` e
`src/lib/server/editorial/`:

1. **ancoragem determinística**: todo número, data e nome precisa aparecer no
   pacote factual daquela pauta. Sem isso, `REJECT_UNGROUNDED_CLAIM`.
2. **auditor de QA por LLM**: qualidade e aderência à linha editorial.
3. **claims semânticas**: conclusão e recomendação precisam se sustentar no
   material. Sem isso, `UNGROUNDED_EDITORIAL_CLAIM`.

Há até **duas** reescritas cirúrgicas (`MAX_EDITORIAL_REPAIR_ATTEMPTS`), com a
lista nominal de apontamentos, reconferindo tudo a cada volta. Persistindo a
reprovação, o portão lança erro com um `DetalheDoBloqueio` anexado, contendo o
trecho exato e o motivo, e **nada é publicado**.

Detalhe importante: números só são arredondados depois das conferências, porque a
ancoragem precisa ver o número como a fonte escreveu.

### 5.3 Instagram

Dois caminhos coexistem. O **V2** (`ciclo-do-dia.ts`, `pipeline-v2.ts`) e o
**legado** (`social/instagram/`). O legado só agenda quando o V2 não está em
`enforce`.

```
pool de pautas ou tema perene
  -> seleção
  -> copy e legenda
  -> SOCIAL GUARD: confere na ordem do dano, manchete, depois legenda, depois forma
  -> carrossel: estrutura de papéis por slide, copy, guarda de lastro POR SLIDE,
     auditoria semântica POR SLIDE
  -> imagem: resolvedor visual (entidade, licença verificada)
  -> grava em social_posts como scheduled, com slot de horário
  -> WORKER: renderiza HTML em PNG 2160x2880 com Playwright, sobe para o Storage
  -> Meta Graph: um container por slide, depois o container pai, depois publica
  -> published com provider_post_id
```

A arte vem de `src/lib/carousel-templates/`, que são **templates travados**: a
LLM escreve o texto e nunca toca no layout. `format-defaults.ts` guarda a regra
de produto: formato `noticia` é capa só, ou seja, imagem única; `tutorial` é o
único carrossel de texto; `prompt` é capa mais resultados.

Imagens reais vêm de Wikimedia Commons, Pexels e Unsplash. O resolvedor visual V2
não é uma busca por palavra: ele identifica a entidade da pauta via Wikidata,
mede centralidade e relevância, confere temporalidade (para não usar foto de
época errada) e verifica licença.

**Dois canais com agendas próprias:** o do noticiário e o **evergreen**, cujo
catálogo tem 66 tópicos, 180 combinações e sete famílias, com fontes canônicas
oficiais.

### 5.4 Newsletter e portal

`listmonk.ts` cria a campanha. O disparo automático exige `autoSend` **e**
ausência de risco de alucinação; retido, sai alerta. A mesma edição vira página
em `/artigos/[slug]`, renderizada numa versão sem o cabeçalho e o rodapé que a
página já desenha. A inscrição passa por Cloudflare Turnstile.

### 5.5 Sistema PROMPT

O funil por palavra de comando: o post pede um comentário com uma palavra-chave,
que levaria a uma landing em `/ultraprompts/[keyword]`, captura e entrega. Tem
ciclo próprio às 23:00, aprendizado semanal em `prompt_learnings` e telas no
painel. **O funil não fecha:** a automação depende de uma rota do OpenReply que
não existe do lado de lá.

### 5.6 Painel, comentários e telemetria

Painel com dez abas (Redação, Publicações, Carrossel, Layout, Sistema PROMPT,
Fontes, CMS Artigos, Analytics, Logs, Comentários), autenticado por cookie
assinado com HMAC **mais** sessão persistida em `admin_sessions`, TTL de 12
horas. A assinatura prova a emissão, mas só o registro no banco permite cortar
acesso antes do prazo. O editor de layout é um editor visual de slides.

Comentários do site têm filtro determinístico de palavrão e spam, votação e
moderação. Telemetria é própria: `pageviews`, `newsletter_leads` e
`article_comments`.

## 6. Modelo de dados

Supabase, acessado com service role no servidor.

| Tabela | Papel |
|---|---|
| `projects` | projeto, marca, fuso, horário de publicação, `settings` |
| `project_news_sources` | fontes habilitadas por projeto |
| `news_candidates` | tudo coletado e classificado, com a classificação persistida |
| `news_editions` | a edição do dia, com o QA gravado |
| `articles`, `article_revisions` | o artigo do portal |
| `newsroom_runs` | uma linha por execução: success, cancelled ou failed |
| `editorial_history` | memória do publicado, evita repetição |
| `social_posts` | fila e histórico dos posts, cerca de 38 colunas |
| `admin_sessions` | sessões do painel |
| `prompt_learnings` | aprendizado do Sistema PROMPT |
| `pageviews`, `newsletter_leads`, `article_comments` | telemetria e site |

`social_posts` é a tabela mais larga: `idempotency_key`, `status`,
`origin_channel`, `generation_version`, `scheduled_slot`, `social_guard_status`,
`provider_post_id`, entre outras.

**`supabase/migrations` não reproduz produção.** O banco evoluiu por fora. Leia o
banco antes de escrever código contra ele.

## 7. Configuração por variável de ambiente

O comportamento é governado por flag, não por branch. As de modo aceitam `off`,
`dry_run` ou `enforce`, e valor desconhecido cai no padrão seguro.

| Flag | Efeito |
|---|---|
| `EDITORIAL_GUARD` | guarda editorial. Em `dry_run` ela roda inteira, grava tudo e não decide |
| `SOCIAL_PIPELINE_V2` | canal do noticiário no Instagram |
| `SOCIAL_EVERGREEN_V2` | canal perene |
| `SOCIAL_V2_ENFORCE_LIBERADO` | trava dupla: `enforce` do social exige também o resolvedor visual em `enforce` |
| `VISUAL_RESOLVER_V2` | quem decide a imagem |
| `INSTAGRAM_AUTO_POST` | publicação automática |
| `NEWSLETTER_AUTO_SEND` | disparo automático da campanha |
| `EDITORIAL_MIN_PAUTAS`, `EDITORIAL_MAX_PAUTAS`, `EDITORIAL_MAX_PAUTAS_BRASIL` | composição |
| `DRY_RUN` | ensaio global |
| `WORKER_INTERVAL_SECONDS` | ritmo do worker |

Credenciais por nome: `OPENAI_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`,
`INSTAGRAM_ACCOUNT_ID`, `LISTMONK_*`, `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`,
`CRON_SECRET`, `ADMIN_SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`TURNSTILE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Guardas de rota em `api-auth.ts`: `requireAdmin` (cookie mais sessão no banco),
`requireCron` (Bearer) e `requireAdminOrCron`.

## 8. Arquitetura multiprojeto

Desenhado para hospedar vários projetos, cada um com marca, fontes, capacidades e
credenciais próprias.

**Pronto e em uso:** `projects` com marca e fuso; `capacidades.ts`, onde as sete
capacidades (`coleta`, `newsletter`, `social`, `evergreen`, `visual`, `keyword`,
`landing`) ficam em `projects.settings.capacidades` e a precedência entre
capacidade declarada, ambiente e projeto está concentrada numa função só;
`credenciais-do-projeto.ts`, que sobrepõe credenciais do projeto às do ambiente
sem alterar os clientes existentes; painel em `/admin/projetos`.

**Ainda não:** o cron executa um projeto e não itera; design de carrossel não tem
`project_id`; o UUID do projeto padrão está fixo em alguns arquivos; existe um
único projeto cadastrado, com `slug` ainda legado (`desbuguei`).

## 9. Estado real

Verificado no banco de produção, não no `.env` do repositório.

**Funciona em produção:** ciclo diário; newsletter pelo Listmonk; portal;
captura com Turnstile; worker do Instagram; renovação do token da Meta; ciclo do
Sistema PROMPT; painel; comentários; telemetria.

**Publicando hoje pelo V2:** desde 12/09/2026, **todo** post gravado tem
`generation_version = social-v2`, nos dois canais. Os 15 posts anteriores, sem
essa marca, vieram do caminho legado. Ou seja, `SOCIAL_PIPELINE_V2` e
`SOCIAL_EVERGREEN_V2` estão em `enforce` em produção, e o legado já não agenda.

**Atenção ao ler este repositório:** o `.env` versionado é o ambiente local e
**não reflete produção**. `BACKLOG.md` e parte de `docs/` estão atrasados em
relação ao código. Conclusões sobre o que está ligado precisam vir do banco ou do
ambiente do EasyPanel.

**Não existe ainda:** loop de aprendizado (nada lê alcance de post ou abertura de
e-mail para mudar a pauta de amanhã); fechamento do funil do CTA, que depende do
OpenReply; persistência da evidência de qualidade quando a edição **passa**, que
hoje só chega ao banco quando é barrada; gerador de tutorial para a vertical de
imigração, já que o atual ainda busca conteúdo de IA.

## 10. Convenções obrigatórias

1. **Português do Brasil** em código novo, comentários, commits e documentação,
   inclusive nomes de função e variável.
2. **Sem travessão** em nenhum texto gerado.
3. **Comentário explica o porquê, não o quê.** Os comentários longos registram
   decisões e incidentes. Não os remova ao editar.
4. **Teste prova regra, não sintaxe.** Muitos existem porque um erro específico
   aconteceu, e o cabeçalho do arquivo conta qual foi.
5. **Guarda que decide não publicar grava antes de sinalizar.** Portão que sai por
   exceção sem deixar linha apaga a própria evidência.
6. **Leitura crítica de banco tem releitura** (`leitura.ts`), porque a primeira
   consulta do dia pega conexão fria e já derrubou a operação.
7. **Leitura que falhou não é registro ausente.** Tratar os dois igual transforma
   queda de banco em "projeto não existe".
8. **Mock parcial de módulo derruba o que não for redeclarado**, e isso já custou
   um dia de diagnóstico aqui.
9. Antes de mexer em framework, ler `node_modules/next/dist/docs/`.

`docs/aprendizados-e-incidentes.md` tem 945 linhas de incidentes com causa e
correção. É a leitura mais valiosa para quem chega agora.

Os 35 scripts em `src/scripts/` são a camada de medição: é de lá que saem os
números citados nos comentários como justificativa de regra. Quem for mexer em
regra editorial mede antes.

## 11. Dívidas conhecidas

- `README.md` descreve o produto anterior
- `casaloti.ia.br` continua como domínio canônico em `marca.ts`,
  `next.config.ts`, no nome do pacote e no nome do cookie do admin
- a vertical anterior de IA ainda aparece no site público e no gerador de tutorial
- `supabase/migrations` diverge de produção
- log de contêiner é inalcançável, então diagnóstico precisa ir para o banco
- o cron de tutorial existe e tem healthcheck configurado, mas não está no
  crontab documentado
- `docs/instagram-carousel-pipeline.md` descreve a vertical antiga
