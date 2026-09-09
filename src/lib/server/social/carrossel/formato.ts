/**
 * Static ou carrossel, decidido pelo conteúdo que existe.
 *
 * A pergunta não é "este tópico merece um carrossel", é "há fato suficiente
 * para cada slide". Um fato transformado em seis slides não é um carrossel:
 * são cinco slides de enchimento atrás de um slide bom, e o leitor sente isso
 * antes de chegar ao terceiro.
 *
 * Por isso a decisão tem duas metades e as duas precisam concordar. A família
 * editorial diz que FORMA serve ao assunto: comparação se explica lado a lado,
 * glossário se explica numa frase. O pacote factual diz que MATERIAL existe.
 * A preferência da família nunca vence a falta de material.
 */

import type { FamiliaEvergreen, ItemEvergreen } from "../evergreen/tipos";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import {
  MAXIMO_DE_SLIDES,
  MINIMO_DE_SLIDES,
  maximoDaEstrutura,
  minimoDaEstrutura,
  type EstruturaDoCarrossel,
} from "./estrutura";

export type FormatoDoPost = "static" | "carousel";

export type DecisaoDeFormato = {
  formato: FormatoDoPost;
  /** Só quando `formato` é carousel. */
  estrutura?: EstruturaDoCarrossel;
  /** Quantos slides o conteúdo sustenta, já dentro dos limites da estrutura. */
  slides: number;
  /** Por que esta decisão, em uma frase, para o relatório e o preview. */
  motivo: string;
  /** Quantos fatos do pacote foram considerados úteis para virar slide. */
  fatosUteis: number;
};

/**
 * A preferência de cada família, e a estrutura que ela pede.
 *
 * `forca` distingue "pode" de "prefere": o glossário só vira carrossel quando
 * há contexto de sobra, e a comparação vira carrossel a menos que falte fato.
 * É o que o pedido chama de preferência fraca contra preferência forte.
 *
 * `min` e `max` são a faixa de slides pedida para a família. O `max` limita de
 * verdade; o `min` é conferido por teste contra o que a decisão produz, para a
 * faixa pedida e a forma implementada não divergirem em silêncio.
 */
type PreferenciaDaFamilia = {
  estrutura: EstruturaDoCarrossel;
  forca: "estatico_por_padrao" | "prefere_carrossel" | "carrossel_forte";
  min: number;
  max: number;
  /**
   * Quantos fatos úteis uma família estática por padrão exige para virar
   * carrossel, quando a pergunta não pede outra forma.
   *
   * Existe porque a primeira calibração era permissiva demais e a medição
   * mostrou: 96% do evergreen saía em carrossel, e a régua "um fato além do
   * essencial" era satisfeita por qualquer página oficial, que sempre menciona
   * o termo mais de uma vez. O pedido diz "SOMENTE quando houver contexto
   * adicional REALMENTE útil", e dois fatos não são isso.
   *
   * Ausente significa que a contagem de fatos não autoriza: só a pergunta
   * autoriza, mudando a estrutura para processo ou comparação.
   */
  fatosParaVirarCarrossel?: number;
};

const PREFERENCIA: Record<FamiliaEvergreen, PreferenciaDaFamilia> = {
  /*
   * Termo de dicionário se explica numa peça, e quando vira carrossel a forma
   * é de pergunta e resposta, não de explainer.
   *
   * A estrutura de explainer exige "o que é" MAIS "como funciona", o que a
   * empurraria para quatro slides no mínimo e tornaria a faixa de dois a três
   * do pedido impossível de atingir. Um termo é uma pergunta com resposta e,
   * quando há material, um contexto.
   */
  /*
   * Quatro fatos: a definição mais três de contexto. É o que faz um termo de
   * glossário merecer três telas em vez de uma.
   */
  glossary: { estrutura: "faq", forca: "estatico_por_padrao", min: 2, max: 3, fatosParaVirarCarrossel: 4 },
  /*
   * FAQ não vira carrossel por quantidade de fato, e sim por FORMA da pergunta.
   *
   * É o que o pedido diz: pergunta simples é estática, pergunta que exige
   * explicação em etapas é carrossel. Uma resposta direta continua sendo uma
   * resposta direta por mais material que a página tenha; o que muda a forma é
   * a pergunta pedir uma sequência, e aí a estrutura já vira processo.
   */
  faq: { estrutura: "faq", forca: "estatico_por_padrao", min: 3, max: 4 },
  visa_explainer: { estrutura: "explainer", forca: "prefere_carrossel", min: 4, max: 6 },
  comparison: { estrutura: "comparison", forca: "carrossel_forte", min: 5, max: 7 },
  process_explainer: { estrutura: "process", forca: "carrossel_forte", min: 4, max: 6 },
  professional_education: { estrutura: "explainer", forca: "prefere_carrossel", min: 4, max: 6 },
  evidence_education: { estrutura: "explainer", forca: "prefere_carrossel", min: 4, max: 6 },
};

export function preferenciaDaFamilia(familia: FamiliaEvergreen): PreferenciaDaFamilia {
  return PREFERENCIA[familia];
}

/**
 * Um fato que serve de slide.
 *
 * O extrator devolve frases curtas, uma informação por frase, e algumas delas
 * são cabeçalho de página ou fragmento sem predicado. Um slide precisa de uma
 * afirmação inteira, e o piso de caracteres é o que separa "Formulário I-485"
 * de "O Formulário I-485 é o pedido de ajuste de status".
 */
const MINIMO_DE_CARACTERES_DO_FATO = 40;

export function fatosQueViramSlide(pacote: PacoteFactual): string[] {
  const vistos = new Set<string>();
  const uteis: string[] = [];

  for (const fato of pacote.verified_facts ?? []) {
    const limpo = (fato ?? "").trim();
    if (limpo.length < MINIMO_DE_CARACTERES_DO_FATO) continue;

    /*
     * Dois fatos que dizem a mesma coisa valem um slide, não dois.
     *
     * A chave é o começo normalizado da frase: o extrator repete a mesma
     * informação em formulações próximas quando a página a repete, e sem isso
     * a contagem autorizaria um carrossel que diria duas vezes a mesma coisa.
     */
    const chave = limpo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join(" ");
    if (!chave || vistos.has(chave)) continue;

    vistos.add(chave);
    uteis.push(limpo);
  }

  return uteis;
}

/**
 * A pergunta do ângulo pede sequência?
 *
 * "Quais são as etapas" e "o que acontece depois" são perguntas de processo
 * mesmo quando o tópico não está na família de processo, e a resposta certa
 * para elas é uma sequência numerada, não um parágrafo.
 */
const PEDE_SEQUENCIA =
  /\betapas?\b|\bpasso a passo\b|\bcomo funciona o processo\b|\bo que acontece\b|\bem que ordem\b|\bprimeiro\b.*\bdepois\b/i;

/**
 * A pergunta do ângulo compara duas coisas?
 *
 * Deliberadamente estreito. A tentação é aceitar qualquer pergunta com "ou",
 * e isso transformaria "o que é isso ou como funciona" numa comparação, que
 * desenharia duas colunas para um assunto que tem um lado só. Comparação de
 * verdade nomeia os dois lados, e a família `comparison` já cobre o resto.
 */
const PEDE_COMPARACAO = /\bversus\b|\bvs\.?\b|\bdiferen[çc]as?\b|\bqual dos\b|\bqual deles\b/i;

export type OpcoesDaDecisao = {
  /** O CTA ocupa um slide de fechamento. Sem automação, não ocupa. */
  comCta: boolean;
};

/**
 * A decisão de formato de um item evergreen.
 *
 * Determinística: mesmo item mais mesmo pacote devolvem sempre o mesmo
 * resultado. Isso é exigência do dry-run, que compara sete dias simulados e
 * não teria como comparar nada se a decisão variasse entre execuções.
 */
export function determinarFormatoEvergreen(
  item: ItemEvergreen,
  pacote: PacoteFactual,
  opcoes: OpcoesDaDecisao,
): DecisaoDeFormato {
  const preferencia = PREFERENCIA[item.topico.familia];
  const uteis = fatosQueViramSlide(pacote);
  const fatosUteis = uteis.length;

  const pergunta = item.angulo.pergunta ?? "";
  const sequencia = PEDE_SEQUENCIA.test(pergunta);
  const comparacao = PEDE_COMPARACAO.test(pergunta) || item.topico.familia === "comparison";

  /*
   * A estrutura pode não ser a da família.
   *
   * Um ângulo de etapas dentro de um explainer de visto é um processo, e
   * desenhá-lo como explainer joga a ordem das etapas fora. A família diz a
   * preferência de formato; a pergunta diz a forma.
   */
  let estrutura = preferencia.estrutura;
  if (comparacao) estrutura = "comparison";
  else if (sequencia) estrutura = "process";

  /*
   * Quantos slides o material sustenta.
   *
   * A capa não consome fato: ela é a pergunta do ângulo. Cada slide de
   * conteúdo consome um fato útil. O fechamento é escrito em código e também
   * não consome fato.
   */
  const capa = 1;
  const fechamento = opcoes.comCta ? 1 : 0;
  const sustentados = capa + fatosUteis + fechamento;

  const pisoDaEstrutura = Math.max(minimoDaEstrutura(estrutura) + fechamento, MINIMO_DE_SLIDES);
  const teto = Math.min(maximoDaEstrutura(estrutura), preferencia.max, MAXIMO_DE_SLIDES);
  const slides = Math.min(sustentados, teto);

  if (slides < pisoDaEstrutura) {
    return {
      formato: "static",
      slides: 1,
      fatosUteis,
      motivo:
        `${fatosUteis} fato(s) útil(eis) sustentam ${slides} slide(s), e ${estrutura} ` +
        `precisa de ${pisoDaEstrutura}: uma peça só é melhor do que um carrossel vazio`,
    };
  }

  /*
   * A preferência fraca precisa de contexto de sobra, medido em FATO.
   *
   * Medir a folga em slides não funciona quando o teto da família iguala o
   * piso da estrutura, que é o caso do glossário: nenhum conteúdo, por rico
   * que fosse, produziria "um slide acima do piso", e a família nunca viraria
   * carrossel. O que o pedido chama de contexto adicional realmente útil é um
   * fato ALÉM dos que os slides obrigatórios já consomem.
   */
  /*
   * A preferência fraca só cede a um sinal forte, e há dois.
   *
   * O primeiro é a PERGUNTA: se ela pede etapas ou compara dois caminhos, a
   * forma segue a pergunta, e é por isso que a estrutura já mudou acima. Esse
   * é o caso que o pedido abre explicitamente para o FAQ.
   *
   * O segundo é MATERIAL DE SOBRA, e ele só vale para o glossário, com um piso
   * declarado. A primeira versão pedia "um fato além do essencial" e isso era
   * satisfeito por qualquer página oficial: a medição de sete dias deu 96% do
   * evergreen em carrossel, com famílias estáticas por padrão virando carrossel
   * quase sempre.
   */
  const aPerguntaMudouAForma = estrutura !== preferencia.estrutura;

  if (preferencia.forca === "estatico_por_padrao" && !aPerguntaMudouAForma) {
    const piso = preferencia.fatosParaVirarCarrossel;

    if (piso === undefined) {
      return {
        formato: "static",
        slides: 1,
        fatosUteis,
        motivo:
          `família ${item.topico.familia} é estática por padrão, e esta pergunta não pede ` +
          `etapas nem compara caminhos: uma resposta direta é uma peça só`,
      };
    }

    if (fatosUteis < piso) {
      return {
        formato: "static",
        slides: 1,
        fatosUteis,
        motivo:
          `família ${item.topico.familia} é estática por padrão e ${fatosUteis} fato(s) ` +
          `não chegam ao piso de ${piso} para justificar contexto adicional`,
      };
    }
  }

  const porQue = comparacao
    ? "a pergunta compara dois caminhos, e comparação se lê lado a lado"
    : sequencia
      ? "a pergunta pede etapas em ordem"
      : `família ${item.topico.familia} se explica em sequência`;

  return {
    formato: "carousel",
    estrutura,
    slides,
    fatosUteis,
    motivo: `${porQue}; ${fatosUteis} fato(s) útil(eis) sustentam ${slides} slide(s)`,
  };
}

/**
 * Intercala formatos, sem mexer em quem entrou nem em quantos.
 *
 * O feed com quatro carrosséis seguidos e depois quatro estáticos parece dois
 * dias diferentes colados. O que se quer é variedade de forma, e isso é
 * desempate: nada aqui inclui, exclui ou substitui post nenhum, e por isso não
 * é quota. Se o dia só tem um formato, a lista volta exatamente como veio.
 *
 * A distribuição é do tipo minoria espalhada na maioria, e não alternância
 * simples: com quatro carrosséis e um estático, alternar daria C S C C C, e
 * espalhar dá C C S C C. O bloco de três no fim é o que se está evitando.
 *
 * Determinística de propósito: o dry-run compara dias simulados, e ordem que
 * varia entre execuções não se compara com nada.
 */
export function alternarFormatos<T>(itens: T[], formatoDe: (item: T) => FormatoDoPost): T[] {
  if (itens.length < 3) return [...itens];

  const carrossel = itens.filter((i) => formatoDe(i) === "carousel");
  const estatico = itens.filter((i) => formatoDe(i) !== "carousel");

  if (carrossel.length === 0 || estatico.length === 0) return [...itens];

  const maioria = carrossel.length >= estatico.length ? carrossel : estatico;
  const minoria = maioria === carrossel ? estatico : carrossel;

  /*
   * De quantos em quantos a minoria entra.
   *
   * Com m da maioria e k da minoria, há k+1 blocos de maioria para distribuir,
   * e o passo é o tamanho de cada bloco. O piso de 1 evita passo zero quando os
   * dois lados têm o mesmo tamanho, caso em que isto vira alternância simples.
   */
  const passo = Math.max(1, Math.round(maioria.length / (minoria.length + 1)));

  const saida: T[] = [];
  let deMinoria = 0;

  maioria.forEach((item, i) => {
    saida.push(item);
    const naFronteira = (i + 1) % passo === 0;
    if (naFronteira && deMinoria < minoria.length && i + 1 < maioria.length) {
      saida.push(minoria[deMinoria]);
      deMinoria += 1;
    }
  });

  /* O que não caiu numa fronteira vai para o fim, na ordem em que veio. */
  for (; deMinoria < minoria.length; deMinoria += 1) saida.push(minoria[deMinoria]);

  return saida;
}
