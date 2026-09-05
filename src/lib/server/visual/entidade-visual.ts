import type { EntidadeVisual } from "./tipos";
import { normalizarEntidade } from "./tipos";
import { resolverEntidadeNoWikidata } from "./wikidata";

/**
 * Qual é o assunto visual da pauta.
 *
 * A busca de imagem não pode nascer do título: "Trump anuncia nova medida para
 * profissionais estrangeiros" tem doze palavras e uma só é fotografável.
 *
 * O material já existe. O classificador da fase 1 devolve `atores`, `lugares` e
 * `acontecimento` por pauta, e é dele que a entidade sai. Nenhuma chamada de
 * modelo é feita aqui: quem diz o tipo é o Wikidata, de graça.
 *
 * A ordem de preferência é pessoa, depois organização, depois lugar. Ela vem
 * de como o leitor lê a manchete: quando há gente na notícia, a gente é o
 * assunto.
 */

/** Quantas consultas ao Wikidata por pauta. Segura latência e educação. */
const MAXIMO_DE_CONSULTAS = 4;

/**
 * Nomes que aparecem em `atores` e não são entidade visual.
 *
 * O classificador às vezes devolve o veículo ou um termo de processo. Foto do
 * logo da Reuters não ilustra notícia de imigração.
 */
const NAO_SAO_ENTIDADE = new Set([
  "reuters", "ap", "associated press", "afp", "efe", "g1", "folha", "estadao",
  "cnn", "bbc", "pbs", "npr", "cbs", "nbc", "abc", "the new york times",
  "washington post", "cnbc", "bloomberg", "the american bazaar", "indiawest",
]);

export type EscolhaDeEntidade = {
  entidade: EntidadeVisual | null;
  /** Toda tentativa, na ordem, para o relatório. */
  tentativas: Array<{ candidato: string; resultado: string }>;
};

export async function escolherEntidadeVisual(
  classificacao: { atores: string[]; lugares: string[]; acontecimento: string[]; pais?: string },
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {}
): Promise<EscolhaDeEntidade> {
  const tentativas: Array<{ candidato: string; resultado: string }> = [];

  const atores = classificacao.atores
    .map((a) => a.trim())
    .filter((a) => a.length > 2 && !NAO_SAO_ENTIDADE.has(normalizarEntidade(a)));

  const lugares = classificacao.lugares.map((l) => l.trim()).filter((l) => l.length > 2);

  /*
   * Nome específico antes de sigla.
   *
   * "Immigration and Customs Enforcement" resolve para a agência. "ICE"
   * resolve para metanfetamina, que é o que o Wikidata considera mais popular
   * com esse nome. Quando a classificação traz os dois, o longo vai primeiro.
   */
  const porEspecificidade = (a: string, b: string) => b.length - a.length;
  const candidatos = [...atores.sort(porEspecificidade), ...lugares].slice(0, MAXIMO_DE_CONSULTAS);
  const resolvidas: EntidadeVisual[] = [];

  for (const candidato of candidatos) {
    const { entidade, nota } = await resolverEntidadeNoWikidata(candidato, {
      ...opcoes,
      paisDaPauta: classificacao.pais,
    });
    tentativas.push({ candidato, resultado: nota });
    if (entidade) resolvidas.push(entidade);
  }

  if (resolvidas.length === 0) {
    return { entidade: null, tentativas };
  }

  const porPrioridade = (e: EntidadeVisual): number => {
    if (e.tipo === "politician" || e.tipo === "public_official") return 0;
    if (e.tipo === "person") return 1;
    if (e.tipo === "government_agency") return 2;
    if (e.tipo === "institution") return 3;
    if (e.tipo === "company") return 4;
    if (e.tipo === "place") return 5;
    return 6;
  };

  // Entre entidades do mesmo tipo, a que tem imagem declarada no Wikidata vem
  // primeiro: é a que tem foto certa garantida.
  const escolhida = [...resolvidas].sort((a, b) => {
    const p = porPrioridade(a) - porPrioridade(b);
    if (p !== 0) return p;
    return Number(Boolean(b.imagemPrincipal)) - Number(Boolean(a.imagemPrincipal));
  })[0];

  return {
    entidade: {
      ...escolhida,
      origem: `${escolhida.origem}; escolhida entre ${resolvidas.length} candidata(s) por tipo ${escolhida.tipo}`,
    },
    tentativas,
  };
}

/**
 * Sem entidade nenhuma, a pauta é conceitual.
 *
 * O tema vem do acontecimento, não do título: "prorrogação" e "aumento de
 * taxa" descrevem o que fotografar melhor do que a manchete inteira.
 */
export function entidadeConceitual(acontecimento: string[], categoria: string): EntidadeVisual {
  const termo = [acontecimento[0], categoria].filter(Boolean).join(" ").trim() || "imigração";
  return {
    nome: termo,
    normalizado: normalizarEntidade(termo),
    tipo: "conceptual",
    qid: null,
    imagemPrincipal: null,
    categoriaCommons: null,
    siteOficial: null,
    origem: "sem entidade identificável, pauta tratada como conceitual",
  };
}
