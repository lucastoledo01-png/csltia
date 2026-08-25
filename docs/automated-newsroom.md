# Documentação Técnica: Redação Automatizada de IA (desbuguei.ia)

Sistema automatizado de curadoria, normalização, deduplicação, ranking e redação editorial de notícias diárias sobre Inteligência Artificial para a **`desbuguei.ia`**.

---

## 🏛️ Arquitetura do Pipeline (FASE 1)

1. **Fontes de Notícias (`src/lib/server/newsroom/news-sources.ts`)**:
   - Catálogo configurável com prioridade 1 (Laboratórios de IA oficiais: OpenAI, Anthropic, Google DeepMind, Meta, Microsoft, Hugging Face, GitHub, AWS, etc.) e prioridade 2 (Veículos de alta credibilidade: TechCrunch, Ars Technica, MIT Tech Review, VentureBeat, The Verge).
2. **Coleta e Filtro Temporal (`src/lib/server/newsroom/collector.ts`)**:
   - Parsing XML rápido (RSS/Atom) + sanitização de HTML + janela de tempo expansível (24h -> 36h -> 48h caso haja menos de 4 notícias elegíveis).
3. **Deduplicação (`src/lib/server/newsroom/deduplicator.ts`)**:
   - Detecção de notícias duplicadas por URL e similaridade sintática de título (Jaccard > 65%). Prioriza o laboratório oficial como fonte principal.
4. **Ranking Editorial (`src/lib/server/newsroom/ranker.ts`)**:
   - Score de 0 a 100 baseado em: Impacto (35%), Novidade (25%), Utilidade Prática (20%) e Credibilidade da Fonte (20%).
   - Limite de diversidade: no máximo 2 pautas da mesma empresa por edição.
5. **Redação & QA via OpenAI (`src/lib/server/newsroom/pipeline.ts`)**:
   - Utiliza `OPENAI_MODEL_TRIAGE` (`gpt-4o-mini`) para triagem barata e audit de QA factual.
   - Utiliza `OPENAI_MODEL_EDITOR` (`gpt-4o`) para a redação da edição completa na linguagem brasileira da `desbuguei.ia`.
   - **Assinatura Obrigatória**: Toda edição termina exatamente com: `Agora você está desbugado. Bora iniciar o dia.`.
6. **Orquestração & Modo DRY RUN (`src/lib/server/newsroom/newsroom-service.ts`)**:
   - `DRY_RUN=true` por padrão. Executa o pipeline com dados reais sem persistir edições nem enviar e-mails no Listmonk.
   - Registro de histórico e consumo em `newsroom_runs`.

---

## ⚙️ Variáveis de Ambiente

```bash
# OpenAI API Keys & Models
OPENAI_API_KEY=sk-...
OPENAI_MODEL_TRIAGE=gpt-4o-mini
OPENAI_MODEL_EDITOR=gpt-4o

# Modo de Segurança
DRY_RUN=true
CRON_SECRET=sua_chave_secreta_aqui
```

---

## 🛠️ Como Executar Manualmente (DRY RUN)

### Via CLI:
```bash
npx tsx src/scripts/cli-newsroom-dryrun.ts
```

### Via Endpoint Interno Protegido:
```bash
curl -X POST http://localhost:3000/api/admin/newsroom/run \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

---

## 🧪 Testes Unitários

```bash
npm test
```
