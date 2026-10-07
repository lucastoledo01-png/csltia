import { autorNaLegenda } from "./flickr";
import { pedirAoBanco } from "./rede";
import type { BuscaNoBanco, DefinicaoDoBanco, FotoDoBanco, OpcoesDaBusca } from "./tipos";

/**
 * As fotos da conta da Casa Branca no Flickr, pelo espelho do Commons
 * (07/10/2026).
 *
 * O dono pediu a conta flickr.com/photos/whitehouse. A API do Flickr pede
 * Flickr Pro e chave comercial negociada; o robô OptimusPrimeBot do Commons já
 * copia a conta inteira, com a mesma licença conferida (FlickreviewR, "United
 * States Government Work") e a legenda original. O Commons não pede chave e já
 * é fonte nossa, então a busca vai lá, dentro da categoria do espelho. O
 * custo é o atraso do robô, de horas a poucos dias: para foto de pessoa
 * (Trump, Vance, secretários) o que importa é o rosto certo, não a foto do dia.
 *
 * Só entra a foto do fotógrafo oficial, a que termina com "(Official White
 * House Photo by Fulano)", como nas galerias do whitehouse.gov: legenda sem
 * esse crédito pode ser de terceiro, e silêncio sobre direitos é recusa.
 */

export const CATEGORIA_DO_ESPELHO = "White_House_Flickr_files_uploaded_by_OptimusPrimeBot";
const API = "https://commons.wikimedia.org/w/api.php";
const CREDITO_OFICIAL = /\(Official White House Photo by [^)]+\)/i;

type PaginaDoCommons = {
  pageid?: number;
  title?: string;
  imageinfo?: Array<{
    url?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }>;
};

function semHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
}

const MESES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** "Taken on 30 September 2026, 08:40:24" ou "2026-08-20 16:11:15" viram "2026-09-30" e "2026-08-20". */
export function dataDoCommons(valor: string): string | null {
  const texto = semHtml(valor);
  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const extenso = texto.match(/(\d{1,2}) ([A-Za-z]+) (\d{4})/);
  const mes = extenso ? MESES[extenso[2].toLowerCase()] : undefined;
  return extenso && mes ? `${extenso[3]}-${mes}-${extenso[1].padStart(2, "0")}` : null;
}

export function lerBuscaDoEspelho(corpo: { query?: { pages?: Record<string, PaginaDoCommons> } }): FotoDoBanco[] {
  const fotos: FotoDoBanco[] = [];
  for (const p of Object.values(corpo.query?.pages ?? {})) {
    const info = p.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    if (!info?.url || !p.pageid) continue;
    const descricao = semHtml(meta.ImageDescription?.value ?? "");
    if (!CREDITO_OFICIAL.test(descricao)) continue;
    fotos.push({
      banco: "casa_branca_commons",
      id: String(p.pageid),
      titulo: (p.title ?? "").replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
      descricao,
      imageUrl: info.url,
      paginaUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title ?? "")}`,
      autor: autorNaLegenda(descricao),
      data: dataDoCommons(meta.DateTimeOriginal?.value ?? ""),
      largura: Number(info.width ?? 0) || 0,
      altura: Number(info.height ?? 0) || 0,
      licenca: semHtml(meta.LicenseShortName?.value ?? ""),
      licencaUrl: info.descriptionurl ?? "",
    });
  }
  // A mais nova primeiro, como as galerias do whitehouse.gov.
  return fotos.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
}

export const CASA_BRANCA_COMMONS: DefinicaoDoBanco = {
  id: "casa_branca_commons",
  nome: "Casa Branca",
  pais: "US",
  hostsDeImagem: ["upload.wikimedia.org"],
  buscar: async (consulta: string, opcoes: OpcoesDaBusca): Promise<BuscaNoBanco> => {
    const url = new URL(API);
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrsearch", `incategory:${CATEGORIA_DO_ESPELHO} ${consulta}`);
    url.searchParams.set("gsrlimit", String(Math.max(opcoes.quantos * 2, 10)));
    url.searchParams.set("gsrsort", "create_timestamp_desc");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|size|extmetadata");
    url.searchParams.set("iiextmetadatafilter", "LicenseShortName|ImageDescription|DateTimeOriginal");
    url.searchParams.set("format", "json");
    const corpo = JSON.parse(await pedirAoBanco(url.toString(), { fetcher: opcoes.fetcher, espaco: opcoes.espaco }));
    const fotos = lerBuscaDoEspelho(corpo);
    return {
      fotos: fotos.slice(0, opcoes.quantos),
      nota: `${Object.keys(corpo.query?.pages ?? {}).length} no espelho da Casa Branca no Commons, ${fotos.length} com crédito oficial`,
    };
  },
};
