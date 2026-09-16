import type { Classificacao } from "./classificador";
import type { ConfigEditorial } from "./config";
import { impressaoDoAcontecimento } from "./fingerprint";
import { entidadesDaClassificacao } from "./classificador";
import type { Vetor } from "./embeddings";
import { cosseno } from "./embeddings";

/**
 * Nota da pauta.
 *
 * O ranker anterior somava ocorrência de palavra: "model", "gpt", "claude",
 * "gemini", "benchmark", "open source". Numa publicação de imigração nenhuma
 * pauta contém essas palavras, então todas empatavam no mesmo piso e a
 * seleção virava, na prática, a ordem em que o feed devolveu. Trocar a lista
 * de palavras por outra lista repetiria o problema na próxima virada de
 * vertical.
 *
 * As quatro dimensões aqui não dependem do assunto:
 *
 *   relevância   o quanto o fato muda o plano do leitor, dita pelo classificador
 *   ineditismo   distância do que já publicamos
 *   credibilidade quem contou, e se mais de um contou
 *   frescor      quando aconteceu
 *
 * Trocar a vertical não pede tocar neste arquivo. Pede trocar o briefing do
 * classificador, que é onde o assunto mora.
 */

export type EntradaDePontuacao = {
  classificacao: Classificacao;
  /** 1 = fonte de primeira linha. */
  prioridadeDaFonte: 1 | 2;
  quantasFontesConfirmam: number;
  publicadoEm: string;
  /** Maior semelhança encontrada contra o histórico, de 0 a 1. */
  semelhancaComHistorico: number;
  /** A fonte trouxe corpo, ou só a manchete? */
  temCorpoFactual: boolean;
};

export type Pontuacao = {
  total: number;
  partes: {
    relevancia: number;
    ineditismo: number;
    credibilidade: number;
    frescor: number;
    /** Desconto por pauta que chegou só com a manchete. Zero ou negativo. */
    corpo: number;
  };
  explicacao: string;
};

const PESO = { relevancia: 40, ineditismo: 20, credibilidade: 20, frescor: 20 };

export function pontuarPauta(entrada: EntradaDePontuacao): Pontuacao {
  const relevancia = (Math.max(0, Math.min(10, entrada.classificacao.relevancia)) / 10) * PESO.relevancia;

  // Semelhança alta que ainda não bateu o limiar de rejeição não é motivo para
  // descartar, mas é motivo para ficar atrás de uma pauta realmente inédita.
  const distancia = 1 - Math.max(0, Math.min(1, entrada.semelhancaComHistorico));
  const ineditismo = distancia * PESO.ineditismo;

  let credibilidade = entrada.prioridadeDaFonte === 1 ? 14 : 9;
  // Dois veículos contando o mesmo fato é o sinal mais barato de que o fato
  // existe. Vale mais do que a reputação de um só.
  if (entrada.quantasFontesConfirmam >= 2) credibilidade += 6;
  else if (entrada.quantasFontesConfirmam === 1) credibilidade += 3;
  credibilidade = Math.min(PESO.credibilidade, credibilidade);

  /*
   * Frescor.
   *
   * A janela de coleta virou 72h para fonte que não é agregador, e janela
   * maior não pode virar preferência: ela existe para que a fonte que publica
   * a cada três dias apareça, não para que o que ela publicou anteontem ganhe
   * do que saiu hoje de manhã. A curva resolve isso sozinha, tirando 15 dos 20
   * pontos de uma pauta de 72h.
   */
  const horas = idadeEmHoras(entrada.publicadoEm);
  let frescor = PESO.frescor;
  if (horas > 6) frescor = 18;
  if (horas > 12) frescor = 15;
  if (horas > 24) frescor = 11;
  if (horas > 36) frescor = 8;
  if (horas > 48) frescor = 5;
  if (horas > 72) frescor = 2;
  if (horas > 96) frescor = 0;

  /*
   * Pauta sem corpo perde.
   *
   * O agregador entrega manchete e nada mais em boa parte dos itens. A pauta
   * até pode ser boa, mas escrever a partir só do título produz o parágrafo
   * que a edição de hoje mostrou três vezes: "a fonte não informa qual é a
   * regra, quem é afetado ou quando começa". Entre duas pautas parecidas,
   * ganha a que veio com texto.
   *
   * É desconto, não veto: num dia magro, manchete relevante ainda é melhor do
   * que edição vazia.
   */
  const descontoSemCorpo = entrada.temCorpoFactual ? 0 : 12;

  const partes = {
    relevancia: Math.round(relevancia),
    ineditismo: Math.round(ineditismo),
    credibilidade: Math.round(credibilidade),
    frescor,
    corpo: -descontoSemCorpo,
  };
  const total = Math.max(
    0,
    partes.relevancia + partes.ineditismo + partes.credibilidade + partes.frescor - descontoSemCorpo,
  );

  return {
    total,
    partes,
    explicacao:
      `${total} = rel ${partes.relevancia} + ined ${partes.ineditismo} + ` +
      `cred ${partes.credibilidade} + fresc ${partes.frescor}` +
      (descontoSemCorpo > 0 ? ` - ${descontoSemCorpo} (só manchete)` : ""),
  };
}

function idadeEmHoras(publicadoEm: string): number {
  const t = new Date(publicadoEm).getTime();
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / (1000 * 60 * 60);
}

export type PautaOrdenavel<T> = {
  item: T;
  pontuacao: Pontuacao;
  classificacao: Classificacao;
  dominio: string;
  /**
   * O vetor da pauta, quando a camada semântica estiver ligada.
   *
   * Opcional porque a composição precisa continuar funcionando sem ele: dia em
   * que a API de embedding cai, a edição sai com os tetos de sempre e uma
   * linha no log dizendo que o agrupamento ficou de fora. O que ela não pode é
   * depender do vetor para existir.
   */
  vetor?: Vetor | null;
};

/** Uma pauta que saiu porque outra, melhor, já contava o mesmo fato. */
export type Absorvida<T> = {
  descartada: PautaOrdenavel<T>;
  representante: PautaOrdenavel<T>;
  /** Quem reconheceu o mesmo fato. */
  camada: "impressao" | "vetor";
  /** Cosseno, quando quem reconheceu foi o vetor. Um, quando foi a impressão. */
  score: number;
};

export type ComposicaoDaEdicao<T> = {
  escolhidas: Array<PautaOrdenavel<T>>;
  /**
   * O que foi agrupado, com o par e o número.
   *
   * Existe para ser lido depois. Sem o score gravado, calibrar o limiar vira
   * palpite, que é exatamente o erro que a versão por igualdade exata cometeu:
   * ela não agrupava nada e não deixava rastro de que não agrupava.
   */
  absorvidas: Array<Absorvida<T>>;
};

/**
 * Compõe a edição: ordena e limita repetição de ator, de veículo e de
 * ACONTECIMENTO.
 *
 * Sem isso, um dia movimentado no USCIS vira uma edição inteira sobre o USCIS.
 *
 * O acontecimento entrou depois, e o comentário anterior dizia que assunto
 * parecido "já foi tratado pela camada de repetição". Estava errado: aquela
 * camada compara com os ÚLTIMOS 30 DIAS, não com as outras pautas da mesma
 * edição. Duas leituras do mesmo fato, publicadas por veículos diferentes e com
 * atores diferentes na primeira posição, passavam pelos dois tetos e chegavam
 * juntas à edição.
 *
 * ## Por que a impressão exata não bastou
 *
 * Em 16/09/2026 o teto por acontecimento entrou, e na mesma noite a edição
 * publicada saiu com três das quatro pautas sobre o mesmo adiamento de regra.
 * A impressão é montada por igualdade exata de ator, lugar e termo, e quatro
 * escritórios de advocacia descrevendo a mesma liminar escrevem "court",
 * "district court", "DHS" e "duration of status rule" em combinações que nunca
 * coincidem. A chave não colidia, então nada agrupava.
 *
 * O sinal que enxerga isso é o vetor, e ele já existia: `news_candidates.embedding`
 * é calculado para toda pauta aprovada, e a camada de repetição histórica já o
 * usa. Faltava usar a mesma medida ENTRE as pautas do dia. Medido naquele
 * pool: o mesmo fato por três veículos deu 0.892, 0.808 e 0.805; o primeiro
 * par de fatos distintos, 0.563.
 *
 * As duas camadas continuam valendo, nesta ordem: a impressão é de graça e
 * pega o caso fácil; o vetor pega o caso que custou a edição.
 */
export function comporEdicao<T>(
  pautas: Array<PautaOrdenavel<T>>,
  config: ConfigEditorial,
  maximoPorAtor = 2,
  maximoPorDominio = 2
): ComposicaoDaEdicao<T> {
  const ordenadas = [...pautas].sort((a, b) => b.pontuacao.total - a.pontuacao.total);

  const porAtor: Record<string, number> = {};
  const porDominio: Record<string, number> = {};
  const porAcontecimento = new Map<string, PautaOrdenavel<T>>();
  let doBrasil = 0;
  const escolhidas: Array<PautaOrdenavel<T>> = [];
  const absorvidas: Array<Absorvida<T>> = [];

  for (const p of ordenadas) {
    if (escolhidas.length >= config.maximoDePautas) break;

    const ator = (p.classificacao.atores[0] || "").toLowerCase();
    const dominio = p.dominio.toLowerCase();

    /*
     * Um acontecimento, uma pauta. A primeira é a de maior nota, porque a lista
     * já vem ordenada: quando duas cobrem o mesmo fato, fica a melhor.
     *
     * Impressão vazia não agrupa nada. Uma pauta sem ator, lugar nem
     * acontecimento classificado produz string vazia, e tratar isso como chave
     * faria a primeira pauta sem classificação bloquear todas as outras na
     * mesma situação.
     */
    const acontecimento = impressaoDoAcontecimento(entidadesDaClassificacao(p.classificacao));
    const porChave = acontecimento ? porAcontecimento.get(acontecimento) : undefined;
    if (porChave) {
      absorvidas.push({ descartada: p, representante: porChave, camada: "impressao", score: 1 });
      continue;
    }

    /*
     * A mesma pergunta, feita ao vetor.
     *
     * Compara só contra QUEM JÁ ENTROU, e não contra tudo que passou por aqui.
     * Uma pauta cortada pelo teto de veículo não está na edição, e não há por
     * que a semelhança com ela impedir uma terceira de entrar: o que se evita é
     * a edição dizer duas vezes a mesma coisa, não a existência do assunto.
     */
    const parecida = maisParecidaEntreAsEscolhidas(p, escolhidas, config.limiarDeAgrupamento);
    if (parecida) {
      absorvidas.push({
        descartada: p,
        representante: parecida.pauta,
        camada: "vetor",
        score: parecida.score,
      });
      continue;
    }

    if (ator && (porAtor[ator] ?? 0) >= maximoPorAtor) continue;
    if (dominio && (porDominio[dominio] ?? 0) >= maximoPorDominio) continue;

    // Num dia de crise no STF, as pautas brasileiras dominam a nota e a
    // edição inteira sai falando do Brasil. O leitor abriu o e-mail para ler
    // sobre os EUA: o Brasil é o contraste, não o assunto.
    if (p.classificacao.pais === "Brasil") {
      if (doBrasil >= config.maximoDePautasBrasil) continue;
      doBrasil += 1;
    }

    if (ator) porAtor[ator] = (porAtor[ator] ?? 0) + 1;
    if (dominio) porDominio[dominio] = (porDominio[dominio] ?? 0) + 1;
    if (acontecimento) porAcontecimento.set(acontecimento, p);
    escolhidas.push(p);
  }

  return { escolhidas, absorvidas };
}

/**
 * A escolhida mais próxima desta pauta, se passar do limiar.
 *
 * Devolve a de MAIOR semelhança, e não a primeira que passa, porque o número
 * que vai para o log é o que se usa depois para calibrar: saber que a pauta
 * bateu 0.89 com a manchete certa vale mais do que saber que bateu 0.71 com a
 * primeira que apareceu.
 *
 * Limiar zero ou negativo desliga a camada, e é assim que se testa a edição
 * sem ela sem precisar tirar os vetores do caminho.
 */
function maisParecidaEntreAsEscolhidas<T>(
  pauta: PautaOrdenavel<T>,
  escolhidas: Array<PautaOrdenavel<T>>,
  limiar: number
): { pauta: PautaOrdenavel<T>; score: number } | null {
  if (!(limiar > 0)) return null;
  const vetor = pauta.vetor;
  if (!vetor || vetor.length === 0) return null;

  let melhor: { pauta: PautaOrdenavel<T>; score: number } | null = null;
  for (const e of escolhidas) {
    if (!e.vetor || e.vetor.length === 0) continue;
    const score = cosseno(vetor, e.vetor);
    if (score >= limiar && (melhor === null || score > melhor.score)) {
      melhor = { pauta: e, score };
    }
  }
  return melhor;
}

/**
 * A edição fecha com o que tem?
 *
 * O pipeline exigia 4 pautas e quebrava com 3. Exigir número fixo depois de um
 * filtro editorial é garantir que, num dia de pauta ruim, ou a edição não sai
 * ou o filtro é ignorado. O mínimo passa a ser 2, e a edição sai menor.
 */
export function edicaoViavel(
  quantas: number,
  config: ConfigEditorial
): { viavel: boolean; motivo: string } {
  if (quantas < config.minimoDePautas) {
    return {
      viavel: false,
      motivo: `${quantas} pauta(s) aprovada(s), mínimo ${config.minimoDePautas}`,
    };
  }
  return { viavel: true, motivo: `${quantas} pauta(s), dentro de ${config.minimoDePautas} a ${config.maximoDePautas}` };
}
