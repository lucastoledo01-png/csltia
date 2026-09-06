import { renderShell } from "./shell";
import { renderLayout } from "./layout-render";
import type { Layout } from "./layout";
import { SLIDE_VARIANTS, firstVariantKey } from "./variants";
import { FORMAT_DEFAULTS } from "./format-defaults";
import { esc } from "./util";
import type { CarouselTokens } from "./tokens";
import type { CarouselFormat, FormatConfig, InstagramSlide, VariantContext } from "./types";

/**
 * Junta os defaults do formato com a config salva pelo admin. Campos ausentes
 * caem no default.
 */
export function resolveFormatConfig(
  format: CarouselFormat,
  override?: Partial<FormatConfig> | null,
): FormatConfig {
  const def = FORMAT_DEFAULTS[format];
  return {
    variantBySlideType: { ...def.variantBySlideType, ...(override?.variantBySlideType ?? {}) },
    eyebrowLabel: override?.eyebrowLabel ?? null,
    ctaText: override?.ctaText ?? null,
  };
}

/**
 * Monta o HTML de um slide. Função única usada pelo worker (render real via
 * Playwright) e pelo preview do painel (iframe no navegador) — o resultado é
 * exatamente o mesmo.
 */
export function assembleSlide(
  slide: InstagramSlide,
  opts: {
    format: CarouselFormat;
    tokens: CarouselTokens;
    formatConfig: FormatConfig;
    slideIndex: number;
    total: number;
    /** Layout desenhado à mão. Quando existe, manda — ver abaixo. */
    layout?: Layout | null;
    /** Atribuição exigida pela licença da foto, impressa sobre a arte. */
    credito?: string;
  },
): string {
  const { format, tokens, formatConfig, slideIndex, total } = opts;

  // Layout desenhado vence a variante de código, e vence sem chrome por cima:
  // quem posicionou os blocos já decidiu onde ficam marca, paginação e rodapé.
  // Injetar o cabeçalho padrão em cima seria desfazer o desenho.
  if (opts.layout && opts.layout.blocks.length > 0) {
    return renderShell(
      {
        body: renderLayout(opts.layout, slide, {
          tokens,
          eyebrowLabel: formatConfig.eyebrowLabel ?? tokens.eyebrows[format].label,
          ctaText: formatConfig.ctaText ?? tokens.cta[format].text,
          slideIndex,
          total,
        }),
        full: true,
      },
      { slideIndex, total, tokens, credito: opts.credito },
    );
  }

  const variantKey =
    slide.variant?.trim() ||
    formatConfig.variantBySlideType[slide.type] ||
    firstVariantKey(slide.type);

  const byType = SLIDE_VARIANTS[slide.type] ?? {};
  const variant = byType[variantKey] ?? Object.values(byType)[0];

  if (!variant) {
    return renderShell(
      { body: `<div class="s-mid"><div class="s-title sm">${esc(slide.title)}</div></div>` },
      { slideIndex, total, tokens, credito: opts.credito },
    );
  }

  const ctx: VariantContext = {
    format,
    tokens,
    eyebrowLabel: formatConfig.eyebrowLabel ?? tokens.eyebrows[format].label,
    ctaText: formatConfig.ctaText ?? tokens.cta[format].text,
    slideIndex,
    total,
  };

  return renderShell(variant.render(slide, ctx), { slideIndex, total, tokens, credito: opts.credito });
}
