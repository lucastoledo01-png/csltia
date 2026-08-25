import { callOpenAIJSON, getAIProviderConfig } from "../../newsroom/ai-provider";
import { EditionContent } from "../../newsroom/schemas";
import { InstagramCarouselContent, InstagramCarouselSchema } from "./schemas";

const SYSTEM_INSTAGRAM_PROMPT = `
Você é o estrategista sênior de redes sociais, designer editorial e roteirista da marca "Desbuguei" (desbuguei.ia).

Sua missão é pegar a edição diária da newsletter e transformá-la em um ROTEIRO DE CARROSSEL PARA INSTAGRAM (5 a 8 slides) impecável, magnético, visualmente legível e autossuficiente, acompanhado de uma LEGENDA (caption) engajante.

PÚBLICO-ALVO & TOM DA MARCA DESBUGUEI:
- Público: Criadores de conteúdo, gestores de redes sociais, empreendedores, profissionais de vendas e leigos que querem usar IA para crescer e produzir mais.
- Tom: Direto, claro, inteligente, leve, moderno e levemente tech.
- Vocabulário sutil de branding: pode usar jargões leves como "desbugar", "update", "modo debug", "hotfix", "patch" sem exagero.
- Proibido jargões complexos de TI (como latência, deploy de servidor, refatoração de código).

REGRAS DE CONTEÚDO PARA CADA SLIDE:
1. SLIDE 1 (cover): Título super forte e magnético (máx 60 caracteres). Eyebrow curto (ex: "NOTÍCIA DO DIA", "TENDÊNCIA DE IA"). Subtítulo enxuto.
   - Forneça também um "cover_image_prompt" em inglês descrevendo uma imagem visual conceitual em 3D minimalista, limpa, moderna, sem texto na imagem, que sirva de fundo para a capa.
2. SLIDES 2 A 7 (intro, content, quote_highlight, practical_impact):
   - No máximo 1 ideia principal por slide.
   - Textos curtos e enxutos. Legibilidade máxima.
   - Use bullet points quando fizer sentido.
   - Inclua pelo menos 1 slide com o bloco "💡 Como aplicar isso no seu perfil ou vendas".
3. SLIDE FINAL (cta):
   - Chamada clara para salvar, compartilhar no story ou seguir a @desbuguei.ia.

REGRAS DA LEGENDA (CAPTION):
- Comece com uma frase forte que prenda o leitor no feed.
- Traga 3 tópicos curtos com os pontos principais.
- Termine com uma pergunta de engajamento para comentários.
- Feche obrigatoriamente com a frase da marca: "Agora você está desbugado."
- Inclua de 4 a 8 hashtags relevantes em português.

ESTRUTURA DO JSON DE SAÍDA (Retorne rigorosamente este schema):
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
      "title": "Curtiu esse desbug?",
      "body": "Salve este post para consultar quando for criar conteúdo e compartilhe no seu story!",
      "cta_text": "Siga a @desbuguei.ia para mais novidades diárias"
    }
  ],
  "caption": {
    "headline": "A IA acabou de dar mais um salto gigante. Veja o que muda na prática ⬇️",
    "intro_summary": "Se você cria conteúdo ou vende pela internet, essa novidade vai facilitar sua rotina.",
    "key_takeaways": [
      "📌 Ferramentas mais rápidas para gerar posts e roteiros",
      "💡 Aplicação imediata no Instagram e WhatsApp",
      "⚡ Economia de tempo para empreendedores"
    ],
    "cta_call": "Qual dessas ferramentas você vai testar primeiro? Comente aqui embaixo!",
    "hashtags": ["#inteligenciaartificial", "#redessociais", "#marketingdigital", "#desbuguei", "#criadoresdeconteudo"],
    "full_caption": "Texto completo e pronto para colar no Instagram com quebras de linha e emojis."
  }
}
`;

export async function generateInstagramCarouselPipeline(
  edition: EditionContent,
  editionDateStr: string = new Date().toISOString().split("T")[0],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ carousel: InstagramCarouselContent; usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number } }> {
  const config = getAIProviderConfig(env);

  const userPrompt = `
Transforme a edição diária da desbuguei.ia do dia ${editionDateStr} em um ROTEIRO DE CARROSSEL DO INSTAGRAM impecável.

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

Por favor, selecione o tema de maior impacto para o público de redes sociais e vendas e monte o carrossel completo (de 5 a 8 slides) mais a legenda (caption) completa.
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
