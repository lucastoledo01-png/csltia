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

/**
 * Divide o título em duas linhas: a primeira em display pesada, a segunda em
 * serifa itálica na cor de destaque. É a assinatura do design impresso, e o
 * que faz uma capa parecer capa e não texto grande.
 *
 * A IA já pode dizer qual é o trecho de destaque em `highlight_text`. Quando
 * não diz, o corte cai no meio das palavras — determinístico de propósito: o
 * mesmo título tem que render sempre o mesmo slide, senão o preview do painel
 * e o post publicado divergem.
 */
export function dividirTitulo(titulo: string, destaque?: string): { forte: string; italico: string } {
  const t = String(titulo ?? "").trim();
  const d = String(destaque ?? "").trim();

  if (d && t.toLowerCase().endsWith(d.toLowerCase())) {
    return { forte: t.slice(0, t.length - d.length).trim(), italico: d };
  }

  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length < 4) return { forte: t, italico: "" };

  const corte = Math.ceil(palavras.length / 2);
  return { forte: palavras.slice(0, corte).join(" "), italico: palavras.slice(corte).join(" ") };
}

function tituloHtml(slide: InstagramSlide, classe = ""): string {
  const { forte, italico } = dividirTitulo(slide.title, slide.highlight_text);
  const segunda = italico ? `<span class="it">${esc(italico)}</span>` : "";
  return `<div class="e-title${classe ? " " + classe : ""}">${esc(forte)}${segunda}</div>`;
}

/** Marca de abertura da capa — o mesmo asterisco/sol do design. */
function marcaEditorial(): string {
  return `<div class="e-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.4v3M12 18.6v3M2.4 12h3M18.6 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/></svg></div>`;
}

/**
 * Linhas do terminal. A primeira vira o comando (em destaque); as demais, a
 * saída. Sem linha nenhuma o cartão não é desenhado — melhor um slide simples
 * que um terminal vazio.
 */
function terminalHtml(arquivo: string, linhas: string[]): string {
  if (!linhas.length) return "";
  const corpo = linhas
    .map((l, i) => `<div class="l${i === 0 ? " cmd" : ""}">${esc(l)}</div>`)
    .join("");
  return `<div class="e-term">
  <div class="bar"><u></u><u></u><u></u><span>${esc(arquivo)}</span></div>
  <div class="lines">${corpo}</div>
</div>`;
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
      <div><div class="s-pname">imigra.us <span class="s-check">✓</span></div><div class="s-phandle">@imigra.us</div></div>
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
    <div class="s-phandle" style="color:#a1a1aa">@imigra.us</div>
    <div style="font-family:'Playfair Display',serif;font-size:40px;font-weight:800;color:#fff">${esc(slide.eyebrow || "imigra.us")}</div>
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

// --------------------------------------------------------------------------
// TUTORIAL — design claro aprovado (sistema impresso)
// --------------------------------------------------------------------------

const coverEditorialClaro: SlideVariant = {
  key: "editorial_claro",
  label: "Capa clara — marca, título partido e botão",
  render: (slide): VariantOutput => ({
    body: `
<div class="e-wrap center">
  ${marcaEditorial()}
  ${tituloHtml(slide)}
  <div class="e-btn">START</div>
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

const stepTerminalClaro: SlideVariant = {
  key: "terminal_claro",
  label: "Passo claro — terminal com comando e saída",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${terminalHtml(slide.eyebrow?.trim() || "terminal", slide.bullet_points)}
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

const stepNumeradoClaro: SlideVariant = {
  key: "numerado_claro",
  label: "Passo claro — lista numerada",
  render: (slide, ctx): VariantOutput => {
    const linhas = slide.bullet_points
      .map((b, i) => `<div class="row"><span class="n">${pad2(i + 1)}</span><span class="t">${esc(b)}</span></div>`)
      .join("");

    return {
      body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${linhas ? `<div class="e-nums">${linhas}</div>` : ""}
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
</div>`,
    };
  },
};

const tipEditorialClaro: SlideVariant = {
  key: "destaque_claro",
  label: "Dica clara — parágrafo e citação",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
  ${slide.highlight_text ? `<div class="e-quote">${esc(slide.highlight_text)}</div>` : ""}
</div>`,
  }),
};

const ctaEditorialClaro: SlideVariant = {
  key: "keyword_claro",
  label: "CTA claro — palavra-chave em destaque",
  render: (slide, ctx): VariantOutput => {
    // A palavra-chave é o que a pessoa comenta para receber o Direct: sai de
    // `highlight_text` quando a IA a informa, senão do CTA do formato.
    const chave = slide.highlight_text?.trim();
    const chamada = slide.cta_text?.trim() || ctx.ctaText;

    return {
      body: `
<div class="e-wrap center">
  ${tituloHtml(slide)}
  ${chave ? `<div class="e-kw">${esc(chave)}</div>` : ""}
  <div class="e-kw-line">${esc(chamada)}</div>
</div>`,
    };
  },
};

/**
 * Slide de imagem em tela cheia — o resultado do prompt, sem texto por cima.
 * É o corpo do formato `prompt`: a pessoa vê primeiro o que poderia criar.
 */
const galleryTelaCheia: SlideVariant = {
  key: "tela_cheia",
  label: "Imagem em tela cheia (resultado do prompt)",
  render: (slide): VariantOutput => ({
    full: true,
    onDark: true,
    body: photo(slide.bg_image_url),
  }),
};

export const SLIDE_VARIANTS: Record<InstagramSlideType, Record<string, SlideVariant>> = {
  cover: {
    fullbleed_portrait: coverFullbleedPortrait,
    brand_card: coverBrandCard,
    result_showcase: coverResultShowcase,
    result_fullbleed: coverResultFullbleed,
    editorial_claro: coverEditorialClaro,
  },
  intro: { big_statement: introBigStatement },
  content: { bullets: contentBullets, highlight: contentHighlight },
  quote_highlight: { pull_quote: quotePull },
  practical_impact: { gold_dark_card: practicalGoldDark },
  step: {
    terminal_claro: stepTerminalClaro,
    numerado_claro: stepNumeradoClaro,
    code_block: stepCodeBlock,
    checklist: stepChecklist,
  },
  tip: { destaque_claro: tipEditorialClaro, light_card: tipLightCard },
  gallery: { tela_cheia: galleryTelaCheia, image_caption: galleryImageCaption },
  personalization: { prompt_swap: personalizationPromptSwap },
  cta: { keyword_claro: ctaEditorialClaro, dark_card: ctaDarkCard },
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
