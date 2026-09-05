import type { EntidadeVisual } from "./tipos";
import { normalizarEntidade } from "./tipos";
import { resolverEntidadeNoWikidata } from "./wikidata";
import { escolherPorCentralidade } from "./centralidade";

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

/**
 * De onde a pauta fala, quando a classificação não diz.
 *
 * O campo `pais` existe desde a fase 1 e vem preenchido no fluxo novo, mas os
 * registros reconstruídos no backfill não têm. Sem país, "ICE" vira trem
 * alemão. Inferir do lugar citado é ler o que já está lá, não adivinhar.
 */
const PISTAS_DE_PAIS: Array<{ padrao: RegExp; pais: string }> = [
  { padrao: /estados unidos|eua|washington|nova york|new york|calif[óo]rnia|fl[óo]rida|texas|minneapolis|oregon|colorado|maryland/i, pais: "EUA" },
  { padrao: /brasil|bras[íi]lia|s[ãa]o paulo|rio de janeiro|minas gerais|congresso nacional/i, pais: "Brasil" },
];

export function inferirPais(lugares: string[], atores: string[]): string | undefined {
  const texto = [...lugares, ...atores].join(" ");
  return PISTAS_DE_PAIS.find((p) => p.padrao.test(texto))?.pais;
}

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
  /** Houve candidato plausível, e nada no contexto decidiu qual era. */
  ambigua: boolean;
};

export async function escolherEntidadeVisual(
  classificacao: {
    atores: string[];
    lugares: string[];
    acontecimento: string[];
    pais?: string;
    /** Título e resumo juntos, para desambiguar lugar. */
    contexto?: string;
    /** O título sozinho. É o sinal mais forte de centralidade. */
    titulo?: string;
    /** O texto da matéria. A abertura dele indica o sujeito do fato. */
    resumo?: string;
  },
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {}
): Promise<EscolhaDeEntidade> {
  const tentativas: Array<{ candidato: string; resultado: string }> = [];
  let houveAmbiguidade = false;

  /*
   * Só nome próprio vira busca de imagem.
   *
   * O classificador devolve em `atores` coisas que não são entidade: "novos
   * agentes", "homem de 76 anos", "indianos". Buscadas no Wikidata, elas
   * encontram QUALQUER coisa parecida: "indianos" devolveu o Indiana Pacers,
   * e a matéria sobre fila de green card ia sair ilustrada com um jogo de
   * basquete.
   *
   * Nome de entidade começa com maiúscula ou é sigla. O resto é descrição, e
   * descrição a gente ilustra pelo tema, não pela busca de entidade.
   */
  const ehNomeProprio = (t: string) => /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(t) || /^[A-Z]{2,6}$/.test(t);

  const atores = classificacao.atores
    .map((a) => a.trim())
    .filter((a) => a.length > 2 && ehNomeProprio(a) && !NAO_SAO_ENTIDADE.has(normalizarEntidade(a)));

  const lugares = classificacao.lugares.map((l) => l.trim()).filter((l) => l.length > 2 && ehNomeProprio(l));

  /*
   * Nome específico antes de sigla.
   *
   * "Immigration and Customs Enforcement" resolve para a agência. "ICE"
   * resolve para metanfetamina, que é o que o Wikidata considera mais popular
   * com esse nome. Quando a classificação traz os dois, o longo vai primeiro.
   */
  const porEspecificidade = (a: string, b: string) => b.length - a.length;
  const candidatos = [...atores.sort(porEspecificidade), ...lugares].slice(0, MAXIMO_DE_CONSULTAS);
  const pais = classificacao.pais || inferirPais(lugares, atores);
  const resolvidas: EntidadeVisual[] = [];

  for (const candidato of candidatos) {
    const { entidade, nota, ambigua } = await resolverEntidadeNoWikidata(candidato, {
      ...opcoes,
      paisDaPauta: pais,
      contexto: [classificacao.contexto ?? "", ...atores, ...lugares].join(" "),
    });
    tentativas.push({ candidato, resultado: nota });
    if (ambigua) houveAmbiguidade = true;
    if (entidade) resolvidas.push(entidade);
  }

  if (resolvidas.length === 0) {
    return { entidade: null, tentativas, ambigua: houveAmbiguidade };
  }

  /*
   * A mesma entidade achada duas vezes não é empate.
   *
   * A matéria cita "ICE" e "Immigration and Customs Enforcement", e as duas
   * resolvem para o mesmo QID. Sem juntar, isso vira "duas entidades
   * igualmente centrais" e a pauta sai sem foto por um empate que não existe.
   */
  const unicas = new Map<string, EntidadeVisual>();
  for (const e of resolvidas) {
    const chave = e.qid ?? normalizarEntidade(e.nome);
    if (!unicas.has(chave)) unicas.set(chave, e);
  }
  const distintas = [...unicas.values()];

  /*
   * Centralidade decide, e não popularidade no Wikidata.
   *
   * Dois erros reais: o Datafolha venceu numa pauta de cotação porque é
   * instituição bem documentada, e o Palácio do Planalto venceu numa pauta
   * cujo título aponta para STF, PF e Congresso. Nos dois casos a entidade
   * escolhida só aparecia no corpo.
   */
  const escolhaCentral = escolherPorCentralidade(distintas, {
    titulo: classificacao.titulo ?? "",
    resumo: classificacao.resumo ?? classificacao.contexto ?? "",
    atores,
  });

  if (!escolhaCentral.escolhida) {
    tentativas.push({ candidato: "centralidade", resultado: escolhaCentral.detalhe });
    return { entidade: null, tentativas, ambigua: escolhaCentral.ambigua };
  }

  const escolhida = escolhaCentral.escolhida;

  return {
    entidade: {
      ...escolhida,
      origem: `${escolhida.origem}; ${escolhaCentral.detalhe}`,
      confianca: Math.min(100, Math.round((escolhida.confianca + (escolhaCentral.nota?.valor ?? 0)) / 2)),
      evidencias: [
        ...escolhida.evidencias,
        `centralidade: ${escolhaCentral.nota?.motivo ?? "não avaliada"}`,
        `escolhida entre ${distintas.length} candidata(s) distinta(s)`,
      ],
    },
    tentativas,
    ambigua: false,
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
    confianca: 30,
    evidencias: [`acontecimento "${acontecimento[0] ?? "não informado"}" e categoria "${categoria || "não informada"}"`],
  };
}
