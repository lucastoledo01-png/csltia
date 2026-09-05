/**
 * Limiares e janelas da camada editorial.
 *
 * Tudo aqui é calibrável sem deploy: os valores saem do ambiente e os padrões
 * são o ponto de partida acordado, não uma verdade. O motivo de existirem
 * juntos num arquivo é que eles se influenciam: subir o limiar semântico sem
 * olhar a janela histórica muda o comportamento de um jeito difícil de prever
 * quando cada número mora num canto do código.
 */

type Ambiente = Record<string, string | undefined>;

function numeroDoAmbiente(nome: string, padrao: number, env: Ambiente = process.env): number {
  const bruto = env[nome];
  if (!bruto) return padrao;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : padrao;
}

export type ConfigEditorial = {
  /** Acima disto, duas pautas são o mesmo assunto. */
  limiarSemantico: number;
  /** Acima disto, dois títulos são o mesmo título com outras palavras. */
  limiarDeTitulo: number;
  /** Dias de histórico consultados na verificação de repetição. */
  janelaDeDias: number;
  /** Dias em que a mesma foto não pode reaparecer. */
  janelaDeImagemEmDias: number;
  /** Mínimo e máximo de pautas por edição. */
  minimoDePautas: number;
  maximoDePautas: number;
  /** Palavras por matéria. */
  minimoDePalavras: number;
  maximoDePalavras: number;
  /** Abaixo disto a pauta não muda a vida de ninguém e não ocupa espaço. */
  relevanciaMinima: number;
};

export function carregarConfigEditorial(env: Ambiente = process.env): ConfigEditorial {
  return {
    // 0.82 é o ponto de partida combinado. O score de cada comparação vai para
    // o log justamente para permitir ajustar isto com dado, não com palpite.
    limiarSemantico: numeroDoAmbiente("EDITORIAL_LIMIAR_SEMANTICO", 0.82, env),
    limiarDeTitulo: numeroDoAmbiente("EDITORIAL_LIMIAR_TITULO", 0.72, env),
    janelaDeDias: numeroDoAmbiente("EDITORIAL_JANELA_DIAS", 30, env),
    janelaDeImagemEmDias: numeroDoAmbiente("EDITORIAL_JANELA_IMAGEM_DIAS", 30, env),
    minimoDePautas: numeroDoAmbiente("EDITORIAL_MIN_PAUTAS", 2, env),
    maximoDePautas: numeroDoAmbiente("EDITORIAL_MAX_PAUTAS", 4, env),
    minimoDePalavras: numeroDoAmbiente("EDITORIAL_MIN_PALAVRAS", 60, env),
    maximoDePalavras: numeroDoAmbiente("EDITORIAL_MAX_PALAVRAS", 100, env),
    relevanciaMinima: numeroDoAmbiente("EDITORIAL_RELEVANCIA_MINIMA", 4, env),
  };
}

/**
 * Códigos de decisão, para o log dizer o motivo em vez de o número.
 *
 * São string literal e não enum numérico de propósito: eles aparecem em log,
 * em relatório de dry-run e em coluna de banco, e um número exige consultar o
 * código para saber o que aconteceu.
 */
export const MOTIVOS = {
  APROVADO_OPORTUNIDADE_EUA: "APPROVED_US_OPPORTUNITY",
  APROVADO_DESAFIO_BRASIL: "APPROVED_BRAZIL_CHALLENGE",
  APROVADO_IMIGRACAO: "APPROVED_IMMIGRATION",
  REJEITADO_EUA_NEGATIVO: "REJECT_US_NEGATIVE",
  REJEITADO_URL_DUPLICADA: "REJECT_DUPLICATE_URL",
  REJEITADO_TITULO_DUPLICADO: "REJECT_DUPLICATE_TITLE",
  REJEITADO_ENTIDADE_DUPLICADA: "REJECT_DUPLICATE_ENTITY_EVENT",
  REJEITADO_SEMANTICO: "REJECT_DUPLICATE_SEMANTIC",
  REJEITADO_IMAGEM: "REJECT_IMAGE_MISMATCH",
  REJEITADO_FONTE: "REJECT_LOW_SOURCE_QUALITY",
  REJEITADO_RELEVANCIA: "REJECT_LOW_RELEVANCE",
  REJEITADO_SEM_CLASSIFICACAO: "REJECT_UNCLASSIFIED",
} as const;

export type Motivo = (typeof MOTIVOS)[keyof typeof MOTIVOS];
