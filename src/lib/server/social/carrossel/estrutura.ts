/**
 * A forma de um carrossel, declarada em código e não pedida ao modelo.
 *
 * Um carrossel não é um post comprido cortado em pedaços. Cada estrutura aqui
 * é uma sequência de PAPÉIS: o que o slide 1 faz é diferente do que o slide 4
 * faz, e essa diferença é a razão de o formato existir. Se a ordem viesse do
 * modelo, dois posts do mesmo tipo sairiam com formas diferentes e o perfil
 * perderia a única coisa que faz um carrossel ser lido até o fim, que é o
 * leitor saber o que esperar do próximo slide.
 *
 * Cada papel vira um `type` do `InstagramSlideSchema`, que já existe e já tem
 * variante desenhada. Nenhum tipo novo de slide é inventado aqui.
 */

import type { InstagramSlideTypeSchema } from "../instagram/schemas";
import type { z } from "zod";

export type TipoDeSlide = z.infer<typeof InstagramSlideTypeSchema>;

export type EstruturaDoCarrossel = "explainer" | "comparison" | "process" | "faq";

/**
 * O papel de um slide dentro da estrutura.
 *
 * `obrigatorio` separa o que define a forma do que a enriquece. Um explainer
 * sem "o que é" não é um explainer; sem a ressalva, é um explainer mais curto.
 * É esta marca que permite encurtar um carrossel por falta de fato sem que ele
 * deixe de ser o que diz que é.
 */
export type PapelDeSlide = {
  papel: string;
  tipo: TipoDeSlide;
  /** O que este slide precisa afirmar, e vai para o prompt como instrução. */
  pede: string;
  obrigatorio: boolean;
  /**
   * Slide que o código escreve, não o modelo.
   *
   * São dois, e os dois por segurança e não por conveniência. A CAPA é a
   * manchete mais o destaque, que já existem na copy, já são ancorados pela
   * guarda e já têm variante desenhada: pedir ao modelo um texto de capa criaria
   * uma segunda fonte para a mesma coisa, e a divergência entre as duas apareceria
   * como "a arte diz uma coisa e a legenda diz outra". O FECHAMENTO é o CTA, que
   * é montado a partir da keyword canônica, porque promessa escrita por modelo é
   * exatamente o defeito que `ctaDaPosicao` existe para impedir.
   */
  escritoEmCodigo?: boolean;
  /**
   * Variante de desenho, quando o papel pede uma que o tipo não escolheria.
   *
   * É assim que a comparação existe sem um tipo de slide novo: `variant` já é
   * o primeiro nível da resolução em `assembleSlide`, acima do mapa por tipo.
   *
   * O valor é a CHAVE do registro de variantes, exatamente como escrita em
   * `SLIDE_VARIANTS`. Escrevi `comparacaoDuasColunas` na primeira volta, e a
   * chave é `comparacao_duas_colunas`: `assembleSlide` não achou a variante,
   * caiu na primeira do tipo, e a comparação foi desenhada como uma lista de
   * bullets. Nenhum teste de unidade viu, porque a resolução acontece no
   * render; quem viu foi o validador visual, contando as colunas do DOM.
   * Acrescentar `comparison` ao enum de tipos obrigaria a mexer no schema que
   * o caminho legado também usa, e a declarar tokens de eyebrow e CTA para um
   * formato que o legado nunca vai desenhar.
   */
  variante?: string;
};

/**
 * As quatro formas.
 *
 * Os papéis seguem a ordem em que o leitor os vê, e o primeiro é sempre a capa,
 * porque é o único slide que aparece no feed de quem não deslizou.
 */
export const ESTRUTURAS: Record<EstruturaDoCarrossel, PapelDeSlide[]> = {
  explainer: [
    { papel: "capa", tipo: "cover", pede: "a manchete", obrigatorio: true, escritoEmCodigo: true },
    { papel: "o que é", tipo: "content", pede: "o que é a coisa, em uma ideia só", obrigatorio: true },
    { papel: "como funciona", tipo: "content", pede: "como funciona na prática, em uma ideia só", obrigatorio: true },
    /*
     * `content`, e não `practical_impact`, e a diferença não é cosmética.
     *
     * A variante de conteúdo permanente está registrada sob `content`. Com o
     * tipo `practical_impact`, `assembleSlide` não a acha, cai na primeira
     * variante daquele tipo, e a primeira é `gold_dark_card`, que traz
     * "COMO APLICAR EM REDES & VENDAS" cravado no HTML, herança do nicho de
     * tecnologia. Um post de imigração sairia com esse rótulo.
     */
    {
      papel: "para quem",
      tipo: "content",
      pede: "para quem isso vale, ou em que contexto aparece",
      obrigatorio: false,
    },
    { papel: "ressalva", tipo: "quote_highlight", pede: "o ponto que o leitor erra, ou o que a fonte NÃO diz", obrigatorio: false },
    { papel: "fechamento", tipo: "cta", pede: "o fechamento", obrigatorio: false, escritoEmCodigo: true },
  ],
  comparison: [
    { papel: "capa", tipo: "cover", pede: "a manchete", obrigatorio: true, escritoEmCodigo: true },
    { papel: "lado A", tipo: "content", pede: "o primeiro conceito, sozinho, sem comparar ainda", obrigatorio: true },
    { papel: "lado B", tipo: "content", pede: "o segundo conceito, sozinho, sem comparar ainda", obrigatorio: true },
    {
      papel: "diferença 1",
      tipo: "content",
      variante: "comparacao_duas_colunas",
      pede: "a diferença que mais muda a decisão de quem lê, com um lado em cada coluna",
      obrigatorio: true,
    },
    {
      papel: "diferença 2",
      tipo: "content",
      variante: "comparacao_duas_colunas",
      pede: "a segunda diferença que importa, com um lado em cada coluna",
      obrigatorio: false,
    },
    { papel: "resumo", tipo: "content", pede: "o resumo da comparação em uma frase", obrigatorio: false },
    { papel: "fechamento", tipo: "cta", pede: "o fechamento", obrigatorio: false, escritoEmCodigo: true },
  ],
  process: [
    { papel: "capa", tipo: "cover", pede: "a manchete", obrigatorio: true, escritoEmCodigo: true },
    { papel: "etapa 1", tipo: "step", pede: "a primeira etapa, na ordem em que acontece", obrigatorio: true },
    { papel: "etapa 2", tipo: "step", pede: "a segunda etapa", obrigatorio: true },
    { papel: "etapa 3", tipo: "step", pede: "a terceira etapa", obrigatorio: false },
    { papel: "etapa 4", tipo: "step", pede: "a quarta etapa", obrigatorio: false },
    { papel: "atenção", tipo: "quote_highlight", pede: "o ponto de atenção do processo", obrigatorio: false },
    { papel: "fechamento", tipo: "cta", pede: "o fechamento", obrigatorio: false, escritoEmCodigo: true },
  ],
  faq: [
    { papel: "pergunta", tipo: "cover", pede: "a manchete", obrigatorio: true, escritoEmCodigo: true },
    { papel: "resposta", tipo: "content", pede: "a resposta direta, sem rodeio, na primeira linha", obrigatorio: true },
    { papel: "contexto", tipo: "content", pede: "o contexto que a resposta exige para não enganar", obrigatorio: false },
    { papel: "ressalva", tipo: "quote_highlight", pede: "o que a fonte não responde", obrigatorio: false },
    { papel: "fechamento", tipo: "cta", pede: "o fechamento", obrigatorio: false, escritoEmCodigo: true },
  ],
};

/**
 * Os limites de slide, e por que não são os do Instagram.
 *
 * O Instagram aceita dez. Sete é o teto aqui porque o oitavo slide de um
 * assunto que se explica em cinco é enchimento, e enchimento é exatamente o
 * que o item 3 do pedido proíbe. Dois é o piso porque um slide só é um post
 * estático, e chamá-lo de carrossel faria a métrica de formato mentir.
 */
export const MINIMO_DE_SLIDES = 2;
export const MAXIMO_DE_SLIDES = 7;

/**
 * Quantos slides cada estrutura precisa para ainda ser ela mesma.
 *
 * É a contagem dos papéis obrigatórios. Abaixo disso o post não vira um
 * carrossel curto, vira um estático: a forma não se sustenta.
 */
export function minimoDaEstrutura(estrutura: EstruturaDoCarrossel): number {
  return ESTRUTURAS[estrutura].filter((p) => p.obrigatorio).length;
}

/** Quantos slides a estrutura aceita no máximo, respeitando o teto geral. */
export function maximoDaEstrutura(estrutura: EstruturaDoCarrossel): number {
  return Math.min(ESTRUTURAS[estrutura].length, MAXIMO_DE_SLIDES);
}

/**
 * Os papéis de um carrossel de N slides.
 *
 * Corta os opcionais de trás para frente, e o fechamento é caso à parte: ele é
 * o último papel da lista mas o primeiro a ser preservado quando existe CTA,
 * porque um carrossel que termina no meio de uma explicação não fecha.
 */
export function papeisPara(estrutura: EstruturaDoCarrossel, slides: number, comCta: boolean): PapelDeSlide[] {
  const todos = ESTRUTURAS[estrutura];
  const fechamento = todos.find((p) => p.tipo === "cta");
  const comFechamento = comCta && Boolean(fechamento);

  /*
   * O piso inclui o que o código escreve, e é por isso que ele existe.
   *
   * Sem contar a capa e o fechamento no piso, um pedido de quatro slides numa
   * comparação (que tem quatro papéis obrigatórios) devolvia CINCO: os
   * obrigatórios entram de qualquer jeito e o fechamento era somado depois. A
   * função passava a devolver mais slides do que o chamador pediu, e o
   * chamador é quem já conferiu que há fato para cada um.
   */
  const piso = minimoDaEstrutura(estrutura) + (comFechamento ? 1 : 0);
  const alvo = Math.max(piso, Math.min(slides, maximoDaEstrutura(estrutura)));

  const elegiveis = todos.filter((p) => p !== fechamento);
  const escolhidos = new Set<PapelDeSlide>(elegiveis.filter((p) => p.obrigatorio));

  const paraConteudo = comFechamento ? alvo - 1 : alvo;
  for (const papel of elegiveis) {
    if (escolhidos.size >= paraConteudo) break;
    if (!papel.obrigatorio) escolhidos.add(papel);
  }

  /*
   * A ordem que o leitor vê é sempre a da estrutura.
   *
   * Os obrigatórios foram escolhidos primeiro para não serem cortados, o que
   * embaralha a sequência: num explainer de quatro slides, "para quem" entraria
   * depois de "como funciona" na escolha, e antes dele na leitura.
   */
  const naOrdem = elegiveis.filter((p) => escolhidos.has(p));

  return comFechamento && fechamento ? [...naOrdem, fechamento] : naOrdem;
}

/** Os papéis que o modelo escreve. A capa e o fechamento não são dele. */
export function papeisDoModelo(papeis: PapelDeSlide[]): PapelDeSlide[] {
  return papeis.filter((p) => !p.escritoEmCodigo);
}
