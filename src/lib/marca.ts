/**
 * Identidade da publicação, em um lugar só.
 *
 * Antes disso o nome, o domínio, a cor e a assinatura estavam escritos à mão
 * em mais de quarenta arquivos — cabeçalho do site, template do e-mail,
 * rodapé dos slides, metadados, textos de página. Trocar de vertical exigia
 * caçar 121 ocorrências, e uma troca assim sempre fica pela metade: sobra o
 * rodapé de um e-mail, o alt de um logo, o título de uma aba.
 *
 * O que o banco decide continua no banco: `projects` manda no que a IA
 * escreve (nicho, briefing editorial, assinatura). O que está aqui é o que
 * precisa existir no build — rótulo, cor, domínio — em componente de servidor
 * e de cliente, sem consulta.
 */

export const MARCA = {
  /** Nome exibido. Aparece no site, no e-mail e nos slides. */
  nome: "immigra.us",
  /** Parte antes do ponto, para o logotipo em duas cores. */
  nomeBase: "immigra",
  /** Sufixo colorido do logotipo. */
  nomeSufixo: ".us",
  handle: "@immigra.us",
  tagline: "O que muda para quem vai para os EUA.",
  descricao:
    "Notícias de imigração para os Estados Unidos: vistos, green card, prazos e " +
    "o que muda para brasileiros. Sem promessa e sem juridiquês.",

  /**
   * Vermelho da bandeira dos EUA (Old Glory Red, #B31942) clareado.
   *
   * O tom oficial é escuro demais para um acento de interface e para pintar
   * palavra dentro de manchete branca sobre foto — some. A função do acento é
   * ser notado de relance.
   */
  cor: "#E4344A",
  corOficialVermelho: "#B31942",
  corOficialAzul: "#0A3161",

  /** Encerramento da edição e do post. */
  assinatura: "Até amanhã. — immigra.us",
  /** Palavra que o leitor comenta no post para receber o material. */
  keyword: "VISTO",

  site: "https://casaloti.ia.br",
} as const;

/** Título de aba e metadados. */
export const TITULO_DO_SITE = `${MARCA.nome} | ${MARCA.tagline}`;
