import type { AssetVisual, EntidadeVisual } from "./tipos";
import { ehPessoa, normalizarEntidade } from "./tipos";
import { avaliarLicenca, limparAutor, montarAtribuicao } from "./licencas";
import { agenteDaWikimedia } from "./wikidata";

/**
 * Fotos do Wikimedia Commons, com a licença junto.
 *
 * Usa a API oficial, nunca a página de busca. E nunca leva só a URL: o que
 * torna um arquivo publicável é o conjunto URL, página do arquivo, autor,
 * licença e atribuição, e é esse conjunto que sai daqui ou não sai nada.
 *
 * Três caminhos, do mais preciso para o menos:
 *
 *   1. o arquivo que o Wikidata declara como imagem da entidade (P18)
 *   2. os arquivos da categoria da entidade no Commons (P373)
 *   3. busca textual por nome, que é o único caminho quando não há QID
 *
 * O primeiro é o que resolve figura pública: para Trump, o P18 é o retrato
 * oficial, não uma foto de comício qualquer.
 */

const API = "https://commons.wikimedia.org/w/api.php";
const TEMPO_LIMITE_MS = 15_000;

/** Formatos que a caixa de entrada de e-mail renderiza. */
const MIMES_ACEITOS = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageInfo = {
  url?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
};

type Pagina = { title?: string; imageinfo?: ImageInfo[] };

export type CandidatoDoCommons = {
  arquivo: string;
  imageUrl: string;
  paginaUrl: string;
  autor: string;
  licenca: string;
  licencaUrl: string;
  descricao: string;
  categorias: string;
  largura: number;
  altura: number;
  mime: string;
  data: string;
};

/**
 * O que a foto representa.
 *
 * Retrato oficial é o arquivo que a própria entidade declara como sua imagem
 * (P18) quando ela é pessoa; retrato comum é qualquer outra foto dela.
 */
function contextoDaImagem(
  entidade: EntidadeVisual,
  candidato: CandidatoDoCommons
): AssetVisual["imageContextType"] {
  const declarada = Boolean(
    entidade.imagemPrincipal && candidato.arquivo.endsWith(entidade.imagemPrincipal)
  );

  if (ehPessoa(entidade.tipo)) return declarada ? "official_portrait" : "entity_portrait";
  if (entidade.tipo === "company") return "company";
  if (entidade.tipo === "place") return "place";
  if (entidade.tipo === "institution" || entidade.tipo === "government_agency") return "institution";
  return "conceptual";
}

function texto(em: Record<string, { value?: string }> | undefined, chave: string): string {
  return (em?.[chave]?.value ?? "").toString();
}

function paraCandidato(p: Pagina): CandidatoDoCommons | null {
  const ii = p.imageinfo?.[0];
  if (!ii?.url || !p.title) return null;
  const em = ii.extmetadata;

  return {
    arquivo: p.title,
    imageUrl: ii.url,
    paginaUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
    autor: limparAutor(texto(em, "Artist")),
    licenca: texto(em, "LicenseShortName") || texto(em, "License"),
    licencaUrl: texto(em, "LicenseUrl"),
    descricao: limparAutor(texto(em, "ImageDescription")).slice(0, 300),
    categorias: texto(em, "Categories").slice(0, 300),
    largura: Number(ii.width ?? 0),
    altura: Number(ii.height ?? 0),
    mime: ii.mime ?? "",
    data: texto(em, "DateTimeOriginal").replace(/<[^>]+>/g, "").slice(0, 40),
  };
}

async function consultar(
  parametros: Record<string, string>,
  fetcher: typeof fetch,
  env: Record<string, string | undefined>
): Promise<CandidatoDoCommons[]> {
  const url = new URL(API);
  for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v);
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|mime|extmetadata");

  const resposta = await fetcher(url, {
    headers: { "User-Agent": agenteDaWikimedia(env), Accept: "application/json" },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!resposta.ok) throw new Error(`Commons respondeu ${resposta.status}`);

  const corpo = (await resposta.json()) as { query?: { pages?: Record<string, Pagina> } };
  return Object.values(corpo.query?.pages ?? {})
    .map(paraCandidato)
    .filter((c): c is CandidatoDoCommons => c !== null);
}

export type BuscaNoCommons = {
  candidatos: CandidatoDoCommons[];
  caminhos: string[];
};

export async function buscarNoCommons(
  entidade: EntidadeVisual,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; limite?: number } = {}
): Promise<BuscaNoCommons> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const limite = String(opcoes.limite ?? 12);
  const caminhos: string[] = [];
  const porArquivo = new Map<string, CandidatoDoCommons>();

  // 1. A imagem que o próprio Wikidata declara para a entidade.
  if (entidade.imagemPrincipal) {
    try {
      const achados = await consultar(
        { action: "query", titles: `File:${entidade.imagemPrincipal}` },
        fetcher,
        env
      );
      for (const c of achados) porArquivo.set(c.arquivo, c);
      caminhos.push(`P18 (imagem declarada): ${achados.length}`);
    } catch (erro) {
      caminhos.push(`P18 falhou: ${(erro as Error).message}`);
    }
  }

  // 2. A categoria da entidade no Commons.
  if (entidade.categoriaCommons) {
    try {
      const achados = await consultar(
        {
          action: "query",
          generator: "categorymembers",
          gcmtitle: `Category:${entidade.categoriaCommons}`,
          gcmtype: "file",
          gcmlimit: limite,
        },
        fetcher,
        env
      );
      for (const c of achados) if (!porArquivo.has(c.arquivo)) porArquivo.set(c.arquivo, c);
      caminhos.push(`categoria "${entidade.categoriaCommons}": ${achados.length}`);
    } catch (erro) {
      caminhos.push(`categoria falhou: ${(erro as Error).message}`);
    }
  }

  // 3. Busca textual, que é o que sobra sem QID.
  if (porArquivo.size === 0) {
    try {
      const achados = await consultar(
        {
          action: "query",
          generator: "search",
          gsrsearch: entidade.nome,
          gsrnamespace: "6",
          gsrlimit: limite,
        },
        fetcher,
        env
      );
      for (const c of achados) if (!porArquivo.has(c.arquivo)) porArquivo.set(c.arquivo, c);
      caminhos.push(`busca textual "${entidade.nome}": ${achados.length}`);
    } catch (erro) {
      caminhos.push(`busca textual falhou: ${(erro as Error).message}`);
    }
  }

  return { candidatos: [...porArquivo.values()], caminhos };
}

export type ConversaoDeCandidato =
  | { ok: true; asset: AssetVisual }
  | { ok: false; motivo: string };

/**
 * Candidato do Commons vira asset, ou explica por que não vira.
 *
 * Aqui é onde a licença deixa de ser texto e vira decisão. Sem licença
 * reconhecida, o arquivo não passa, por mais que ele seja exatamente a foto
 * certa.
 */
export function candidatoParaAsset(
  candidato: CandidatoDoCommons,
  entidade: EntidadeVisual,
  env: Record<string, string | undefined> = process.env
): ConversaoDeCandidato {
  if (candidato.mime && !MIMES_ACEITOS.has(candidato.mime)) {
    return { ok: false, motivo: `formato ${candidato.mime} não renderiza em e-mail` };
  }

  const veredicto = avaliarLicenca(candidato.licenca, env);
  if (!veredicto.aceita) return { ok: false, motivo: veredicto.motivo };

  const agora = new Date().toISOString();

  return {
    ok: true,
    asset: {
      entityName: entidade.nome,
      entityNormalized: entidade.normalizado || normalizarEntidade(entidade.nome),
      entityType: entidade.tipo,
      source: "wikimedia_commons",
      sourceAssetId: candidato.arquivo,
      imageUrl: candidato.imageUrl,
      sourcePageUrl: candidato.paginaUrl,
      author: candidato.autor,
      license: veredicto.nome,
      licenseUrl: candidato.licencaUrl,
      attribution: montarAtribuicao({
        autor: candidato.autor,
        fonte: "Wikimedia Commons",
        licenca: veredicto.nome,
        exigeAtribuicao: veredicto.exigeAtribuicao,
      }),
      rightsStatement: candidato.licenca,
      rightsStatus: "verified",
      rightsCheckedAt: agora,
      sourceLastCheckedAt: agora,
      width: candidato.largura,
      height: candidato.altura,
      mimeType: candidato.mime,
      storagePath: null,
      perceptualHash: null,
      imageRelevanceScore: 0,
      /*
       * Nunca `exact_event`.
       *
       * Arquivo do Commons é acervo: uma foto real da pessoa, do prédio ou da
       * cidade. Não temos como provar que ela foi feita no acontecimento que a
       * matéria narra, e sem prova a classificação honesta é retrato ou
       * instituição, não "foto do fato".
       */
      imageContextType: contextoDaImagem(entidade, candidato),
      metadata: {
        descricao: candidato.descricao,
        categorias: candidato.categorias,
        data: candidato.data,
        permite_copia: veredicto.permiteCopia,
        exige_atribuicao: veredicto.exigeAtribuicao,
      },
    },
  };
}
