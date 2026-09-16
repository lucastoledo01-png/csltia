import type { AssetVisual, EntidadeVisual } from "./tipos";
import { ehPessoa } from "./tipos";
import { avaliarLicenca, montarAtribuicao } from "./licencas";

/**
 * Openverse: um endpoint, vários acervos.
 *
 * Ele não tem acervo próprio. É o índice do Flickr, do Wikimedia, da Europeana,
 * do Smithsonian e da NASA, e é por isso que entra: um integrador só cobre
 * cinco fontes, e o campo `attribution` já vem montado, o que elimina o
 * trabalho de remontar crédito de cada acervo.
 *
 * O que ele NÃO é, e isto precisa estar escrito: fonte de atualidade. O acervo
 * é dominado por foto amadora do Flickr, e numa busca por "border patrol" o
 * primeiro resultado pode ser a foto de um passante. Ele entra como varredura
 * ampla ao lado do Commons, e quem decide continua sendo a pontuação de
 * relevância, nunca a ordem de chegada.
 *
 * ## As três travas
 *
 * LICENÇA no pedido, e não depois. `license_type=commercial` sozinho ainda
 * devolve ND, que proíbe obra derivada: recortar a foto para o formato da peça
 * é derivada. A busca pede `license=cc0,pdm,by,by-sa`, que são as quatro
 * famílias que a allowlist aceita, e `avaliarLicenca` confere de novo do lado
 * de cá.
 *
 * HOST de imagem, porque `next/image` LANÇA quando o host não está em
 * `remotePatterns` e derruba a página inteira do portal, não só a capa. O
 * Openverse pode devolver imagem de qualquer provedor; aqui só passam os dois
 * que estão liberados.
 *
 * CONTEÚDO SENSÍVEL: o índice marca `mature` e `unstable__sensitivity`, e os
 * dois são motivo de descarte. Publicação sobre imigração não erra isso uma vez.
 */

const API = "https://api.openverse.org/v1/images/";

/** Sem chave, e o limite anônimo medido nos headers: 20/min e 200/dia. */
const TEMPO_LIMITE_MS = 12_000;

/**
 * Hosts que a peça pode carregar.
 *
 * Os dois estão em `next.config.ts`. Acrescentar provedor aqui sem acrescentar
 * lá é o bug que derruba a página do artigo, e existe um teste ligando as duas
 * listas.
 */
const HOSTS_PERMITIDOS = new Set(["live.staticflickr.com", "upload.wikimedia.org"]);

type ResultadoOpenverse = {
  id?: string;
  title?: string;
  url?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  attribution?: string;
  foreign_landing_url?: string;
  source?: string;
  provider?: string;
  width?: number;
  height?: number;
  filetype?: string;
  mature?: boolean;
  unstable__sensitivity?: unknown[];
  tags?: Array<{ name?: string }>;
  indexed_on?: string;
};

export type CandidatoDoOpenverse = {
  id: string;
  titulo: string;
  imageUrl: string;
  paginaUrl: string;
  autor: string;
  licenca: string;
  licencaUrl: string;
  atribuicao: string;
  provedor: string;
  largura: number;
  altura: number;
  mime: string;
  tags: string;
};

/**
 * O texto da licença no formato que a allowlist reconhece.
 *
 * O índice devolve a licença em duas partes, `by-sa` e `2.0`, e a allowlist lê
 * texto corrido. Montar aqui evita que cada consumidor invente a sua tradução.
 */
export function textoDaLicenca(codigo: string, versao: string): string {
  const c = (codigo || "").trim().toLowerCase();
  const v = (versao || "").trim();
  if (c === "cc0") return `CC0 ${v}`.trim();
  if (c === "pdm") return `Public Domain Mark ${v}`.trim();
  if (!c) return "";
  return `CC ${c.toUpperCase()} ${v}`.trim();
}

export function hostPermitido(url: string): boolean {
  try {
    return HOSTS_PERMITIDOS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function paraCandidato(r: ResultadoOpenverse): CandidatoDoOpenverse | null {
  const imageUrl = (r.url ?? "").trim();
  if (!imageUrl || !r.id) return null;
  if (!hostPermitido(imageUrl)) return null;
  if (r.mature === true) return null;
  if (Array.isArray(r.unstable__sensitivity) && r.unstable__sensitivity.length > 0) return null;

  return {
    id: String(r.id),
    titulo: (r.title ?? "").slice(0, 200),
    imageUrl,
    paginaUrl: (r.foreign_landing_url ?? "").trim() || `https://openverse.org/image/${r.id}`,
    autor: (r.creator ?? "").slice(0, 120),
    licenca: textoDaLicenca(r.license ?? "", r.license_version ?? ""),
    licencaUrl: (r.license_url ?? "").trim(),
    atribuicao: (r.attribution ?? "").slice(0, 400),
    provedor: (r.source || r.provider || "").slice(0, 40),
    largura: Number(r.width ?? 0),
    altura: Number(r.height ?? 0),
    mime: r.filetype ? `image/${r.filetype}` : "image/jpeg",
    tags: (r.tags ?? [])
      .map((t) => (t?.name ?? "").trim())
      .filter(Boolean)
      .slice(0, 25)
      .join(", "),
  };
}

export type BuscaNoOpenverse = {
  candidatos: CandidatoDoOpenverse[];
  caminhos: string[];
};

export async function buscarNoOpenverse(
  entidade: EntidadeVisual,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; quantos?: number } = {}
): Promise<BuscaNoOpenverse> {
  const fetcher = opcoes.fetcher ?? fetch;
  const consulta = entidade.nome.trim();
  if (!consulta) return { candidatos: [], caminhos: ["entidade sem nome"] };

  const url = new URL(API);
  url.searchParams.set("q", consulta);
  url.searchParams.set("license", "cc0,pdm,by,by-sa");
  url.searchParams.set("page_size", String(opcoes.quantos ?? 12));
  // Só os dois provedores cujos hosts estão liberados no next/image.
  url.searchParams.set("source", "flickr,wikimedia");

  const resposta = await fetcher(url.toString(), {
    headers: { "User-Agent": "usa.journal/1.0 (https://casaloti.ia.br)" },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });

  if (!resposta.ok) {
    throw new Error(`Openverse respondeu ${resposta.status}`);
  }

  const json = (await resposta.json()) as { results?: ResultadoOpenverse[]; result_count?: number };
  const candidatos = (json.results ?? [])
    .map(paraCandidato)
    .filter((c): c is CandidatoDoOpenverse => c !== null);

  return {
    candidatos,
    caminhos: [`"${consulta}" devolveu ${json.result_count ?? 0}, ${candidatos.length} utilizável(is)`],
  };
}

export type ConversaoDoOpenverse =
  | { ok: true; asset: AssetVisual }
  | { ok: false; motivo: string };

export function candidatoParaAsset(
  candidato: CandidatoDoOpenverse,
  entidade: EntidadeVisual,
  env: Record<string, string | undefined> = process.env
): ConversaoDoOpenverse {
  const veredicto = avaliarLicenca(candidato.licenca, env);
  if (!veredicto.aceita) {
    return { ok: false, motivo: `licença recusada: ${veredicto.motivo}` };
  }

  const agora = new Date().toISOString();

  return {
    ok: true,
    asset: {
      entityName: entidade.nome,
      entityNormalized: entidade.normalizado,
      entityType: entidade.tipo,
      source: "openverse",
      sourceAssetId: candidato.id,
      imageUrl: candidato.imageUrl,
      sourcePageUrl: candidato.paginaUrl,
      author: candidato.autor,
      license: veredicto.nome,
      licenseUrl: candidato.licencaUrl,
      /*
       * A atribuição do índice é preferida à nossa quando ela existe: ela já
       * vem no formato que a licença exige, com título, autor e link da
       * licença. `montarAtribuicao` continua sendo o caminho quando o campo
       * vem vazio, para a peça nunca sair sem crédito onde a licença cobra.
       */
      attribution:
        candidato.atribuicao ||
        montarAtribuicao({
          autor: candidato.autor,
          fonte: candidato.provedor,
          licenca: veredicto.nome,
          exigeAtribuicao: veredicto.exigeAtribuicao,
        }),
      rightsStatement: veredicto.motivo,
      rightsStatus: "verified",
      rightsCheckedAt: agora,
      sourceLastCheckedAt: agora,
      width: candidato.largura,
      height: candidato.altura,
      mimeType: candidato.mime,
      storagePath: null,
      perceptualHash: null,
      imageRelevanceScore: 0,
      imageContextType: ehPessoa(entidade.tipo)
        ? "entity_portrait"
        : entidade.tipo === "place"
          ? "place"
          : entidade.tipo === "company"
            ? "company"
            : entidade.tipo === "institution" || entidade.tipo === "government_agency"
              ? "institution"
              : "conceptual",
      /*
       * A metadata não fica vazia, e isso não é enfeite.
       *
       * As barreiras de datação e de figura não central leem `descricao`,
       * `categorias` e `titulo`. Fonte que chega sem esses campos passa por
       * elas sem ser conferida, que é pior do que ser recusada.
       */
      metadata: {
        titulo: candidato.titulo,
        descricao: candidato.titulo,
        categorias: candidato.tags,
        provedor: candidato.provedor,
        via: "openverse",
      },
    },
  };
}
