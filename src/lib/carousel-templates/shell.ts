import { BASE_CSS } from "./base-css";
import { tokensToCss, type CarouselTokens } from "./tokens";
import { pad2 } from "./util";
import type { VariantOutput } from "./types";

const FOOTER_TAGLINE = "Inteligência Artificial para Redes &amp; Vendas";

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  "family=JetBrains+Mono:wght@400;500;700&" +
  "family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,600;1,700&" +
  'family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">';

/**
 * Monta o documento HTML completo de um slide (1080×1350). Para slides `full`
 * (capa, galeria) o cabeçalho/rodapé são responsabilidade da variante — ela
 * desenha o próprio chrome sobre a imagem. Para os demais, o shell injeta o
 * cabeçalho e o rodapé padrão.
 */
export function renderShell(
  out: VariantOutput,
  opts: { slideIndex: number; total: number; tokens: CarouselTokens },
): string {
  const style = `<style>${BASE_CSS}${tokensToCss(opts.tokens)}</style>`;
  const rootClass = out.onDark ? ' class="on-dark"' : "";

  const inner = out.full
    ? `<div class="slide full">${out.body}</div>`
    : `<div class="slide">
${standardHeader(opts.slideIndex, opts.total)}
${out.body}
${standardFooter()}
</div>`;

  return `<!DOCTYPE html><html lang="pt-BR"${rootClass}><head><meta charset="UTF-8">${FONT_LINK}${style}</head><body>${inner}</body></html>`;
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
