Registro de bugs, causas raiz e decisões não óbvias — pra não repetir o mesmo
diagnóstico do zero da próxima vez. Toda vez que algo quebrar em produção ou
uma decisão de arquitetura/conteúdo não for óbvia, acrescente uma entrada
aqui (curta, indo direto ao sintoma → causa → correção → lição). Não é
changelog de feature, é memória de "por que isso quebrou" e "por que
decidimos assim".

## Infra & Deploy

### 502 em produção: Next.js standalone escutando no endereço errado

**Sintoma:** `casaloti.ia.br` retornava 502 do Traefik. O contêiner aparecia
"Up" no `docker ps`, e o log mostrava `✓ Ready in 0ms` — parecia saudável.

**Causa raiz:** o `server.js` gerado pelo build standalone do Next lê
`process.env.HOSTNAME` pra decidir o endereço de escuta. Sem essa env fixada
no Dockerfile, ele herdava o `HOSTNAME` que o Docker injeta automaticamente
em todo contêiner (o ID do contêiner) — passando a escutar só nesse endereço
específico, não em `0.0.0.0`. Confirmado via
`docker exec <container> node -e "require('http').get('http://localhost:80', ...)"`
→ `ECONNREFUSED`.

**Correção:** `ENV HOSTNAME=0.0.0.0` na etapa `runner` do `Dockerfile`.

**Lição:** um contêiner "Up" com log de "Ready" não prova que a porta está
aceitando conexão — teste de dentro do próprio contêiner antes de suspeitar
do proxy reverso.

### `dall-e-3` foi descontinuado — geração de imagem falhava 100% silenciosa

**Sintoma:** todos os posts do Instagram saíam com a mesma foto de banco de
imagem repetida, mesmo sendo sobre assuntos completamente diferentes.

**Causa raiz:** `generateCoverImageWithAI` chamava `model: "dall-e-3"`, que
não existe mais na API da OpenAI (`"The model 'dall-e-3' does not exist"`).
A função engolia o erro (`catch { return "" }`) e caía num fallback de ~5
fotos fixas do Unsplash — cujo `default` (sem categoria reconhecida) por
coincidência apontava pra mesma URL do bucket "chatgpt", dobrando a colisão.

**Correção:** trocado pra `gpt-image-1` (família atual). Também mudou o
formato de resposta: a API não aceita mais `response_format`, sempre devolve
`b64_json` (não mais `url`) — o código que tratava o retorno como URL HTTP
precisou ser ajustado pra aceitar `data:` URIs diretamente.

**Lição:** erros de geração de imagem/IA que só resultam em "usa o
fallback" nunca aparecem como erro visível pro usuário — testar a chamada
real à API de tempos em tempos, não só confiar que "sempre funcionou".

### RSS/Instagram: vídeo sendo usado como imagem de capa

**Sintoma:** a newsletter saiu com uma "imagem" quebrada (`<img>` apontando
pra um `.mp4`) na matéria da AWS.

**Causa raiz:** o extrator de imagem de RSS pegava qualquer
`<media:content>`/`<enclosure>` pela tag, sem checar o atributo `type=` nem
a extensão do arquivo — o feed da AWS anexava um vídeo de demonstração
nessa mesma tag. O mesmo padrão existia na coleta de perfis do Instagram:
`media_url` de um post de vídeo/reels aponta pro arquivo de vídeo, não uma
imagem, e o `media_type` vindo da Graph API não era usado pra filtrar.

**Correção:** `parseRSSItems` (RSS) agora exige `type="image/..."` ou
extensão de imagem antes de aceitar a URL; a coleta do Instagram só usa
`media_url` quando `media_type` é `IMAGE` ou `CAROUSEL_ALBUM`. Teste de
regressão em `collector.test.ts`.

**Lição:** ao extrair mídia de fontes externas (RSS, APIs de rede social),
sempre validar o *tipo* declarado, nunca assumir pela presença do campo.

### Cron pode falhar silenciosamente durante uma janela de indisponibilidade

**Sintoma:** um dia inteiro sem newsletter nem posts — nenhuma linha em
`newsroom_runs`, nenhuma edição em `news_editions`.

**Causa raiz:** o cron externo bateu em `/api/cron/newsroom` durante a
janela do 502 acima. A chamada nunca chegou a criar registro nenhum — não
teve erro pra logar porque a aplicação nem respondeu.

**Correção pontual:** disparo manual com `?wait=1` recupera o dia (o cron
não é sensível a data — roda a qualquer hora e gera a edição do dia
corrente).

**Lição / pendência:** não existe hoje nenhum alerta de "o cron devia ter
rodado e não rodou". `newsroom_runs` vazio num dia é indistinguível de "a
aplicação nunca recebeu a chamada" só olhando o painel — precisa checar
ativamente. Vale considerar um monitor externo (ex: healthcheck.io/cron
watchdog) que avisa se não houver run bem-sucedido até um horário limite.

## Conteúdo & IA

### QA de alucinação bloqueando o envio automático — isso é o sistema funcionando

> **Atualização de 2026-09-04.** A conclusão acima valia para o caso concreto,
> mas o portão estava calibrado errado. Ele olhava `qaResult.passed`, que é o
> veredito **genérico** autodeclarado pela IA: ela reprovava por tom, gramática
> ou nota baixa e a newsletter do dia inteiro ficava retida. E o motivo não era
> recuperável — dos sete campos que o checador devolve, só o `passed` era
> gravado; `issues` e `score` iam para um `console.log` dentro do contêiner.
>
> Agora o portão olha só `hallucination_risk`. Fato inventado chegando à lista
> não se desfaz com errata; vírgula errada se desfaz e não vale um dia sem
> edição. O detalhe do QA passou a ser gravado em `news_editions`
> (`qa_score`, `qa_hallucination_risk`, `qa_issues`) e uma retenção dispara
> alerta no Telegram — silêncio foi o que custou seis dias em agosto.
>
> **Lição sobre a lição:** "o sistema está funcionando" precisa ser verificável.
> Um portão cujo motivo de bloqueio não é gravado em lugar nenhum não é um
> portão auditável — é uma parada inexplicável.

**Sintoma:** a campanha do dia ficou como "draft" no Listmonk em vez de
disparar sozinha, sem nenhum erro visível.

**Causa raiz:** não é bug. O pipeline roda um checador de QA
(`qaResult.passed`) que reprovou a edição com `hallucination_risk: true` —
uma matéria incluiu números de comparação (percentuais de benchmark entre
modelos) que não estavam no pacote factual original das fontes. O
`autoSend` só dispara quando `qaResult.passed` é `true`
(`newsroom-service.ts`), então a campanha ficou retida pra revisão humana.

**Correção pontual:** editar a matéria removendo o trecho não verificável,
regerar o HTML (`renderEditionToHtml`) e atualizar a campanha via API do
Listmonk (`PUT /api/campaigns/:id` + `PUT /api/campaigns/:id/status`)
antes de disparar manualmente.

**Lição:** quando uma campanha fica em "draft" sem erro no log, checar
`qaResult` no retorno do cron (ou nos logs) antes de assumir que é bug —
pode ser o QA fazendo o trabalho dele. Vale melhorar a visibilidade disso
no painel de admin (hoje exige olhar o JSON bruto do run).

### GitHub Search API não suporta OR entre parênteses combinado com outro qualificador

**Sintoma:** `(topic:a OR topic:b OR topic:c) pushed:>data` devolvia
`total_count: 0` mesmo com milhares de repositórios em cada tópico
isoladamente.

**Correção:** uma query por tópico só, alternando por dia (`topic-sources.ts`).

**Lição:** testar queries da Search API do GitHub direto contra a API real
antes de assumir que a sintaxe documentada de outras APIs de busca se
aplica igual.

### Instagram Hashtag Search exige aprovação da Meta

Retorna erro `(#10)` em toda chamada sem o recurso "Instagram Public
Content Access" aprovado via App Review. Não é configuração errada — é
bloqueio de permissão mesmo. Hoje desligado via flag
(`INSTAGRAM_LISTENING_ENABLED = false` em `topic-sources.ts`), código pronto
pra religar assim que a aprovação sair.

### Instagram não permite DM automática por "seguiu a conta" — só por comentário

Cogitamos mandar Direct automático assim que alguém segue a conta (sem
precisar comentar nada). Não dá: a regra geral da Messaging API do Instagram
é que só se pode mandar DM pra quem já mandou mensagem primeiro — não existe
webhook público de "novo seguidor". A única exceção documentada é o "Follow to
DM", lançado pela Meta em outubro/2025, mas em beta fechada com o **ManyChat
como parceiro exclusivo** — o campo aparece no schema de webhooks da Meta mas
não na lista de campos publicamente inscritíveis, ou seja, não tem caminho de
acesso pra ferramenta self-hosted nenhuma (OpenReply incluso).

**Lição:** o único gatilho de Direct automatizado disponível pra gente é
comentário com keyword → private reply (exceção que a Meta permite
explicitamente). Não vale reinvestigar "mandar DM no follow" até a Meta abrir
isso como capacidade geral da Graph API.

### Guardrail de PI barrava a declaração da boa prática — duas vezes

**Sintoma.** Em 2026-09-04 o Sistema PROMPT tinha 2 conceitos no banco e os
dois `blocked`; zero assets, zero campanhas publicáveis. Sem conceito não há
aplicações, sem aplicações não há imagem, sem imagem não há post: o funil
inteiro parado por causa do portão.

**Causa.** O guardrail casava os termos proibidos sem olhar o contexto. Um
conceito que escreve `"sem marcas ou logotipos visíveis"` ou `"Não inserir
logos"` — que é exatamente o que se quer que ele escreva — era barrado por
*mencionar* o termo. A primeira correção acrescentou janela de negação e
fronteira de palavra (`"logo de"` casava com `"logo depois"`).

Sobrou um caso: `"aparência de recriação autoral, nunca de material oficial"`.
A lista de negações tinha `jamais` — a variante rara — e **não tinha `nunca`**.

**Corrigido.** `nunca`, `em vez de`, `no lugar de`, `nada de` na lista de
negações. Testes usam os textos reais dos conceitos bloqueados em produção, não
exemplos inventados.

**O segundo problema, maior que o primeiro.** O veredito é **gravado** no
registro, não recalculado na leitura. Afrouxar a regra não alcança o que já
está no banco: os dois conceitos continuariam barrados para sempre, e o
conserto seria `UPDATE` na mão em produção. Daí a rota
`/api/admin/prompt-system/concepts/reavaliar` e o botão no painel.

A reavaliação **só afrouxa** de propósito: conceito que passou a ser reprovado
sob a regra nova continua `draft`. Rebaixar conteúdo já aprovado — possivelmente
já publicado — é decisão editorial, não efeito colateral de um botão.

**Lição.** Portão cujo veredito é persistido precisa nascer com o caminho de
reavaliação. Sem ele, cada calibração do critério deixa um rastro de registros
presos numa regra que não existe mais. E quando um guardrail bloqueia texto,
teste com o texto que ele **deve** aprovar, não só com o que deve barrar — a
falha aqui não foi deixar passar o proibido, foi barrar o recomendado.

## Legal & marca

### Não usar o mascote do Claude como identidade genérica da conta

Usar o personagem oficial da Anthropic/Claude como mascote de todo post
(incluindo assuntos sem relação, tipo AWS ou ChatGPT) passa a impressão de
afiliação/endosso que não existe, além de risco de denúncia de propriedade
intelectual. Decisão: o mascote do Claude só aparece em posts
especificamente sobre Claude Code, como referência editorial pontual —
identidade geral da conta usa um personagem próprio e original (ver
`opendesign-renderer.ts`, `HOODIE_MASCOT_DESCRIPTION` vs
`CLAUDE_MASCOT_DESCRIPTION`).

## Ambiente de desenvolvimento

### Sessão do Claude Code tem rede restrita a domínios, não IPs

Chamar `http://<IP-da-VPS>:<porta>/...` diretamente (ex: webhook de deploy
do Easypanel) trava em timeout — o proxy de saída da sessão só libera
HTTPS pra domínios conhecidos. O mesmo domínio via HTTPS
(`https://casaloti.ia.br/...`) funciona normalmente. Na prática: quando
precisar disparar algo por IP:porta, pedir pro usuário rodar o comando, ou
usar a URL HTTPS do domínio se existir uma.

---

## Schema, dados e ambiente

Entradas de 2026-09-03 e 04.

### Seis dias sem produzir, e ninguém soube

**O que.** Em 2026-09-03 a produção foi encontrada parada desde 28/08:
`newsroom_runs`, `news_editions`, `articles` e `social_posts` todos com último
registro em 28/08. Seis edições não produzidas, seis dias sem newsletter e sem
post.

**Causa.** O cron não existia em lugar nenhum. Conferidos os quatro lugares
possíveis: `/etc/crontab` (só entradas padrão do Debian), `/etc/cron.d/` (só
docker-prune, e2scrub, monarx, sysstat), crontab do `deploy` (vazio) e a base
do EasyPanel (zero ocorrências de "schedule" ou "cron"). O cron da Hostinger
foi desligado na migração para a VPS — como o próprio `migracao-vps.md` manda
— e o da VPS nunca foi criado.

**Por que ninguém foi avisado.** O Tier 0 — alertas de Telegram, watchdog,
auto-refresh do token da Meta — estava no repositório e **não em produção**.
Os dois merges de 29/08 nunca foram deployados. A rede de proteção construída
justamente para gritar nesse cenário não estava no ar.

**Como foi diagnosticado sem privilégio no servidor.** `newsroom_runs` vazio no
período prova que a chamada não chegou à aplicação — uma execução que quebrasse
gravaria `failed`. E o commit publicado foi cercado testando quais rotas
respondem 401 (existe) contra 404 (não existe):
`/api/admin/carousel-design` e `/api/cron/refresh-instagram-token` davam 404,
`/api/cron/tutorial` dava 401. Confirmado depois no disco, em
`/etc/easypanel/projects/core/web/code`, que é legível sem sudo.

**Corrigido.** Crontab instalado no usuário `deploy` e deploy do `web` disparado
pelo webhook do EasyPanel.

**O que fazer.** Migração de host move o agendamento junto — e a verificação de
que o cron novo disparou tem que ser um item explícito, não uma suposição.
Um site respondendo 200 não diz nada sobre o pipeline: durante os seis dias o
site esteve no ar o tempo todo. O sinal é `newsroom_runs`, e agora o watchdog.

### Três dias sem newsletter: a decisão certa, comunicada por exceção

**Sintoma.** Último disparo em 05/09/2026. Em 06, 07 e 08 nada saiu, e
`newsroom_runs`, `news_editions` e `editorial_history` estavam vazios nos três
dias. A leitura imediata, e a que o incidente de agosto ensinou, era cron morto.

**Não era.** O log do próprio cron, em `/home/deploy/newsroom-cron.log`, tem as
três chamadas, às 09:03:01, 09:03:02 e 09:03:02 UTC, cada uma com resposta
`{"ok":true,"accepted":true}`: cron disparou, autenticação passou, a aplicação
aceitou. E as classificações persistidas em `news_candidates` provam que a
redação rodou inteira: em 07/09 às 09h foram gravadas 35 classificações, e em
08/09 às 09h outras 152, com os motivos nominais de recusa.

**Causa.** A linha editorial aprovou menos que o mínimo de 2 pautas. Reproduzido
em produção pelo `admin/newsroom/run` em dry-run: HTTP 500 em 40 segundos com
`"Edição não fecha hoje: 1 pauta(s) aprovada(s), mínimo 2. 191 pautas recusadas
pela linha editorial."` Isso é a regra funcionando. Dia sem pauta não vira
newsletter, e completar com o que o filtro recusou é não ter filtro.

**O defeito real.** A decisão era comunicada com `throw`. Um throw naquele ponto
acontece antes de qualquer escrita: `news_editions` e `newsroom_runs` ficam
adiante no fluxo e nunca eram alcançados. Três dias de acerto editorial não
deixaram uma linha em lugar nenhum e ficaram **indistinguíveis de um cron
morto**. Pior: o `.catch` da rota classificava o acerto como "Redação falhou",
em nível crítico, e pingava o watchdog como falha.

**Corrigido.** Dia sem pauta passou a ser resultado, não exceção:
`registrarDiaSemEdicao` grava um run com status `cancelled` (valor que já
existia no CHECK, sem migration), com as contagens e o motivo
`EDITORIAL_MINIMUM_NOT_MET`, e `runNewsroom` devolve `ok: false` com motivo
próprio. O alerta virou aviso com o número que importa, e o watchdog recebe
sucesso, porque a pergunta dele é se a chamada chegou à aplicação, e chegou.

**Detalhe que quase virou um segundo bug.** `newsroom_runs.idempotency_key` é
UNIQUE global. Gravando o dia sem edição com a chave canônica do dia, uma
recuperação bem-sucedida mais tarde perderia o próprio registro de sucesso e o
dia ficaria arquivado como cancelado tendo publicado. Daí o sufixo
`#sem-edicao`: registro que mente é pior que registro ausente, que é justamente
o problema que esta correção veio resolver.

**Consequência no Instagram.** O fluxo antigo cria `social_posts` a partir da
edição. Sem edição, não houve post: é consequência, não problema separado.

**Lição, que é a de agosto com o sinal trocado.** Em agosto, tabela vazia
significou cron morto. Em setembro, significou linha editorial funcionando. Os
dois exigem reações opostas e nenhum dos dois deixava rastro. Ausência de linha
nunca é diagnóstico: só é quando o caminho de sucesso E o de recusa ambos
escrevem. E o corolário: portão que decide não publicar precisa gravar antes de
sinalizar, porque sinalizar por exceção apaga o rastro do que ele decidiu.

### Token de longa duração da Meta expira em ~60 dias

**O que.** `INSTAGRAM_ACCESS_TOKEN` é um token longo que vence. Antes do Tier 0
ele era fixo no env: quando vencia, a publicação parava sem aviso.

**Corrigido em** `a0981ae` — cron diário `/api/cron/refresh-instagram-token`
renova quando falta pouco e alerta no Telegram se não conseguir.

**O que fazer.** Se a publicação parar, conferir `newsroom_runs` e o alerta do
Telegram antes de suspeitar do código.

---

### Data em UTC gravava o dia seguinte

**O que.** O pipeline usava `new Date().toISOString()` para a data da edição.
Toda execução depois das 21h no Brasil era gravada com a data do dia seguinte.

**Corrigido na** migração multi-projeto, com `projectToday(project)`, que
devolve a data no fuso de `projects.timezone`.

**O que fazer.** Nenhuma data de conteúdo vem de `new Date()` nem de
`current_date` (que é UTC no servidor). Sempre `projectToday(project)`. Esta
armadilha voltou a aparecer em 2026-09-03, ao desenhar
`prompt_concept_results.snapshot_date` — o `default current_date` foi removido
justamente por isso.

### `DEFAULT` de `project_id` é dívida, não conveniência

**O que.** As tabelas antigas ganharam `project_id` com `DEFAULT` do projeto
semente para não quebrar o código que ainda não passava o projeto.

**Risco.** Enquanto o `DEFAULT` existe, um call site esquecido grava
silenciosamente no projeto errado — e não há erro para investigar depois.

**O que fazer.** Tabela nova nasce com `project_id not null` **sem** default.
As tabelas `prompt_*` seguem essa regra.

### O banco tem estrutura que o repositório não descreve

**O que.** Em 2026-09-03, ao começar a Fase 0 do Sistema PROMPT, as oito
tabelas `prompt_*` **já estavam em produção** — aplicadas direto no banco, fora
de `supabase/migrations/`, sem nenhum arquivo do repo descrevendo-as. O desenho
aplicado era mais rico que o do documento de arquitetura (sequência de Direct,
régua de e-mail, explore/exploit, tabela `prompt_learnings`) e usava outro
vocabulário nos CHECKs: `status` é `draft`/`ready`/`published`/`blocked`/
`archived`, não os sete que o documento sugeria.

**Consequência.** Uma Fase 0 inteira foi escrita contra o schema do documento e
quebrou contra o banco real (`column prompt_campaigns.error_message does not
exist`), exigindo reescrita.

**O que fazer.** Antes de escrever código contra qualquer tabela, ler o schema
do **banco**, não o documento nem as migrações. Sem acesso SQL, o schema exposto
pelo PostgREST dá colunas, tipos, obrigatoriedade e chaves estrangeiras:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" | jq '.definitions'
```

CHECKs, unicidades e índices só saem por SQL — `pg_get_constraintdef` mais
`pg_indexes`, no SQL Editor. E migração que contradiga produção **não** entra em
`supabase/migrations/`: num banco novo criaria estrutura errada.

### UNIQUE sobre coluna nullable não protege nada

**O que.** Em 2026-09-03 criei `prompt_concept_results.snapshot_date` como
nullable e pus `unique (campaign_id, snapshot_date)` em cima dela, para
garantir um retrato por campanha por dia. No Postgres, nulos são **distintos
entre si** numa constraint UNIQUE: N linhas com `snapshot_date` nulo para a
mesma campanha passavam sem violação.

**Por que passou despercebido.** O teste na réplica preenchia `snapshot_date`
explicitamente, então a duplicata era barrada e a garantia parecia funcionar. O
caminho não testado — quem grava esquecer a coluna — era justamente o que a
constraint deveria cobrir.

**Corrigido em** `20260903130000_prompt_snapshot_date_not_null.sql`.

**O que fazer.** Unicidade que inclui coluna nullable precisa da coluna
`not null`, ou de um índice único parcial (`where col is not null`) mais uma
regra explícita para o caso nulo. E teste de invariante precisa exercitar o
caminho em que quem chama **erra** — o caminho correto não prova constraint
nenhuma.

### Constraint acrescentada com a tabela vazia não pode falhar

**O que.** Os invariantes de `prompt_*` (dedupe do funil, unicidade de lead,
formato da keyword) foram aplicados em 2026-09-03, enquanto as oito tabelas
ainda tinham zero linhas.

**Por que importa.** Depois, com dados, um único par duplicado impede a criação
da constraint, e o conserto passa a exigir limpeza manual — decidir qual linha
duplicada morre, em produção, com o funil rodando.

**O que fazer.** Unicidade e CHECK entram na janela em que a tabela está vazia.
Adiar é trocar um `ALTER TABLE` de segundos por uma migração de dados.

---

### `zod` era dependência não declarada

**O que.** `zod` é importado por código de runtime (`newsroom/schemas.ts`,
`social/instagram/schemas.ts`, `carousel-templates/tokens.ts`), mas chegava só
transitivamente por `eslint-config-next` — uma devDependency.

**Por que não quebrou.** Os dois Dockerfiles rodam `npm ci` puro, que instala
devDependencies. Confirmado com `npm ci --omit=dev` numa cópia limpa: o pacote
não vinha.

**Corrigido em** `7e940d2`, fixado em `4.4.3` exata — a versão que já estava
resolvida, para declarar a dependência sem subir a biblioteca que valida toda
saída de LLM do sistema.

**O que fazer.** Antes de enxugar imagem com `--omit=dev`, testar
`npm ci --omit=dev` numa cópia e conferir que os imports de runtime resolvem.

### Chave SSH com passphrase falha como "chave não autorizada"

**O que.** A chave `~/.ssh/claude_code` do VPS tem passphrase. Conexão
não-interativa falha com `Permission denied (publickey,password)` — mensagem
idêntica à de chave não instalada no servidor.

**Diagnóstico.** `ssh-copy-id` respondeu `All keys were skipped because they
already exist`: a chave estava lá, o `ssh` é que não conseguia destravá-la.

**O que fazer.** Carregar no agent uma vez
(`ssh-add --apple-use-keychain ~/.ssh/claude_code`) antes de concluir que o
acesso não existe. E lembrar que o usuário `deploy` não está no grupo `docker`:
dá shell, não alcança containers nem o EasyPanel.

### `.env` salvo como Rich Text

**O que.** Um `.env` criado pelo TextEdit foi salvo como `.env.rtf`. Nesse
formato nenhum carregador o lê, e renomear não resolve — o conteúdo é RTF.

**O que fazer.** `textutil -convert txt .env.rtf -output .env`, depois
`chmod 600`, e conferir que não sobrou caractere não-ASCII: as aspas curvas do
autocorretor corrompem valores de chave silenciosamente.

```bash
LC_ALL=C grep -c '[^ -~]' .env    # tem que ser 0
```
