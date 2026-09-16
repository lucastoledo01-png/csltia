/**
 * Identidade da publicação, em um lugar só.
 *
 * Antes disso o nome, o domínio, a cor e a assinatura estavam escritos à mão
 * em mais de quarenta arquivos (cabeçalho do site, template do e-mail,
 * rodapé dos slides, metadados, textos de página). Trocar de vertical exigia
 * caçar 121 ocorrências, e uma troca assim sempre fica pela metade: sobra o
 * rodapé de um e-mail, o alt de um logo, o título de uma aba.
 *
 * O que o banco decide continua no banco: `projects` manda no que a IA
 * escreve (nicho, briefing editorial, assinatura). O que está aqui é o que
 * precisa existir no build (rótulo, cor, domínio) em componente de servidor
 * e de cliente, sem consulta.
 */

export const MARCA = {
  /** Nome exibido. Aparece no site, no e-mail e nos slides. */
  nome: "usa.journal",
  /** Parte antes do ponto, para o logotipo em duas cores. */
  nomeBase: "usa",
  /** Sufixo colorido do logotipo. */
  nomeSufixo: ".journal",
  handle: "@imigra.us",
  tagline: "O que muda para quem vai para os EUA.",
  descricao:
    "Notícias de imigração para os Estados Unidos: vistos, green card, prazos e " +
    "o que muda para brasileiros. Sem promessa e sem juridiquês.",

  /**
   * Vermelho da bandeira dos EUA (Old Glory Red, #B31942) clareado.
   *
   * O tom oficial é escuro demais para um acento de interface e para pintar
   * palavra dentro de manchete branca sobre foto, some. A função do acento é
   * ser notado de relance.
   */
  cor: "#E4344A",
  corOficialVermelho: "#B31942",
  corOficialAzul: "#0A3161",

  /** Encerramento da edição e do post. */
  assinatura: "Até amanhã. Equipe usa.journal.",
  /** Palavra que o leitor comenta no post para receber o material. */
  keyword: "VISTO",

  site: "https://casaloti.ia.br",

  /**
   * Logotipo, nas duas versões.
   *
   * Caminho absoluto porque o mesmo arquivo serve o site e o e-mail, e num
   * e-mail o caminho relativo não resolve: o cliente de e-mail não sabe de
   * qual origem a mensagem veio.
   */
  logoClaro: "https://casaloti.ia.br/marca/usa-journal-claro.png",
  /*
   * Ainda o arquivo antigo, de propósito: `logoEscuro` não é usado por nenhum
   * código hoje, e a versão do usa.journal para fundo escuro não existe. O
   * azul-marinho do "usa" e o traço da estrela sumiriam num fundo preto, então
   * essa versão precisa ser desenhada, não derivada.
   */
  logoEscuro: "https://casaloti.ia.br/marca/imigra-us-escuro.png",
  instagram: "https://instagram.com/imigra.us",
  instagramHandle: "@imigra.us",

  /**
   * Paleta da bandeira aplicada à interface.
   *
   * `azul` é o Old Glory Blue oficial e serve de tinta escura. Os dois tons
   * claros existem porque fundo de destaque precisa de contraste com texto
   * preto, porque o vermelho e o azul cheios só funcionam com texto branco por cima.
   */
  tintaEscura: "#0A3161",
  fundoRealce: "#EEF3FB",
  bordaRealce: "#C8D6EC",
  fundoAviso: "#FDECEE",
  textoAviso: "#8C1226",
} as const;

/** Título de aba e metadados. */
export const TITULO_DO_SITE = `${MARCA.nome} | ${MARCA.tagline}`;
