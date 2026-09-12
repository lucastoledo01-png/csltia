import { BASE_CSS } from "./base-css";
import { tokensToCss, type CarouselTokens } from "./tokens";
import { cantosEditorial, chromeFooter, chromeHeader, type Affordance } from "./chrome";
import { fontLinkTag } from "./fonts";
import { CSS_DO_LAYOUT, SCRIPT_DE_AJUSTE } from "./layout-render";
import { esc } from "./util";
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
  opts: {
    slideIndex: number;
    total: number;
    tokens: CarouselTokens;
    credito?: string;
    affordance?: Affordance;
    /**
     * Moldura discreta: sem colchetes de corte e sem contador no cabeçalho.
     *
     * A capa do carrossel é sangrada e não tem moldura nenhuma. Quando o miolo
     * vinha com colchetes, contador em cima E pontos embaixo, a peça mudava de
     * regra na virada do slide 1 para o 2, e a mesma paginação aparecia duas
     * vezes. Aqui o miolo segue a capa: continuidade fica só nos pontos.
     */
    molduraDiscreta?: boolean;
  },
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
  const cantos = chrome === "editorial" && !opts.molduraDiscreta ? cantosEditorial() : "";

  /*
   * O crédito da licença é impresso na arte, não guardado num campo.
   *
   * CC BY e CC BY-SA exigem atribuição visível junto da obra. Guardar o autor
   * numa coluna do banco cumpre o registro e não cumpre a licença: quem vê o
   * post não vê a coluna. Por isso a tira sai no PNG, e sai por último, sobre
   * qualquer variante.
   */
  const credito = (opts.credito ?? "").trim();
  const tira = credito ? `<div class="s-credito">${esc(credito)}</div>` : "";

  const inner = out.full
    ? `<div class="slide full">${cantos}${out.body}${tira}</div>`
    : `<div class="slide">
${cantos}
${chromeHeader(chrome, opts.slideIndex, opts.molduraDiscreta ? 1 : opts.total)}
${out.body}
${chromeFooter(chrome, opts.slideIndex, opts.total, opts.affordance)}
${tira}
</div>`;

  /*
   * O ajuste de corpo do texto e comportamento do documento, nao do layout.
   *
   * Ele vivia dentro de `renderLayout`, entao so existia quando havia um
   * desenho salvo no painel. A capa de texto da noticia usa a mesma marcacao
   * (`.lay-texto[data-ajuste]`) e vem da variante de codigo: sem o script, o
   * `data-max` nunca era aplicado e a manchete saia no corpo padrao de 16px.
   *
   * Rodar sempre e barato: sem bloco marcado, o `querySelectorAll` nao acha
   * nada e a funcao so marca o documento como pronto.
   */
  return `<!DOCTYPE html><html lang="pt-BR"${rootClass}><head><meta charset="UTF-8">${fontLink}${style}</head><body>${inner}<script>${SCRIPT_DE_AJUSTE}</script></body></html>`;
}

/** Marca da conta sem contador — usada nas sobreposições das capas. */
export function overlayBrand(): string {
  return `<div class="s-header plain"><div class="s-brand"><span class="s-badge">us</span><span class="s-wordmark">imigra.us</span></div></div>`;
}
