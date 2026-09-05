/**
 * URL canônica: a mesma notícia chega por endereços diferentes.
 *
 * Agregador, newsletter e rede social acrescentam rastreamento, e o mesmo
 * artigo aparece como três URLs distintas. Comparar a URL crua deixa passar
 * repetição óbvia — foi assim que a mesma matéria voltou em dias seguidos.
 *
 * O que sai: parâmetros de rastreamento, âncora, barra final, `www.`, e a
 * distinção entre http e https. O que fica: host, caminho e qualquer
 * parâmetro que o site use para identificar o conteúdo (`id`, `p`, `story`).
 * Descartar tudo faria dois artigos distintos de um mesmo CMS colidirem.
 */

const RASTREAMENTO = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^igshid$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^source$/i,
  /^cmpid$/i,
  /^ncid$/i,
  /^smid$/i,
  /^s_cid$/i,
  /^__twitter_impression$/i,
  /^guccounter$/i,
  /^guce_referrer/i,
  /^amp$/i,
  /^at_medium$/i,
  /^at_campaign$/i,
];

function ehRastreamento(chave: string): boolean {
  return RASTREAMENTO.some((r) => r.test(chave));
}

export function urlCanonica(bruta: string): string {
  const texto = (bruta ?? "").trim();
  if (!texto) return "";

  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    // URL inválida vira ela mesma em minúsculas: melhor comparar o texto que
    // fingir que não existe endereço nenhum.
    return texto.toLowerCase();
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return texto.toLowerCase();

  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  const parametros = [...u.searchParams.entries()]
    .filter(([chave]) => !ehRastreamento(chave))
    .sort(([a], [b]) => a.localeCompare(b));

  const query = parametros.length
    ? "?" + parametros.map(([k, v]) => `${k}=${v}`).join("&")
    : "";

  // Barra final não distingue conteúdo em servidor nenhum que importe aqui.
  const caminho = u.pathname.replace(/\/+$/, "") || "/";

  return `${host}${caminho}${query}`;
}

/** Domínio da URL, para medir qualidade de fonte e concentração. */
export function dominioDe(bruta: string): string {
  try {
    return new URL(bruta).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
