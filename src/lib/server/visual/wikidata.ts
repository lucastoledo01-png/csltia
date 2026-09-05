import type { EntidadeVisual, TipoDeEntidade } from "./tipos";
import { normalizarEntidade } from "./tipos";

/**
 * Quem é a entidade, e de que tipo ela é.
 *
 * O classificador já devolve atores e lugares por pauta, mas não diz se
 * "USCIS" é órgão, se "Deborah Boardman" é pessoa e se "Orlando" é cidade. Sem
 * isso não dá para aplicar a regra que mais importa: pessoa pública não aceita
 * foto conceitual no lugar.
 *
 * Em vez de gastar uma chamada de modelo para adivinhar isso, pergunta ao
 * Wikidata, que responde de graça, sem chave, e com dado estruturado:
 *
 *   P31  do que a entidade é instância (humano, cidade, agência, empresa)
 *   P18  a imagem principal declarada para ela
 *   P373 a categoria dela no Commons, que é o caminho mais preciso de busca
 *   P856 o site oficial, ponto de partida da camada de fonte oficial
 *
 * O P18 é o achado que muda o resultado: para figura pública conhecida, ele
 * aponta direto para o retrato oficial no Commons.
 */

const API = "https://www.wikidata.org/w/api.php";
const TEMPO_LIMITE_MS = 12_000;

/** Identifica o robô, como a política da Wikimedia pede. */
export function agenteDaWikimedia(env: Record<string, string | undefined> = process.env): string {
  const contato = env.WIKIMEDIA_CONTACT || "contato@lokta.com.br";
  return `imigra-us-newsroom/1.0 (https://casaloti.ia.br; ${contato})`;
}

/**
 * Do que a entidade é instância, traduzido para os nossos tipos.
 *
 * A lista é curta de propósito: cobre o que a publicação encontra. O que não
 * casar vira `institution` quando tem site oficial e `conceptual` quando não
 * tem, e o log diz qual QID não foi reconhecido, para a lista crescer com
 * dado em vez de com suposição.
 */
const INSTANCIA_PARA_TIPO: Record<string, TipoDeEntidade> = {
  Q5: "person",
  Q82955: "politician",
  Q30461: "politician",
  Q327333: "government_agency",
  Q2659904: "government_agency",
  Q1412224: "government_agency",
  Q43229: "institution",
  Q3918: "institution",
  Q2085381: "institution",
  Q41487: "institution",
  Q19832486: "institution",
  Q4830453: "company",
  Q783794: "company",
  Q6881511: "company",
  Q891723: "company",
  Q515: "place",
  Q1093829: "place",
  Q35657: "place",
  Q6256: "place",
  Q1549591: "place",
  Q3957: "place",
};

type Claims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;

function valores(claims: Claims, prop: string): string[] {
  return (claims[prop] ?? [])
    .map((c) => {
      const v = c.mainsnak?.datavalue?.value;
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && "id" in v) return String((v as { id: string }).id);
      return "";
    })
    .filter(Boolean);
}

export type ResolucaoDeEntidade = {
  entidade: EntidadeVisual | null;
  /** Toda tentativa, para o relatório dizer o que foi consultado. */
  nota: string;
};

export async function resolverEntidadeNoWikidata(
  nome: string,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; idioma?: string } = {}
): Promise<ResolucaoDeEntidade> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const idioma = opcoes.idioma ?? "pt";
  const cabecalho = { "User-Agent": agenteDaWikimedia(env), Accept: "application/json" };

  try {
    const busca = new URL(API);
    busca.searchParams.set("action", "wbsearchentities");
    busca.searchParams.set("search", nome);
    busca.searchParams.set("language", idioma);
    busca.searchParams.set("uselang", idioma);
    busca.searchParams.set("format", "json");
    busca.searchParams.set("limit", "3");

    const r1 = await fetcher(busca, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r1.ok) return { entidade: null, nota: `Wikidata respondeu ${r1.status}` };

    const achados = ((await r1.json()) as { search?: Array<{ id: string; label?: string; description?: string }> }).search ?? [];
    if (achados.length === 0) return { entidade: null, nota: `Wikidata não conhece "${nome}"` };

    const escolhido = achados[0];

    const detalhe = new URL(API);
    detalhe.searchParams.set("action", "wbgetentities");
    detalhe.searchParams.set("ids", escolhido.id);
    detalhe.searchParams.set("props", "claims");
    detalhe.searchParams.set("format", "json");

    const r2 = await fetcher(detalhe, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r2.ok) return { entidade: null, nota: `Wikidata (claims) respondeu ${r2.status}` };

    const corpo = (await r2.json()) as { entities?: Record<string, { claims?: Claims }> };
    const claims = corpo.entities?.[escolhido.id]?.claims ?? {};

    const instancias = valores(claims, "P31");
    const tipoConhecido = instancias.map((q) => INSTANCIA_PARA_TIPO[q]).find(Boolean);
    const siteOficial = valores(claims, "P856")[0] ?? null;

    const tipo: TipoDeEntidade = tipoConhecido ?? (siteOficial ? "institution" : "conceptual");

    return {
      entidade: {
        nome: escolhido.label || nome,
        normalizado: normalizarEntidade(escolhido.label || nome),
        tipo,
        qid: escolhido.id,
        imagemPrincipal: valores(claims, "P18")[0] ?? null,
        categoriaCommons: valores(claims, "P373")[0] ?? null,
        siteOficial,
        origem: `Wikidata ${escolhido.id}${tipoConhecido ? "" : ` (P31 ${instancias.join(",") || "ausente"} não mapeado)`}`,
      },
      nota: `${escolhido.id}: ${escolhido.description ?? "sem descrição"}, tipo ${tipo}`,
    };
  } catch (erro) {
    return { entidade: null, nota: `Wikidata falhou: ${(erro as Error).message}` };
  }
}
