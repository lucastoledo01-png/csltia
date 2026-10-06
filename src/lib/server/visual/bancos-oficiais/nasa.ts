import { pedirAoBanco } from "./rede";
import type { BuscaNoBanco, DefinicaoDoBanco, FotoDoBanco, OpcoesDaBusca } from "./tipos";

/**
 * O acervo de imagens da NASA (images-api.nasa.gov), pesquisado em 06/10/2026.
 *
 * LICENÇA. As diretrizes de mídia da NASA (nasa.gov/nasa-brand-center/
 * images-and-media): o conteúdo da NASA "geralmente não está sujeito a
 * direito autoral nos Estados Unidos", veículo de notícia pode usar sem
 * pedir, desde que não sugira endosso e cite a NASA como fonte. O que NÃO é
 * domínio público: o logotipo e a insígnia, e foto de terceiro, que vem
 * marcada. A foto com "Courtesy", "©" ou crédito de empresa fica de fora.
 *
 * ACESSO. API pública, sem chave, sem robots.txt, 200 para o agente honesto.
 *
 * QUALIDADE. Forte para Trump em visita à NASA, Isaacman, Hegseth em Cabo
 * Canaveral e o programa Artemis. Fraca para nome comum: "Vance" devolve o
 * astronauta Vance Brand e "Rubio" o astronauta Frank Rubio. Por isso a busca
 * só aproveita a foto cuja legenda prova a pessoa, que é a régua de
 * `legendaCita`, e não a ordem do acervo.
 */

const API = "https://images-api.nasa.gov/search";

const DE_TERCEIRO = /courtesy|©|copyright|getty|reuters|associated press|\bap photo\b|spacex|boeing|blue origin/i;

type ItemDaNasa = {
  data?: Array<{
    nasa_id?: string;
    title?: string;
    description?: string;
    date_created?: string;
    photographer?: string;
    secondary_creator?: string;
    media_type?: string;
  }>;
  links?: Array<{ href?: string; rel?: string; width?: number; height?: number }>;
};

/** "NASA/John Kraus" fica; "Danny Nowlin" e "James Blair - NASA - JSC" viram só o nome. */
export function autorDaNasa(bruto: string): string {
  const t = (bruto ?? "").trim();
  if (!t) return "";
  return t
    .replace(/^nasa\s*\/\s*/i, "")
    .replace(/\s*-\s*nasa.*$/i, "")
    .replace(/^\(|\)$/g, "")
    .trim();
}

export function lerBuscaDaNasa(json: string): FotoDoBanco[] {
  const corpo = JSON.parse(json) as { collection?: { items?: ItemDaNasa[] } };
  const fotos: FotoDoBanco[] = [];
  for (const item of corpo.collection?.items ?? []) {
    const d = item.data?.[0];
    if (!d?.nasa_id || (d.media_type && d.media_type !== "image")) continue;
    const descricao = (d.description ?? "").replace(/\s+/g, " ").trim();
    const credito = `${d.photographer ?? ""} ${d.secondary_creator ?? ""}`;
    if (DE_TERCEIRO.test(credito) || DE_TERCEIRO.test(descricao.replace(/photo credit:\s*\(nasa[^)]*\)/gi, ""))) continue;

    /*
     * O arquivo `~large` (1.920 px) e não o original: o original passa de 16
     * MB, a conferência visual recusa baixar mais de 20 MB, e a peça não
     * precisa de 7.000 px.
     */
    const grande = (item.links ?? []).find((l) => /~large\.jpe?g$/i.test(l.href ?? ""));
    const original = (item.links ?? []).find((l) => l.rel === "canonical");
    if (!grande?.href) continue;
    fotos.push({
      banco: "nasa",
      id: d.nasa_id,
      titulo: (d.title ?? "").trim(),
      descricao,
      imageUrl: grande.href,
      paginaUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
      autor: autorDaNasa(d.photographer || d.secondary_creator || ""),
      data: (d.date_created ?? "").slice(0, 10) || null,
      largura: grande.width ?? 0,
      altura: grande.height ?? (original?.width && original.height && grande.width ? Math.round((grande.width * original.height) / original.width) : 0),
      licenca: "Public Domain (NASA, uso editorial sem endosso)",
      licencaUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    });
  }
  return fotos;
}

async function buscar(consulta: string, opcoes: OpcoesDaBusca): Promise<BuscaNoBanco> {
  const url = new URL(API);
  url.searchParams.set("q", consulta);
  url.searchParams.set("media_type", "image");
  // Os últimos dois anos: a pessoa como está hoje, e não a foto da década passada.
  url.searchParams.set("year_start", String(new Date().getFullYear() - 2));
  url.searchParams.set("page_size", String(Math.max(opcoes.quantos * 2, 10)));
  const fotos = lerBuscaDaNasa(await pedirAoBanco(url.toString(), { fetcher: opcoes.fetcher, espaco: opcoes.espaco }));
  fotos.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  return { fotos: fotos.slice(0, opcoes.quantos), nota: `${fotos.length} foto(s) da NASA para "${consulta}"` };
}

export const NASA: DefinicaoDoBanco = {
  id: "nasa",
  nome: "NASA",
  pais: "US",
  hostsDeImagem: ["images-assets.nasa.gov"],
  buscar,
};
