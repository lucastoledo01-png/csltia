import { normalizarEntidade } from "../tipos";
import { medirImagemDoBanco, pedirAoBanco } from "./rede";
import type { BuscaNoBanco, DefinicaoDoBanco, FotoDoBanco, OpcoesDaBusca } from "./tipos";

/**
 * A galeria de fotos do Federal Reserve (federalreserve.gov/photogallery.htm),
 * pesquisada em 06/10/2026.
 *
 * LICENÇA. O aviso do site (federalreserve.gov/disclaimer.htm): "salvo
 * indicação, a informação do site da Board é de domínio público", com o
 * pedido de citar a Board, e a ressalva de que foto associada a terceiro
 * precisa de permissão do terceiro. Na galeria, o terceiro aparece como
 * "Photo Credit: Harris & Ewing" na descrição: essas ficam de fora.
 *
 * ACESSO. Uma página estática com as cerca de mil fotos, sem robots.txt (404)
 * e com 200 para o agente honesto. A busca é nossa, na descrição de cada foto.
 *
 * QUALIDADE. É a melhor fonte para gente do Fed: o retrato oficial de Kevin
 * Warsh, presidente desde 22/05/2026, e as coletivas do FOMC da semana. O
 * arquivo servido tem 1.024 px de largura e a página não diz a medida, que é
 * lida do próprio JPEG (`medirImagemDoBanco`).
 */

export const GALERIA_DO_FED = "https://www.federalreserve.gov/photogallery.htm";

/** Quantas fotos medir por busca: cada medida é um pedido ao host. */
const MEDIDAS_POR_BUSCA = 4;

function desfazer(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function semTags(s: string): string {
  return desfazer(desfazer(s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const MESES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function dataIso(texto: string): string | null {
  const m = texto.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i);
  return m ? `${m[3]}-${MESES[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}` : null;
}

/** Todas as fotos da galeria, sem as de terceiro. */
export function lerGaleriaDoFed(html: string): FotoDoBanco[] {
  const fotos: FotoDoBanco[] = [];
  for (const m of html.matchAll(/<(?:a|div)\b[^>]*data-flickr="true"[^>]*>/gi)) {
    const tag = m[0];
    const attr = (nome: string) => tag.match(new RegExp(`\\s${nome}=(?:'([^']*)'|"([^"]*)")`, "i"));
    const valor = (nome: string) => {
      const x = attr(nome);
      return x ? (x[1] ?? x[2] ?? "") : "";
    };
    const caminho = valor("data-remote") || valor("href");
    if (!/\.(jpe?g|png)$/i.test(caminho)) continue;
    const descricao = semTags(valor("data-content"));
    // Foto de terceiro, que a própria página manda pedir permissão a ele.
    if (/photo credit\s*:/i.test(descricao) || /©|copyright/i.test(descricao)) continue;
    const imageUrl = new URL(caminho, "https://www.federalreserve.gov").toString();
    const dataTexto = valor("data-date");
    fotos.push({
      banco: "federal_reserve",
      id: caminho.replace(/^.*\//, ""),
      titulo: semTags(valor("data-title") || valor("data-gallery")),
      descricao,
      imageUrl,
      paginaUrl: GALERIA_DO_FED,
      autor: "",
      data: dataIso(dataTexto) ?? dataIso(descricao),
      largura: 0,
      altura: 0,
      licenca: "Public Domain (Federal Reserve Board, salvo indicação)",
      licencaUrl: "https://www.federalreserve.gov/disclaimer.htm",
    });
  }
  return fotos;
}

/** As fotos cuja descrição cita a consulta: a última palavra decide, como no sobrenome. */
export function fotosQueCitam(fotos: FotoDoBanco[], consulta: string): FotoDoBanco[] {
  const palavras = normalizarEntidade(consulta).split(" ").filter((p) => p.length >= 3);
  const ultima = palavras[palavras.length - 1];
  if (!ultima) return [];
  return fotos
    .filter((f) => ` ${normalizarEntidade(`${f.titulo} ${f.descricao}`)} `.includes(` ${ultima} `))
    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
}

async function buscar(consulta: string, opcoes: OpcoesDaBusca): Promise<BuscaNoBanco> {
  const rede = { fetcher: opcoes.fetcher, espaco: opcoes.espaco, aceitar: "text/html" };
  const todas = lerGaleriaDoFed(await pedirAoBanco(GALERIA_DO_FED, rede));
  const citam = fotosQueCitam(todas, consulta).slice(0, Math.min(opcoes.quantos, MEDIDAS_POR_BUSCA));
  const fotos: FotoDoBanco[] = [];
  for (const f of citam) {
    const medida = await medirImagemDoBanco(f.imageUrl, rede);
    fotos.push(medida ? { ...f, largura: medida.largura, altura: medida.altura } : f);
  }
  return { fotos, nota: `${todas.length} na galeria, ${fotos.length} citam "${consulta}"` };
}

export const FEDERAL_RESERVE: DefinicaoDoBanco = {
  id: "federal_reserve",
  nome: "Federal Reserve",
  pais: "US",
  hostsDeImagem: ["www.federalreserve.gov"],
  buscar,
};
