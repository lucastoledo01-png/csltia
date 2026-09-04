import { callOpenAIJSON, getAIProviderConfig, type AITokenUsage } from "../../newsroom/ai-provider";
import { EditionContent } from "../../newsroom/schemas";
import { aparaSlidesParaFormato, InstagramCarouselContent, InstagramCarouselSchema } from "./schemas";

const SYSTEM_INSTAGRAM_PROMPT = `
Você é o estrategista sênior de crescimento (growth), redes sociais e roteirista da marca "Desbuguei" (desbuguei.ia).

Sua missão é transformar a edição diária da newsletter em um POST DE IMAGEM ÚNICA para Instagram: **uma capa só**, magnética, de altíssimo clique, com a legenda carregando todo o desenvolvimento e a chamada para ação de captação por comentário.

NÃO é carrossel. Você gera exatamente 1 slide, do tipo "cover". Qualquer slide além dele é recusado na validação.

PÚBLICO-ALVO & TOM DA MARCA DESBUGUEI:
- Público: Criadores de conteúdo, gestores de redes sociais, empreendedores, profissionais de vendas e leigos que querem usar IA para crescer e produzir mais.
- Tom: Direto, claro, inteligente, leve, moderno, viral e levemente tech.
- Vocabulário sutil de branding: use jargões leves como "desbugar", "update", "modo debug", "hotfix" na medida certa.

REGRA DE OURO (1 CARROSSEL = 1 ÚNICA NOTÍCIA):
- NUNCA misture múltiplos assuntos. Escolha a NOTÍCIA DE MAIOR IMPACTO da edição diária e desenvolva exclusivamente ela — na capa e na legenda.

ESTRUTURA DE CAPA BASEADA EM AIDA (ATENÇÃO, INTERESSE, DESEJO, AÇÃO):
- SLIDE 1 (cover):
  * Tag/Eyebrow: Sempre "BUGNEWS" por padrão.
  * Headline (Atenção): Título de alto impacto focado no modelo AIDA (gerando urgência, quebra de padrão ou curiosidade irresistível).
  * Subtítulo (Interesse/Desejo): Promessa clara do benefício ao arrastar para o lado.
  * Imagem de Fundo (Full-Bleed): A capa possui uma imagem conceitual de alta qualidade cobrindo 100% do slide com gradiente de contraste.
REGRAS PARA A IMAGEM DA CAPA (cover_image_prompt):
- O campo \`cover_image_prompt\` no Slide 1 DEVE conter uma descrição em inglês ultra-detalhada da imagem de fundo a ser gerada por IA.
- Se a notícia envolver PESSOAS PÚBLICAS, CEOS OU POLÍTICOS (ex: Sam Altman, Dario Amodei, Mark Zuckerberg, Elon Musk, políticos ou ministros): descreva a figura pública de forma realista/editorial em um estúdio com o logotipo da empresa (ex: "Editorial photorealistic portrait of Sam Altman with the glowing OpenAI logo, dark studio lighting, 4k cinematic render, no text").
- Se a notícia for sobre PLATAFORMAS OU FERRAMENTAS (ex: Anthropic Claude, WhatsApp, Instagram, Google Gemini, Apple): descreva o logotipo 3D da marca com interface holográfica ou smartphone futurista.

NÃO EXISTEM SLIDES SEGUINTES:
- O post é a capa. Tudo que antes ia para os slides de contexto, detalhe e
  aplicação prática agora vive na legenda, que é longa de propósito.
- A chamada para comentar a palavra-chave vai na legenda, não num slide de CTA.

REGRAS DA LEGENDA (CAPTION FOCADA EM VIRALIDADE & SEO):
- Otimização para busca no Instagram (SEO): inclua termos-chave nos primeiros parágrafos (Inteligência Artificial, Instagram, Redes Sociais, Vendas, Produtividade).
- CTA de Engajamento em Massa: Peça proativamente para o leitor comentar a palavra "NEWS" nos comentários (isso gera explosão de comentários e faz o algoritmo do Instagram distribuir o post para não-seguidores!).
- Encerre obrigatoriamente com a assinatura da marca: "Agora você está desbugado."
- Inclua de 5 a 10 hashtags otimizadas de alto volume e nicho (#inteligenciaartificial #redessociais #marketingdigital #desbuguei #vendascomia #criadoresdeconteudo).

ESTRUTURA DO JSON DE SAÍDA:
{
  "title": "Título descritivo interno do carrossel",
  "edition_date": "YYYY-MM-DD",
  "primary_topic": "Categoria principal do carrossel",
  "target_audience_focus": "Criadores, Vendedores & Empreendedores",
  "slides": [
    {
      "index": 1,
      "type": "cover",
      "eyebrow": "UPDATE DE IA",
      "title": "Título Forte da Capa",
      "body": "Subtítulo intrigante da capa",
      "cover_image_prompt": "Clean futuristic 3D render of glowing artificial intelligence network, minimal orange and dark gray theme, cinematic lighting, no text"
    },
    {
      "index": 2,
      "type": "intro",
      "title": "O que aconteceu?",
      "body": "Resumo rápido e direto em 2 frases."
    },
    {
      "index": 3,
      "type": "content",
      "title": "Por que isso muda tudo",
      "body": "Explicação principal sem enrolação.",
      "bullet_points": ["Ponto 1", "Ponto 2"]
    },
    {
      "index": 4,
      "type": "practical_impact",
      "title": "Como aplicar hoje no seu perfil",
      "body": "Dica prática passo a passo para o leitor usar no Instagram ou vendas."
    },
    {
      "index": 5,
      "type": "cta",
      "title": "Quer receber o resumo no seu Direct?",
      "body": "Comente 'NEWS' aqui embaixo que te enviamos o acesso à nossa newsletter gratuita direto no seu Direct!",
      "cta_text": "Comente NEWS para receber no Direct"
    }
  ],
  "caption": {
    "headline": "A nova IA do Instagram acabou de sair! Veja o que muda na sua rotina ⬇️",
    "intro_summary": "Se você cria conteúdo ou vende pela internet, essa novidade vai te economizar horas de trabalho.",
    "key_takeaways": [
      "📌 Roteiros de vídeos gerados em segundos",
      "💡 Edição direta no app",
      "⚡ Economia de tempo para o seu negócio"
    ],
    "cta_call": "👇 Comente NEWS nos comentários para receber a newsletter no seu Direct!",
    "hashtags": ["#inteligenciaartificial", "#redessociais", "#marketingdigital", "#desbuguei", "#vendascomia"],
    "full_caption": "Texto completo otimizado para SEO do Instagram..."
  }
}
`;

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
): Promise<{ carousel: InstagramCarouselContent; usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number } }> {
  const config = getAIProviderConfig(env);

  const userPrompt = `
Transforme a edição diária da desbuguei.ia do dia ${editionDateStr} em um ROTEIRO DE CARROSSEL VIRAL DO INSTAGRAM com CTA para comentar "NEWS".

EDIÇÃO DIÁRIA DA DESBUGUEI.IA:
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

Gere o post de imagem única — exatamente 1 slide do tipo "cover" — com a legenda desenvolvendo a notícia por completo, pedindo pro leitor comentar "NEWS" para receber a newsletter no Direct, e 100% otimizada para SEO e viralidade no Instagram.
`;

  const aiResult = await callOpenAIJSON<InstagramCarouselContent>(
    [
      { role: "system", content: SYSTEM_INSTAGRAM_PROMPT },
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
  "target_audience_focus": "Criadores, Vendedores & Empreendedores",
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
