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

/**
 * Códigos de visto, formulário e programa não são coisa que se fotografe.
 *
 * "EB-2 NIW", "I-485" e "PERM" nomeiam um procedimento, não um prédio, uma
 * pessoa ou um lugar. Buscados no Wikidata, eles encontram homônimo: em
 * 17/09/2026 "PERM" devolveu a cidade de Perm, na Rússia, e um post sobre o
 * Departamento do Trabalho americano foi para a fila com a foto de uma
 * universidade russa.
 *
 * Testado no catálogo inteiro, o problema não era o ramo de sigla do
 * `ehNomeProprio`: os 27 códigos do catálogo começam com maiúscula, então TODOS
 * passavam pelo primeiro ramo. Mexer só no `/^[A-Z]{2,6}$/` não consertaria um
 * único caso. O que resolve é reconhecer o formato do código.
 *
 * O que o Wikidata devolve hoje para os mais curtos, conferido em 17/09/2026:
 *
 *     TN     Tunísia, Tennessee, uma cepa de bactéria da hanseníase
 *     EAD    uma divisão da Nintendo, o fotógrafo Eadweard Muybridge
 *     EB     estrela binária eclipsante, Universidade de Tübingen
 *     PERM   Perm Krai, cidade de Perm, submarino nuclear russo
 *
 * A sigla de ÓRGÃO continua passando, e é de propósito: ICE, USCIS, DOL e FBI
 * são instituições com sede, fachada e acervo de foto. A lista abaixo é só de
 * programa e formulário, que é o que não tem o que mostrar.
 *
 * Sem entidade, a pauta cai no banco conceitual e é ilustrada pelo TEMA, que é
 * para isso que ele existe.
 */
const CODIGOS_SEM_DIGITO = new Set([
  "perm",
  "ead",
  "eb",
  "tn",
  "opt",
  "cpt",
  "niw",
  "rfe",
  "noid",
  "aos",
  "ead/ap",
]);

export function ehCodigoDeProgramaOuFormulario(termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (t.length === 0) return false;

  /*
   * Comparação de dois códigos ainda é código: o catálogo guarda coisas como
   * "EB-1A x EB-2 NIW" e "F-1 OPT x H-1B". Basta uma das partes ser código
   * para a busca de entidade não fazer sentido.
   */
  const partes = t.split(/\s+x\s+|\//).map((x) => x.trim()).filter(Boolean);
  if (partes.length > 1) return partes.some((parte) => ehCodigoDeProgramaOuFormulario(parte));

  if (CODIGOS_SEM_DIGITO.has(t)) return true;

  /*
   * Letra e número colados são o formato de todo código de visto e formulário
   * americano: I-485, H-1B, EB-2, O-1A, N-400, F-1, J-1, L-1, E-2, IR5.
   * O sufixo opcional cobre "EB-2 NIW" e "F-1 OPT".
   */
  return /^[a-z]{1,3}[- ]?\d[a-z0-9-]*( [a-z]{2,4})?$/.test(t);
}

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
    .filter(
      (a) =>
        a.length > 2 &&
        ehNomeProprio(a) &&
        !ehCodigoDeProgramaOuFormulario(a) &&
        !NAO_SAO_ENTIDADE.has(normalizarEntidade(a)),
    );

  const lugares = classificacao.lugares
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && ehNomeProprio(l) && !ehCodigoDeProgramaOuFormulario(l));

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
