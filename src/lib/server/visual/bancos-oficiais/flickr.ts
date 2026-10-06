import { pedirAoBanco } from "./rede";
import type { BuscaNoBanco, DefinicaoDoBanco, FotoDoBanco, IdDoBanco, OpcoesDaBusca } from "./tipos";

/**
 * O formato das fotos do Flickr, que três bancos falam (06/10/2026).
 *
 * O Senado serve o acervo da Agência Senado por um proxy próprio sobre a API
 * do Flickr, e o Planalto e o STF publicam direto no Flickr. A resposta da
 * busca é a mesma (`photos.search` com `extras`), então a leitura é uma só.
 *
 * LICENÇA, pelo número que o Flickr grava em cada foto (conferido na resposta
 * de `flickr.photos.licenses.getInfo`): a conta oficial NÃO tem licença única.
 * A Agência Senado publica as fotos de 2025 e 2026 em CC BY-SA 4.0 (12), as de
 * 2015 a 2023 em CC BY 2.0 (4), e uma de 2013 em CC BY-NC 2.0 (2). Por isso a
 * licença é lida foto a foto e nunca presumida pela conta.
 */

export const LICENCAS_DO_FLICKR: Record<number, string> = {
  0: "All Rights Reserved",
  1: "CC BY-NC-SA 2.0",
  2: "CC BY-NC 2.0",
  3: "CC BY-NC-ND 2.0",
  4: "CC BY 2.0",
  5: "CC BY-SA 2.0",
  6: "CC BY-ND 2.0",
  7: "No known copyright restrictions",
  8: "United States Government Work",
  9: "CC0 1.0",
  10: "Public Domain Mark 1.0",
  11: "CC BY 4.0",
  12: "CC BY-SA 4.0",
  13: "CC BY-ND 4.0",
  14: "CC BY-NC 4.0",
  15: "CC BY-NC-SA 4.0",
  16: "CC BY-NC-ND 4.0",
};

/**
 * As que permitem uso comercial e obra derivada (o recorte da peça é
 * derivada). A 7, "sem restrição conhecida", fica fora: ela diz que ninguém
 * sabe, e silêncio sobre direitos é recusa.
 */
export const LICENCAS_COMERCIAIS_DO_FLICKR = [4, 5, 8, 9, 10, 11, 12];

const URLS_DE_LICENCA: Record<number, string> = {
  4: "https://creativecommons.org/licenses/by/2.0/",
  5: "https://creativecommons.org/licenses/by-sa/2.0/",
  9: "https://creativecommons.org/publicdomain/zero/1.0/",
  10: "https://creativecommons.org/publicdomain/mark/1.0/",
  11: "https://creativecommons.org/licenses/by/4.0/",
  12: "https://creativecommons.org/licenses/by-sa/4.0/",
};

export type FotoDoFlickr = {
  id?: string;
  owner?: string;
  ownername?: string;
  pathalias?: string;
  title?: string | { _content?: string };
  description?: { _content?: string } | string;
  datetaken?: string;
  license?: string | number;
  url_o?: string;
  width_o?: number | string;
  height_o?: number | string;
  url_k?: string;
  width_k?: number | string;
  height_k?: number | string;
  url_l?: string;
  width_l?: number | string;
  height_l?: number | string;
};

function texto(v: FotoDoFlickr["title"] | FotoDoFlickr["description"]): string {
  if (!v) return "";
  return (typeof v === "string" ? v : (v._content ?? "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** "Foto: Jonas Pereira/Agência Senado" na legenda vira "Jonas Pereira". */
export function autorNaLegenda(legenda: string): string {
  const m = legenda.match(/Fotos?:\s*([^\n]+?)\s*$/im) ?? legenda.match(/Fotos?:\s*([^\n;]+)/i);
  if (!m) return "";
  return m[1].split(/\s*\/\s*/)[0].replace(/[.;,]+$/, "").trim();
}

/**
 * A foto do Flickr no nosso vocabulário, ou nada.
 *
 * O arquivo publicado é o de 2.048 px (`url_k`) quando existe: o original da
 * Agência Senado chega a 7.800 px e a mais de 20 MB, que a conferência visual
 * recusa baixar. Sem o de 2.048, o original; sem os dois, o de 1.024.
 */
export function fotoDoFlickr(
  f: FotoDoFlickr,
  banco: IdDoBanco,
  paginaBase: string,
  licencaConhecida?: number,
): FotoDoBanco | null {
  if (!f.id) return null;
  const id = Number(licencaConhecida ?? f.license);
  const tamanhos = [
    { url: f.url_k, w: f.width_k, h: f.height_k },
    { url: f.url_o, w: f.width_o, h: f.height_o },
    { url: f.url_l, w: f.width_l, h: f.height_l },
  ].filter((t) => t.url);
  const escolhido = tamanhos[0];
  if (!escolhido?.url) return null;
  const descricao = texto(f.description);
  return {
    banco,
    id: String(f.id),
    titulo: texto(f.title),
    descricao,
    imageUrl: escolhido.url,
    paginaUrl: `${paginaBase}${f.id}/`,
    autor: autorNaLegenda(descricao),
    data: (f.datetaken ?? "").slice(0, 10) || null,
    largura: Number(escolhido.w ?? 0) || 0,
    altura: Number(escolhido.h ?? 0) || 0,
    // Sem número de licença, o texto fica vazio, e `avaliarLicenca` recusa.
    licenca: Number.isFinite(id) ? (LICENCAS_DO_FLICKR[id] ?? "") : "",
    licencaUrl: URLS_DE_LICENCA[id] ?? "",
  };
}

/**
 * Banco oficial no Flickr, pela API pública com chave (`FLICKR_API_KEY`).
 *
 * O robots.txt do flickr.com proíbe tudo para agente não listado, inclusive o
 * feed público: a API com chave é o único caminho legítimo, e a chave para uso
 * comercial precisa ser pedida pelo dono (o passo a passo está no
 * `decisoes.md`). Sem a chave, o banco é pulado com nota.
 */
export function bancoNoFlickr(config: {
  id: IdDoBanco;
  nome: string;
  pais: "BR" | "US";
  nsid: string;
  alias: string;
}): DefinicaoDoBanco {
  return {
    id: config.id,
    nome: config.nome,
    pais: config.pais,
    hostsDeImagem: ["live.staticflickr.com"],
    chave: "FLICKR_API_KEY",
    buscar: async (consulta: string, opcoes: OpcoesDaBusca): Promise<BuscaNoBanco> => {
      const url = new URL("https://api.flickr.com/services/rest/");
      url.searchParams.set("method", "flickr.photos.search");
      url.searchParams.set("api_key", opcoes.env.FLICKR_API_KEY ?? "");
      url.searchParams.set("user_id", config.nsid);
      url.searchParams.set("text", consulta);
      // A licença vai no pedido, e é conferida de novo foto a foto do lado de cá.
      url.searchParams.set("license", LICENCAS_COMERCIAIS_DO_FLICKR.join(","));
      url.searchParams.set("sort", "date-taken-desc");
      url.searchParams.set("extras", "license,owner_name,date_taken,url_o,url_k,url_l,description");
      url.searchParams.set("per_page", String(Math.max(opcoes.quantos * 2, 10)));
      url.searchParams.set("format", "json");
      url.searchParams.set("nojsoncallback", "1");
      const corpo = JSON.parse(await pedirAoBanco(url.toString(), { fetcher: opcoes.fetcher, espaco: opcoes.espaco })) as {
        stat?: string;
        message?: string;
        photos?: { total?: number | string; photo?: FotoDoFlickr[] };
      };
      if (corpo.stat && corpo.stat !== "ok") throw new Error(`Flickr recusou: ${corpo.message ?? corpo.stat}`);
      const fotos = (corpo.photos?.photo ?? [])
        .filter((f) => !f.owner || f.owner === config.nsid)
        .map((f) => fotoDoFlickr(f, config.id, `https://www.flickr.com/photos/${config.alias}/`))
        .filter((f): f is FotoDoBanco => f !== null);
      return {
        fotos: fotos.slice(0, opcoes.quantos),
        nota: `${corpo.photos?.total ?? 0} no Flickr de ${config.nome}, ${fotos.length} com licença comercial`,
      };
    },
  };
}

/** Palácio do Planalto (NSID achado nos registros do Commons). */
export const PLANALTO = bancoNoFlickr({
  id: "planalto",
  nome: "Palácio do Planalto",
  pais: "BR",
  nsid: "51178866@N04",
  alias: "palaciodoplanalto",
});

/** Supremo Tribunal Federal. */
export const STF = bancoNoFlickr({
  id: "stf",
  nome: "STF",
  pais: "BR",
  nsid: "192203401@N04",
  alias: "supremotribunalfederal",
});
