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
    /** Título e resumo, que é o que decide lugar ambíguo. */
    contexto?: string;
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
   * Quem está no título é o assunto visual.
   *
   * A matéria "Dólar fecha a R$ 5,1300 e Ibovespa recua" cita o Datafolha no
   * corpo, como causa do movimento, e o Datafolha venceu a escolha por ser uma
   * instituição bem documentada. Ilustrar a cotação com uma foto do instituto
   * de pesquisa é escolher o coadjuvante.
   *
   * Estar no título não é um sinal fraco: é onde a redação disse do que a
   * matéria trata.
   */
  const tituloNormalizado = normalizarEntidade(classificacao.contexto?.split(".")[0] ?? "");
  const apareceNoTitulo = (e: EntidadeVisual): boolean => {
    if (!tituloNormalizado) return false;
    const nome = normalizarEntidade(e.nome);
    if (tituloNormalizado.includes(nome)) return true;
    // Nome longo do Wikidata ("Serviço de Imigração e Controle...") raramente
    // aparece inteiro: basta uma palavra significativa.
    return nome
      .split(" ")
      .filter((p) => p.length > 4)
      .some((p) => tituloNormalizado.includes(p));
  };

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
    const t = Number(apareceNoTitulo(b)) - Number(apareceNoTitulo(a));
    if (t !== 0) return t;
    const p = porPrioridade(a) - porPrioridade(b);
    if (p !== 0) return p;
    return Number(Boolean(b.imagemPrincipal)) - Number(Boolean(a.imagemPrincipal));
  })[0];

  return {
    entidade: {
      ...escolhida,
      origem: `${escolhida.origem}; escolhida entre ${resolvidas.length} candidata(s) por tipo ${escolhida.tipo}`,
      evidencias: [
        ...escolhida.evidencias,
        apareceNoTitulo(escolhida)
          ? "citada no título da matéria"
          : `ator ou lugar principal da matéria entre ${resolvidas.length} candidata(s)`,
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
