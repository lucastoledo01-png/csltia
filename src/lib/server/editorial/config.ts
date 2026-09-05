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
  /**
   * Faixa de suspeita: acima disto as pautas falam do mesmo assunto, mas
   * podem ser fatos diferentes. Precisa de confirmação por entidade.
   */
  limiarSemantico: number;
  /** Acima disto é repetição sem precisar de mais nada. */
  limiarSemanticoCerto: number;
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
  /** Teto de pautas sobre o Brasil por edição. */
  maximoDePautasBrasil: number;
  /** Relevância máxima de uma pauta que é declaração, e não ato. */
  tetoDeDeclaracao: number;
  /** Tentativas de correção antes de desistir da edição. */
  maximoDeReparos: number;
  /** Nota mínima do auditor para a edição poder sair. */
  notaMinimaDeQA: number;
};

export function carregarConfigEditorial(env: Ambiente = process.env): ConfigEditorial {
  return {
    // Medido, não chutado. Os pares do histórico mostram repetição real a
    // 0.729 (a mesma matéria do EB-2 voltando no dia seguinte) e pautas
    // distintas do mesmo ator a 0.760. As faixas se sobrepõem, então um
    // número só não resolve: entre 0.72 e 0.85 quem decide é a entidade.
    limiarSemantico: numeroDoAmbiente("EDITORIAL_LIMIAR_SEMANTICO", 0.72, env),
    limiarSemanticoCerto: numeroDoAmbiente("EDITORIAL_LIMIAR_SEMANTICO_CERTO", 0.85, env),
    limiarDeTitulo: numeroDoAmbiente("EDITORIAL_LIMIAR_TITULO", 0.72, env),
    janelaDeDias: numeroDoAmbiente("EDITORIAL_JANELA_DIAS", 30, env),
    janelaDeImagemEmDias: numeroDoAmbiente("EDITORIAL_JANELA_IMAGEM_DIAS", 30, env),
    minimoDePautas: numeroDoAmbiente("EDITORIAL_MIN_PAUTAS", 2, env),
    maximoDePautas: numeroDoAmbiente("EDITORIAL_MAX_PAUTAS", 4, env),
    minimoDePalavras: numeroDoAmbiente("EDITORIAL_MIN_PALAVRAS", 60, env),
    maximoDePalavras: numeroDoAmbiente("EDITORIAL_MAX_PALAVRAS", 100, env),
    relevanciaMinima: numeroDoAmbiente("EDITORIAL_RELEVANCIA_MINIMA", 4, env),
    // O Brasil é contraste, não é a pauta. Sem teto, um dia de crise no STF
    // enche a edição inteira e a publicação deixa de falar dos EUA, que é o
    // que o leitor abriu o e-mail para ler.
    maximoDePautasBrasil: numeroDoAmbiente("EDITORIAL_MAX_PAUTAS_BRASIL", 1, env),
    // Abaixo do piso de relevância, então na prática declaração só entra se o
    // teto for levantado de propósito.
    tetoDeDeclaracao: numeroDoAmbiente("EDITORIAL_TETO_DECLARACAO", 3, env),
    // Duas, como combinado. Fica na configuração porque o número certo só
    // aparece com rodadas: se o laço passar a convergir sempre na terceira,
    // é decisão de operação, não de código.
    maximoDeReparos: numeroDoAmbiente("MAX_EDITORIAL_REPAIR_ATTEMPTS", 2, env),
    notaMinimaDeQA: numeroDoAmbiente("MIN_EDITORIAL_QA_SCORE", 85, env),
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
  /** Pauta brasileira no eixo, sem carga negativa. Existe para o log não
   *  chamar de "desafio" uma notícia boa e virar viés escondido em rótulo. */
  APROVADO_CONTEXTO_BRASIL: "APPROVED_BRAZIL_CONTEXT",
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
  /** Nem o feed nem a página da matéria deram o que aconteceu. */
  REJEITADO_SEM_FATOS: "REJECT_INSUFFICIENT_FACTS",
  /** Veio de agregador e não foi possível chegar à matéria de origem. */
  REJEITADO_FONTE_NAO_RESOLVIDA: "REJECT_SOURCE_UNRESOLVED",
  /** O texto gerado afirma algo que não está no pacote factual. */
  REJEITADO_SEM_ANCORAGEM: "REJECT_UNGROUNDED_CLAIM",
} as const;

export type Motivo = (typeof MOTIVOS)[keyof typeof MOTIVOS];
