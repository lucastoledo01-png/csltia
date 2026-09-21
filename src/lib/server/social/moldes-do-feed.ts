/**
 * Quais moldes de arte o feed pode usar, por projeto.
 *
 * Os quatro desenhos existem no código e, até aqui, a esteira escolhia entre
 * eles sozinha: o eixo pedia recorte, o ritmo alternava a bolha, a ausência de
 * foto caía na capa tipográfica. Não havia como dizer "este molde não sai
 * mais", e a única forma de tirar um do ar era apagar código.
 *
 * O contrato é o mesmo das capacidades, e pelo mesmo motivo: molde NÃO
 * declarado está ligado. Um projeto que não declara nada se comporta byte a
 * byte como antes desta mudança, e o ciclo de amanhã não muda por isto existir.
 * Só o `false` explícito desliga.
 *
 * A forma no banco, dentro do `settings` que já é jsonb e já está em uso:
 *
 *   settings: { "moldes": { "recorte": false } }
 *
 * ## O que desligar significa de verdade
 *
 * Não é "esconder da tela". É o feed não produzir mais aquela peça. Com todos
 * desligados, o dia não tem post nenhum, e é assim que tem que ser: a tela
 * promete controle, e controle que não alcança a esteira é enfeite.
 *
 * Desligar `sem_foto` merece aviso à parte. Ele é a rede de todos os outros:
 * é a peça que sai quando nenhuma foto passa pelas barreiras do resolvedor, e
 * em 18/09/2026 foi a edição inteira. Desligado, o dia sem foto fica sem post.
 */

export const MOLDES_DO_FEED = ["jornal", "jornal_bolha", "recorte", "sem_foto"] as const;

export type MoldeDoFeed = (typeof MOLDES_DO_FEED)[number];

export type MoldesLigados = Record<MoldeDoFeed, boolean>;

export const TODOS_OS_MOLDES: MoldesLigados = {
  jornal: true,
  jornal_bolha: true,
  recorte: true,
  sem_foto: true,
};

/** O mínimo que este módulo precisa de um projeto, para não depender dele. */
export type ProjetoComMoldes = { settings?: Record<string, unknown> | null } | null | undefined;

export function moldesLigados(projeto: ProjetoComMoldes): MoldesLigados {
  const bruto = (projeto?.settings?.moldes ?? {}) as Record<string, unknown>;

  const saida = { ...TODOS_OS_MOLDES };
  for (const molde of MOLDES_DO_FEED) {
    /*
     * Só o `false` booleano desliga.
     *
     * A string "false", o zero e o nulo ficam de fora de propósito: este valor
     * vem de um jsonb que outras mãos podem editar, e aceitar formas
     * aproximadas de "não" faria um erro de digitação apagar um molde do feed
     * em silêncio. O lado seguro do erro aqui é continuar publicando.
     */
    if (bruto[molde] === false) saida[molde] = false;
  }

  return saida;
}

/** O que o painel declarou, sem os defaults, para a tela distinguir os dois. */
export function moldesDeclarados(projeto: ProjetoComMoldes): Partial<MoldesLigados> {
  const bruto = (projeto?.settings?.moldes ?? {}) as Record<string, unknown>;
  const saida: Partial<MoldesLigados> = {};
  for (const molde of MOLDES_DO_FEED) {
    if (typeof bruto[molde] === "boolean") saida[molde] = bruto[molde] as boolean;
  }
  return saida;
}
