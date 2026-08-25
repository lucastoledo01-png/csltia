import { AITokenUsage, callOpenAIJSON, getAIProviderConfig } from "./ai-provider";
import { NewsCandidate } from "./collector";
import { DeduplicatedGroup } from "./deduplicator";
import { RankedCandidate } from "./ranker";
import { EditionContent, EditionContentSchema, QAResult, QAResultSchema } from "./schemas";

export type PipelineResult = {
  edition: EditionContent;
  qaResult: QAResult;
  selectedCandidates: NewsCandidate[];
  totalUsage: AITokenUsage;
};

const SYSTEM_EDITORIAL_PROMPT = `
Você é o editor-chefe sênior e redator da publicação "desbuguei.ia".

Sua missão é transformar fatos brutos de Inteligência Artificial em uma edição editorial em português do Brasil impecável, natural, inteligente, leve e divertida.

DIRETRIZES DE TOM & ESTILO DA desbuguei.ia:
1. Tom: informal, leve, divertido, inteligente e conversacional (como uma conversa rápida de café com um colega dev sênior que manja tudo de IA).
2. Humor & Personalidade: Use observações irônicas leves e tiradas engraçadas sobre tecnologia, cotidiano de dev e negócios.
3. SEM VÍCIOS DE LINGUAGEM DE IA: PROIBIDO usar frases como "Em um mundo onde...", "No cenário atual...", "Não é apenas X, é Y", "Desvendando...", "Vale ressaltar...", "Sem dúvida...", "Em suma...", "Na era da inteligência artificial...". Seja direto, autêntico e humano!
4. Uso moderado de metáforas de programação e debugging (ex: bug, desbugar, modo debug, hotfix, log, compilou, deploy, travou, rodou, sem stack trace). Os jargões são o tempero.
5. SEM HYPE VAZIO: Não use adjetivos apelativos vazios ("revolucionário", "surpreendente"). Mostre o que mudou na prática.
6. RIGOR ANTI-ALUCINAÇÃO EXTREMO: Não invente preços, nomes, benchmarks, datas ou números. Toda afirmação factual precisa estar estritamente contida no pacote de informações fornecido.
7. ASSINATURA OBRIGATÓRIA: A edição deve encerrar a variável "final_line" exatamente com:
"Agora você está desbugado. Bora iniciar o dia."

ESTRUTURA DO JSON DE SAÍDA (retorne exclusivamente este JSON estrito):
{
  "subject_options": ["3 a 5 opções de assunto curiosas de 35 a 65 caracteres"],
  "subject": "A melhor opção de assunto escolhida",
  "preheader": "Resumo preheader de 60 a 110 caracteres",
  "headline": "Título editorial forte para o portal",
  "intro": "Abertura curta de 40 a 100 palavras danto bom dia e o clima do noticiário de IA",
  "stories": [
    {
      "rank": 1,
      "category": "Radar",
      "title": "Título da pauta 1",
      "summary": "Resumo direto do que aconteceu",
      "context": "Contexto e por que isso importa",
      "why_it_matters": "O motivo do impacto",
      "practical_impact": "O que muda na prática para desenvolvedores, empresas ou criadores",
      "humor_line": "Observação inteligente ou frase curta de humor leve",
      "source_name": "Nome da fonte",
      "source_url": "URL da fonte"
    }
  ],
  "quick_bits": [
    { "title": "Nota rápida", "text": "Texto breve de 1 ou 2 frases", "url": "URL opcional" }
  ],
  "closing": "Última frase divertida conectada ao conteúdo do dia (ex: Seu café talvez ainda esteja carregando. Você já não está.)",
  "final_line": "Agora você está desbugado. Bora iniciar o dia."
}
`;

export async function runNewsroomPipeline(
  rankedCandidates: RankedCandidate[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<PipelineResult> {
  const config = getAIProviderConfig(env);

  // 1. Selecionar 4 a 6 melhores pautas
  const topRanked = rankedCandidates.slice(0, 6);
  if (topRanked.length < 4) {
    throw new Error(`Número insuficiente de pautas qualificadas para gerar a edição (encontradas ${topRanked.length}, mínimo 4).`);
  }

  const selectedCandidates = topRanked.map((r) => r.group.primary);

  // 2. Montar Pacote Factual Estrito (Anti-Alucinação)
  const factualPackage = topRanked.map((item, index) => ({
    rank: index + 1,
    title: item.group.primary.title,
    source: item.group.primary.source_name,
    url: item.group.primary.url,
    secondary_sources: item.group.secondary_sources,
    category: item.group.primary.category,
    published_at: item.group.primary.published_at,
    facts_summary: item.group.primary.description,
    full_content: item.group.primary.content.slice(0, 1000),
  }));

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUsd = 0;

  // 3. Etapa de Redação Editorial (OPENAI_MODEL_EDITOR)
  const userWritingPrompt = `
Por favor, redija a edição de hoje da desbuguei.ia utilizando rigorosamente este pacote factual de notícias:

${JSON.stringify(factualPackage, null, 2)}

Requisitos obrigatórios:
- Gere entre 4 e 6 pautas principais detalhadas.
- Se houver matérias secundárias, adicione 2 a 4 itens em "quick_bits".
- Mantenha tom leve, brasileiro, inteligente e com jargões de programação na medida certa.
- Retorne EXCLUSIVAMENTE a estrutura JSON descrita na especificação.
`;

  const writingResult = await callOpenAIJSON<EditionContent>(
    [
      { role: "system", content: SYSTEM_EDITORIAL_PROMPT },
      { role: "user", content: userWritingPrompt },
    ],
    config.editorModel,
    env,
    fetcher
  );

  totalPromptTokens += writingResult.usage.promptTokens;
  totalCompletionTokens += writingResult.usage.completionTokens;
  totalCostUsd += writingResult.usage.estimatedCostUsd;

  // 4. Validação Zod da resposta
  let parsedEdition: EditionContent;
  try {
    parsedEdition = EditionContentSchema.parse(writingResult.data);
  } catch (err) {
    console.warn("[NEWSROOM QA] Erro na validação do Zod schema, executando tentativa de ajuste...");
    // Forçar final_line válida caso o modelo tenha variado a pontuação
    const rawData = writingResult.data as any;
    rawData.final_line = "Agora você está desbugado. Bora iniciar o dia.";
    parsedEdition = EditionContentSchema.parse(rawData);
  }

  // 5. Etapa de QA Editorial (OPENAI_MODEL_TRIAGE)
  const qaPrompt = `
Você é o auditor de qualidade e fatos da desbuguei.ia.

Analise esta edição produzida contra os fatos originais fornecidos:

PACOTE FACTUAL ORIGINAL:
${JSON.stringify(factualPackage.map((f) => ({ title: f.title, facts: f.facts_summary })), null, 2)}

EDIÇÃO PRODUZIDA:
${JSON.stringify(parsedEdition, null, 2)}

Avalie os pontos abaixo e responda EXCLUSIVAMENTE com o JSON do schema:
{
  "passed": boolean,
  "hallucination_risk": boolean,
  "tone_check_passed": boolean,
  "grammar_passed": boolean,
  "story_count_valid": boolean,
  "issues": ["lista de problemas encontrados se houver"],
  "score": número de 0 a 100
}
`;

  const qaResponse = await callOpenAIJSON<QAResult>(
    [
      { role: "system", content: "Você é um auditor rigoroso de fatos e qualidade editorial." },
      { role: "user", content: qaPrompt },
    ],
    config.triageModel,
    env,
    fetcher
  );

  totalPromptTokens += qaResponse.usage.promptTokens;
  totalCompletionTokens += qaResponse.usage.completionTokens;
  totalCostUsd += qaResponse.usage.estimatedCostUsd;

  const parsedQA = QAResultSchema.parse(qaResponse.data);

  return {
    edition: parsedEdition,
    qaResult: parsedQA,
    selectedCandidates,
    totalUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      estimatedCostUsd: totalCostUsd,
    },
  };
}
