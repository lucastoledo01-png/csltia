import { AITokenUsage, callOpenAIJSON, getAIProviderConfig } from "./ai-provider";
import { NewsCandidate } from "./collector";
import { DeduplicatedGroup } from "./deduplicator";
import { RankedCandidate } from "./ranker";
import { EditionContent, EditionContentSchema, QAResult, QAResultSchema } from "./schemas";
import { limparVicios } from "./anti-vicios";
import type { ClaimNaoSustentada, PacoteFactual } from "../editorial/pacote-factual";
import { validarAncoragem } from "../editorial/pacote-factual";

export type AncoragemDaPauta = {
  titulo: string;
  ancorado: boolean;
  conferidos: number;
  naoSustentadas: ClaimNaoSustentada[];
};

export type PipelineResult = {
  edition: EditionContent;
  qaResult: QAResult;
  selectedCandidates: NewsCandidate[];
  totalUsage: AITokenUsage;
  /** Vazio quando nenhum pacote factual estruturado foi fornecido. */
  ancoragem: AncoragemDaPauta[];
};

/**
 * Identidade editorial da publicação, vinda do projeto.
 *
 * O prompt era uma constante com "desbuguei.ia", "público de criadores de
 * conteúdo" e "proibido jargão de TI" escritos no meio, e o sistema é
 * multi-projeto desde a migração, mas a voz não era. `editorial_prompt_extra`
 * existia na tabela `projects`, era carregado em `projects.ts` e **não era
 * usado em lugar nenhum**: mudar o projeto no banco não mudava uma vírgula do
 * texto gerado.
 *
 * O que fica fixo aqui é o que não depende de vertical (e-mail
 * autossuficiente, anti-alucinação, ausência de vício de linguagem de IA,
 * regras do assunto. O que é da marca vem de fora.
 */
export type MarcaEditorial = {
  nome: string;
  nicho: string;
  /** Voz, público e regras próprias da vertical. */
  extra: string;
  /** Frase exata que encerra a edição. */
  assinatura: string;
};

/**
 * Só a rede de segurança para quando o projeto não define a voz. Não é a
 * marca de ninguém: se este texto aparecer numa edição publicada, o projeto
 * está com os campos vazios.
 */
export const MARCA_PADRAO: MarcaEditorial = {
  nome: "a publicação",
  nicho: "Noticias do dia",
  extra: "Tom informativo, direto e humano.",
  assinatura: "Até amanhã.",
};

export function montarSystemEditorial(marca: MarcaEditorial): string {
  return `
Você é o editor-chefe sênior e redator da publicação "${marca.nome}", inspirada no formato autossuficiente e rico de newsletters como "The News".

NICHO DA PUBLICAÇÃO:
${marca.nicho}

BRIEFING EDITORIAL DESTA PUBLICAÇÃO (vale sobre qualquer regra genérica abaixo):
${marca.extra}

E-MAIL AUTOSSUFICIENTE, MAS CURTO:
- O leitor termina informado sem clicar em nada. Isso e' sobre completude, nao sobre tamanho.
- NAO crie "teasers" nem suspense convidando a sair do e-mail.
- TAMANHO POR PAUTA, e a regra e' rigida:
  * "summary" da pauta 1: no maximo 90 palavras.
  * "summary" das demais: no maximo 55 palavras. Um paragrafo so.
  * "context": no maximo 40 palavras, e SO na pauta 1. Nas outras, deixe vazio.
  * "practical_impact": UMA frase, no maximo 25 palavras. Objetiva: o que muda, para quem, a partir de quando.
  * "why_it_matters": no maximo 25 palavras.
  * "humor_line": opcional. Use em no maximo uma pauta da edicao, e so quando o assunto comportar.
- Corte adjetivo, repeticao e frase que so prepara a proxima. Se uma frase pode sair sem perder informacao, ela sai.
- A edicao inteira deve ser lida em menos de tres minutos.

DIRETRIZES DE TOM & ESTILO (Estilo "The News"):
1. Tom: conversacional e inteligente, como alguém que entende do assunto explicando para um amigo, dentro do tom que o briefing acima define.
2. LINGUAGEM ACESSÍVEL: traduza o jargão técnico do setor para o impacto prático na vida de quem lê. Se um termo do meio é inevitável, explique-o na primeira vez que aparecer.
3. Personalidade: observações e sacadas são bem-vindas quando o assunto comporta. Assunto sensível (dinheiro, saúde, situação legal de alguém) pede sobriedade, não piada.
4. SEM VÍCIOS DE LINGUAGEM DE IA: PROIBIDO usar clichês como "Em um mundo onde...", "No cenário atual...", "Não é apenas X, é Y", "Desvendando...", "Vale ressaltar...", "Sem dúvida...", "Em suma...". Seja autêntico, humano e direto!
5. FOCO PRÁTICO: cada pauta DEVE deixar claro o que muda, para quem muda e a partir de quando, para o público descrito no briefing.
6. RIGOR ANTI-ALUCINAÇÃO EXTREMO: Não invente preços, nomes, números, prazos ou datas. Toda afirmação factual precisa estar estritamente contida no pacote de informações fornecido. Se um detalhe relevante não está no pacote, escreva que a fonte não divulgou. Nunca preencha a lacuna.
7. ASSINATURA OBRIGATÓRIA: A edição deve encerrar a variável "final_line" exatamente com:
"${marca.assinatura}"

SKILL: TÍTULOS EDITORIAIS DE ALTA ABERTURA (regras para "subject_options" e "subject"):
O assunto do e-mail transforma a pauta PRINCIPAL (rank 1) num título curto, humano e curioso. NÃO é manchete jornalística tradicional. Precisa dar vontade de abrir o e-mail sem esconder totalmente o assunto e sem clickbait falso (a matéria precisa entregar o que o título promete).

Processo: leia a pauta principal, identifique o fato central, depois o elemento mais curioso, inesperado, contraditório, específico ou "conversável" dela: a tensão, o número, o personagem ou a situação estranha. Escreva o assunto a partir DESSE elemento, não de um resumo da notícia. Teste mental: "se eu tivesse acabado de ler isso e fosse comentar com um amigo, que frase faria ele perguntar 'como assim?'". Essa frase costuma ser o assunto ideal.

Características: 3 a 9 palavras, linguagem coloquial e falada, palavras simples, curiosidade incompleta, números específicos quando forem surpreendentes, perguntas curtas quando fizerem sentido, pequenas provocações, afirmações inesperadas, trocadilho só quando for realmente bom, caixa baixa como padrão.

Varie a estrutura entre as opções, não repita sempre o mesmo formato. Exemplos de estruturas possíveis (inspiração, não modelo fixo):
- pergunta curiosa: "você comeria um biscoito de plástico?"
- afirmação inesperada: "as vacas do futuro são brasileiras"
- número + consequência: "105 horas para 1 cesta básica"
- conversa: "alô, trump? alô, lula?"
- provocação: "não abra este email"
- referência cultural: "o nana neném da meta"
- pergunta sobre mudança: "a era concorde vai voltar?"
- choque entre dois conceitos: "ganhar menos para sorrir mais?"

PROIBIDO em subject_options e subject:
- travessão (—) e dois-pontos (:)
- formato "Empresa X anuncia Y: entenda o impacto"
- as palavras "entenda", "saiba tudo", "veja como", "descubra", "confira", "revoluciona", "transforma o mercado", "o futuro de...", "a nova era de...", "como X está mudando Y"
- resumir toda a notícia ou entregar a conclusão no título
- empilhar várias informações numa frase só
- tom institucional, acadêmico ou de release corporativo
- adjetivos vazios: "inovador", "revolucionário", "impressionante", "surpreendente"
- emoji como muleta
- clickbait que a matéria não entrega de verdade

Teste antes de escolher: "uma pessoa mandaria essa frase de verdade num grupo de WhatsApp?" Se parecer título de blog corporativo, portal de SEO, release de assessoria ou texto de IA, descarte e tente outra. Exemplo RUIM: "OpenAI lança ferramenta revolucionária que promete transformar a criação de vídeos". Exemplo MELHOR pro mesmo fato: "o hollywood da openai chegou?".

ESTRUTURA DO JSON DE SAÍDA (retorne exclusivamente este JSON estrito):
{
  "subject_options": [
    "3 a 5 opções de assunto seguindo a SKILL: TÍTULOS EDITORIAIS DE ALTA ABERTURA acima, variadas entre si"
  ],
  "subject": "A opção mais curta entre as subject_options que ainda preserva a curiosidade",
  "preheader": "Resumo preheader de 60 a 110 caracteres mostrando a utilidade prática da edição",
  "headline": "Título editorial impactante estilo manchete do The News",
  "intro": "Saudação matinal super leve e descontraída dando o bom dia e o clima da edição.",
  "stories": [
    {
      "rank": 1,
      "category": "Categoria curta da pauta, coerente com o nicho da publicação",
      "title": "Título atrativo e claro da pauta 1",
      "summary": "Resumo COMPLETO e aprofundado do fato em 2 a 3 parágrafos explicativos (sem cortar a informação pela metade).",
      "context": "Contexto do mercado ou da ferramenta.",
      "why_it_matters": "Por que isso importa de verdade para o público descrito no briefing.",
      "practical_impact": "O que muda na prática: para quem vale, a partir de quando, e o que a pessoa precisa fazer ou observar.",
      "humor_line": "Observação curta e humana sobre a pauta. Vazia quando o assunto não comporta leveza.",
      "source_name": "Nome da fonte original",
      "source_url": "URL da fonte"
    }
  ],
  "quick_bits": [
    { "title": "Nota Rápida", "text": "Super resumo completo de 1 a 2 frases sobre outra novidade útil de IA ou redes sociais.", "url": "URL opcional" }
  ],
  "closing": "Recado final convidando o leitor a compartilhar a edição com alguém que se interessa pelo assunto do briefing editorial. Não cite tema que não seja o desta publicação.",
  "final_line": "A assinatura exata definida no briefing."
}
`;
}

/**
 * Quantas pautas a edição comporta.
 *
 * Era 4 a 6, fixo. Depois de um filtro editorial isso é uma armadilha: num dia
 * em que só 3 pautas passam, ou a edição não sai ou o filtro é ignorado. Quem
 * manda agora é a configuração editorial, e o padrão aqui só existe para
 * quem chama sem informar.
 */
export type LimitesDaEdicao = { minimo: number; maximo: number };

const LIMITES_PADRAO: LimitesDaEdicao = { minimo: 2, maximo: 4 };

export async function runNewsroomPipeline(
  rankedCandidates: RankedCandidate[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  /** Identidade da publicação. Ausente cai na marca padrão. */
  marca: MarcaEditorial = MARCA_PADRAO,
  limites: LimitesDaEdicao = LIMITES_PADRAO,
  /**
   * Pacote factual por URL da pauta.
   *
   * Sem ele o redator recebe o resumo cru do feed e a checagem de ancoragem
   * não roda, que é como a edição saiu com uma operação policial inventada.
   */
  pacotes: Map<string, PacoteFactual> = new Map(),
): Promise<PipelineResult> {
  const config = getAIProviderConfig(env);

  const topRanked = rankedCandidates.slice(0, limites.maximo);
  if (topRanked.length < limites.minimo) {
    throw new Error(
      `Número insuficiente de pautas qualificadas para gerar a edição (encontradas ${topRanked.length}, mínimo ${limites.minimo}).`,
    );
  }

  const selectedCandidates = topRanked.map((r) => r.group.primary);

  const factualPackage = topRanked.map((item, index) => {
    const pacote = pacotes.get(item.group.primary.url);
    const base = {
      rank: index + 1,
      title: item.group.primary.title,
      source: item.group.primary.source_name,
      url: item.group.primary.url,
      secondary_sources: item.group.secondary_sources,
      category: item.group.primary.category,
      published_at: item.group.primary.published_at,
    };

    if (!pacote) {
      return {
        ...base,
        facts_summary: item.group.primary.description,
        full_content: item.group.primary.content.slice(0, 1000),
      };
    }

    return {
      ...base,
      verified_facts: pacote.verified_facts,
      people: pacote.people,
      organizations: pacote.organizations,
      places: pacote.places,
      dates: pacote.dates,
      numbers: pacote.numbers,
      /** O que a matéria não diz. Está aqui para o redator não preencher. */
      gaps: pacote.gaps,
      source_urls: pacote.source_urls,
    };
  });

  const temPacoteEstruturado = topRanked.some((item) => pacotes.has(item.group.primary.url));

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUsd = 0;

  const userWritingPrompt = `
Por favor, redija a edição de hoje da ${marca.nome} no estilo do "The News", 100% autossuficiente (o leitor recebe a informação completa dentro do e-mail sem precisar clicar em links para ler mais).

Pacote factual fornecido:
${JSON.stringify(factualPackage, null, 2)}

REGRA DE FATO, acima de qualquer outra:
- Nome próprio, número, data, valor, prazo, cargo, programa, operação, lei e órgão só podem aparecer se estiverem no pacote factual acima. Nenhuma exceção.
- Você NÃO tem conhecimento próprio sobre estes assuntos. O que não está no pacote não aconteceu.
- Nunca dê nome a uma operação, investigação, programa ou regra que o pacote não nomeia.
- Nunca acrescente o momento ("nesta semana", "em setembro") se a data não estiver no pacote.
- Nunca complete o que está em "gaps". Se o leitor precisa daquilo, escreva que a fonte não informou.
- Transição, ordem das ideias, tom e o significado prático para o leitor são seus. Fato, não.

Requisitos obrigatórios:
- Gere exatamente ${topRanked.length} pauta(s), uma para cada item do pacote factual, respeitando os limites de palavras da diretriz de tamanho.
- Traga 2 a 3 itens rápidos em "quick_bits", de uma linha cada.
- Idioma: Português do Brasil natural, no tom que o briefing editorial define.
- NÃO use chamadas tipo 'clique aqui para continuar lendo'. Entregue o valor completo no e-mail.
- Retorne EXCLUSIVAMENTE a estrutura JSON especificada.
`;

  const writingResult = await callOpenAIJSON<EditionContent>(
    [
      { role: "system", content: montarSystemEditorial(marca) },
      { role: "user", content: userWritingPrompt },
    ],
    config.editorModel,
    env,
    fetcher
  );

  totalPromptTokens += writingResult.usage.promptTokens;
  totalCompletionTokens += writingResult.usage.completionTokens;
  totalCostUsd += writingResult.usage.estimatedCostUsd;

  let parsedEdition: EditionContent;
  try {
    // Antes da validação: o travessão é removido em toda string da edição.
    // O prompt já pede; isto garante. Uma edição bem escrita perde
    // credibilidade numa única frase que abre com traço longo.
    parsedEdition = EditionContentSchema.parse(limparVicios(writingResult.data));
  } catch (err) {
    console.warn("[NEWSROOM QA] Ajustando formato do JSON...");
    const rawData = writingResult.data as any;
    rawData.final_line = marca.assinatura;
    parsedEdition = EditionContentSchema.parse(rawData);
  }

  const qaPrompt = `
Você é o auditor de qualidade e de fatos desta publicação.

Analise esta edição produzida contra os fatos originais fornecidos:

PACOTE FACTUAL ORIGINAL (é a íntegra do que a redação recebeu; o que não está aqui não foi fornecido):
${JSON.stringify(factualPackage, null, 2)}

EDIÇÃO PRODUZIDA:
${JSON.stringify(parsedEdition, null, 2)}

Avalie os pontos abaixo e responda EXCLUSIVAMENTE com o JSON:
{
  "passed": boolean,
  "hallucination_risk": boolean,
  "tone_check_passed": boolean,
  "grammar_passed": boolean,
  "story_count_valid": boolean,
  "issues": ["lista de problemas se houver"],
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

  /*
   * Ancoragem: conferência determinística, depois do auditor.
   *
   * O auditor é outro modelo lendo o texto, e um modelo pode deixar passar.
   * Esta parte não lê: ela compara nome próprio, número e data do texto
   * gerado contra o pacote, e o que não estiver lá aparece com o trecho em
   * que apareceu. Foi assim que "Operação Compliance Zero" seria pega mesmo
   * se o auditor tivesse aprovado.
   *
   * Sem pacote estruturado não há contra o que conferir, e a lista volta
   * vazia. Vazio aqui significa "não conferido", não "aprovado", e quem
   * chama precisa saber a diferença: por isso `temPacoteEstruturado`.
   */
  const ancoragem: AncoragemDaPauta[] = temPacoteEstruturado
    ? parsedEdition.stories.map((story, i) => {
        const pacote = pacotes.get(topRanked[i]?.group.primary.url ?? "");
        if (!pacote) {
          return { titulo: story.title, ancorado: true, conferidos: 0, naoSustentadas: [] };
        }

        const texto = [
          story.title,
          story.summary,
          story.context,
          story.why_it_matters,
          story.practical_impact,
          story.humor_line ?? "",
        ]
          .filter(Boolean)
          .join(" ");

        const r = validarAncoragem(texto, pacote);
        return {
          titulo: story.title,
          ancorado: r.ancorado,
          conferidos: r.conferidos,
          naoSustentadas: r.naoSustentadas,
        };
      })
    : [];

  return {
    edition: parsedEdition,
    qaResult: parsedQA,
    ancoragem,
    selectedCandidates,
    totalUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      estimatedCostUsd: totalCostUsd,
    },
  };
}
