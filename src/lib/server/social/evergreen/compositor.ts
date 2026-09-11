import type { ItemEvergreen } from "./tipos";

/**
 * O feed do dia, com a notícia primeiro.
 *
 * Esta camada é pequena de propósito e não toca na seleção do News. A
 * composição da notícia já rodou e já aplicou as réguas dela; o que acontece
 * aqui é aritmética de vagas mais a diversidade que só faz sentido olhando o
 * dia inteiro.
 *
 * A ordem não é negociável: notícia válida nunca perde vaga para conteúdo
 * permanente. Uma pauta de hoje tem prazo; um explicador de EB-2 estará igual
 * na semana que vem.
 *
 * E o teto nunca é meta. Com duas notícias válidas e nenhum evergreen elegível,
 * o dia sai com dois posts. Empurrar até dez seria trocar qualidade por
 * volume, que é a decisão que a capacidade medida de 0,9 post por dia tornou
 * tentadora e continua errada.
 */

export type VagasDoDia = {
  /** Quantos posts o dia aceita no total. `SOCIAL_POSTS_MAX_PER_DAY`. */
  maximo: number;
  /** Quantos a notícia já ocupou. */
  ocupadasPorNoticia: number;
  /** O que sobrou para o evergreen. Nunca negativo. */
  restantes: number;
};

export function calcularVagas(quantidadeDeNoticias: number, maximoPorDia: number): VagasDoDia {
  const ocupadas = Math.max(0, quantidadeDeNoticias);
  return {
    maximo: maximoPorDia,
    ocupadasPorNoticia: ocupadas,
    restantes: Math.max(0, maximoPorDia - ocupadas),
  };
}

/** O que o compositor devolve, na ordem em que o dia será agendado. */
export type FeedDoDia<TNoticia, TEvergreen = ItemEvergreen> = {
  noticias: TNoticia[];
  evergreen: TEvergreen[];
  vagas: VagasDoDia;
  /** Total de posts do dia. Nunca maior que o máximo. */
  total: number;
};

/**
 * Junta os dois canais numa lista só.
 *
 * O worker não recebe esta informação e não precisa dela: para ele, os dois
 * viram linhas de `social_posts` com o mesmo `generation_version`. A distinção
 * é editorial e vive em `origin_channel`, para o relatório do dia poder dizer
 * de onde cada post veio.
 *
 * Genérico nos DOIS lados porque o chamador de produção junta duas listas de
 * pauta, e não pauta com item de catálogo: a assinatura antiga só servia ao
 * teste, e foi assim que esta função ficou com teste e sem chamador enquanto a
 * composição de verdade acontecia por concatenação solta no pipeline.
 */
export function comporFeedDoDia<TNoticia, TEvergreen = ItemEvergreen>(
  noticias: TNoticia[],
  evergreenElegiveis: TEvergreen[],
  maximoPorDia: number,
): FeedDoDia<TNoticia, TEvergreen> {
  const vagas = calcularVagas(noticias.length, maximoPorDia);

  /*
   * A notícia é aparada no teto, não o evergreen.
   *
   * Se a composição do News devolvesse mais que o máximo do dia — hoje ela não
   * devolve, porque usa o mesmo número —, o excesso é dela, e cortar evergreen
   * para caber deixaria o dia acima do teto de qualquer forma.
   */
  const noticiasNoTeto = noticias.slice(0, vagas.maximo);
  const evergreen = evergreenElegiveis.slice(0, vagas.restantes);

  return {
    noticias: noticiasNoTeto,
    evergreen,
    vagas,
    total: noticiasNoTeto.length + evergreen.length,
  };
}
