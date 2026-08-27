import { callOpenAIJSON, getAIProviderConfig } from "../../newsroom/ai-provider";
import { EditionContent } from "../../newsroom/schemas";
import { InstagramCarouselContent, InstagramCarouselSchema } from "./schemas";

const SYSTEM_INSTAGRAM_PROMPT = `
Você é o estrategista sênior de crescimento (growth), redes sociais e roteirista da marca "Desbuguei" (desbuguei.ia).

Sua missão é transformar a edição diária da newsletter em um ROTEIRO DE CARROSSEL PARA INSTAGRAM (5 a 8 slides) viral, otimizado para SEO do Instagram, com capa magnética de altíssimo clique e uma chamada para ação (CTA) FOCADA EM CAPTAÇÃO DE LEADS VIA COMENTÁRIOS (ex: ManyChat / automação de comentários).

PÚBLICO-ALVO & TOM DA MARCA DESBUGUEI:
- Público: Criadores de conteúdo, gestores de redes sociais, empreendedores, profissionais de vendas e leigos que querem usar IA para crescer e produzir mais.
- Tom: Direto, claro, inteligente, leve, moderno, viral e levemente tech.
- Vocabulário sutil de branding: use jargões leves como "desbugar", "update", "modo debug", "hotfix" na medida certa.

REGRA DE OURO (1 CARROSSEL = 1 ÚNICA NOTÍCIA):
- NUNCA misture múltiplos assuntos em um mesmo carrossel. Escolha a NOTÍCIA DE MAIOR IMPACTO da edição diária e aprofunde exclusivamente nela durante todos os slides do carrossel.

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

REGRAS DOS SLIDES SEGUINTES:
1. SLIDE 2 (intro / contexto): O que aconteceu em detalhes. Por que a grande empresa/plataforma lançou essa novidade e qual problema ela resolve.
2. SLIDE 3 (content / detalhes): Como a ferramenta/novidade funciona na prática. 3 a 4 bullet points explicando as funções principais e o diferencial.
3. SLIDE 4 (practical_impact): Como aplicar isso HOJE no seu perfil, conteúdo ou vendas. Passo a passo prático, direto e acionável.
4. SLIDE 5 (cta / automação): Chamada forte para o leitor comentar "NEWS" e receber a edição completa com todas as notícias no Direct:
   - cta_text: "Comente NEWS para receber no Direct"

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

Gere o carrossel (5 a 8 slides) com o CTA final pedindo pro leitor comentar "NEWS" para receber a newsletter no Direct, e legenda 100% otimizada para SEO e viralidade no Instagram.
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
    parsedCarousel = InstagramCarouselSchema.parse(aiResult.data);
  } catch (err) {
    console.warn("[INSTAGRAM PIPELINE] Validação Zod ajustada no fallback...");
    const raw = aiResult.data as any;
    if (!raw.edition_date) raw.edition_date = editionDateStr;
    if (!raw.slides || !Array.isArray(raw.slides)) raw.slides = [];
    parsedCarousel = InstagramCarouselSchema.parse(raw);
  }

  return {
    carousel: parsedCarousel,
    usage: aiResult.usage,
  };
}
