import { esc, safeImageUrl } from "./util";
import { FONTS } from "./fonts";
import {
  conteudoDosSlots,
  type Bloco,
  type Layout,
  type SlotDeTexto,
} from "./layout";
import type { CarouselTokens } from "./tokens";
import type { InstagramSlide } from "./types";

/**
 * Renderiza um layout desenhado à mão.
 *
 * Produz o slide inteiro, não só o corpo: um layout desenhado bloco a bloco já
 * decide onde fica cabeçalho, rodapé e paginação — sobrepor o chrome padrão por
 * cima seria desfazer o desenho de quem o fez.
 *
 * ## O auto-encaixe roda no navegador, e por quê
 *
 * A largura real de um texto depende de fonte, kerning, ligaduras e de onde a
 * linha quebra. Nada disso é calculável no servidor sem reimplementar o motor
 * de texto. Como o slide já é renderizado dentro de um Chromium (Playwright, no
 * worker) e dentro de um iframe (preview do painel), o lugar certo para medir é
 * lá — o mesmo código serve aos dois, e o preview passa a mostrar exatamente o
 * que vai ser publicado, incluindo o encolhimento.
 *
 * O script é síncrono e roda antes do screenshot porque está no fim do body: o
 * Playwright espera o `load`, e a essa altura o ajuste já aconteceu.
 */

/**
 * Emite `style="…"` com o valor escapado.
 *
 * Não é zelo: as pilhas de fonte trazem aspas duplas (`"Epilogue",…`) e um
 * `style="font-family:"Epilogue"…"` **fecha o atributo na primeira aspa**. Tudo
 * que vem depois — inclusive o `font-size` — vira atributo inválido e some. O
 * sintoma é um slide com o texto em 16px no lugar de 96px, e ele só apareceria
 * no post publicado.
 */
function atributoDeEstilo(estilo: string): string {
  return `style="${esc(estilo)}"`;
}

function estiloComum(b: Bloco): string {
  const partes = [
    `left:${b.x}%`,
    `top:${b.y}%`,
    `width:${b.w}%`,
    `height:${b.h}%`,
    `z-index:${b.z}`,
  ];

  if (b.opacidade !== 1) partes.push(`opacity:${b.opacidade}`);
  if (b.raio) partes.push(`border-radius:${b.raio}px`);
  if (b.fundo) partes.push(`background:${b.fundo}`);
  if (b.rotacao) partes.push(`transform:rotate(${b.rotacao}deg)`);
  if (b.padding) partes.push(`padding:${b.padding}px`);

  return partes.join(";");
}

function familia(b: Bloco, tokens: CarouselTokens): string {
  // O bloco escolhe um papel ("display", "body"), não uma fonte. Quem decide
  // qual família é o papel é o tema — trocar a fonte do tema reflete em todos
  // os layouts sem reabrir nenhum.
  return FONTS[tokens.fonts[b.fonte]]?.stack ?? FONTS[tokens.fonts.body]?.stack ?? "sans-serif";
}

/**
 * Pinta o trecho de destaque dentro do texto.
 *
 * O escape vem primeiro, nos dois, e a busca é feita já no texto escapado: se
 * eu injetasse o `<span>` antes de escapar, o escape comeria a própria tag; se
 * escapasse depois, o destaque com `&` ou `<` não casaria. Escapar os dois e
 * procurar um dentro do outro é o único jeito em que as duas coisas continuam
 * verdadeiras.
 *
 * Só a primeira ocorrência. Uma manchete que repete a palavra ficaria com o
 * texto inteiro salpicado de cor, que é o oposto de destacar.
 */
function comRealce(textoEscapado: string, destaque: string, cor: string): string {
  const alvo = esc(destaque.trim());
  if (!alvo) return textoEscapado;

  const posicao = textoEscapado.toLowerCase().indexOf(alvo.toLowerCase());
  if (posicao < 0) return textoEscapado;

  const antes = textoEscapado.slice(0, posicao);
  const meio = textoEscapado.slice(posicao, posicao + alvo.length);
  const depois = textoEscapado.slice(posicao + alvo.length);

  return `${antes}<span style="color:${esc(cor)}">${meio}</span>${depois}`;
}

function blocoDeTexto(
  b: Bloco,
  texto: string,
  tokens: CarouselTokens,
  destaque = "",
): string {
  // Bloco de texto vazio não deixa buraco: some. Um slot que a IA não
  // preencheu — `destaque` num slide sem destaque — apareceria como uma caixa
  // de fundo flutuando no meio do post.
  const conteudo = b.textoFixo.trim() || texto.trim();
  if (!conteudo) return "";

  const justificaVertical =
    b.alinhamentoVertical === "center"
      ? "center"
      : b.alinhamentoVertical === "end"
        ? "flex-end"
        : "flex-start";

  const estilo = [
    estiloComum(b),
    "display:flex",
    "flex-direction:column",
    `justify-content:${justificaVertical}`,
    `font-family:${familia(b, tokens)}`,
    `font-size:${b.tamanho}px`,
    `font-weight:${b.peso}`,
    `line-height:${b.entrelinha}`,
    `letter-spacing:${b.espacamento}em`,
    `color:${b.cor}`,
    `text-align:${b.alinhamento}`,
    b.caixaAlta ? "text-transform:uppercase" : "",
    b.ajuste === "cortar" ? "overflow:hidden" : "",
  ]
    .filter(Boolean)
    .join(";");

  const escapado = esc(conteudo).replace(/\n/g, "<br>");
  const corpo = b.realcarDestaque
    ? comRealce(escapado, destaque, b.corDoRealce || tokens.colors.accent)
    : escapado;

  return (
    `<div class="lay-bloco lay-texto" data-ajuste="${b.ajuste}" ` +
    `data-min="${b.tamanhoMinimo}" data-max="${b.tamanho}" ` +
    `${atributoDeEstilo(estilo)}><span>${corpo}</span></div>`
  );
}

function blocoDeImagem(b: Bloco, urlDoFundo: string): string {
  // `safeImageUrl` aceita só https: e data:. Um bloco com URL fixa é editado à
  // mão no painel, e `javascript:` num `src` seria script no documento que o
  // Playwright executa.
  const url = safeImageUrl(b.imagem === "fixa" ? b.imagemUrl : urlDoFundo);
  if (!url) return "";

  // `veu` é o que torna texto sobre foto legível sem depender da foto. Sem ele,
  // uma manchete branca some numa imagem clara — e qual imagem vai sair é
  // decisão da IA, não de quem desenhou o layout.
  // Degradê da base é o padrão dos posts de notícia: escurece onde o texto
  // fica e não toca o rosto na foto. O sólido lava a imagem inteira.
  const pintura =
    b.veuTipo === "base"
      ? `linear-gradient(to top, rgba(0,0,0,${b.veu}) 0%, ` +
        `rgba(0,0,0,${(b.veu * 0.88).toFixed(3)}) 30%, ` +
        `rgba(0,0,0,${(b.veu * 0.42).toFixed(3)}) 52%, rgba(0,0,0,0) 76%)`
      : `rgba(0,0,0,${b.veu})`;

  const veu =
    b.veu > 0
      ? `<div style="position:absolute;inset:0;background:${pintura};` +
        `border-radius:${b.raio}px"></div>`
      : "";

  return (
    `<div class="lay-bloco" ${atributoDeEstilo(`${estiloComum(b)};overflow:hidden`)}>` +
    `<img src="${esc(url)}" alt="" ` +
    `style="width:100%;height:100%;object-fit:${b.encaixe};display:block">` +
    veu +
    `</div>`
  );
}

function blocoDeForma(b: Bloco): string {
  return `<div class="lay-bloco" ${atributoDeEstilo(estiloComum(b))}></div>`;
}

/**
 * Ajuste de texto, executado no navegador.
 *
 * `encolher` reduz a fonte em passos de 2px até o conteúdo caber, com o piso
 * declarado no bloco — abaixo dele o texto ficaria ilegível, e aí é melhor
 * cortar o excesso do que publicar algo que ninguém lê.
 *
 * **A medida é do `<span>`, não do bloco.** O `scrollHeight` de um bloco cuja
 * altura é fracionária (22% de 1440 = 316,8px) vem 2 a 4px acima do
 * `clientHeight` por arredondamento, independentemente do conteúdo — comparar
 * os dois dava "não coube" sempre, e toda manchete era encolhida até o ponto
 * em que o ruído do arredondamento por acaso sumia. O `<span>` tem altura real
 * de texto e não sofre disso.
 */
const SCRIPT_DE_AJUSTE = `
(function () {
  function ajustar() {
    var blocos = document.querySelectorAll('.lay-texto[data-ajuste="encolher"]');
    for (var i = 0; i < blocos.length; i++) {
      var el = blocos[i];
      var span = el.firstElementChild;
      if (!span) continue;

      var estilo = window.getComputedStyle(el);
      var padY = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom);
      var padX = parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight);
      var alturaDisponivel = el.clientHeight - padY;
      var larguraDisponivel = el.clientWidth - padX;

      var min = parseFloat(el.getAttribute('data-min')) || 20;
      var tamanho = parseFloat(el.getAttribute('data-max')) || parseFloat(estilo.fontSize);
      el.style.fontSize = tamanho + 'px';

      var voltas = 0;
      while (
        (span.scrollHeight > alturaDisponivel + 1 || span.scrollWidth > larguraDisponivel + 1) &&
        tamanho > min &&
        voltas < 200
      ) {
        tamanho -= 2;
        el.style.fontSize = tamanho + 'px';
        voltas++;
      }

      if (span.scrollHeight > alturaDisponivel + 1) el.style.overflow = 'hidden';
    }
    document.documentElement.setAttribute('data-ajuste-pronto', '1');
  }

  // Depois das fontes, sempre. Medir com a fonte de fallback da largura errada
  // -- e o erro nao e pequeno nem constante: as metricas do substituto nao tem
  // relacao com as da fonte real, entao a mesma manchete encolhia de um jeito
  // num caso e de outro no seguinte.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(ajustar).catch(ajustar);
  } else {
    ajustar();
  }
})();
`.trim();

export function renderLayout(
  layout: Layout,
  slide: InstagramSlide,
  ctx: {
    tokens: CarouselTokens;
    eyebrowLabel: string;
    ctaText: string;
    slideIndex: number;
    total: number;
  },
): string {
  const slots = conteudoDosSlots(slide, ctx);
  const fundo = slide.bg_image_url ?? "";

  const corpo = [...layout.blocks]
    .sort((a, b) => a.z - b.z)
    .map((b) => {
      if (b.tipo === "imagem") return blocoDeImagem(b, fundo);
      if (b.tipo === "forma") return blocoDeForma(b);
      return blocoDeTexto(
        b,
        slots[(b.slot ?? "titulo") as SlotDeTexto] ?? "",
        ctx.tokens,
        slots.destaque,
      );
    })
    .join("");

  return (
    `<div class="lay-canvas" ` +
    atributoDeEstilo(
      `position:relative;width:100%;height:100%;overflow:hidden;background:${ctx.tokens.colors.bg}`,
    ) +
    `>${corpo}</div><script>${SCRIPT_DE_AJUSTE}</script>`
  );
}

/** CSS dos blocos. Vai no shell junto com o resto. */
export const CSS_DO_LAYOUT = `
.lay-bloco { position: absolute; box-sizing: border-box; }
/*
 * break-word e nao anywhere: os dois quebram palavra longa demais, mas
 * anywhere tambem entra no calculo de largura minima do elemento, e isso fazia
 * o auto-encaixe achar que o texto nao cabia quando cabia -- uma manchete curta
 * desenhada em 96px saia publicada em 70px, sem motivo visivel.
 * (Sem crase e sem acento aqui: este bloco vive dentro de um template literal.)
 */
.lay-texto { overflow-wrap: break-word; }
.lay-texto > span { display: block; width: 100%; }
`.trim();
