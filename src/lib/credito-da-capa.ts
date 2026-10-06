import { enderecoLimpoDaImagem } from "./imagem-da-capa";

/**
 * O crédito da foto da capa: autor, licença e link (06/10/2026).
 *
 * A auditoria de estrutura achou 1 de 2 matérias publicadas sem crédito
 * nenhum (capa do Pexels) e a outra só com o link genérico do Commons. A
 * licença CC BY pede crédito junto da obra (incidente "Atribuição de licença
 * guardada em coluna não cumpre a licença"), e o dono pediu crédito em TODA
 * capa, inclusive a do banco de imagem, cuja licença não exige.
 *
 * O crédito mora no corpo, num `<p class="credito-da-foto">`, como já morava
 * o crédito das edições desmontadas e a legenda: a tabela não tem coluna para
 * isso e o dono não quer DDL agora. O parágrafo leva o link da página do
 * arquivo (onde a licença está provada) e, quando se sabe, as dimensões do
 * ORIGINAL em `data-largura` e `data-altura`, que o NewsArticle precisa para
 * o `image` com largura e altura.
 *
 * Puro e sem rede: a página, o ramo e os scripts usam igual. Quem resolve o
 * crédito do Commons pela página do arquivo é `capa-da-materia.ts`.
 */

export type CreditoDaFoto = {
  /** Quem fez a foto, em texto puro. Vazio quando a origem não diz. */
  autor: string;
  /** "CC BY-SA 4.0", "Licença Pexels", "acervo próprio"... Vazio quando não se sabe. */
  licenca: string;
  /** De onde a foto veio: "Wikimedia Commons", "Pexels", o host. */
  origem: string;
  /** A página do arquivo, onde autor e licença estão. Nunca a própria imagem quando há página. */
  href: string;
  largura?: number;
  altura?: number;
};

const LICENCA_PEXELS = "Licença Pexels";
const LICENCA_UNSPLASH = "Licença Unsplash";

function semTags(s: string): string {
  return (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function httpOuVazio(u: string | null | undefined): string {
  const limpo = enderecoLimpoDaImagem(u);
  try {
    const p = new URL(limpo);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : "";
  } catch {
    return "";
  }
}

/** "Foto: Fulano, CC BY-SA 4.0, via Wikimedia Commons". O que falta some, sem vírgula sobrando. */
export function textoDoCredito(c: CreditoDaFoto): string {
  const autor = semTags(c.autor);
  const partes = [autor ? `Foto: ${autor}` : "Foto", semTags(c.licenca), c.origem ? `via ${semTags(c.origem)}` : ""].filter(Boolean);
  return partes.join(", ");
}

/** O parágrafo que a página tira do corpo e desenha embaixo da capa. */
export function htmlDoCredito(c: CreditoDaFoto): string {
  const dims =
    c.largura && c.altura && c.largura > 0 && c.altura > 0
      ? ` data-largura="${Math.round(c.largura)}" data-altura="${Math.round(c.altura)}"`
      : "";
  const texto = escapar(textoDoCredito(c));
  const href = httpOuVazio(c.href);
  const dentro = href ? `<a href="${escapar(href)}" rel="noopener" target="_blank">${texto}</a>` : texto;
  return `<p class="credito-da-foto"${dims}>${dentro}</p>`;
}

const ORIGEM_DA_FONTE: Record<string, string> = {
  wikimedia_commons: "Wikimedia Commons",
  flickr_commons: "Flickr",
  openverse: "Openverse",
  press_kit: "kit de imprensa",
};

/**
 * O crédito a partir do asset que o resolvedor escolheu (o caminho do ramo e
 * da refação). É a fonte mais fiel: autor, licença e página vêm da origem,
 * conferidos quando a foto foi escolhida.
 */
export function creditoDoAsset(
  asset: {
    source?: string;
    imageUrl?: string;
    sourcePageUrl?: string;
    author?: string;
    license?: string;
    width?: number;
    height?: number;
    metadata?: Record<string, unknown>;
  } | null | undefined,
  nomeDoAcervo = "acervo eua.journal",
): CreditoDaFoto | null {
  if (!asset?.imageUrl) return null;
  const provedor = String(asset.metadata?.provedor ?? "");
  const porEndereco = creditoPorEndereco(asset.imageUrl, nomeDoAcervo);
  let origem = ORIGEM_DA_FONTE[asset.source ?? ""] ?? "";
  if (asset.source === "banco_conceitual") origem = provedor === "unsplash" ? "Unsplash" : "Pexels";
  if (asset.source === "acervo_proprio") origem = nomeDoAcervo;
  if (asset.source === "fonte_oficial") {
    try {
      origem = new URL(asset.sourcePageUrl || asset.imageUrl).hostname.replace(/^www\./, "");
    } catch {
      origem = "";
    }
  }
  if (!origem) origem = porEndereco?.origem ?? "";
  let licenca = semTags(asset.license ?? "");
  if (/^pexels license$/i.test(licenca)) licenca = LICENCA_PEXELS;
  if (/^unsplash license$/i.test(licenca)) licenca = LICENCA_UNSPLASH;
  /*
   * O banco conceitual grava 1200x800 fixo (`resolver.ts`), que não é a foto:
   * dimensão inventada no JSON-LD é pior que dimensão nenhuma. Ali vale a que
   * o endereço do Pexels garante, e o NewsArticle usa o corte de tamanho
   * conhecido (`imagensDaCapaParaJsonLd`).
   */
  const dimensoesConfiaveis = asset.source !== "banco_conceitual";
  return {
    autor: semTags(asset.author ?? ""),
    licenca: licenca || porEndereco?.licenca || "",
    origem,
    href: httpOuVazio(asset.sourcePageUrl) || porEndereco?.href || httpOuVazio(asset.imageUrl),
    ...(dimensoesConfiaveis && asset.width && asset.height ? { largura: asset.width, altura: asset.height } : {}),
  };
}

/**
 * O crédito que o endereço da foto permite saber sem perguntar a ninguém.
 * É o piso da página para linha antiga sem crédito gravado: a origem e o link
 * da página do arquivo, onde autor e licença estão.
 */
export function creditoPorEndereco(capa: string | null | undefined, nomeDoAcervo = "acervo eua.journal"): CreditoDaFoto | null {
  const limpo = enderecoLimpoDaImagem(capa);
  if (!limpo) return null;
  let u: URL;
  try {
    u = new URL(limpo);
  } catch {
    return null;
  }
  const arquivoDoCommons = arquivoDoCommonsNoEndereco(limpo);
  if (arquivoDoCommons) {
    return { autor: "", licenca: "", origem: "Wikimedia Commons", href: `https://commons.wikimedia.org/wiki/File:${arquivoDoCommons}` };
  }
  if (u.hostname === "images.pexels.com") {
    const id = u.pathname.match(/\/photos\/(\d+)\//)?.[1];
    return { autor: "", licenca: LICENCA_PEXELS, origem: "Pexels", href: id ? `https://www.pexels.com/photo/${id}/` : "https://www.pexels.com/license/" };
  }
  if (u.hostname === "images.unsplash.com") {
    return { autor: "", licenca: LICENCA_UNSPLASH, origem: "Unsplash", href: "https://unsplash.com/license" };
  }
  if (/\.supabase\.co$/.test(u.hostname) && /\/acervo/i.test(u.pathname)) {
    return { autor: "", licenca: "acervo próprio", origem: nomeDoAcervo, href: "" };
  }
  return { autor: "", licenca: "", origem: u.hostname.replace(/^www\./, ""), href: limpo };
}

/** O nome do arquivo do Commons (sem "File:"), do original ou da miniatura. */
export function arquivoDoCommonsNoEndereco(capa: string | null | undefined): string | null {
  const limpo = enderecoLimpoDaImagem(capa);
  const m =
    limpo.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)\//i) ??
    limpo.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** O crédito tem o mínimo que o dono pediu: autor, licença e link. */
export function creditoCompleto(c: Pick<CreditoDaFoto, "autor" | "licenca" | "href"> | null | undefined): boolean {
  return Boolean(c && semTags(c.autor) && semTags(c.licenca) && httpOuVazio(c.href));
}

/**
 * A legenda que não afirma nada sobre a foto: só o assunto da matéria. É a
 * saída quando a descrição da conferência visual não passou na ancoragem, ou
 * quando a linha é anterior à legenda (06/10/2026).
 */
export function legendaNeutra(assunto: string | null | undefined): string {
  const a = (assunto ?? "").trim().replace(/[.\s]+$/, "");
  return a ? `Imagem ilustrativa: ${a}.` : "Imagem ilustrativa.";
}
