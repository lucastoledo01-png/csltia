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
  Q241317: "company",
  Q1210425: "company",
  Q18388277: "company",
  Q783794: "company",
  Q6881511: "company",
  Q891723: "company",
  Q190752: "institution",
  Q895914: "institution",
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

/** País esperado da pauta, para desempatar homônimo. */
const PAIS_PARA_QID: Record<string, string> = { EUA: "Q30", Brasil: "Q155" };

/**
 * Nota mínima para aceitar um candidato.
 *
 * Abaixo disto, a resposta correta é "sem entidade". Publicar sem imagem custa
 * um bloco vazio; publicar a entidade errada custa a credibilidade da matéria.
 */
const LIMIAR_DE_ACEITE = 55;

type Candidato = {
  id: string;
  label: string;
  descricao: string;
  instancias: string[];
  pais: string[];
  temImagem: boolean;
  temSiteOficial: boolean;
  temCategoria: boolean;
  claims: Claims;
};

/*
 * Por que não basta pegar o primeiro resultado.
 *
 * Buscar "ICE" no Wikidata devolve, em ordem: metanfetamina, trem alemão, água
 * congelada e motor de combustão. A agência de imigração não aparece nem entre
 * as dez primeiras. Buscar "AWS" em português devolve uma banda húngara antes
 * da Amazon Web Services.
 *
 * O primeiro resultado é o mais popular, e popular não é o que a notícia quer
 * dizer. Então os candidatos são pontuados: tipo que serve para ilustrar,
 * país que bate com o da pauta, existência de imagem declarada e igualdade com
 * o termo buscado. Quando nada pontua, a resposta correta é não ter entidade,
 * e não a foto de metanfetamina.
 */
function pontuarCandidato(c: Candidato, termo: string, paisEsperado: string | null): number {
  let nota = 0;

  const tipo = c.instancias.map((q) => INSTANCIA_PARA_TIPO[q]).find(Boolean);
  // Tipo reconhecido pesa mais que a soma dos sinais indiretos: sem isso, a
  // American Welding Society ganhava da Amazon Web Services na busca por
  // "AWS", e a cidade de Washington na Pensilvânia ganhava do estado.
  if (tipo) nota += 70;

  /*
   * Sinais que valem quando o P31 não está no mapa.
   *
   * Manter uma lista completa de "do que a entidade é instância" é jogo
   * perdido: o Wikidata tem milhares de tipos, e as entidades certas estavam
   * sendo recusadas por isso. O STF é instância de "suprema corte", a ICE é
   * instância de "agência federal americana", e nenhuma das duas estava no
   * mapa.
   *
   * Ter site oficial é evidência forte de organização real. Ter categoria no
   * Commons é evidência de assunto fotografado. Nenhum dos dois é verdade para
   * um composto químico ou uma música.
   */
  if (!tipo && c.temSiteOficial) nota += 35;
  if (!tipo && c.temCategoria) nota += 20;

  if (paisEsperado && c.pais.includes(paisEsperado)) nota += 20;
  if (c.temImagem) nota += 10;
  // Categoria no Commons vale sempre: entre dois itens do mesmo órgão, o que
  // tem categoria é o que tem foto para buscar. O Wikidata tem duplicata de
  // instituição, e a diferença entre elas costuma ser exatamente essa.
  if (c.temCategoria) nota += 10;
  if (c.label.trim().toLowerCase() === termo.trim().toLowerCase()) nota += 10;

  // Descrição que denuncia coisa que não se fotografa como entidade de
  // notícia: composto químico, gene, proteína, single musical.
  if (/compound|chemical|stimulant|gene|protein|single by|dog breed|cell line|webcomic/i.test(c.descricao)) {
    nota -= 60;
  }

  return nota;
}

async function buscarCandidatos(
  nome: string,
  idioma: string,
  fetcher: typeof fetch,
  cabecalho: Record<string, string>
): Promise<Array<{ id: string; label: string; descricao: string }>> {
  const busca = new URL(API);
  busca.searchParams.set("action", "wbsearchentities");
  busca.searchParams.set("search", nome);
  busca.searchParams.set("language", idioma);
  busca.searchParams.set("uselang", idioma);
  busca.searchParams.set("format", "json");
  busca.searchParams.set("limit", "6");

  const r = await fetcher(busca, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  if (!r.ok) return [];

  const corpo = (await r.json()) as { search?: Array<{ id: string; label?: string; description?: string }> };
  return (corpo.search ?? []).map((s) => ({
    id: s.id,
    label: s.label ?? nome,
    descricao: s.description ?? "",
  }));
}

export async function resolverEntidadeNoWikidata(
  nome: string,
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    idioma?: string;
    /** "EUA" ou "Brasil", vindo da classificação da pauta. */
    paisDaPauta?: string;
  } = {}
): Promise<ResolucaoDeEntidade> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const cabecalho = { "User-Agent": agenteDaWikimedia(env), Accept: "application/json" };
  const paisEsperado = opcoes.paisDaPauta ? (PAIS_PARA_QID[opcoes.paisDaPauta] ?? null) : null;

  try {
    // Os dois idiomas: sigla americana costuma resolver em inglês, órgão
    // brasileiro em português, e o custo de perguntar duas vezes é baixo.
    const idiomas = opcoes.idioma ? [opcoes.idioma] : ["pt", "en"];
    const achadosPorId = new Map<string, { id: string; label: string; descricao: string }>();

    for (const idioma of idiomas) {
      for (const a of await buscarCandidatos(nome, idioma, fetcher, cabecalho)) {
        if (!achadosPorId.has(a.id)) achadosPorId.set(a.id, a);
      }
    }

    const achados = [...achadosPorId.values()].slice(0, 8);
    if (achados.length === 0) return { entidade: null, nota: `Wikidata não conhece "${nome}"` };

    const detalhe = new URL(API);
    detalhe.searchParams.set("action", "wbgetentities");
    detalhe.searchParams.set("ids", achados.map((a) => a.id).join("|"));
    detalhe.searchParams.set("props", "claims");
    detalhe.searchParams.set("format", "json");

    const r2 = await fetcher(detalhe, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r2.ok) return { entidade: null, nota: `Wikidata (claims) respondeu ${r2.status}` };

    const corpo = (await r2.json()) as { entities?: Record<string, { claims?: Claims }> };

    const candidatos: Candidato[] = achados.map((a) => {
      const claims = corpo.entities?.[a.id]?.claims ?? {};
      return {
        id: a.id,
        label: a.label,
        descricao: a.descricao,
        instancias: valores(claims, "P31"),
        pais: valores(claims, "P17"),
        temImagem: valores(claims, "P18").length > 0,
        temSiteOficial: valores(claims, "P856").length > 0,
        temCategoria: valores(claims, "P373").length > 0,
        claims,
      };
    });

    const ranqueados = candidatos
      .map((c) => ({ c, nota: pontuarCandidato(c, nome, paisEsperado) }))
      .sort((a, b) => b.nota - a.nota);

    const melhor = ranqueados[0];

    // Nenhum candidato com tipo utilizável é resposta legítima: melhor sem
    // entidade do que com a entidade errada.
    if (!melhor || melhor.nota < LIMIAR_DE_ACEITE) {
      return {
        entidade: null,
        nota:
          `nenhum candidato utilizável para "${nome}" ` +
          `(melhor: ${melhor?.c.id ?? "nenhum"} "${melhor?.c.descricao.slice(0, 40) ?? ""}", nota ${melhor?.nota ?? 0})`,
      };
    }

    const escolhido = melhor.c;
    const tipoConhecido = escolhido.instancias.map((q) => INSTANCIA_PARA_TIPO[q]).find(Boolean);
    const siteOficial = valores(escolhido.claims, "P856")[0] ?? null;
    const tipo: TipoDeEntidade = tipoConhecido ?? (siteOficial ? "institution" : "conceptual");

    return {
      entidade: {
        nome: escolhido.label || nome,
        normalizado: normalizarEntidade(escolhido.label || nome),
        tipo,
        qid: escolhido.id,
        imagemPrincipal: valores(escolhido.claims, "P18")[0] ?? null,
        categoriaCommons: valores(escolhido.claims, "P373")[0] ?? null,
        siteOficial,
        origem: `Wikidata ${escolhido.id}, nota ${melhor.nota} entre ${candidatos.length} candidatos`,
      },
      nota: `${escolhido.id}: ${escolhido.descricao || "sem descrição"}, tipo ${tipo}, nota ${melhor.nota}`,
    };
  } catch (erro) {
    return { entidade: null, nota: `Wikidata falhou: ${(erro as Error).message}` };
  }
}
