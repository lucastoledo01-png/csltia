import { chromium } from "playwright-core";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { assembleSlide } from "@/lib/carousel-templates/assemble";
import { resolveFormatConfigFromDb, resolveTokens } from "@/lib/carousel-templates/resolve";
import { InstagramCarouselContent } from "./schemas";

export type OpenDesignSlideAsset = {
  index: number;
  type: string;
  filename: string;
  htmlContent: string;
  pngBuffer: Buffer;
  publicUrl?: string;
};

export async function fetchImageAsBase64(url: string): Promise<string> {
  if (!url || !url.startsWith("http")) return url;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return url;
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mime = response.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${base64}`;
  } catch {
    return url;
  }
}

// Modelo de geração de imagem da OpenAI. "dall-e-3" foi descontinuado — a
// conta só tem acesso à família gpt-image agora. gpt-image-1 é o mais rápido
// e barato dos disponíveis; trocar aqui pra "gpt-image-2" se quiser mais
// qualidade (renderização mais rica) em troca de ~3x mais tempo de geração —
// tolerável aqui porque roda em background no worker, não bloqueia usuário.
const IMAGE_GENERATION_MODEL = "gpt-image-1";

// Mascote fixo pra manter uma identidade visual consistente entre os posts,
// em vez de sortear foto de banco de imagem a cada capa. Dois personagens:
// a figura de moletom pra assunto geral, e a figurinha do Claude só pra
// tutoriais que são especificamente sobre Claude Code — usar o mascote oficial
// do Claude como identidade genérica da conta seria uso indevido de marca de
// terceiro (Anthropic), por isso fica restrito a esse contexto.
const HOODIE_MASCOT_DESCRIPTION =
  "A mysterious person wearing a deep dark red hoodie (matte, muted brick-red tone), hood fully up, face completely hidden in pure black shadow with absolutely no facial features ever visible, photorealistic, cinematic single dramatic light source from above-front, moody low-key lighting, confident and enigmatic posture";

const CLAUDE_MASCOT_DESCRIPTION =
  "A small blocky voxel-shaped mascot figurine — simple cube-ish orange-red body, two simple rectangular black eyes, no mouth, minimalist geometric design like a real 3D-printed collectible toy, matte plastic texture with visible print layer lines, photorealistic product photography";

function isClaudeRelated(...texts: Array<string | undefined>): boolean {
  const combined = texts.filter(Boolean).join(" ").toLowerCase();
  return /claude|anthropic/.test(combined);
}

export async function generateCoverImageWithAI(
  title: string,
  coverPrompt?: string,
  primaryTopic?: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";

  const scene = coverPrompt || `${title} (${primaryTopic || "Inteligência Artificial"})`;
  const claudeRelated = isClaudeRelated(title, coverPrompt, primaryTopic);

  const finalPrompt = claudeRelated
    ? `${CLAUDE_MASCOT_DESCRIPTION}. Scene/context: the figurine placed in a realistic desk or tech setup scene related to: ${scene}. Warm cozy authentic tech-creator desk photography style, shallow depth of field, high-impact Instagram cover aesthetic. ABSOLUTELY NO TEXT, NO WORDS, NO TYPOGRAPHY, NO LOGOS IN THE IMAGE.`
    : `${HOODIE_MASCOT_DESCRIPTION}. Scene/context relates to: ${scene}. Solid black or deep charcoal background, subtle warm orange rim light, rich contrast, high-impact editorial Instagram cover aesthetic, 4k resolution. ABSOLUTELY NO TEXT, NO WORDS, NO TYPOGRAPHY IN THE IMAGE.`;

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_GENERATION_MODEL,
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024",
        quality: "high",
      }),
    });

    if (!res.ok) return "";
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : "";
  } catch {
    return "";
  }
}

/**
 * Imagem de fundo contextual quando a geração por IA não roda (sem
 * OPENAI_API_KEY) ou falha. Só é usada em slides de capa.
 */
export function getContextualBrandImage(title: string, primaryTopic: string, providedUrl?: string): string {
  if (providedUrl && providedUrl.startsWith("http") && !providedUrl.includes("photo-1618005182384")) {
    return providedUrl;
  }

  const text = (title + " " + primaryTopic).toLowerCase();

  if (text.includes("whatsapp") || text.includes("zap")) {
    return "https://images.unsplash.com/photo-1614680376593-902f749f7b2c?auto=format&fit=crop&w=1080&q=80";
  }
  if (text.includes("instagram") || text.includes("reels") || text.includes("meta")) {
    return "https://images.unsplash.com/photo-1611262588024-d12430b98920?auto=format&fit=crop&w=1080&q=80";
  }
  if (text.includes("chatgpt") || text.includes("openai") || text.includes("gpt")) {
    return "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=1080&q=80";
  }
  if (text.includes("google") || text.includes("gemini") || text.includes("busca")) {
    return "https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?auto=format&fit=crop&w=1080&q=80";
  }
  if (text.includes("apple") || text.includes("iphone") || text.includes("mac")) {
    return "https://images.unsplash.com/photo-1616469829941-c7200edec809?auto=format&fit=crop&w=1080&q=80";
  }

  // Sem categoria reconhecida: usa uma imagem própria, diferente de todas as
  // acima, pra não colidir e repetir capa em posts sem relação nenhuma entre si.
  return "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1080&q=80";
}

/**
 * Renderiza os slides do carrossel para PNG.
 *
 * O design (tokens + variantes) vem de `carousel_theme` / `carousel_format_config`
 * no Supabase, com fallback pro default do repo. A montagem do HTML é feita por
 * `assembleSlide` — a mesma função que o preview do painel usa.
 */
export async function renderOpenDesignSlides(carousel: InstagramCarouselContent): Promise<OpenDesignSlideAsset[]> {
  const totalSlides = carousel.slides.length;
  const format = carousel.format ?? "noticia";

  const [tokens, formatConfig] = await Promise.all([
    resolveTokens(),
    resolveFormatConfigFromDb(format),
  ]);

  // Por padrão o Chromium vem do registro do Playwright, populado por
  // `npx playwright install chromium`. Em servidor onde o navegador está em
  // outro lugar — imagem de contêiner, pacote do sistema — o caminho pode ser
  // informado por PLAYWRIGHT_CHROMIUM_EXECUTABLE.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined;

  const browser = await chromium.launch({ headless: true, executablePath });
  const assets: OpenDesignSlideAsset[] = [];

  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 2, // Retinal HD 2160x2700 screenshot
    });

    for (const slide of carousel.slides) {
      if (slide.type === "cover") {
        let imageUrl = slide.bg_image_url;

        if (!imageUrl) {
          const aiUrl = await generateCoverImageWithAI(
            slide.title,
            slide.cover_image_prompt,
            carousel.primary_topic,
          );
          if (aiUrl) imageUrl = aiUrl;
        }

        if (!imageUrl) {
          imageUrl = getContextualBrandImage(slide.title, carousel.primary_topic, slide.bg_image_url);
        }

        if (imageUrl && imageUrl.startsWith("data:")) {
          slide.bg_image_url = imageUrl;
        } else if (imageUrl && imageUrl.startsWith("http")) {
          const b64 = await fetchImageAsBase64(imageUrl);
          if (b64 && b64.startsWith("data:")) slide.bg_image_url = b64;
        }
      }

      const htmlContent = assembleSlide(slide, {
        format,
        tokens,
        formatConfig,
        slideIndex: slide.index,
        total: totalSlides,
      });

      await page.setContent(htmlContent, { waitUntil: "networkidle" });

      // Aguardar explicitamente o carregamento completo das fontes e imagens
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() =>
        Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise((resolve) => {
                  img.onload = img.onerror = resolve;
                }),
            ),
        ),
      );
      await page.waitForTimeout(300);

      const pngBuffer = await page.screenshot({ type: "png", fullPage: false });
      const filename = `slide-${String(slide.index).padStart(2, "0")}.png`;

      assets.push({
        index: slide.index,
        type: slide.type,
        filename,
        htmlContent,
        pngBuffer,
      });
    }
  } finally {
    await browser.close();
  }

  return assets;
}

export async function uploadOpenDesignSlideToStorage(
  pngBuffer: Buffer,
  filepath: string,
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdminClient();

    const { error: uploadErr } = await supabase.storage
      .from("public_assets")
      .upload(filepath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      console.warn("[OPENDESIGN STORAGE UPLOAD WARN]", uploadErr.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("public_assets")
      .getPublicUrl(filepath);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn("[OPENDESIGN STORAGE EXCEPTION]", err);
    return null;
  }
}
