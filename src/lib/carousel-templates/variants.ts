import { esc, pad2, safeImageUrl } from "./util";
import { overlayBrand } from "./shell";
import type {
  InstagramSlide,
  InstagramSlideType,
  SlideVariant,
  VariantContext,
  VariantOutput,
} from "./types";

/**
 * Catálogo de variantes de layout por tipo de slide. O painel do admin escolhe
 * qual usar por formato; nada aqui é editável pelo painel (só código).
 *
 * Toda variante compõe as primitivas do `base-css.ts` — não declara CSS novo.
 * O tema (cores/tipo) vem das `var(--s-*)`, então as variantes raramente
 * precisam do `ctx.tokens`.
 */

function eyebrow(ctx: VariantContext, slide: InstagramSlide): string {
  const label = slide.eyebrow?.trim() || ctx.eyebrowLabel;
  return `<span class="s-eyebrow eb-${ctx.format}">${esc(label)}</span>`;
}

function photo(url: string, placeholderClass = "ph"): string {
  const safe = safeImageUrl(url);
  if (safe) return `<div class="s-photo" style="background-image:url('${safe.replace(/'/g, "%27")}')"></div>`;
  return `<div class="s-photo ${placeholderClass}"></div>`;
}

function bulletsHtml(points: string[]): string {
  return points
    .filter(Boolean)
    .map((p) => `<div class="s-bullet"><span class="i">✓</span><span class="x">${esc(p)}</span></div>`)
    .join("");
}

function ctaButton(ctx: VariantContext, slide: InstagramSlide): string {
  const keyword = slide.highlight_text?.trim();
  if (keyword) return `Comente <span class="s-kw">${esc(keyword.toUpperCase())}</span>`;
  return esc(slide.cta_text?.trim() || ctx.ctaText);
}

// --------------------------------------------------------------------------
// CAPA
// --------------------------------------------------------------------------

const coverFullbleedPortrait: SlideVariant = {
  key: "fullbleed_portrait",
  label: "Retrato full-bleed + card social",
  render: (slide): VariantOutput => ({
    full: true,
    onDark: true,
    body: `
${photo(slide.bg_image_url)}
<div class="s-grad"></div>
<div class="s-overlay">
  ${overlayBrand()}
  <div>
    <div class="s-profile" style="margin-bottom:22px">
      <span class="s-avatar">b.</span>
      <div><div class="s-pname">Desbuguei IA <span class="s-check">✓</span></div><div class="s-phandle">@desbuguei.ia</div></div>
    </div>
    <div class="s-title" style="color:#fff;text-shadow:0 4px 20px rgba(0,0,0,0.7)">${esc(slide.title)}</div>
  </div>
  <div class="s-swipe">Arrasta que eu te atualizo em 1 minuto →</div>
</div>`,
  }),
};

const coverBrandCard: SlideVariant = {
  key: "brand_card",
  label: "Fundo claro + card da marca",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title">${esc(slide.title)}</div>
  ${slide.body ? `<div class="s-sub">${esc(slide.body)}</div>` : ""}
  <div class="s-card dark" style="min-height:360px;justify-content:flex-end">
    <div class="s-phandle" style="color:#a1a1aa">@desbuguei.ia</div>
    <div style="font-family:'Playfair Display',serif;font-size:40px;font-weight:800;color:#fff">${esc(slide.eyebrow || "Desbuguei Intel")}</div>
  </div>
</div>`,
  }),
};

const coverResultShowcase: SlideVariant = {
  key: "result_showcase",
  label: "Resultado + selo de passos",
  render: (slide): VariantOutput => ({
    full: true,
    onDark: true,
    body: `
${photo(slide.bg_image_url, "ph")}
<div class="s-grad"></div>
<div class="s-overlay">
  ${overlayBrand()}
  <div style="display:flex;flex-direction:column;gap:22px">
    ${slide.eyebrow ? `<span class="step-count">${esc(slide.eyebrow)}</span>` : ""}
    <div class="s-title" style="color:#fff;text-shadow:0 4px 20px rgba(0,0,0,0.7)">${esc(slide.title)}</div>
  </div>
  <div class="s-swipe">Passo a passo completo →</div>
</div>`,
  }),
};

const coverResultFullbleed: SlideVariant = {
  key: "result_fullbleed",
  label: "Só o resultado (formato prompt)",
  render: (slide, ctx): VariantOutput => ({
    full: true,
    onDark: true,
    body: `
${photo(slide.bg_image_url, "ph")}
<div class="s-grad soft"></div>
<span class="prompt-badge">${esc(ctx.eyebrowLabel)}</span>
<div class="s-overlay">
  ${overlayBrand()}
  <div class="s-title" style="color:#fff;text-shadow:0 4px 20px rgba(0,0,0,0.8)">${esc(slide.title)}</div>
</div>`,
  }),
};

// --------------------------------------------------------------------------
// INTRO / CONTEÚDO
// --------------------------------------------------------------------------

const introBigStatement: SlideVariant = {
  key: "big_statement",
  label: "Declaração grande",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title sm">${esc(slide.title)}</div>
  ${slide.body ? `<div class="s-sub">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

const contentBullets: SlideVariant = {
  key: "bullets",
  label: "Título + bullets no cartão",
  render: (slide): VariantOutput => ({
    body: `
<div class="s-mid">
  <span class="s-label lbl-step">${esc(slide.eyebrow || "DETALHES")}</span>
  <div class="s-title sm">${esc(slide.title)}</div>
  ${slide.body ? `<div class="s-sub">${esc(slide.body)}</div>` : ""}
  ${slide.bullet_points.length ? `<div class="s-card">${bulletsHtml(slide.bullet_points)}</div>` : ""}
</div>`,
  }),
};

const contentHighlight: SlideVariant = {
  key: "highlight",
  label: "Título + parágrafo em destaque",
  render: (slide): VariantOutput => ({
    body: `
<div class="s-mid">
  <span class="s-label lbl-step">${esc(slide.eyebrow || "DETALHES")}</span>
  <div class="s-title sm">${esc(slide.title)}</div>
  <div class="s-card"><div class="p">${esc(slide.body)}</div></div>
</div>`,
  }),
};

const practicalGoldDark: SlideVariant = {
  key: "gold_dark_card",
  label: "Cartão escuro “como aplicar”",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  <span class="s-label lbl-step">${esc(slide.eyebrow || `PASSO ${pad2(slide.index)} DE ${pad2(ctx.total)}`)}</span>
  <div class="s-title sm">${esc(slide.title)}</div>
  <div class="s-card dark">
    <span class="s-label lbl-gold">\u{1F4A1} COMO APLICAR EM REDES &amp; VENDAS</span>
    <div class="p">${esc(slide.body)}</div>
  </div>
</div>`,
  }),
};

const quotePull: SlideVariant = {
  key: "pull_quote",
  label: "Citação em destaque",
  render: (slide): VariantOutput => ({
    body: `
<div class="s-mid">
  <div class="s-title" style="font-style:italic">“${esc(slide.body || slide.title)}”</div>
  ${slide.body ? `<div class="s-sub">${esc(slide.title)}</div>` : ""}
</div>`,
  }),
};

// --------------------------------------------------------------------------
// TUTORIAL
// --------------------------------------------------------------------------

const stepCodeBlock: SlideVariant = {
  key: "code_block",
  label: "Passo com bloco de código",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title sm">${esc(slide.title)}</div>
  ${slide.bullet_points[0] ? `<div class="s-code">${esc(slide.bullet_points[0])}</div>` : ""}
  ${slide.body ? `<div class="s-sub">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

const stepChecklist: SlideVariant = {
  key: "checklist",
  label: "Passo com checklist",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title sm">${esc(slide.title)}</div>
  ${
    slide.bullet_points.length
      ? `<div class="s-card">${bulletsHtml(slide.bullet_points)}</div>`
      : slide.body
        ? `<div class="s-card"><div class="p">${esc(slide.body)}</div></div>`
        : ""
  }
</div>`,
  }),
};

const tipLightCard: SlideVariant = {
  key: "light_card",
  label: "Dica de fechamento",
  render: (slide): VariantOutput => ({
    body: `
<div class="s-mid">
  <span class="s-label lbl-step">${esc(slide.eyebrow || "FECHAMENTO")}</span>
  <div class="s-title sm">${esc(slide.title)}</div>
  <div class="s-card"><div class="p">${esc(slide.body)}</div></div>
</div>`,
  }),
};

// --------------------------------------------------------------------------
// PROMPT
// --------------------------------------------------------------------------

const galleryImageCaption: SlideVariant = {
  key: "image_caption",
  label: "Imagem + legenda curta",
  render: (slide, ctx): VariantOutput => ({
    full: true,
    onDark: true,
    body: `
${photo(slide.bg_image_url, "ph")}
<div class="s-grad soft"></div>
<div class="s-overlay" style="justify-content:space-between">
  <span class="s-counter" style="align-self:flex-end;background:rgba(255,255,255,0.16);color:#fff">${pad2(slide.index)} / ${pad2(ctx.total)}</span>
  ${slide.title ? `<div class="gallery-cap">${esc(slide.title)}</div>` : ""}
</div>`,
  }),
};

const personalizationPromptSwap: SlideVariant = {
  key: "prompt_swap",
  label: "Prompt base com campo a trocar",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title sm">${esc(slide.title)}</div>
  ${slide.body ? `<div class="s-code">${esc(slide.body)}</div>` : ""}
  ${slide.bullet_points[0] ? `<div class="s-sub">${esc(slide.bullet_points[0])}</div>` : ""}
</div>`,
  }),
};

// --------------------------------------------------------------------------
// CTA
// --------------------------------------------------------------------------

const ctaDarkCard: SlideVariant = {
  key: "dark_card",
  label: "Cartão escuro com botão",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-cta">
  <span class="ico">\u{1F4E9}</span>
  <div class="t">${esc(slide.title)}</div>
  ${slide.body ? `<div class="b">${esc(slide.body)}</div>` : ""}
  <div class="btn">${ctaButton(ctx, slide)}</div>
</div>`,
  }),
};

// --------------------------------------------------------------------------

export const SLIDE_VARIANTS: Record<InstagramSlideType, Record<string, SlideVariant>> = {
  cover: {
    fullbleed_portrait: coverFullbleedPortrait,
    brand_card: coverBrandCard,
    result_showcase: coverResultShowcase,
    result_fullbleed: coverResultFullbleed,
  },
  intro: { big_statement: introBigStatement },
  content: { bullets: contentBullets, highlight: contentHighlight },
  quote_highlight: { pull_quote: quotePull },
  practical_impact: { gold_dark_card: practicalGoldDark },
  step: { code_block: stepCodeBlock, checklist: stepChecklist },
  tip: { light_card: tipLightCard },
  gallery: { image_caption: galleryImageCaption },
  personalization: { prompt_swap: personalizationPromptSwap },
  cta: { dark_card: ctaDarkCard },
};

/** `{ cover: [{key,label},…], … }` — o que o painel do admin lista. */
export function variantCatalog(): Record<string, Array<{ key: string; label: string }>> {
  const out: Record<string, Array<{ key: string; label: string }>> = {};
  for (const [slideType, variants] of Object.entries(SLIDE_VARIANTS)) {
    out[slideType] = Object.values(variants).map((v) => ({ key: v.key, label: v.label }));
  }
  return out;
}

export function firstVariantKey(slideType: InstagramSlideType): string {
  const variants = SLIDE_VARIANTS[slideType];
  const keys = variants ? Object.keys(variants) : [];
  return keys[0] ?? "";
}
