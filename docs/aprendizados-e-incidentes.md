# Aprendizados e incidentes

Registro do que já quebrou e do que a plataforma bloqueou. Serve para não
redescobrir a mesma coisa duas vezes — e é o documento citado por
`estado-do-ecossistema.md` e pelas etapas 1 e 3 de
`sistema-prompt-arquitetura.md`.

Cada entrada diz **o que aconteceu**, **por que** e **o que fazer com isso**.
Nada aqui é hipótese: tudo tem origem num commit, num erro de API ou numa
verificação registrada.

---

## Bloqueios de plataforma

### Busca por hashtag no Instagram exige App Review

**O que.** A busca ampla por hashtag na Graph API responde erro `(#10)`:
requer permissão que só sai por App Review da Meta.

**Consequência.** O "listening amplo" descrito no ecossistema não existe.
Só funciona o monitoramento dos perfis explicitamente cadastrados em
`project_news_sources` com `type = 'instagram_profile'`.

**O que fazer.** Não planejar etapa que dependa de descoberta por hashtag sem
antes ter a aprovação. A etapa 1 do Sistema PROMPT contorna isso com entrada
manual no painel e coletores alternativos (Google Trends RSS, Reddit, catálogo
de estreias).

### Token de longa duração da Meta expira em ~60 dias

**O que.** `INSTAGRAM_ACCESS_TOKEN` é um token longo que vence. Antes do Tier 0
ele era fixo no env: quando vencia, a publicação parava sem aviso.

**Corrigido em** `a0981ae` — cron diário `/api/cron/refresh-instagram-token`
renova quando falta pouco e alerta no Telegram se não conseguir.

**O que fazer.** Se a publicação parar, conferir `newsroom_runs` e o alerta do
Telegram antes de suspeitar do código.

---

## Incidentes de produção

### 502 por bind incorreto do Next standalone

**O que.** A aplicação subiu mas respondeu 502. Causa: o build standalone do
Next não estava escutando no endereço esperado pelo proxy.

**Consequência real.** Um dia inteiro sem newsletter. E pior que a falha: o
silêncio. `newsroom_runs` vazio é indistinguível de "a aplicação nunca recebeu
a chamada do cron", então ninguém soube que havia quebrado.

**Corrigido em** `47684ae`. O silêncio foi corrigido depois, no Tier 0
(`a0981ae`): watchdog externo + alerta.

**O que fazer.** Tabela de execução vazia nunca é prova de que nada rodou.
Qualquer diagnóstico começa pelo watchdog, não pelo banco.

### `dall-e-3` descontinuado quebrou a geração de capa

**O que.** A geração da capa por IA falhou porque o modelo `dall-e-3` foi
descontinuado pela OpenAI.

**Corrigido em** `1e1a462` — migrado para `gpt-image-1`, mais mascotes fixos.

**O que fazer.** Identificador de modelo é dependência externa que muda sem
aviso. Ao ver falha na geração de imagem ou texto, conferir se o modelo ainda
existe antes de depurar o código.

### Query de busca no GitHub silenciosamente errada

**O que.** A geração diária de tutorial dependia de uma busca no GitHub cuja
query estava malformada. A falha não aparecia: o cron "rodava".

**Corrigido em** `f80cd69` — query consertada e diagnóstico real de falha
adicionado ao cron.

**O que fazer.** Cron que termina sem erro não significa cron que fez algo.
Todo novo cron precisa gravar o que produziu, não só que executou.

---

## Armadilhas de dados e schema

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

## Armadilhas de dependência e ambiente

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
