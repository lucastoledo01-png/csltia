import { callOpenAIJSON, getAIProviderConfig, type AITokenUsage } from "../../newsroom/ai-provider";
import { EditionContent } from "../../newsroom/schemas";
import { aparaSlidesParaFormato, InstagramCarouselContent, InstagramCarouselSchema } from "./schemas";

/**
 * Identidade da marca no post. Mesma razão do prompt da redação: o sistema é
 * multi-projeto e a voz não era — o nome, o público e o CTA estavam escritos
 * dentro da constante.
 */
export type MarcaDoPost = {
  nome: string;
  nicho: string;
  extra: string;
  /** Palavra que o leitor comenta para receber o material. */
  keyword: string;
  assinatura: string;
};

export const MARCA_POST_PADRAO: MarcaDoPost = {
  nome: "desbuguei.ia",
  nicho: "Inteligencia artificial aplicada a conteudo, vendas e produtividade",
  extra: "Tom direto, leve e levemente tech.",
  keyword: "NEWS",
  assinatura: "Agora você está desbugado.",
};

function montarSystemDoPost(marca: MarcaDoPost): string {
  return `
Você é o estrategista sênior de crescimento e roteirista da marca "${marca.nome}".

Sua missão é transformar a edição diária da newsletter em um POST DE IMAGEM ÚNICA para Instagram: **uma capa só**, magnética, com a legenda carregando todo o desenvolvimento e a chamada para ação de captação por comentário.

NÃO é carrossel. Você gera exatamente 1 slide, do tipo "cover". Qualquer slide além dele é recusado na validação.

NICHO:
${marca.nicho}

BRIEFING DA MARCA (vale sobre qualquer regra genérica abaixo):
${marca.extra}

REGRA DE OURO (1 POST = 1 ÚNICA NOTÍCIA):
- NUNCA misture múltiplos assuntos. Desenvolva exclusivamente a pauta indicada — na capa e na legenda.

A CAPA:
- \`title\`: a manchete. Uma frase jornalística direta que dá o fato, não um teaser. De 8 a 16 palavras — ela é grande na arte e ocupa três linhas.
- \`highlight_text\`: **a expressão da manchete que será pintada em cor**. De 1 a 4 palavras, copiadas LITERALMENTE de dentro do \`title\` — mesma grafia, mesmos acentos. Escolha o miolo da notícia: o número, o prazo, o nome da regra, o verbo que muda algo. Se nada se destaca, devolva vazio; melhor sem realce que com a palavra errada colorida.
- \`body\`: uma linha de apoio curta.
- \`eyebrow\`: vazio. Este layout não usa chapéu.

REGRAS PARA A IMAGEM DA CAPA (cover_image_prompt):
- O campo \`cover_image_prompt\` no Slide 1 DEVE conter uma descrição em inglês ultra-detalhada da imagem de fundo a ser gerada por IA.
- A foto é sangrada e ocupa a arte inteira, com a manchete por cima na base. Descreva CENA, não composição gráfica: fotografia editorial real, não render 3D.
- Nunca peça texto, palavra, número, logotipo ou marca na imagem — a tipografia vem do template por cima, e palavra gerada por IA sai torta e em inglês.
- Deixe respiro na parte de baixo do enquadramento: é onde a manchete vai. Assunto centralizado ou no terço superior.
- Pessoa pública: descreva de forma editorial e realista, sem inventar cenário institucional que não existe.

NÃO EXISTEM SLIDES SEGUINTES:
- O post é a capa. Tudo que antes ia para os slides de contexto, detalhe e
  aplicação prática agora vive na legenda, que é longa de propósito.
- A chamada para comentar a palavra-chave vai na legenda, não num slide de CTA.

REGRAS DA LEGENDA:
- Otimização para busca no Instagram: termos-chave do nicho nos primeiros parágrafos.
- CTA: peça para o leitor comentar a palavra "${marca.keyword}" para receber o material no Direct.
- Encerre com a assinatura da marca: "${marca.assinatura}"
- De 5 a 10 hashtags do nicho, misturando volume alto e termo específico.
- RIGOR FACTUAL: número, prazo, taxa e requisito só entram se estiverem no pacote da edição. Não estime, não arredonde, não deduza.

ESTRUTURA DO JSON DE SAÍDA:
{
  "title": "Título descritivo interno do carrossel",
  "edition_date": "YYYY-MM-DD",
  "primary_topic": "Categoria principal do carrossel",
  "target_audience_focus": "Público descrito no briefing",
  "slides": [
    {
      "index": 1,
      "type": "cover",
      "eyebrow": "",
      "title": "A manchete, frase jornalística direta de 8 a 16 palavras",
      "highlight_text": "expressão copiada literalmente de dentro do title, 1 a 4 palavras",
      "body": "Linha de apoio curta",
      "cover_image_prompt": "Editorial documentary photograph, realistic, natural light, subject in the upper third with empty space at the bottom, no text, no logos"
    },
  ],
  "caption": {
    "headline": "Primeira linha da legenda, que continua a manchete",
    "intro_summary": "Duas ou três frases dizendo o que mudou e para quem",
    "key_takeaways": ["Ponto 1", "Ponto 2", "Ponto 3"],
    "cta_call": "👇 Comente ${marca.keyword} para receber no Direct",
    "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
    "full_caption": "Legenda completa, longa, com o desenvolvimento inteiro da notícia"
  }
}
`;
}

export async function generateInstagramCarouselPipeline(
  edition: EditionContent,
  editionDateStr: string = new Date().toISOString().split("T")[0],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  /**
   * Pauta que o carrossel deve desenvolver. A edição vira vários posts, um por
   * notícia, então quem chama escolhe qual — sem isso o modelo escolheria a de
   * maior impacto toda vez e os posts do dia se repetiriam.
   */
  focusStory?: EditionContent["stories"][number],
  /** Identidade da marca. Ausente cai no padrão. */
  marca: MarcaDoPost = MARCA_POST_PADRAO,
): Promise<{ carousel: InstagramCarouselContent; usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number } }> {
  const config = getAIProviderConfig(env);

  const userPrompt = `
Transforme a edição diária da ${marca.nome} do dia ${editionDateStr} em um ROTEIRO DE CARROSSEL VIRAL DO INSTAGRAM com CTA para comentar "${marca.keyword}".

EDIÇÃO DIÁRIA:
Headline: ${edition.headline}
Preheader: ${edition.preheader}
Intro: ${edition.intro}

PAUTAS DA EDIÇÃO:
${JSON.stringify(
  edition.stories.map((s) => ({
    category: s.category,
    title: s.title,
    summary: s.summary,
    practical_impact: s.practical_impact,
    why_it_matters: s.why_it_matters,
  })),
  null,
  2
)}

GIRO RÁPIDO:
${JSON.stringify(edition.quick_bits || [], null, 2)}

${
  focusStory
    ? `PAUTA OBRIGATORIA DESTE CARROSSEL (nao escolha outra, nao misture com as demais):
${JSON.stringify(
  {
    category: focusStory.category,
    title: focusStory.title,
    summary: focusStory.summary,
    context: focusStory.context,
    practical_impact: focusStory.practical_impact,
    why_it_matters: focusStory.why_it_matters,
    source_name: focusStory.source_name,
  },
  null,
  2,
)}

As demais pautas acima servem apenas de contexto do dia. Desenvolva exclusivamente a pauta obrigatoria.`
    : "Selecione a pauta de maior impacto da edicao e aprofunde exclusivamente nela."
}

Gere o post de imagem única — exatamente 1 slide do tipo "cover" — com a legenda desenvolvendo a notícia por completo, pedindo pro leitor comentar "${marca.keyword}" para receber o material no Direct, e 100% otimizada para SEO e viralidade no Instagram.
`;

  const aiResult = await callOpenAIJSON<InstagramCarouselContent>(
    [
      { role: "system", content: montarSystemDoPost(marca) },
      { role: "user", content: userPrompt },
    ],
    config.editorModel,
    env,
    fetcher
  );

  let parsedCarousel: InstagramCarouselContent;
  try {
    parsedCarousel = InstagramCarouselSchema.parse(aparaSlidesParaFormato(aiResult.data));
  } catch (err) {
    console.warn("[INSTAGRAM PIPELINE] Validação Zod ajustada no fallback...");
    const raw = aiResult.data as any;
    if (!raw.edition_date) raw.edition_date = editionDateStr;
    if (!raw.slides || !Array.isArray(raw.slides)) raw.slides = [];
    parsedCarousel = InstagramCarouselSchema.parse(aparaSlidesParaFormato(raw));
  }

  parsedCarousel.format = "noticia";

  return {
    carousel: parsedCarousel,
    usage: aiResult.usage,
  };
}

// ==========================================================================
// FORMATO TUTORIAL — adapta um artigo de tutorial já revisado (tabela
// `articles`, categoria "Tutorial") num carrossel de passos.
// ==========================================================================

export type TutorialArticleInput = {
  title: string;
  slug: string;
  excerpt: string;
  primaryTopic: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
  /** Palavra exclusiva pra comentar no CTA (recebe o tutorial escrito no Direct). */
  keyword: string;
};

const SYSTEM_TUTORIAL_CAROUSEL = `
Você é o roteirista da marca "Desbuguei" (desbuguei.ia). Sua missão é transformar um TUTORIAL ESCRITO já publicado em um ROTEIRO DE CARROSSEL PARA INSTAGRAM no formato PASSO A PASSO.

PÚBLICO & TOM:
- Criadores de conteúdo, gestores de redes sociais, empreendedores e curiosos por IA que não são programadores experientes.
- Direto, claro, com personalidade. Frases curtas. Nada de manual técnico frio.
- PROIBIDO clichê de IA ("Em um mundo onde...", "Não é apenas X, é Y", "Desvendando...", "Na era da...").

ESTRUTURA OBRIGATÓRIA DO CARROSSEL (4 a 10 slides):
- SLIDE 1 — type "cover":
  * "title": o RESULTADO que a pessoa vai alcançar (não "Tutorial de X" — sim "Rodando seu primeiro agente no Claude Code").
  * "eyebrow": "N PASSOS · M MIN" (ex: "6 PASSOS · 4 MIN"), estimando pelo número de passos.
  * "cover_image_prompt": descrição em inglês, ultra-detalhada, de um print realista do resultado/tela final ou de um setup de desenvolvedor. SEM texto na imagem.
- SLIDES DO MEIO — type "step", um passo REAL por slide:
  * "eyebrow": "PASSO 0X DE 0Y" (numeração só dos passos, não conta capa/CTA).
  * "title": a ação do passo, curta ("Instale a CLI", "Crie o arquivo do agente").
  * "bullet_points": array com UM item — o comando/código/config EXATO daquele passo (pode ter várias linhas, use \\n). Se o passo não tiver comando, deixe o array vazio.
  * "body": 1 frase curta explicando o passo ou por que ele importa.
- SLIDE DE FECHAMENTO (opcional) — type "tip":
  * "eyebrow": "FECHAMENTO"
  * "title": "Dica de quem já fez" ou similar.
  * "body": um erro comum a evitar, ou o próximo passo natural.
- ÚLTIMO SLIDE — type "cta":
  * "title": promessa de valor ("Quer o tutorial escrito, com tudo copiável?").
  * "body": 1 frase.
  * "highlight_text": a KEYWORD exclusiva do post (será mostrada no botão "Comente KEYWORD").

REGRAS:
- Um passo por slide. Não junte dois passos num slide só.
- Os comandos têm que ser os REAIS do tutorial de origem — não invente sintaxe.
- Não force número de slides: se o tutorial tem 3 passos, são 3 slides "step".

LEGENDA ("caption"): headline com gancho, intro_summary, 2-5 key_takeaways com emoji, cta_call pedindo pra comentar a keyword, 5-10 hashtags, full_caption completa. Encerre a full_caption com "Agora você está desbugado.".

FORMATO DE SAÍDA — APENAS um objeto JSON:
{
  "title": "título interno do carrossel",
  "edition_date": "YYYY-MM-DD",
  "primary_topic": "assunto",
  "target_audience_focus": "Público descrito no briefing",
  "slides": [ { "index": 1, "type": "cover", "title": "...", "eyebrow": "...", "cover_image_prompt": "..." }, ... ],
  "caption": { "headline": "...", "intro_summary": "...", "key_takeaways": ["..."], "cta_call": "...", "hashtags": ["..."], "full_caption": "..." }
}
`;

export async function generateTutorialCarouselPipeline(
  article: TutorialArticleInput,
  editionDateStr: string = new Date().toISOString().split("T")[0],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<{ carousel: InstagramCarouselContent; usage: AITokenUsage }> {
  const config = getAIProviderConfig(env);

  const userPrompt = `
Transforme este tutorial escrito da desbuguei.ia (data ${editionDateStr}) num carrossel PASSO A PASSO para Instagram.

TÍTULO: ${article.title}
RESUMO: ${article.excerpt}
ASSUNTO: ${article.primaryTopic}
KEYWORD EXCLUSIVA DO POST (use no CTA): ${article.keyword}

SEÇÕES DO TUTORIAL:
${JSON.stringify(
  article.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs })),
  null,
  2,
)}

Extraia os passos executáveis das seções acima (com os comandos reais), monte a capa focada no resultado e feche com o CTA pedindo pra comentar "${article.keyword}".
`;

  const aiResult = await callOpenAIJSON<InstagramCarouselContent>(
    [
      { role: "system", content: SYSTEM_TUTORIAL_CAROUSEL },
      { role: "user", content: userPrompt },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  let parsedCarousel: InstagramCarouselContent;
  try {
    parsedCarousel = InstagramCarouselSchema.parse(aparaSlidesParaFormato(aiResult.data));
  } catch {
    console.warn("[TUTORIAL CAROUSEL] Validação Zod ajustada no fallback...");
    const raw = aiResult.data as any;
    if (!raw.edition_date) raw.edition_date = editionDateStr;
    if (!raw.primary_topic) raw.primary_topic = article.primaryTopic;
    if (!raw.slides || !Array.isArray(raw.slides)) raw.slides = [];
    parsedCarousel = InstagramCarouselSchema.parse(aparaSlidesParaFormato(raw));
  }

  parsedCarousel.format = "tutorial";

  // Garante que o CTA carrega a keyword mesmo se o modelo esquecer.
  const ctaSlide = parsedCarousel.slides.find((s) => s.type === "cta");
  if (ctaSlide && !ctaSlide.highlight_text) ctaSlide.highlight_text = article.keyword;

  return { carousel: parsedCarousel, usage: aiResult.usage };
}
