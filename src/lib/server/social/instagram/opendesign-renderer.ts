import { chromium } from "playwright-core";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { assembleSlide } from "@/lib/carousel-templates/assemble";
import {
  resolveFormatConfigFromDb,
  resolveLayout,
  resolveTokens,
} from "@/lib/carousel-templates/resolve";
import { InstagramCarouselContent } from "./schemas";
import {
  bancoConfigurado,
  buscarFotoDeBanco,
  consultaDaCapa,
} from "../../prompt-system/stock";

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

/**
 * Prompt da capa: fotografia editorial da cena, sem personagem.
 *
 * Havia um mascote — uma figura de moletom com o rosto na sombra — prefixado
 * em **toda** capa, com a notícia entrando depois como "contexto". O resultado
 * era o previsível: uma matéria sobre fila de green card virava um vulto
 * encapuzado num quarto escuro. O personagem era o assunto da imagem e a
 * notícia era o pano de fundo, exatamente ao contrário do que uma capa de
 * notícia precisa.
 *
 * Aqui a cena é o assunto. O que ficou fixo é a *linguagem* — fotojornalismo,
 * luz natural, sem texto — e não um personagem: é o que dá unidade à conta sem
 * amarrar toda notícia à mesma figura.
 *
 * ## Duas regras que existem por causa do template
 *
 * - **Retrato, não quadrado.** A arte é 1080×1440 e a imagem entra com
 *   `object-fit: cover`. Uma imagem 1024×1024 nesse quadro perde as laterais,
 *   e é onde o assunto costuma estar.
 * - **Espaço embaixo.** O terço inferior recebe a manchete. Sem pedir isso, o
 *   modelo centraliza o assunto e o texto cai por cima do rosto. Pedir "espaço
 *   vazio" também não serve: o modelo desenha uma faixa cinza lisa, que é uma
 *   moldura, não uma foto. O pedido é por *simplicidade visual* na parte de
 *   baixo — chão, superfície, primeiro plano desfocado —, ainda dentro da cena.
 */
const LINGUAGEM_DA_CAPA =
  "Editorial photojournalism, realistic documentary photograph, natural available light, " +
  "muted true-to-life colors, shallow depth of field, shot on a full-frame camera with a " +
  "35mm or 50mm lens, candid and unstaged";

const ENQUADRAMENTO_DA_CAPA =
  "Vertical portrait framing. Compose with the main subject in the upper two thirds. " +
  "The bottom third should be visually simple — floor, ground, a plain surface or an " +
  "out-of-focus foreground — but still a real part of the photographed scene: do not " +
  "leave it blank, do not add a solid band, border, gradient or empty margin. " +
  "ABSOLUTELY NO TEXT, NO WORDS, NO LETTERING, NO NUMBERS, NO LOGOS, NO BRAND MARKS, " +
  "NO WATERMARKS anywhere in the image.";

export async function generateCoverImageWithAI(
  title: string,
  coverPrompt?: string,
  primaryTopic?: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";

  const cena = (coverPrompt || "").trim() || `${title}${primaryTopic ? ` — ${primaryTopic}` : ""}`;

  const finalPrompt = `${cena}. ${LINGUAGEM_DA_CAPA}. ${ENQUADRAMENTO_DA_CAPA}`;

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
        // Retrato, na proporção da arte. Quadrado era cortado nas laterais.
        size: "1024x1536",
        quality: "high",
      }),
    });

    if (!res.ok) {
      console.warn(`[CAPA] Geração falhou (${res.status}).`);
      return "";
    }
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : "";
  } catch (err) {
    console.warn("[CAPA] Exceção na geração:", err);
    return "";
  }
}

/**
 * Imagem de reserva, quando a geração por IA não roda ou falha.
 *
 * A lista anterior mapeava WhatsApp, Instagram, ChatGPT, Google e Apple — o
 * catálogo da vertical de IA. Numa notícia de imigração, nenhuma dessas
 * condições casava e **toda** capa caía na mesma foto genérica: posts sem
 * relação nenhuma entre si saíam com a mesma imagem, que foi o incidente do
 * `dall-e-3` de novo por outro caminho.
 *
 * As categorias agora são as do assunto, e o padrão continua sendo o último
 * recurso — não o caminho normal.
 */
const RESERVAS: Array<{ termos: string[]; url: string }> = [
  {
    termos: ["visto", "consulad", "embaixad", "entrevista", "passaporte"],
    url: "https://images.pexels.com/photos/1051075/pexels-photo-1051075.jpeg?auto=compress&cs=tinysrgb&w=1080",
  },
  {
    termos: ["green card", "residencia", "residência", "cidadania", "naturaliza"],
    url: "https://images.pexels.com/photos/6077326/pexels-photo-6077326.jpeg?auto=compress&cs=tinysrgb&w=1080",
  },
  {
    termos: ["ice", "deporta", "detid", "custodia", "custódia", "fiscaliza"],
    url: "https://images.pexels.com/photos/5669602/pexels-photo-5669602.jpeg?auto=compress&cs=tinysrgb&w=1080",
  },
  {
    termos: ["fronteira", "border", "asilo", "refugiad", "migrant"],
    url: "https://images.pexels.com/photos/5473955/pexels-photo-5473955.jpeg?auto=compress&cs=tinysrgb&w=1080",
  },
  {
    termos: ["corte", "juiz", "tribunal", "decisao", "decisão", "lei", "decreto", "regra"],
    url: "https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&cs=tinysrgb&w=1080",
  },
  {
    termos: ["trump", "casa branca", "governo", "congresso", "politica", "política"],
    url: "https://images.pexels.com/photos/1550337/pexels-photo-1550337.jpeg?auto=compress&cs=tinysrgb&w=1080",
  },
  {
    termos: ["trabalho", "emprego", "h-1b", "h1b", "empresa", "profission"],
    url: "https://images.pexels.com/photos/373912/pexels-photo-373912.jpeg?auto=compress&cs=tinysrgb&w=1080",
  },
];

/** Bandeira e paisagem urbana: serve a qualquer pauta sem cair no absurdo. */
const RESERVA_PADRAO =
  "https://images.pexels.com/photos/1550337/pexels-photo-1550337.jpeg?auto=compress&cs=tinysrgb&w=1080";

export function getContextualBrandImage(title: string, primaryTopic: string, providedUrl?: string): string {
  if (providedUrl && providedUrl.startsWith("http")) {
    return providedUrl;
  }

  const texto = `${title} ${primaryTopic}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const reserva of RESERVAS) {
    if (reserva.termos.some((t) => texto.includes(t))) return reserva.url;
  }

  return RESERVA_PADRAO;
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
    resolveTokens(format),
    resolveFormatConfigFromDb(format),
  ]);

  // Um layout por tipo de slide, buscado uma vez. Buscar dentro do laço faria
  // N consultas para ler as mesmas duas ou três linhas — e um carrossel de 12
  // slides costuma ter só três tipos distintos.
  const tiposUsados = [...new Set(carousel.slides.map((s) => s.type))];
  const layouts = new Map<string, Awaited<ReturnType<typeof resolveLayout>>>();
  for (const tipo of tiposUsados) {
    layouts.set(tipo, await resolveLayout(format, tipo));
  }

  // Por padrão o Chromium vem do registro do Playwright, populado por
  // `npx playwright install chromium`. Em servidor onde o navegador está em
  // outro lugar — imagem de contêiner, pacote do sistema — o caminho pode ser
  // informado por PLAYWRIGHT_CHROMIUM_EXECUTABLE.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined;

  const browser = await chromium.launch({ headless: true, executablePath });
  const assets: OpenDesignSlideAsset[] = [];

  try {
    // O viewport vem dos tokens, não de um número fixo aqui. Com os dois
    // separados, mudar a proporção da arte no `base-css` renderizava certo no
    // preview do navegador e cortado no worker — e o corte só apareceria no
    // post publicado.
    const page = await browser.newPage({
      viewport: { width: tokens.canvas.width, height: tokens.canvas.height },
      deviceScaleFactor: 2, // dobra a resolução do arquivo entregue à Meta
    });

    for (const slide of carousel.slides) {
      if (slide.type === "cover") {
        let imageUrl = slide.bg_image_url;

        /*
         * Ordem: foto real > banco de imagem > geração.
         *
         * A geração passou a ser o último recurso, não o primeiro. Imagem de
         * IA em capa de notícia tem um tell — pele lisa demais, mão errada,
         * texto borrado ao fundo, luz que não existe — e num post que se
         * apresenta como jornalismo esse tell custa credibilidade, que é o
         * único ativo que a conta tem.
         *
         * A busca sai do `cover_image_prompt`, que a IA já escreve em inglês
         * descrevendo a cena: é o formato que banco de imagem indexa.
         */
        // O log distingue os três casos. Antes dizia "sem foto de banco" para
        // todos, e no servidor não dava para saber se faltava a chave, se a
        // busca não achou nada ou se o provedor caiu — três problemas com três
        // correções diferentes.
        if (!imageUrl && !bancoConfigurado()) {
          console.log("[CAPA] Banco de imagens desligado (sem PEXELS_API_KEY).");
        }

        if (!imageUrl && bancoConfigurado()) {
          const consulta = consultaDaCapa(slide.cover_image_prompt, slide.title);
          const foto = await buscarFotoDeBanco(consulta);
          if (foto) {
            imageUrl = foto.imagemUrl;
            console.log(`[CAPA] Foto de banco (${foto.credito.provedor}) para "${consulta}".`);
          } else {
            console.log(`[CAPA] Banco não devolveu foto para "${consulta}".`);
          }
        }

        if (!imageUrl) {
          console.log("[CAPA] Gerando por IA.");
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
        layout: layouts.get(slide.type) ?? null,
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
