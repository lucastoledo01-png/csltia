# Estado do ecossistema — avaliação honesta (2026-08-29)

Contexto: pergunta do dono — (1) dá pra desenhar os templates de carrossel à mão e o
sistema só trocar o texto? (2) o que existe hoje é sólido pra rodar 100% todo dia e ir
aprendendo, ou tem furo que vai quebrar?

Avaliação baseada em leitura do código (`src/lib/server/newsroom/`,
`src/lib/server/social/instagram/`, `src/lib/server/tutorials/`), migrações do Supabase,
`docs/operacao-diaria.md` e `docs/aprendizados-e-incidentes.md`. Cada furo abaixo foi
verificado no código ou já está registrado no doc de incidentes.

---

## 1. Templates feitos à mão — sim, e é o jeito certo

O conceito de **variante** (`src/lib/carousel-templates/variants.ts`) é exatamente isso:
template fixo, só o texto muda. A IA escreve a copy, nunca toca no layout.

**Fluxo de authoring que não quebra:**

1. Você fecha os 3 designs — capa + slides de corpo + slide de CTA, por formato. Em
   Figma/Canva ou descrevendo com precisão.
2. Eu converto cada um numa variante travada (HTML/CSS). Uma vez.
3. A partir daí o sistema só preenche texto em campos fixos. O editor do painel
   ("Carrossel") ajusta cor/tamanho via tokens, sem tocar na estrutura.

As variantes atuais são um rascunho a partir do style guide, **não** o design final.
Próximo passo concreto: travar os designs → virar variantes de verdade.

**Cuidado com "adaptando um ou outro ponto":** se o sistema puder rearranjar/redimensionar
por post, começa a ficar inconsistente. O certo é o template ter variantes explícitas que
*você* definiu (capa 1 linha vs. 2 linhas; passo com código vs. sem) e o sistema escolher
entre as suas opções fixas — nunca inventar layout.

**Não é realista:** "desenho no Figma e o sistema importa e mantém sincronizado pra
sempre". Ferramenta frágil. Padrão robusto: desenha → converte uma vez → congela.

---

## 2. O que temos é sólido, ou tem furo?

**Resposta direta:** a base é real e roda. O ecossistema completo descrito está **~40%
construído**, e as partes que existem têm furos de confiabilidade que contradizem "100%
funcional todo dia". Não vai "começar a quebrar" — o problema é que metade não existe e a
operação diária depende de um cron sem rede de proteção.

### Funciona hoje, de verdade

| Peça | Nota |
|---|---|
| Newsroom → newsletter (Listmonk) | Coleta → dedup → ranqueia → redige → QA de alucinação → campanha. O QA de fato segura o auto-send quando reprova (`newsroom-service.ts:449`). |
| Notícia → carrossel IG → publica | Edição → roteiro → valida schema → renderiza (Playwright) → Storage → Meta Graph. |
| Geração de tutorial | GitHub trending / listening de perfil → rascunho → tabela `articles`. |
| Painel admin + editor de carrossel | Redação, publicações, fontes, CMS, analytics de site, logs, design dos 3 formatos. |

### Não existe (do que foi descrito)

| Peça | Estado |
|---|---|
| **Loop de aprendizado** ("vai aprendendo, viralizou → faz mais") | **Zero.** Nada ingere alcance/saves/shares dos posts nem abertura/clique da newsletter. `email_events` existe, ninguém escreve. Nenhuma pontuação muda a pauta de amanhã. |
| **keyword → LP → captura → entrega** | **Zero.** É todo o Sistema PROMPT. Hoje o post diz "comente X" e nada acontece. |
| **OpenReply ligado ao csltia** | **Zero.** Login consertado, integração não começou. |
| **Geração do formato prompt** | Parcial — variantes + preview existem, pipeline não. |
| **Listening amplo no Instagram** | Bloqueado pela Meta (hashtag search exige App Review, erro `(#10)`). Só monitoramento de perfis listados funciona. |

### Furos de confiabilidade

1. **[CRÍTICO] Cron sem vigia.** `crontab` na VPS (`3 9 * * *` → 06:03 BRT) batendo numa
   URL. VPS reinicia / container fora / curl falha → silêncio total, nada logado. Já
   aconteceu (dia inteiro sem newsletter durante o 502). `newsroom_runs` vazio é
   indistinguível de "a app nunca recebeu a chamada".
2. **[CRÍTICO] Token do Instagram não renova.** `INSTAGRAM_ACCESS_TOKEN` fixo no env. Token
   longo da Meta expira ~60 dias. Sem renovação nem alerta no csltia → publicação para sem
   aviso.
3. **[ALTO] Nenhum alerta, em lugar nenhum.** Sem e-mail/Slack/webhook em falha. Só
   descobre olhando o painel.
4. **[ALTO] OpenAI sem plano B.** OpenAI cai/recusa → redação inteira falha, sem degradação
   graciosa.

---

## 3. O que "100% funcional + que aprende" exige

### Tier 0 — confiabilidade (fazer primeiro, ~2-3 dias, retorno desproporcional)
- Watchdog externo (healthchecks.io / cron-job.org): sem run bem-sucedido até um
  horário-limite → avisa.
- Renovação automática do token da Meta + alerta de expiração próxima.
- Falha de OpenAI/Meta/Listmonk → alerta visível (e-mail ou Telegram), não linha de log.

### Tier 1 — espinha do funil
- Sistema PROMPT Fases 0-2: schema + keyword única + automação no OpenReply + LP dinâmica +
  captura + entrega. Liga o "comente X" a algo que acontece.

### Tier 2 — loop de aprendizado
- Cron diário: insights do Meta (alcance, saves, shares) + stats do Listmonk (abertura,
  clique) → tabelas `*_results` → alimenta a pontuação de pauta. "Viralizou → faz mais" e
  "newsletter abriu bem → repete" viram automáticos.

### Tier 3 — expansão
- Geração do formato prompt. Listening amplo (depende da aprovação da Meta).

---

## Recomendação

Base boa mas incompleta. **Tier 0 primeiro** — tira o sistema de "reza pra não quebrar" e
bota em "roda e avisa". Depois Tier 1 (espinha), depois Tier 2 (aprendizado). Cada camada
sobre uma que já é confiável.

Templates: pode fechar os designs a qualquer momento — não depende dos tiers.
