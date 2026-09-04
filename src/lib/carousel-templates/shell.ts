import { BASE_CSS } from "./base-css";
import { tokensToCss, type CarouselTokens } from "./tokens";
import { cantosEditorial, chromeFooter, chromeHeader } from "./chrome";
import { fontLinkTag } from "./fonts";
import { CSS_DO_LAYOUT } from "./layout-render";
import type { VariantOutput } from "./types";


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
  const style = `<style>${BASE_CSS}${CSS_DO_LAYOUT}${tokensToCss(opts.tokens)}</style>`;
  const rootClass = out.onDark ? ' class="on-dark"' : "";

  const chrome = opts.tokens.chrome;
  // Os colchetes de corte são do sistema impresso e emolduram a arte inteira,
  // então valem também no slide sangrado — é neles que o design se reconhece.
  const cantos = chrome === "editorial" ? cantosEditorial() : "";

  const inner = out.full
    ? `<div class="slide full">${cantos}${out.body}</div>`
    : `<div class="slide">
${cantos}
${chromeHeader(chrome, opts.slideIndex, opts.total)}
${out.body}
${chromeFooter(chrome, opts.slideIndex, opts.total)}
</div>`;

  return `<!DOCTYPE html><html lang="pt-BR"${rootClass}><head><meta charset="UTF-8">${fontLink}${style}</head><body>${inner}</body></html>`;
}

/** Marca da conta sem contador — usada nas sobreposições das capas. */
export function overlayBrand(): string {
  return `<div class="s-header plain"><div class="s-brand"><span class="s-badge">us</span><span class="s-wordmark">immigra.us</span></div></div>`;
}
