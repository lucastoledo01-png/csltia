/**
 * O texto do carrossel virando slides desenháveis.
 *
 * Este módulo é a fronteira entre o que o modelo escreveu e o que o renderer
 * entende. Ele não decide conteúdo e não decide forma: a forma veio da
 * estrutura, o conteúdo veio da copy, e o que falta é traduzir papel em
 * `InstagramSlide` com a variante certa.
 *
 * A capa e o fechamento são montados AQUI, em código, e não pelo modelo. A capa
 * é a manchete que a guarda já ancorou; o fechamento é o CTA da keyword
 * canônica.
 */

import type { InstagramSlide } from "../../../carousel-templates/types";
import type { EntradaDaCapa, FotoDaCapa } from "../arte";
import type { CopyDoCarrossel, SlideDeTexto } from "./copy";
import { papeisDoModelo, type PapelDeSlide } from "./estrutura";
import { destaqueEhTrechoDaManchete } from "./guarda";

/**
 * As variantes de desenho de cada tipo de slide do carrossel.
 *
 * Declaradas, e não deixadas para o `firstVariantKey` do renderer. A resolução
 * por primeira-variante-do-tipo devolveria `terminal_claro` para um passo, que
 * é um desenho de terminal de linha de comando, herdado do nicho de tecnologia:
 * um post sobre etapas de imigração sairia com cara de tutorial de programação.
 * Determinismo aqui é o que o item 9 do pedido pede.
 */
const VARIANTE_POR_TIPO: Record<string, string> = {
  cover: "noticia_sem_foto",
  content: "conteudo_editorial",
  step: "numerado_claro",
  quote_highlight: "ressalva_editorial",
  practical_impact: "conteudo_editorial",
  tip: "destaque_claro",
  cta: "keyword_claro",
};

function slideVazio(index: number, type: string, variant: string): InstagramSlide {
  return {
    index,
    type,
    eyebrow: "",
    title: "",
    body: "",
    bullet_points: [],
    highlight_text: "",
    variant,
    cover_variant: "dark_speaker",
    headline_style: "clean",
    /* Vazio sempre: é o campo que o renderer antigo usa como busca de imagem. */
    cover_image_prompt: "",
    bg_image_url: "",
    cta_text: "",
  } as InstagramSlide;
}

/**
 * O slide de conteúdo, a partir do que o modelo escreveu para aquele papel.
 *
 * A comparação é o único caso que remaneja campos: os dois lados vão em
 * `bullet_points` e os rótulos em `highlight_text`, porque é o que
 * `InstagramSlide` oferece sem acrescentar campo ao schema que o caminho legado
 * também valida.
 */
export function slideDoPapel(
  papel: PapelDeSlide,
  texto: SlideDeTexto,
  index: number,
  eixo: string,
): InstagramSlide {
  const variante = papel.variante ?? VARIANTE_POR_TIPO[papel.tipo] ?? "";
  const slide = slideVazio(index, papel.tipo, variante);

  slide.eyebrow = rotuloDoPapel(papel, eixo);
  slide.title = texto.titulo;

  if (papel.variante === "comparacao_duas_colunas") {
    slide.bullet_points = [texto.lado_a, texto.lado_b].filter(Boolean);
    slide.highlight_text = [texto.lado_a ? "de um lado" : "", texto.lado_b ? "do outro" : ""]
      .filter(Boolean)
      .join(" | ");
    slide.body = texto.corpo;
    return slide;
  }

  slide.body = texto.corpo;
  slide.bullet_points = (texto.bullets ?? []).filter(Boolean);

  return slide;
}

/**
 * A sobrancelha de cada papel.
 *
 * O eixo editorial serve à capa, e a capa é a única que o recebe. Nos slides de
 * conteúdo, o rótulo diz o que aquele slide faz: é o que orienta quem chegou no
 * slide 4 sem ter lido o 1.
 */
function rotuloDoPapel(papel: PapelDeSlide, eixo: string): string {
  if (papel.tipo === "cover") return eixo;

  const porPapel: Record<string, string> = {
    "o que é": "O QUE É",
    "como funciona": "COMO FUNCIONA",
    "para quem": "PARA QUEM",
    ressalva: "ATENÇÃO",
    atenção: "ATENÇÃO",
    resposta: "RESPOSTA",
    contexto: "CONTEXTO",
    resumo: "RESUMO",
    "lado A": "PRIMEIRO",
    "lado B": "SEGUNDO",
    "diferença 1": "A DIFERENÇA",
    "diferença 2": "OUTRA DIFERENÇA",
  };

  if (porPapel[papel.papel]) return porPapel[papel.papel];
  if (papel.tipo === "step") return papel.papel.toUpperCase();
  return "";
}

export type EntradasDoCarrossel = {
  entradas: EntradaDaCapa[];
  /** Os papéis efetivamente desenhados, na ordem, incluindo capa e fechamento. */
  papeis: PapelDeSlide[];
};

/**
 * O carrossel inteiro como entradas de render, na ordem de leitura.
 *
 * `total` vai em todas as entradas porque é ele que liga a paginação discreta
 * do cabeçalho: com `total` igual a 1 o chrome não desenha indicador nenhum, o
 * que é exatamente o certo para a peça única e exatamente errado para um
 * carrossel de cinco.
 */
export function entradasDoCarrossel(
  copy: CopyDoCarrossel,
  papeis: PapelDeSlide[],
  opcoes: { eixo: string; asset: FotoDaCapa | null; motivoSemFoto: string },
): EntradasDoCarrossel {
  const doModelo = papeisDoModelo(papeis);
  const total = papeis.length;
  const entradas: EntradaDaCapa[] = [];

  papeis.forEach((papel, i) => {
    const posicao = i + 1;

    if (papel.tipo === "cover") {
      /*
       * A capa passa pelo caminho normal da arte, com foto e crédito.
       *
       * É o mesmo `montarCapaDoPost` do post de imagem única, com o mesmo
       * tratamento de foto e de crédito de licença. O que muda é a variante:
       * `estiloDaCapa: "carrossel"` pede a faixa escura com a frase-chave
       * marcada, em vez da serifa sobre creme da notícia.
       *
       * A diferença é deliberada, e substitui a regra anterior de capa única.
       * Notícia do dia e material de referência são dois produtos no mesmo
       * feed: quando as duas capas eram iguais, o leitor só descobria qual era
       * qual depois de ler. O que continua igual é tudo o que identifica a
       * marca: colchetes de corte, arroba, tipografia e paleta.
       */
      entradas.push({
        headline: copy.headline,
        eixo: opcoes.eixo,
        asset: opcoes.asset,
        motivoSemFoto: opcoes.motivoSemFoto,
        posicao,
        total,
        affordance: "discreta",
        estiloDaCapa: "carrossel",
        destaque: copy.destaque ?? "",
        molduraDiscreta: true,
      });
      return;
    }

    if (papel.tipo === "cta") {
      const slide = slideVazio(posicao, "cta", VARIANTE_POR_TIPO.cta);
      /*
       * O título do fechamento é sempre texto ANCORADO.
       *
       * `copy.destaque` só entra se for um trecho literal da manchete, que é o
       * que a guarda ancorou: trecho de texto ancorado está ancorado. Sem isso,
       * um destaque com número inventado ia impresso no último slide sem
       * nenhuma conferência, e era o caso em três de cada quatro posts, porque
       * o slide de fechamento existe sempre que há CTA.
       *
       * Quando o destaque não serve, a manchete inteira serve, e a peça sai com
       * um título mais longo em vez de um título não conferido.
       *
       * O texto do CTA é o `copy.cta`, que veio de `ctaDaPosicao` com a keyword
       * canônica: sem automação escutando, este slide não existe, porque
       * `papeisPara` não o inclui.
       */
      slide.title = destaqueEhTrechoDaManchete(copy.destaque, copy.headline)
        ? copy.destaque || copy.headline
        : copy.headline;
      slide.cta_text = copy.cta;
      slide.highlight_text = palavraDoCta(copy.cta);
      entradas.push({
        headline: copy.headline,
        asset: null,
        slidePronto: slide,
        posicao,
        total,
        affordance: "discreta",
        molduraDiscreta: true,
      });
      return;
    }

    const indiceNoModelo = doModelo.indexOf(papel);
    const texto = copy.slides[indiceNoModelo];
    if (!texto) return;

    entradas.push({
      headline: copy.headline,
      asset: null,
      slidePronto: slideDoPapel(papel, texto, posicao, opcoes.eixo),
      posicao,
      total,
      /*
       * Paginação sim, convite escrito não.
       *
       * O chrome de `noticia` é o editorial, e o rodapé dele escreve
       * "SWIPE" com seta em toda peça de mais de um slide. Na peça única
       * isso nunca apareceu porque `total` é 1; no primeiro carrossel
       * desenhado apareceu em todos os slides.
       */
      affordance: "discreta",
      molduraDiscreta: true,
    });
  });

  return { entradas, papeis };
}

/**
 * A palavra que a pessoa comenta, extraída do CTA já montado.
 *
 * Extrair em vez de receber é de propósito: a keyword chega aqui dentro de uma
 * frase que `ctaDaPosicao` montou, e passá-la por fora abriria a porta para o
 * slide imprimir uma palavra e a legenda pedir outra. Se o padrão não casar, o
 * slide sai sem a palavra em destaque, o que é feio e honesto; imprimir um
 * palpite seria pedir para comentar algo que o listener não escuta.
 */
export function palavraDoCta(cta: string): string {
  const m = /\bcomente\s+([A-Z][A-Z0-9]{1,19})\b/i.exec(cta ?? "");
  return m ? m[1].toUpperCase() : "";
}
