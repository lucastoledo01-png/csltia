import type { CarouselFormat, InstagramSlide } from "@/lib/carousel-templates/types";
import type { Layout } from "@/lib/carousel-templates/layout";
import type { AssetVisual } from "../visual/tipos";

/**
 * A arte do post do feed, e a única regra que ela não negocia.
 *
 * Este módulo existe separado do renderer do carrossel por um motivo só: o
 * caminho antigo, quando não tem foto, cai em banco de imagem e depois em
 * geração por IA. Para notícia factual isso é proibido, e proibido não é o
 * mesmo que "evitado quando dá" — a única forma de garantir é uma superfície
 * onde esse caminho não existe.
 *
 * Aqui `bg_image_url` recebe exatamente uma coisa: a URL do asset que o
 * resolvedor visual aprovou. Não há segunda atribuição, não há fallback, não
 * há consulta a banco de imagem. Sem asset aprovado, a capa é de texto.
 *
 * Capa de texto não é um erro nem um degradê de qualidade: é a forma honesta
 * de publicar uma notícia para a qual não existe imagem legítima disponível.
 */

/**
 * Qual formato sobrevive sem fotografia.
 *
 * A regra do dono do produto: pauta editorialmente valida sem imagem valida
 * PODE publicar. `NO_VALID_VISUAL_ASSET` deixa de ser motivo de descarte e
 * passa a ser uma decisao editorial registrada. So impede a publicacao quando
 * o formato exige fotografia e nao existe versao textual segura dele.
 *
 * `noticia` e capa unica e tem capa de texto propria: publica.
 * `tutorial` e carrossel de texto desde sempre: publica.
 * `prompt` mostra o resultado visual de um prompt. Sem imagem nao ha o que
 * mostrar, e um card escrito "aqui teria uma imagem" e pior que nao postar.
 */
const FORMATOS_QUE_SOBREVIVEM_SEM_FOTO: Record<CarouselFormat, boolean> = {
  noticia: true,
  tutorial: true,
  prompt: false,
};

export function publicavelSemFoto(formato: CarouselFormat): boolean {
  return FORMATOS_QUE_SOBREVIVEM_SEM_FOTO[formato] ?? false;
}

export type CapaDoPost = {
  slide: InstagramSlide;
  /** Variante do template. Muda com a presença da foto, e só com ela. */
  variante: "fullbleed_portrait" | "noticia_sem_foto";
  comFoto: boolean;
  /** Crédito a ser impresso na arte. Vazio quando a licença não exige. */
  credito: string;
  /** Preenchido quando não há foto, para o preview dizer por quê. */
  motivoSemFoto: string;
};

/**
 * O layout desenhado no painel sabe carregar a foto?
 *
 * Layout desenhado vence a variante de código, e vence inteiro: quem
 * posicionou os blocos decidiu tudo. Só que o desenho de `noticia/cover` em
 * produção tem três blocos — degradê, marca e manchete em branco — e **nenhum
 * bloco de imagem**. Com ele, a foto aprovada não aparece em lugar nenhum e a
 * manchete branca cai sobre o creme do canvas: texto invisível.
 *
 * Isso apareceu na primeira arte renderizada de verdade, e não apareceria em
 * nenhum teste de unidade: o layout vem do banco.
 *
 * A regra aqui é de capacidade, não de gosto. O desenho manda quando consegue
 * mostrar o que recebeu. Quando não consegue, a variante de código assume, que
 * é a que sabe desenhar os dois estados.
 */
export const DIAGNOSTICOS_DE_LAYOUT = {
  /** Nenhum desenho salvo: a variante de codigo e o caminho normal. */
  AUSENTE: "LAYOUT_NOT_DESIGNED",
  /** Ha desenho e ele carrega a foto. Foi usado. */
  USADO: "LAYOUT_USED",
  /** Ha desenho, mas sem bloco de imagem de fundo: a foto sumiria nele. */
  SEM_SLOT_DE_IMAGEM: "LAYOUT_MISSING_IMAGE_SLOT",
  /** Capa de texto: o desenho nao entra em jogo, com ou sem slot. */
  SEM_FOTO: "LAYOUT_NOT_APPLICABLE_NO_PHOTO",
} as const;

export type DiagnosticoDeLayout = (typeof DIAGNOSTICOS_DE_LAYOUT)[keyof typeof DIAGNOSTICOS_DE_LAYOUT];

export function layoutCarregaAFoto(layout: Layout | null | undefined): boolean {
  if (!layout || layout.blocks.length === 0) return false;
  return layout.blocks.some((b) => b.tipo === "imagem" && (b.imagem ?? "fundo") === "fundo");
}

/**
 * O veredito sobre o desenho, nomeado.
 *
 * "Nao usou o layout" e ambiguo: pode ser que nao exista desenho nenhum, pode
 * ser que exista e esteja incompleto, e as duas coisas pedem acoes diferentes.
 * `LAYOUT_MISSING_IMAGE_SLOT` e a que precisa aparecer no relatorio, porque e a
 * unica que descreve um desenho salvo que nao serve para o conteudo que
 * recebeu. O codigo nao depende da correcao para funcionar; o diagnostico
 * existe para que a correcao possa ser feita no painel, depois, sabendo o que
 * corrigir.
 */
export function diagnosticarLayout(
  layout: Layout | null | undefined,
  comFoto: boolean,
): DiagnosticoDeLayout {
  const desenhado = Boolean(layout && layout.blocks.length > 0);
  if (!comFoto) return desenhado ? DIAGNOSTICOS_DE_LAYOUT.SEM_FOTO : DIAGNOSTICOS_DE_LAYOUT.AUSENTE;
  if (!desenhado) return DIAGNOSTICOS_DE_LAYOUT.AUSENTE;
  return layoutCarregaAFoto(layout)
    ? DIAGNOSTICOS_DE_LAYOUT.USADO
    : DIAGNOSTICOS_DE_LAYOUT.SEM_SLOT_DE_IMAGEM;
}

export type EntradaDaCapa = {
  headline: string;
  /** Categoria editorial, usada como sobrancelha na capa sem foto. */
  eixo?: string;
  asset: AssetVisual | null;
  motivoSemFoto?: string;
};

/**
 * A sobrancelha da capa sem foto.
 *
 * Sem imagem, o título fica sozinho num campo claro e perde a referência do
 * que se está lendo. O eixo editorial devolve essa referência sem afirmar
 * nada além do que a classificação já afirmou.
 *
 * O rótulo é escrito aqui, e não derivado do valor: o eixo é vocabulário de
 * máquina, e `decisao_judicial` impresso na arte sai sem acento e com
 * underscore. Trocar `_` por espaço não resolve — resolve o acento errado.
 * A lista é fechada (ver o enum do classificador), então escrevê-la inteira
 * custa seis linhas e não deixa caso solto.
 */
const ROTULO_DO_EIXO: Record<string, string> = {
  oportunidade: "OPORTUNIDADE",
  processo: "PROCESSO",
  decisao_judicial: "DECISÃO JUDICIAL",
  custo_de_vida: "CUSTO DE VIDA",
  deterioracao_brasil: "BRASIL",
  // "outro" não tem rótulo: nomear o que a classificação não soube nomear
  // seria inventar uma editoria.
};

function sobrancelha(eixo: string | undefined): string {
  return ROTULO_DO_EIXO[(eixo ?? "").trim()] ?? "";
}

export function montarCapaDoPost(entrada: EntradaDaCapa): CapaDoPost {
  const asset = entrada.asset;
  const comFoto = Boolean(asset && asset.imageUrl);

  const slide: InstagramSlide = {
    index: 1,
    type: "cover",
    eyebrow: comFoto ? "" : sobrancelha(entrada.eixo),
    title: entrada.headline,
    body: "",
    bullet_points: [],
    highlight_text: "",
    variant: comFoto ? "fullbleed_portrait" : "noticia_sem_foto",
    cover_variant: "dark_speaker",
    headline_style: "clean",
    // Vazio sempre, e de propósito: é este campo que o renderer antigo usa
    // como consulta ao banco de imagem e como prompt de geração.
    cover_image_prompt: "",
    // A ÚNICA origem possível de imagem nesta superfície.
    bg_image_url: comFoto ? asset!.imageUrl : "",
    cta_text: "",
  };

  return {
    slide,
    variante: comFoto ? "fullbleed_portrait" : "noticia_sem_foto",
    comFoto,
    credito: comFoto ? (asset!.attribution || "").trim() : "",
    motivoSemFoto: comFoto ? "" : (entrada.motivoSemFoto || "NO_VALID_VISUAL_ASSET").trim(),
  };
}

/**
 * Render da arte.
 *
 * Fica neste arquivo, e não no renderer do carrossel, pela mesma razão do
 * resto do módulo: lá o laço de render é o dono da cadeia de fallback. Aqui o
 * laço não tem cadeia nenhuma para cair.
 */

export type ArteRenderizada = {
  capa: CapaDoPost;
  html: string;
  /** O arquivo que subiria para a Meta: 2x, sem perda. */
  png: Buffer;
  /*
   * A mesma arte em JPEG, só para caber numa página de preview.
   *
   * O PNG em 2x passa de 4 MB por peça; dez deles embutidos numa página fazem
   * um arquivo de 40 MB que o navegador engasga para abrir — e preview que não
   * abre não é preview.
   */
  jpeg: Buffer;
  /** Se o desenho do painel foi usado, ou se a variante de código assumiu. */
  usouLayoutDesenhado: boolean;
  /** Por que foi ou não foi usado. Ver `diagnosticarLayout`. */
  diagnosticoDoLayout: DiagnosticoDeLayout;
};

/**
 * Baixa a foto e embute como data URL.
 *
 * A página do render roda offline, sem rede, e uma URL remota simplesmente não
 * carregaria a tempo do screenshot. Falha vira capa sem foto, não capa com
 * retângulo vazio: quem chama decide o que fazer com isso.
 */
async function baixarComoDataUrl(
  url: string,
  fetcher: typeof fetch,
  tetoMs = 30_000,
): Promise<string | null> {
  try {
    const r = await fetcher(url, {
      headers: { "User-Agent": "imigra.us/1.0 (contato@imigra.us)" },
      signal: AbortSignal.timeout(tetoMs),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength === 0) return null;
    const mime = r.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderizarCapas(
  entradas: EntradaDaCapa[],
  opcoes?: { fetcher?: typeof fetch },
): Promise<ArteRenderizada[]> {
  if (entradas.length === 0) return [];

  const { chromium } = await import("playwright-core");
  const { assembleSlide } = await import("@/lib/carousel-templates/assemble");
  const { resolveFormatConfigFromDb, resolveLayout, resolveTokens } = await import(
    "@/lib/carousel-templates/resolve"
  );

  const fetcher = opcoes?.fetcher ?? fetch;
  const [tokens, formatConfig, layout] = await Promise.all([
    resolveTokens("noticia"),
    resolveFormatConfigFromDb("noticia"),
    resolveLayout("noticia", "cover"),
  ]);

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  const feitas: ArteRenderizada[] = [];

  try {
    const page = await browser.newPage({
      viewport: { width: tokens.canvas.width, height: tokens.canvas.height },
      deviceScaleFactor: 2,
    });

    for (const entrada of entradas) {
      let capa = montarCapaDoPost(entrada);

      if (capa.comFoto) {
        const dataUrl = await baixarComoDataUrl(capa.slide.bg_image_url, fetcher);
        if (dataUrl) {
          capa = { ...capa, slide: { ...capa.slide, bg_image_url: dataUrl } };
        } else {
          // Download falho não vira outra imagem. Vira capa de texto, igual a
          // qualquer outra ausência de foto.
          capa = montarCapaDoPost({ ...entrada, asset: null, motivoSemFoto: "ASSET_DOWNLOAD_FAILED" });
        }
      }

      // Ver `layoutCarregaAFoto`: sem bloco de imagem, o desenho engole a foto
      // e deixa a manchete branca sobre fundo claro.
      const diagnosticoDoLayout = diagnosticarLayout(layout, capa.comFoto);
      const usaDesenho = diagnosticoDoLayout === DIAGNOSTICOS_DE_LAYOUT.USADO;

      const html = assembleSlide(capa.slide, {
        format: "noticia",
        tokens,
        formatConfig,
        slideIndex: 1,
        total: 1,
        layout: usaDesenho ? layout : null,
        credito: capa.credito,
      });

      await page.setContent(html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      /*
       * O ajuste de corpo do texto roda depois das fontes, e o screenshot tem
       * que esperar por ELE, não por um cronômetro. `SCRIPT_DE_AJUSTE` marca o
       * documento quando termina; sem esperar essa marca, uma manchete longa
       * podia ser capturada ainda no corpo máximo, estourando a caixa.
       */
      await page
        .waitForFunction(() => document.documentElement.getAttribute("data-ajuste-pronto") === "1", null, {
          timeout: 5_000,
        })
        .catch(() => undefined);
      await page.waitForTimeout(120);

      const png = await page.screenshot({ type: "png", fullPage: false });
      const jpeg = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false, scale: "css" });
      feitas.push({ capa, html, png, jpeg, usouLayoutDesenhado: usaDesenho, diagnosticoDoLayout });
    }
  } finally {
    await browser.close();
  }

  return feitas;
}
