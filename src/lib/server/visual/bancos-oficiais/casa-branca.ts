import { normalizarEntidade } from "../tipos";
import { pedirAoBanco } from "./rede";
import type { BuscaNoBanco, DefinicaoDoBanco, FotoDoBanco, OpcoesDaBusca } from "./tipos";

/**
 * As galerias da Casa Branca (whitehouse.gov), pesquisadas em 06/10/2026.
 *
 * LICENÇA. A página de direitos do site (whitehouse.gov/copyright) diz que o
 * material produzido pelo governo "não é protegido por direito autoral", e
 * que o conteúdo de TERCEIROS, salvo indicação, é CC BY 3.0. A diferença entre
 * os dois está na legenda de cada foto: a do fotógrafo oficial termina com
 * "(Official White House Photo by Fulano)". Só essa entra, como domínio
 * público do governo americano; qualquer outra é tratada como de terceiro e
 * fica de fora, porque silêncio sobre direitos é recusa.
 *
 * ACESSO. Não há API: `/wp-json/` responde 403 e o robots.txt proíbe a busca
 * interna (`?s=`). O caminho que o robots permite é o mapa de galerias
 * (`gallery-sitemap.xml`, umas 550 galerias), filtrado pelo nome no endereço
 * da galeria, e depois a página da galeria. O agente honesto recebe 200.
 *
 * QUALIDADE. Foto de evento, da semana, com a pessoa quase sempre no centro, e
 * o original com 3.000 px. É a melhor fonte para Trump, Vance e o presidente
 * do Fed; para Hegseth não há galeria.
 */

export const MAPA_DE_GALERIAS = "https://www.whitehouse.gov/gallery-sitemap.xml";

/** Quantas galerias abrir por busca. Cada uma é um pedido de ~300 KB. */
const GALERIAS_POR_BUSCA = 2;

const CREDITO_OFICIAL = /\(Official White House Photo by ([^)]+)\)\s*$/i;

export type GaleriaNoMapa = { url: string; lastmod: string };

export function lerMapaDeGalerias(xml: string): GaleriaNoMapa[] {
  const galerias: GaleriaNoMapa[] = [];
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/g)) {
    const url = m[1].trim();
    if (!/\/gallery\/[^/]+\/?$/.test(url)) continue;
    galerias.push({ url, lastmod: (m[2] ?? "").trim() });
  }
  return galerias;
}

/**
 * As galerias cujo endereço nomeia o que se procura, da mais nova para a mais
 * antiga.
 *
 * O endereço é o título da galeria ("president-donald-j-trump-signs..."), e a
 * palavra que decide é a ÚLTIMA da consulta, que em nome de gente é o
 * sobrenome: "Kevin Warsh" acha "warsh-sworn-in", que não tem "kevin". As
 * outras palavras desempatam.
 */
export function galeriasQueCitam(galerias: GaleriaNoMapa[], consulta: string): GaleriaNoMapa[] {
  const palavras = normalizarEntidade(consulta).split(" ").filter((p) => p.length >= 3);
  const ultima = palavras[palavras.length - 1];
  if (!ultima) return [];
  return galerias
    .map((g) => {
      const slug = `-${(g.url.match(/\/gallery\/([^/]+)/)?.[1] ?? "").toLowerCase()}-`;
      const casadas = palavras.filter((p) => slug.includes(`-${p}-`)).length;
      return { g, casadas, temUltima: slug.includes(`-${ultima}-`) };
    })
    .filter((x) => x.temUltima)
    .sort((a, b) => b.casadas - a.casadas || b.g.lastmod.localeCompare(a.g.lastmod))
    .map((x) => x.g);
}

function desfazerEntidades(s: string): string {
  return s
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&#8211;|&#8212;/g, ",")
    .replace(/&nbsp;/g, " ");
}

const MESES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** "Friday, May 22, 2026" na legenda vira 2026-05-22. */
export function dataNaLegenda(texto: string): string | null {
  const m = texto.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (!m) return null;
  return `${m[3]}-${MESES[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
}

/** As fotos de uma galeria. Só as do fotógrafo oficial. */
export function lerGaleria(html: string, paginaUrl: string): FotoDoBanco[] {
  const titulo = desfazerEntidades(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "")
    .replace(/\s*[|–-]\s*The White House\s*$/i, "")
    .trim();
  const publicada = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  const fotos: FotoDoBanco[] = [];

  for (const m of html.matchAll(/<img\b[^>]*\bwh-gallery-lightbox-image\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (nome: string) => tag.match(new RegExp(`\\s${nome}="([^"]*)"`, "i"))?.[1] ?? "";
    const alt = desfazerEntidades(attr("alt")).trim();
    const credito = alt.match(CREDITO_OFICIAL);
    // Sem a assinatura do fotógrafo oficial, a foto pode ser de terceiro.
    if (!credito) continue;

    const maiores = attr("srcset")
      .split(",")
      .map((s) => s.trim().split(/\s+/))
      .map(([url, w]) => ({ url, w: Number((w ?? "").replace(/w$/, "")) || 0 }))
      .filter((x) => x.url)
      .sort((a, b) => b.w - a.w);
    const maior = maiores[0];
    if (!maior) continue;
    const largura0 = Number(attr("width")) || 0;
    const altura0 = Number(attr("height")) || 0;
    const largura = maior.w || largura0;
    const altura = largura0 > 0 ? Math.round((largura * altura0) / largura0) : 0;

    fotos.push({
      banco: "casa_branca",
      id: attr("data-id") || maior.url,
      titulo,
      // Legenda truncada no começo (", Wednesday, ...") é completada pelo título da galeria.
      descricao: /^[,;]/.test(alt) ? `${titulo}${alt}` : alt,
      imageUrl: maior.url.split("?")[0],
      paginaUrl,
      autor: credito[1].trim(),
      data: dataNaLegenda(alt) ?? publicada,
      largura,
      altura,
      licenca: "United States Government Work",
      licencaUrl: "https://www.whitehouse.gov/copyright/",
    });
  }
  return fotos;
}

async function buscar(consulta: string, opcoes: OpcoesDaBusca): Promise<BuscaNoBanco> {
  const rede = { fetcher: opcoes.fetcher, espaco: opcoes.espaco, aceitar: "application/xml, text/xml, text/html" };
  const galerias = galeriasQueCitam(lerMapaDeGalerias(await pedirAoBanco(MAPA_DE_GALERIAS, rede)), consulta);
  const abertas = galerias.slice(0, GALERIAS_POR_BUSCA);
  const fotos: FotoDoBanco[] = [];
  for (const g of abertas) {
    try {
      fotos.push(...lerGaleria(await pedirAoBanco(g.url, rede), g.url));
    } catch {
      // Uma galeria fora do ar não apaga a outra.
    }
  }
  return {
    fotos: fotos.slice(0, opcoes.quantos),
    nota: `${galerias.length} galeria(s) citam "${consulta}", ${abertas.length} aberta(s), ${fotos.length} foto(s) oficiais`,
  };
}

export const CASA_BRANCA: DefinicaoDoBanco = {
  id: "casa_branca",
  nome: "Casa Branca",
  pais: "US",
  hostsDeImagem: ["www.whitehouse.gov"],
  buscar,
};
