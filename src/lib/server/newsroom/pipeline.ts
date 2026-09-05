import { AITokenUsage, callOpenAIJSON, getAIProviderConfig } from "./ai-provider";
import { NewsCandidate } from "./collector";
import { DeduplicatedGroup } from "./deduplicator";
import { RankedCandidate } from "./ranker";
import { EditionContent, EditionContentSchema, QAResult, QAResultSchema } from "./schemas";
import { limparVicios } from "./anti-vicios";
import type { ClaimNaoSustentada, PacoteFactual } from "../editorial/pacote-factual";
import { validarAncoragem } from "../editorial/pacote-factual";
import type { ResultadoDeClaims } from "../editorial/claims-semanticas";
import { auditarClaims } from "../editorial/claims-semanticas";

/**
 * Um apontamento que o redator precisa resolver.
 *
 * `indice` é a pauta, ou -1 quando o apontamento é da edição inteira, que é o
 * caso dos apontamentos do auditor: ele avalia o conjunto e nem sempre diz de
 * qual pauta está falando.
 */
export type ProblemaEditorial = {
  indice: number;
  tipo: "fato" | "claim" | "qa";
  descricao: string;
};

export type RodadaDeReparo = {
  tentativa: number;
  problemasRecebidos: string[];
  problemasRestantes: string[];
};

/**
 * Teto de tentativas de correção.
 *
 * Duas. A primeira resolve o caso comum, que é uma frase de consequência sem
 * lastro. A partir da terceira, o padrão observado é o modelo trocar um
 * problema por outro, e cada volta custa uma geração inteira.
 */
export const MAX_TENTATIVAS_DE_REPARO = 2;

export type AncoragemDaPauta = {
  /** Posição da pauta na edição, para casar com a lista de selecionadas. */
  indice: number;
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
  /** Auditoria de consequência, causa, impacto, comparação e previsão. */
  claimsSemanticas: ResultadoDeClaims;
  tentativasDeReparo: number;
  rodadasDeReparo: RodadaDeReparo[];
  /** Passou nas conferências de fato? Falso significa que não deve publicar. */
  aprovado: boolean;
  /** Por que não passou. Vazio quando aprovado. */
  bloqueios: string[];
  /** O que sobrou depois da última tentativa. */
  problemasRestantes: ProblemaEditorial[];
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

O ASSUNTO PODE SER CURTO E CURIOSO, MAS NÃO PODE INVERTER O FATO:
- Curiosidade não autoriza ambiguidade sobre o que aconteceu. Se o leitor pode entender o contrário do fato lendo só o assunto, o assunto está errado.
- O caso que motivou esta regra: uma liminar suspendeu uma ordem que RESTRINGIA a cidadania por nascimento, e o assunto saiu como "cidadania em pausa", que sugere que a cidadania foi suspensa. Aconteceu o oposto.
- Quando o fato é a suspensão de uma restrição, o assunto não pode sugerir que o direito foi suspenso. Prefira a forma factual e curta: "Justiça suspende ordem que restringia cidadania por nascimento", ou uma redução equivalente que preserve quem suspendeu o quê.
- Vale para toda inversão do mesmo tipo: barrar uma taxa não é criar uma taxa, adiar um prazo não é encerrar um prazo, negar um recurso não é conceder.

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
  maxTentativasDeReparo: number = MAX_TENTATIVAS_DE_REPARO,
  /** Nota mínima do auditor. Abaixo dela a edição não sai. */
  notaMinimaDeQA: number = 85,
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

CONCLUSÃO TAMBÉM É FATO:
- Consequência, causa, impacto, comparação, tendência e previsão só entram se o pacote sustentar. Elas parecem opinião e funcionam como afirmação factual para quem lê.
- Proibido, quando o pacote não disser: "isso encarece as compras", "isso facilita a imigração", "deve gerar empregos", "prejudica empresas", "muda o cenário para brasileiros", "a tendência é de aumento", "o impacto deve ser grande".
- Se o pacote não diz o que a medida faz, você não sabe o que ela provoca. Escreva o que aconteceu e diga que a fonte não informou o efeito.
- Certo: "A medida foi aprovada e segue para sanção. A fonte não informa o que muda para o consumidor."
- Errado: "A medida deve baratear as compras internacionais."
- Transição, ordem das ideias e tom são seus. Fato e consequência, não.

Requisitos obrigatórios:
- Gere exatamente ${topRanked.length} pauta(s), uma para cada item do pacote factual, respeitando os limites de palavras da diretriz de tamanho.
- Traga 2 a 3 itens rápidos em "quick_bits", de uma linha cada.
- Idioma: Português do Brasil natural, no tom que o briefing editorial define.
- NÃO use chamadas tipo 'clique aqui para continuar lendo'. Entregue o valor completo no e-mail.
- Retorne EXCLUSIVAMENTE a estrutura JSON especificada.
`;

  /*
   * Escrever, conferir, corrigir, conferir de novo.
   *
   * O QA reprovava e o dia acabava ali. Reprovar sem tentar consertar é
   * desperdiçar uma edição inteira por causa de duas frases, e as duas frases
   * costumam ser as mesmas: uma consequência que o material não sustenta.
   *
   * O reparo é cirúrgico e tem teto. O redator recebe de volta só o que foi
   * apontado, o motivo e o pacote factual, reescreve, e tudo é conferido de
   * novo. Passou do teto sem passar nas conferências, a edição não sai. Um
   * laço sem teto tentaria para sempre e gastaria para sempre.
   */
  const escreverEdicao = async (promptUsuario: string): Promise<EditionContent> => {
    const resposta = await callOpenAIJSON<EditionContent>(
      [
        { role: "system", content: montarSystemEditorial(marca) },
        { role: "user", content: promptUsuario },
      ],
      config.editorModel,
      env,
      fetcher,
    );

    totalPromptTokens += resposta.usage.promptTokens;
    totalCompletionTokens += resposta.usage.completionTokens;
    totalCostUsd += resposta.usage.estimatedCostUsd;

    try {
      // Antes da validação: o travessão é removido em toda string da edição.
      // O prompt já pede; isto garante. Uma edição bem escrita perde
      // credibilidade numa única frase que abre com traço longo.
      return EditionContentSchema.parse(limparVicios(resposta.data));
    } catch {
      console.warn("[NEWSROOM QA] Ajustando formato do JSON...");
      const bruto = limparVicios(resposta.data) as Record<string, unknown>;
      bruto.final_line = marca.assinatura;
      return EditionContentSchema.parse(bruto);
    }
  };

  const textoDaPauta = (story: EditionContent["stories"][number]): string =>
    [
      story.title,
      story.summary,
      story.context,
      story.why_it_matters,
      story.practical_impact,
      story.humor_line ?? "",
    ]
      .filter(Boolean)
      .join(" ");

  /*
   * Ancoragem dura: conferência determinística, sem modelo no meio.
   *
   * Compara nome próprio, número e data do texto contra o pacote. Foi assim
   * que "Operação Compliance Zero" seria pega mesmo se o auditor aprovasse.
   *
   * Sem pacote estruturado não há contra o que conferir, e a lista volta
   * vazia. Vazio aqui significa "não conferido", não "aprovado", e por isso
   * existe `temPacoteEstruturado`.
   */
  /*
   * Pacote da edição inteira.
   *
   * Abertura, giro rápido e fechamento não pertencem a uma pauta só, e por
   * isso ficavam sem conferência nenhuma. Foi lá que passou "os ganhos médios
   * por hora subiram 0,3% em agosto", com o "em agosto" acrescentado: o
   * auditor pegou no fim, depois de o reparo já ter gastado as tentativas em
   * outra coisa. Conferir contra a união dos pacotes coloca esse texto na
   * primeira rodada, junto com o resto.
   */
  const pacoteDaEdicao = (): PacoteFactual | null => {
    const todos = [...pacotes.values()];
    if (todos.length === 0) return null;
    return {
      verified_facts: todos.flatMap((p) => p.verified_facts),
      people: todos.flatMap((p) => p.people),
      organizations: todos.flatMap((p) => p.organizations),
      places: todos.flatMap((p) => p.places),
      dates: todos.flatMap((p) => p.dates),
      numbers: todos.flatMap((p) => p.numbers),
      gaps: todos.flatMap((p) => p.gaps),
      source_urls: todos.flatMap((p) => p.source_urls),
      texto_de_origem: todos.map((p) => p.texto_de_origem).join("\n\n"),
    };
  };

  const textoAvulso = (edicao: EditionContent): string =>
    [
      edicao.intro,
      ...(edicao.quick_bits ?? []).map((q) => `${q.title} ${q.text ?? ""}`),
      edicao.closing,
    ]
      .filter(Boolean)
      .join(" ");

  const conferirAncoragem = (edicao: EditionContent): AncoragemDaPauta[] => {
    if (!temPacoteEstruturado) return [];

    const porPauta = edicao.stories.map((story, i) => {
      const pacote = pacotes.get(topRanked[i]?.group.primary.url ?? "");
      if (!pacote) {
        return { indice: i, titulo: story.title, ancorado: true, conferidos: 0, naoSustentadas: [] };
      }
      const r = validarAncoragem(textoDaPauta(story), pacote);
      return {
        indice: i,
        titulo: story.title,
        ancorado: r.ancorado,
        conferidos: r.conferidos,
        naoSustentadas: r.naoSustentadas,
      };
    });

    const uniao = pacoteDaEdicao();
    if (!uniao) return porPauta;

    const r = validarAncoragem(textoAvulso(edicao), uniao);
    return [
      ...porPauta,
      {
        indice: -1,
        titulo: "abertura, giro rápido e fechamento",
        ancorado: r.ancorado,
        conferidos: r.conferidos,
        naoSustentadas: r.naoSustentadas,
      },
    ];
  };

  const auditarQA = async (edicao: EditionContent): Promise<QAResult> => {
    const qaPrompt = `
Você é o auditor de qualidade e de fatos desta publicação.

Analise esta edição produzida contra os fatos originais fornecidos:

PACOTE FACTUAL ORIGINAL (é a íntegra do que a redação recebeu; o que não está aqui não foi fornecido):
${JSON.stringify(factualPackage, null, 2)}

EDIÇÃO PRODUZIDA:
${JSON.stringify(edicao, null, 2)}

O QUE É ALUCINAÇÃO AQUI:
Marque "hallucination_risk" como true quando o texto ACRESCENTAR informação que o pacote não tem: um fato, um nome, um número, uma data, uma consequência, um efeito, uma comparação ou uma previsão que não estejam ali.

O QUE NÃO É:
- Paráfrase fiel. Se o pacote diz que o texto foi aprovado pela Câmara e pelo Senado, escrever que ele "avançou no Congresso" é a mesma informação com outras palavras. Sinônimo, resumo, ordem diferente e escolha de verbo não são acréscimo.
- Ressalva. Dizer que a fonte não informou algo é o comportamento correto, não um defeito.
- Assunto e opções de assunto. São chamadas curtas e podem ser perguntas. Avalie se afirmam algo FALSO, não se resumem demais. "A taxa das blusinhas está no fim?" é pergunta legítima quando o pacote diz que o texto foi aprovado e aguarda sanção; "A taxa das blusinhas acabou" seria falso.
- IMPRECISÃO DE REDAÇÃO. Chamar de "decisões" um conjunto que inclui um relatório, ou atribuir ao país o que uma juíza decidiu, é imprecisão: a informação existe no pacote e foi mal resumida. Isso vai para "issues" e derruba "passed", mas NÃO é alucinação.

A pergunta que separa as duas coisas: a informação existe no pacote?
- Não existe: alucinação, hallucination_risk = true.
- Existe e foi mal descrita: imprecisão, hallucination_risk = false, e descreva em "issues".

Na dúvida entre pedantismo e omissão, pergunte: um leitor que só tem o pacote factual seria induzido a acreditar em algo que não está nele? Se não, não é alucinação.

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

    const resposta = await callOpenAIJSON<QAResult>(
      [
        { role: "system", content: "Você é um auditor rigoroso de fatos e qualidade editorial." },
        { role: "user", content: qaPrompt },
      ],
      config.triageModel,
      env,
      fetcher,
    );

    totalPromptTokens += resposta.usage.promptTokens;
    totalCompletionTokens += resposta.usage.completionTokens;
    totalCostUsd += resposta.usage.estimatedCostUsd;

    return QAResultSchema.parse(resposta.data);
  };

  const auditarSemantica = async (edicao: EditionContent): Promise<ResultadoDeClaims> => {
    if (!temPacoteEstruturado) {
      return { claims: [], naoSustentadas: [], custoUsd: 0, tokens: 0, erro: null };
    }

    const auditaveis = edicao.stories
      .map((story, i) => {
        const pacote = pacotes.get(topRanked[i]?.group.primary.url ?? "");
        return pacote ? { indice: i, titulo: story.title, texto: textoDaPauta(story), pacote } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const uniao = pacoteDaEdicao();
    if (uniao) {
      auditaveis.push({
        indice: -1,
        titulo: "abertura, giro rápido e fechamento",
        texto: textoAvulso(edicao),
        pacote: uniao,
      });
    }

    const r = await auditarClaims(auditaveis, env, fetcher);
    totalCostUsd += r.custoUsd;
    return r;
  };

  let parsedEdition = await escreverEdicao(userWritingPrompt);
  let ancoragem = conferirAncoragem(parsedEdition);
  let parsedQA = await auditarQA(parsedEdition);
  let semantica = await auditarSemantica(parsedEdition);

  const rodadas: RodadaDeReparo[] = [];
  let tentativas = 0;

  const problemasDe = (
    anc: AncoragemDaPauta[],
    qa: QAResult,
    sem: ResultadoDeClaims,
  ): ProblemaEditorial[] => {
    const lista: ProblemaEditorial[] = [];

    for (const a of anc) {
      for (const c of a.naoSustentadas.filter((x) => x.severidade === "bloqueio")) {
        lista.push({
          indice: a.indice,
          tipo: "fato",
          descricao: `${c.tipo} "${c.valor}" não está no pacote factual (em: "${c.onde}")`,
        });
      }
    }

    for (const c of sem.naoSustentadas) {
      lista.push({
        indice: c.pauta,
        tipo: "claim",
        descricao: `${c.tipo} sem sustentação: "${c.trecho}". ${c.motivo}`,
      });
    }

    // Apontamento do auditor entra no reparo mesmo quando não bloqueia:
    // imprecisão de redação merece uma tentativa de conserto, e nota baixa
    // costuma vir de imprecisão acumulada. O que o apontamento não faz é
    // derrubar a edição sozinho: quem decide isso é `bloqueia`.
    for (const issue of qa.issues) {
      lista.push({ indice: -1, tipo: "qa", descricao: issue });
    }
    if (qa.hallucination_risk && qa.issues.length === 0) {
      lista.push({ indice: -1, tipo: "qa", descricao: "auditor marcou risco de alucinação sem detalhar" });
    }

    return lista;
  };

  /*
   * O que impede a edição de sair.
   *
   * Diferente da lista de reparo. Fato inventado, conclusão sem lastro e risco
   * de alucinação bloqueiam. Imprecisão de redação não: ela vira apontamento,
   * o reparo tenta consertar, e se sobrar, sobra registrada.
   */
  const bloqueia = (anc: AncoragemDaPauta[], qa: QAResult, sem: ResultadoDeClaims): string[] => {
    const motivos: string[] = [];
    const duros = anc.filter((a) => !a.ancorado);
    if (duros.length > 0) motivos.push(`REJECT_UNGROUNDED_CLAIM em ${duros.length} matéria(s)`);
    if (sem.naoSustentadas.length > 0) {
      motivos.push(`UNGROUNDED_EDITORIAL_CLAIM em ${sem.naoSustentadas.length} conclusão(ões)`);
    }
    if (qa.hallucination_risk) motivos.push("REJECT_EDITORIAL_QA: hallucination_risk");
    if (qa.score < notaMinimaDeQA) {
      motivos.push(`REJECT_EDITORIAL_QA: nota ${qa.score} abaixo do piso ${notaMinimaDeQA}`);
    }
    if (sem.erro) motivos.push(`auditoria de conclusões não rodou: ${sem.erro}`);
    return motivos;
  };

  let problemas = problemasDe(ancoragem, parsedQA, semantica);

  while (problemas.length > 0 && tentativas < maxTentativasDeReparo) {
    tentativas += 1;

    const promptDeReparo = `
A edição abaixo foi reprovada na conferência de fatos. Reescreva SOMENTE o necessário para resolver cada apontamento, mantendo o resto exatamente como está.

PACOTE FACTUAL (é tudo o que a redação tem; nada fora daqui existe):
${JSON.stringify(factualPackage, null, 2)}

EDIÇÃO ATUAL:
${JSON.stringify(parsedEdition, null, 2)}

APONTAMENTOS:
${problemas.map((p) => `- ${p.indice >= 0 ? `pauta ${p.indice + 1}` : "edição"}: ${p.descricao}`).join("\n")}

COMO CORRIGIR:
- Afirmação que o pacote não sustenta: remova a afirmação ou troque pelo que o pacote diz. Se o leitor precisa daquilo, escreva que a fonte não informou.
- Nome, número ou data fora do pacote: tire. Não substitua por outro nome, número ou data.
- Não invente nada novo para tapar o buraco deixado pela correção.
- Não mexa em pauta que não foi apontada.
- Mantenha o mesmo número de pautas, a mesma ordem e a assinatura.

Retorne EXCLUSIVAMENTE a edição inteira no mesmo formato JSON.
`;

    parsedEdition = await escreverEdicao(promptDeReparo);
    ancoragem = conferirAncoragem(parsedEdition);
    parsedQA = await auditarQA(parsedEdition);
    semantica = await auditarSemantica(parsedEdition);

    const restantes = problemasDe(ancoragem, parsedQA, semantica);
    rodadas.push({
      tentativa: tentativas,
      problemasRecebidos: problemas.map((p) => p.descricao),
      problemasRestantes: restantes.map((p) => p.descricao),
    });
    problemas = restantes;
  }

  const bloqueios = bloqueia(ancoragem, parsedQA, semantica);
  const aprovado = bloqueios.length === 0;

  return {
    edition: parsedEdition,
    qaResult: parsedQA,
    ancoragem,
    claimsSemanticas: semantica,
    tentativasDeReparo: tentativas,
    rodadasDeReparo: rodadas,
    aprovado,
    bloqueios,
    problemasRestantes: problemas,
    selectedCandidates,
    totalUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      estimatedCostUsd: totalCostUsd,
    },
  };
}
