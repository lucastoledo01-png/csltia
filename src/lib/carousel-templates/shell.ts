import { BASE_CSS } from "./base-css";
import { tokensToCss, type CarouselTokens } from "./tokens";
import { fontLinkTag } from "./fonts";
import { pad2 } from "./util";
import type { VariantOutput } from "./types";

const FOOTER_TAGLINE = "Inteligência Artificial para Redes &amp; Vendas";


/**
 * Monta o documento HTML completo de um slide, na proporção de
 * `tokens.canvas`. Para slides `full`
 * (capa, galeria) o cabeçalho/rodapé são responsabilidade da variante — ela
 * desenha o próprio chrome sobre a imagem. Para os demais, o shell injeta o
 * cabeçalho e o rodapé padrão.
 */
export function renderShell(
  out: VariantOutput,
  opts: { slideIndex: number; total: number; tokens: CarouselTokens },
): string {
  // O <link> sai das fontes que os tokens realmente escolheram: declarar uma
  // família sem requisitá-la é o bug silencioso que `fonts.ts` existe para
  // impedir.
  const f = opts.tokens.fonts;
  const fontLink = fontLinkTag([f.display, f.body, f.accent, f.mono]);
  const style = `<style>${BASE_CSS}${tokensToCss(opts.tokens)}</style>`;
  const rootClass = out.onDark ? ' class="on-dark"' : "";

  const inner = out.full
    ? `<div class="slide full">${out.body}</div>`
    : `<div class="slide">
${standardHeader(opts.slideIndex, opts.total)}
${out.body}
${standardFooter()}
</div>`;

  return `<!DOCTYPE html><html lang="pt-BR"${rootClass}><head><meta charset="UTF-8">${fontLink}${style}</head><body>${inner}</body></html>`;
}

export function standardHeader(slideIndex: number, total: number): string {
  return `<div class="s-header">
<div class="s-brand"><span class="s-badge">b.</span><span class="s-wordmark">desbuguei.ia</span></div>
<span class="s-counter">${pad2(slideIndex)} / ${pad2(total)}</span>
</div>`;
}

export function standardFooter(): string {
  return `<div class="s-footer"><span class="h">@desbuguei.ia</span><span class="t">${FOOTER_TAGLINE}</span></div>`;
}

/** Marca da conta sem contador — usada nas sobreposições das capas. */
export function overlayBrand(): string {
  return `<div class="s-header plain"><div class="s-brand"><span class="s-badge">b.</span><span class="s-wordmark">desbuguei.ia</span></div></div>`;
}
