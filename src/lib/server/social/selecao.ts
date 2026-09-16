import type { PautaAvaliada } from "../editorial/guarda";
import type { Classificacao } from "../editorial/classificador";
import { dominioDe } from "../editorial/url-canonica";
import { impressaoDoAcontecimento } from "../editorial/fingerprint";
import { cosseno } from "../editorial/embeddings";
import { entidadesDaClassificacao } from "../editorial/classificador";

/**
 * A composição do Instagram, que não é a da newsletter.
 *
 * A guarda editorial entrega duas coisas diferentes e o nome delas importa.
 * `aprovadas` é o pool: tudo que passou pelos critérios duros, negatividade
 * dos EUA, relevância, fonte resolvida, enriquecimento, repetição. É a matéria
 * disponível do dia. `selecionadas` é a composição da NEWSLETTER: as quatro
 * melhores, com no máximo duas por domínio, duas por ator e uma do Brasil.
 *
 * Esses tetos são bons para um e-mail com quatro pautas e péssimos como teto
 * do feed. Alimentar o Instagram com a saída já cortada pela newsletter é
 * pedir dez posts e receber dois, que foi exatamente o que a medição mostrou:
 * num dia com oito pautas aprovadas, seis desapareceram no corte de
 * composição do e-mail, sem sequer aparecer na lista de recusadas.
 *
 * Este módulo parte do pool e aplica regras próprias. Elas não são mais
 * frouxas: são de outra natureza. O e-mail evita repetir veículo dentro de uma
 * peça só; o feed evita ser monotemático ao longo do dia.
 */

export type ConfigSocial = {
  alvoPorDia: number;
  maximoPorDia: number;
  /** Sem piso: se o dia sustenta três pautas, saem três posts. */
  minimoPorDia: number;
  maximoPorEixo: number;
  maximoDeImigracao: number;
  maximoDePoliticaBrasileira: number;
  maximoPorPrograma: number;
  maximoPorOrganizacao: number;
  maximoPorEvento: number;
  /**
   * Acima disto, duas pautas do mesmo dia contam o mesmo acontecimento.
   *
   * Lê a MESMA variável de ambiente da newsletter, e isso é de propósito: o
   * número foi medido uma vez, sobre os pares de um dia real, e dois canais
   * com dois limiares para a mesma pergunta dariam duas respostas para o mesmo
   * par de pautas.
   */
  limiarDeAgrupamento: number;
  maximoPorAtor: number;
  maximoPorDominio: number;
  maximoPorTopico: number;
};

function numeroDoAmbiente(nome: string, padrao: number, env: Record<string, string | undefined>): number {
  const bruto = env[nome];
  if (!bruto) return padrao;
  const n = Number(bruto);
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}

export function carregarConfigSocial(
  env: Record<string, string | undefined> = process.env,
): ConfigSocial {
  return {
    alvoPorDia: numeroDoAmbiente("SOCIAL_POSTS_TARGET_PER_DAY", 10, env),
    maximoPorDia: numeroDoAmbiente("SOCIAL_POSTS_MAX_PER_DAY", 10, env),
    /*
     * Zero de propósito.
     *
     * Um mínimo obrigatório só tem duas formas de ser cumprido num dia magro:
     * baixar a régua ou publicar duas vezes o mesmo assunto. As duas são
     * piores que publicar menos.
     */
    minimoPorDia: numeroDoAmbiente("SOCIAL_POSTS_MIN_PER_DAY", 0, env),
    maximoPorEixo: numeroDoAmbiente("SOCIAL_MAX_POR_EIXO", 3, env),
    maximoDeImigracao: numeroDoAmbiente("SOCIAL_MAX_IMIGRACAO", 3, env),
    maximoDePoliticaBrasileira: numeroDoAmbiente("SOCIAL_MAX_POLITICA_BR", 2, env),
    maximoPorPrograma: numeroDoAmbiente("SOCIAL_MAX_POR_PROGRAMA", 2, env),
    maximoPorOrganizacao: numeroDoAmbiente("SOCIAL_MAX_POR_ORGANIZACAO", 2, env),
    maximoPorEvento: numeroDoAmbiente("SOCIAL_MAX_POR_EVENTO", 1, env),
    limiarDeAgrupamento: numeroDoAmbiente("EDITORIAL_LIMIAR_AGRUPAMENTO", 0.7, env),
    maximoPorAtor: numeroDoAmbiente("SOCIAL_MAX_POR_ATOR", 2, env),
    maximoPorDominio: numeroDoAmbiente("SOCIAL_MAX_POR_DOMINIO", 3, env),
    maximoPorTopico: numeroDoAmbiente("SOCIAL_MAX_POR_TOPICO", 2, env),
  };
}

/**
 * A escolhida mais próxima desta pauta, se passar do limiar.
 *
 * Sem vetor dos dois lados não há comparação, e aí só vale a impressão do
 * acontecimento. Isso acontece no dia em que a API de embedding cai, e o feed
 * sai com os tetos de sempre em vez de não sair.
 */
function maisParecidaEntreAsEscolhidas(
  pauta: PautaAvaliada,
  escolhidas: Array<{ pauta: PautaAvaliada }>,
  limiar: number,
): { titulo: string; score: number } | null {
  if (!(limiar > 0)) return null;
  const vetor = pauta.vetor;
  if (!vetor || vetor.length === 0) return null;

  let melhor: { titulo: string; score: number } | null = null;
  for (const e of escolhidas) {
    const outro = e.pauta.vetor;
    if (!outro || outro.length === 0) continue;
    const score = cosseno(vetor, outro);
    if (score >= limiar && (melhor === null || score > melhor.score)) {
      melhor = { titulo: e.pauta.grupo.primary.title, score };
    }
  }
  return melhor;
}

function normalizar(texto: string): string {
  return ` ${(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/**
 * O programa migratório de que a pauta trata, quando há um.
 *
 * Serve ao teto por programa: três notícias diferentes sobre EB-2 NIW são três
 * pautas distintas para a camada de repetição e um assunto só para quem rola o
 * feed.
 */
const PROGRAMAS: Array<{ padrao: RegExp; nome: string }> = [
  { padrao: / niw | eb 2 niw | eb2niw /, nome: "eb2-niw" },
  { padrao: / eb 1 | eb1 | eb 1a /, nome: "eb1" },
  { padrao: / eb 2 | eb2 /, nome: "eb2" },
  { padrao: / eb 3 | eb3 /, nome: "eb3" },
  { padrao: / eb 5 | eb5 /, nome: "eb5" },
  { padrao: / h 1b | h1b /, nome: "h1b" },
  { padrao: / o 1 | o1 /, nome: "o1" },
  { padrao: / l 1 | l1a | l1b /, nome: "l1" },
  { padrao: / f 1 | visto de estudante /, nome: "f1" },
  { padrao: / green card | greencard | residencia permanente /, nome: "green-card" },
  { padrao: / cidadania | naturalizac /, nome: "cidadania" },
  { padrao: / asilo | refugio /, nome: "asilo" },
  { padrao: / visa bulletin | priority date /, nome: "visa-bulletin" },
];

export function programaDaPauta(titulo: string, resumo: string): string | null {
  const texto = normalizar(`${titulo} ${resumo}`);
  for (const p of PROGRAMAS) {
    if (p.padrao.test(texto)) return p.nome;
  }
  return null;
}

function chave(valor: string): string {
  return normalizar(valor).trim().replace(/ /g, "-");
}

/**
 * Identidade de assunto, mais grossa que a de acontecimento.
 *
 * `event_fingerprint` separa dois fatos distintos sobre o mesmo tema, que é o
 * que a antirrepetição precisa. Aqui a pergunta é outra: quantos posts do dia
 * o leitor vai ler como "de novo isso". Programa migratório vem primeiro
 * porque é o agrupamento que ele reconhece; depois o órgão; e no fim o eixo,
 * que sempre existe.
 */
export function topicoDaPauta(pauta: PautaAvaliada): string {
  const titulo = pauta.grupo.primary.title;
  const resumo = pauta.enriquecimento?.texto ?? pauta.grupo.primary.description ?? "";

  const programa = programaDaPauta(titulo, resumo);
  if (programa) return `programa:${programa}`;

  const org = pauta.classificacao.atores[0];
  if (org) return `org:${chave(org)}`;

  return `eixo:${pauta.classificacao.eixo}`;
}

/** Pauta de política institucional brasileira, para o teto próprio dela. */
function ehPoliticaBrasileira(c: Classificacao, titulo: string): boolean {
  if (c.pais !== "Brasil") return false;
  const texto = normalizar(`${titulo} ${c.atores.join(" ")} ${c.acontecimento.join(" ")}`);
  return (
    c.eixo === "brasil" ||
    c.eixo === "politica" ||
    / stf | supremo | ministro | policia federal | congresso | senado | camara | governo | presidente /.test(texto)
  );
}

export type MotivoDeCorte =
  | "IMMIGRATION_TOPIC_OVERLOAD"
  | "TOPIC_OVERLOAD"
  | "EIXO_OVERLOAD"
  | "POLITICA_BR_OVERLOAD"
  | "SAME_VISA_OVERLOAD"
  | "SAME_ENTITY_OVERLOAD"
  | "DUPLICATE_EVENT"
  | "SAME_ORG_OVERLOAD"
  | "DOMINIO_OVERLOAD"
  | "ALEM_DO_MAXIMO";

export type PautaSocial = {
  pauta: PautaAvaliada;
  topico: string;
  programa: string | null;
  dominio: string;
  nota: number;
};

export type CortadaDoSocial = {
  titulo: string;
  motivo: MotivoDeCorte;
  detalhe: string;
};

/**
 * Sem a camada persistida, o social não publica.
 *
 * A newsletter pode seguir degradada: ela sai uma vez por dia, com duas a
 * quatro pautas, e um dia sem cache custa tokens. O social não tem esse luxo.
 * Sem persistência ele perde a antirrepetição confiável, perde o reuso da
 * verificação e volta a depender de uma classificação que muda de decisão em
 * 24% das vezes, publicando dez vezes por dia. O mesmo fato pode sair de manhã
 * aprovado e de tarde recusado, ou pior, sair duas vezes.
 *
 * Dry-run continua rodando, porque diagnóstico não publica nada.
 */
export const SOCIAL_PERSISTENCE_UNAVAILABLE = "SOCIAL_PERSISTENCE_UNAVAILABLE";

export type ComposicaoSocial = {
  escolhidas: PautaSocial[];
  cortadas: CortadaDoSocial[];
  /** Quanta variedade o dia tem, para o relatório e para o teste de diversidade. */
  diversidade: {
    eixos: Record<string, number>;
    topicos: Record<string, number>;
    dominios: Record<string, number>;
    paises: Record<string, number>;
    imigracao: number;
    politicaBrasileira: number;
  };
  linhasDeLog: string[];
  /** Quando presente, o ciclo não pode publicar automaticamente. */
  bloqueio: string | null;
};

/**
 * Escolhe os posts do dia a partir do pool aprovado.
 *
 * Guloso por nota, com tetos. Guloso porque a nota já carrega relevância,
 * ineditismo e credibilidade, e inverter isso por variedade produziria um feed
 * variado e sem importância. Os tetos é que garantem a variedade, e cada corte
 * fica registrado com o motivo: um post que não saiu porque o dia já tinha
 * três de imigração é informação, não descarte silencioso.
 *
 * A quantidade final é consequência, nunca meta: se o pool sustenta três,
 * saem três.
 */
export type ContextoDaComposicao = {
  /** A camada de candidatas falhou nesta execução? */
  persistenciaDegradada?: boolean;
  /** Dry-run diagnostica sem publicar, então não é bloqueado. */
  paraPublicar?: boolean;
};

export function comporFeedSocial(
  pool: PautaAvaliada[],
  config: ConfigSocial,
  contexto: ContextoDaComposicao = {},
): ComposicaoSocial {
  const ordenadas = [...pool].sort((a, b) => b.pontuacao.total - a.pontuacao.total);

  const escolhidas: PautaSocial[] = [];
  const cortadas: CortadaDoSocial[] = [];

  const porEixo: Record<string, number> = {};
  const porTopico: Record<string, number> = {};
  const porPrograma: Record<string, number> = {};
  const porOrganizacao: Record<string, number> = {};
  const porEvento: Record<string, number> = {};
  const porAtor: Record<string, number> = {};
  const porDominio: Record<string, number> = {};
  const porPais: Record<string, number> = {};
  let imigracao = 0;
  let politicaBr = 0;

  const teto = Math.min(config.alvoPorDia, config.maximoPorDia);

  for (const p of ordenadas) {
    const titulo = p.grupo.primary.title;

    if (escolhidas.length >= teto) {
      cortadas.push({ titulo, motivo: "ALEM_DO_MAXIMO", detalhe: `o dia já tem ${teto} posts` });
      continue;
    }

    const c = p.classificacao;
    const topico = topicoDaPauta(p);
    const programa = programaDaPauta(titulo, p.enriquecimento?.texto ?? "");
    const dominio = dominioDe(p.grupo.primary.url);
    const ator = (c.atores[0] || "").toLowerCase();
    const organizacao = (c.atores.find((a) => a.length > 2) || "").toLowerCase();
    /*
     * A identidade do acontecimento vem do fingerprint quando existe.
     *
     * `storyId` separa duas matérias sobre o MESMO fato quando elas vieram de
     * URLs diferentes, e para o feed elas são um post só. O fingerprint junta
     * o que o leitor lê como repetição.
     */
    const evento = impressaoDoAcontecimento(entidadesDaClassificacao(c)) || p.storyId;

    const recusar = (motivo: MotivoDeCorte, detalhe: string) => {
      cortadas.push({ titulo, motivo, detalhe });
    };

    if ((porTopico[topico] ?? 0) >= config.maximoPorTopico) {
      recusar("TOPIC_OVERLOAD", `${topico} já tem ${config.maximoPorTopico}`);
      continue;
    }
    if ((porEixo[c.eixo] ?? 0) >= config.maximoPorEixo) {
      recusar("EIXO_OVERLOAD", `eixo ${c.eixo} já tem ${config.maximoPorEixo}`);
      continue;
    }
    if (c.imigracao && imigracao >= config.maximoDeImigracao) {
      recusar("IMMIGRATION_TOPIC_OVERLOAD", `o dia já tem ${config.maximoDeImigracao} pautas migratórias`);
      continue;
    }
    if (ehPoliticaBrasileira(c, titulo) && politicaBr >= config.maximoDePoliticaBrasileira) {
      recusar("POLITICA_BR_OVERLOAD", `o dia já tem ${config.maximoDePoliticaBrasileira} de política brasileira`);
      continue;
    }
    if (programa && (porPrograma[programa] ?? 0) >= config.maximoPorPrograma) {
      recusar("SAME_VISA_OVERLOAD", `${programa} já tem ${config.maximoPorPrograma}`);
      continue;
    }
    if (organizacao && (porOrganizacao[organizacao] ?? 0) >= config.maximoPorOrganizacao) {
      recusar("SAME_ORG_OVERLOAD", `${organizacao} já tem ${config.maximoPorOrganizacao}`);
      continue;
    }
    if ((porEvento[evento] ?? 0) >= config.maximoPorEvento) {
      recusar("DUPLICATE_EVENT", "o mesmo acontecimento já entrou hoje");
      continue;
    }

    /*
     * A mesma pergunta, feita ao vetor.
     *
     * A impressão acima compara igualdade EXATA de ator, lugar e termo, e dois
     * escritórios cobrindo a mesma liminar escrevem palavras diferentes: o
     * feed saía com dois posts sobre a mesma decisão, com manchetes quase
     * iguais. É o mesmo defeito que a composição da newsletter teve, e a
     * correção é a mesma medida, com o mesmo número.
     */
    const parecida = maisParecidaEntreAsEscolhidas(p, escolhidas, config.limiarDeAgrupamento);
    if (parecida) {
      recusar(
        "DUPLICATE_EVENT",
        `semelhança ${parecida.score.toFixed(3)} com "${parecida.titulo.slice(0, 50)}", que já entrou hoje`,
      );
      continue;
    }
    if (ator && (porAtor[ator] ?? 0) >= config.maximoPorAtor) {
      recusar("SAME_ENTITY_OVERLOAD", `${ator} já aparece ${config.maximoPorAtor} vezes`);
      continue;
    }
    if (dominio && (porDominio[dominio] ?? 0) >= config.maximoPorDominio) {
      recusar("DOMINIO_OVERLOAD", `${dominio} já tem ${config.maximoPorDominio}`);
      continue;
    }

    porTopico[topico] = (porTopico[topico] ?? 0) + 1;
    porEixo[c.eixo] = (porEixo[c.eixo] ?? 0) + 1;
    if (programa) porPrograma[programa] = (porPrograma[programa] ?? 0) + 1;
    if (organizacao) porOrganizacao[organizacao] = (porOrganizacao[organizacao] ?? 0) + 1;
    porEvento[evento] = (porEvento[evento] ?? 0) + 1;
    if (ator) porAtor[ator] = (porAtor[ator] ?? 0) + 1;
    if (dominio) porDominio[dominio] = (porDominio[dominio] ?? 0) + 1;
    porPais[c.pais] = (porPais[c.pais] ?? 0) + 1;
    if (c.imigracao) imigracao += 1;
    if (ehPoliticaBrasileira(c, titulo)) politicaBr += 1;

    escolhidas.push({ pauta: p, topico, programa, dominio, nota: p.pontuacao.total });
  }

  const linhas = [
    `[SOCIAL] ${escolhidas.length} post(s) de um pool de ${pool.length} aprovada(s), teto ${teto}`,
    `[SOCIAL] eixos: ${Object.entries(porEixo).map(([k, v]) => `${k} ${v}`).join(", ") || "nenhum"}`,
    `[SOCIAL] tópicos: ${Object.entries(porTopico).map(([k, v]) => `${k} ${v}`).join(", ") || "nenhum"}`,
    `[SOCIAL] imigração ${imigracao}, política BR ${politicaBr}`,
  ];
  for (const c of cortadas.slice(0, 20)) {
    linhas.push(`[SOCIAL] fora: ${c.motivo} :: ${c.detalhe} :: ${c.titulo.slice(0, 60)}`);
  }

  /*
   * O bloqueio é decidido no fim, e não no começo, de propósito: mesmo sem
   * poder publicar, o relatório do dia continua mostrando o que teria saído.
   */
  const bloqueio =
    contexto.persistenciaDegradada && contexto.paraPublicar !== false
      ? SOCIAL_PERSISTENCE_UNAVAILABLE
      : null;

  if (bloqueio) {
    linhas.push(
      `[SOCIAL] ${bloqueio}: a camada de candidatas falhou, e sem ela o feed perde antirrepetição ` +
        `e reuso de verificação. ${escolhidas.length} post(s) calculado(s) e nenhum liberado.`,
    );
  }

  return {
    escolhidas,
    cortadas,
    bloqueio,
    diversidade: {
      eixos: porEixo,
      topicos: porTopico,
      dominios: porDominio,
      paises: porPais,
      imigracao,
      politicaBrasileira: politicaBr,
    },
    linhasDeLog: linhas,
  };
}

/**
 * O feed do dia é monotemático?
 *
 * Serve ao teste de diversidade do dry-run. Um dia com três posts e um tópico
 * só não é falha: é um dia magro. Um dia com dez posts e dois tópicos é.
 */
export function feedMonotematico(composicao: ComposicaoSocial): { monotematico: boolean; motivo: string } {
  const n = composicao.escolhidas.length;
  if (n <= 2) return { monotematico: false, motivo: `${n} post(s), variedade não se aplica` };

  const topicos = Object.keys(composicao.diversidade.topicos).length;
  const eixos = Object.keys(composicao.diversidade.eixos).length;
  const minimoDeTopicos = Math.max(2, Math.ceil(n / 3));

  if (topicos < minimoDeTopicos) {
    return {
      monotematico: true,
      motivo: `${n} posts em apenas ${topicos} tópico(s); o mínimo para este volume é ${minimoDeTopicos}`,
    };
  }

  if (eixos < 2) {
    return { monotematico: true, motivo: `${n} posts num eixo editorial só` };
  }

  return { monotematico: false, motivo: `${topicos} tópicos e ${eixos} eixos em ${n} posts` };
}
