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
  nome: "eua.journal",
  /** Parte antes do ponto, para o logotipo em duas cores. */
  nomeBase: "eua",
  /** Sufixo colorido do logotipo. */
  nomeSufixo: ".journal",
  handle: "@eua.journal",
  /*
   * A publicação deixou de ser sobre imigração em 16/09/2026.
   *
   * O dono apontou que as manchetes falavam de visto e de sigla o tempo todo,
   * e que as referências do produto não fazem isso. A virada é de escopo: os
   * Estados Unidos para brasileiros, com economia, trabalho, custo de vida,
   * política, tecnologia e cultura, e a imigração como UMA editoria entre
   * elas. As fontes, a classificação e o briefing do banco mudaram junto.
   */
  tagline: "Os Estados Unidos, todo dia, em português.",
  descricao:
    "Os Estados Unidos para brasileiros: economia, trabalho, custo de vida, " +
    "política, tecnologia e cultura. Todo dia, em português, sem juridiquês.",

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
  assinatura: "Até amanhã. Equipe eua.journal.",
  /**
   * Palavra que o leitor comenta no post.
   *
   * Este valor é o PADRÃO de última instância, não a fonte da verdade. Quem
   * manda é `prompt_campaigns.keyword`, porque é dela que sai o valor entregue
   * ao OpenReply, que é quem escuta o comentário. Ver `keyword-canonica.ts`.
   *
   * Ele estava em "VISTO" aqui, "VISA" no banco e "NEWS" no padrão do worker:
   * três palavras para um valor só. Agora as três dizem NEWS.
   */
  keyword: "NEWS",

  site: "https://casaloti.ia.br",

  /**
   * Logotipo, nas duas versões.
   *
   * Caminho absoluto porque o mesmo arquivo serve o site e o e-mail, e num
   * e-mail o caminho relativo não resolve: o cliente de e-mail não sabe de
   * qual origem a mensagem veio.
   */
  /*
   * O logotipo entregue pelo dono em 05/10/2026, nas duas versões.
   *
   * Até esta data os dois arquivos `eua-journal-claro.png` e
   * `eua-journal-escuro.png` ainda desenhavam "usa.journal" com a estrela: a
   * marca mudou de nome em 28/09 e o arquivo do logotipo não mudou junto. Os
   * nomes novos são outros de propósito, por dois motivos: e-mail já enviado
   * aponta para o endereço antigo e continua igual ao que foi lido, e cache
   * de navegador e de cliente de e-mail não serve o desenho velho no endereço
   * novo. Os arquivos antigos ficam em `public/marca`, sem uso.
   *
   * `fundo-claro` é o "eua" em azul-marinho, para fundo branco; `fundo-escuro`
   * é o "eua" em branco, para azul-marinho e foto escura. O ".journal" é
   * vermelho nas duas. As versões `-alta` são o arquivo entregue sem as
   * margens, em resolução cheia, e nada no código aponta para elas.
   */
  logoClaro: "https://casaloti.ia.br/marca/eua-journal-fundo-claro.png",
  /*
   * A versão escura é a clara com o azul-marinho virado branco.
   *
   * Ela foi gerada a partir da clara, e não desenhada: no fundo azul-marinho
   * do cabeçalho e do rodapé o "eua", a estrela e os traços sumiriam. O
   * vermelho do ".journal" permanece, porque ele tem contraste nos dois fundos.
   *
   * Isso valeu até 05/10/2026. Desde então a versão escura é desenhada pelo
   * dono, e não derivada.
   */
  logoEscuro: "https://casaloti.ia.br/marca/eua-journal-fundo-escuro.png",
  /**
   * Proporção dos dois arquivos, largura sobre altura (800 por 142 o claro,
   * 800 por 143 o escuro: a diferença é de um pixel e não aparece).
   *
   * Existe para o e-mail: o Outlook ignora `height:auto` e usa o atributo
   * `height`, e sem ele a imagem sai esticada ou com a altura do arquivo.
   */
  logoProporcao: 800 / 142,
  /*
   * O logotipo do INSTAGRAM, e só dele (06/10/2026).
   *
   * O dono entregou uma marca compacta para as peças do feed: o "eua" com o
   * ponto vermelho, sem o ".journal", nas duas tintas. É a que vai na capa, no
   * miolo do carrossel e no convite final; o portal, o e-mail e o site seguem
   * com `logoClaro` e `logoEscuro`, que são a assinatura horizontal.
   *
   * Os arquivos são os entregues (500x500, fundo transparente) com a margem
   * transparente cortada rente, para a altura do CSS ser a altura da letra e
   * não a de uma caixa quase vazia. `fundo-claro` é o "eua" azul-marinho, para
   * foto clara; `fundo-escuro` é o "eua" branco, para foto escura e para o
   * fundo preto do convite. Quem escolhe na foto é a medida de brilho atrás da
   * marca, a mesma de 16/09/2026 (limiar 0.62).
   */
  logoInstagramClaro: "https://casaloti.ia.br/marca/eua-instagram-fundo-claro.png",
  logoInstagramEscuro: "https://casaloti.ia.br/marca/eua-instagram-fundo-escuro.png",
  /** Largura sobre altura dos dois arquivos cortados (478x129 e 482x129). */
  logoInstagramProporcao: 480 / 129,
  /**
   * A marca em círculo, que é a foto de perfil.
   *
   * O logotipo é uma assinatura horizontal e não cabe num círculo de 76px sem
   * virar borrão. Esta é a versão de avatar, com o ponto vermelho, o "eua" em
   * branco e a Estátua da Liberdade em marca-d'água sobre o azul-marinho. É
   * ela que aparece no recorte de post, onde a peça inteira imita a gramática
   * de uma rede social e o perfil está no topo.
   *
   * Até 06/10/2026 o arquivo ainda desenhava ".usa" com a Estátua da
   * Liberdade. Desde então é o ícone do site (`src/app/icon.png`), o "eua"
   * branco com o ponto vermelho sobre azul-marinho, achatado sem transparência
   * e no mesmo tamanho de antes, 320x320.
   */
  avatar: "https://casaloti.ia.br/marca/eua-journal-avatar.png",
  /*
   * O perfil, perguntado à Graph API em 28/09/2026, não suposto.
   *
   * ```
   * username: eua.journal
   * name:     EUA Journal
   * ```
   *
   * Estes três campos estavam errados, e não de um jeito silencioso: o handle
   * é IMPRESSO na arte de todo post (capa de jornal e recorte), no rodapé da
   * newsletter e no portal, e o link levava a `instagram.com/usa.journal.ai`,
   * que não é esta conta. O comentário anterior afirmava com todas as letras
   * que `@eua.journal` era o passado e `@usa.journal.ai` o presente, ou seja,
   * o inverso do que a API responde. Comentário errado é pior que comentário
   * ausente, porque ele encerra a investigação de quem for olhar depois.
   *
   * Se a conta for renomeada de novo, estes três campos mudam JUNTOS, e a
   * conferência é uma chamada à Graph API, não a memória de ninguém.
   *
   * `instagramNome` é o nome de EXIBIÇÃO do perfil, que é o que o rodapé do
   * e-mail imprime ao lado do ícone. Arroba ao lado de um ícone é ruído; o
   * nome as pessoas reconhecem.
   */
  instagram: "https://instagram.com/eua.journal",
  instagramHandle: "@eua.journal",
  instagramNome: "EUA Journal",

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

/**
 * O mesmo logotipo, pelo caminho da própria origem.
 *
 * `MARCA.logoClaro` e `logoEscuro` são absolutos porque o e-mail precisa
 * disso: o cliente de e-mail não sabe de qual origem a mensagem veio. No SITE
 * o absoluto é um defeito, e de dois jeitos: em desenvolvimento ele busca o
 * arquivo em produção, que pode nem existir ainda, e em produção ele obriga um
 * salto pela rede para buscar algo que está ao lado.
 *
 * Uma fonte só, dois formatos, derivados e não copiados.
 */
export function logoDoSite(escuro = false): string {
  const url = escuro ? MARCA.logoEscuro : MARCA.logoClaro;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
