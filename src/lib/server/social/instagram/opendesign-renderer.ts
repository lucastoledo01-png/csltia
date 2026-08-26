import { chromium } from "playwright";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { InstagramCarouselContent, InstagramSlide } from "./schemas";

export type OpenDesignSlideAsset = {
  index: number;
  type: string;
  filename: string;
  htmlContent: string;
  pngBuffer: Buffer;
  publicUrl?: string;
};

export function buildSlideHtml(slide: InstagramSlide, totalSlides: number, primaryTopic = "INTELIGÊNCIA ARTIFICIAL"): string {
  const slideIndexStr = String(slide.index).padStart(2, "0");
  const totalSlidesStr = String(totalSlides).padStart(2, "0");

  const eyebrow = slide.eyebrow || primaryTopic.toUpperCase();
  const title = slide.title || "";
  const body = slide.body || "";
  const ctaText = slide.cta_text || "Comente NEWS para receber a newsletter no Direct";
  const bulletPoints = slide.bullet_points || [];

  let slideBodyHtml = "";

  if (slide.type === "cover") {
    slideBodyHtml = `
      <div class="tag-eyebrow">${eyebrow}</div>
      <h1 class="slide-title-cover">${title}</h1>
      <p class="slide-subtitle">${body}</p>

      <!-- UI Card Container Inspirado no Claude / OpenDesign Kami -->
      <div class="ui-hero-card">
        <div class="ui-card-header">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
          <span class="card-brand-tag">⚡ DESBUGUEI.IA • PASSO A PASSO</span>
        </div>
        <div class="ui-card-body">
          <div class="ui-section-title">Desbugamos tudo em 1 minuto para você</div>
          <div class="ui-code-box">
            <span class="code-keyword">Selecione o modelo</span> e ative as ferramentas de IA que você já usa no dia a dia.
          </div>
          <div class="ui-swipe-hint">Arraste para o lado para ler a explicação completa ➔</div>
        </div>
      </div>
    `;
  } else if (slide.type === "practical_impact") {
    slideBodyHtml = `
      <div class="slide-step-badge">PASSO ${slideIndexStr} DE ${totalSlidesStr}</div>
      <h2 class="slide-title-content">${title}</h2>
      
      <div class="kami-card-main">
        <div class="card-label-gold">💡 COMO APLICAR NO SEU PERFIL OU VENDAS</div>
        <div class="card-body-text">${body}</div>

        <div class="mockup-action-box">
          <div class="mockup-header">Abra seu aplicativo e vá até as configurações</div>
          <div class="mockup-subtext">Ative a sugestão de roteiro para gerar 3 variações instantâneas.</div>
        </div>
      </div>
    `;
  } else if (slide.type === "cta") {
    slideBodyHtml = `
      <div class="cta-container-card">
        <div class="cta-icon">📩</div>
        <h2 class="cta-title">${title}</h2>
        <p class="cta-body">${body}</p>
        <div class="cta-button-main">
          ${ctaText}
        </div>
      </div>
    `;
  } else {
    // Slide de Conteúdo Tradicional (Estilo OpenDesign Kami / Gio Explica)
    const bulletsHtml = bulletPoints
      .map(
        (bp) => `
        <div class="bullet-row-card">
          <span class="bullet-icon">✓</span>
          <span class="bullet-text">${bp}</span>
        </div>
      `
      )
      .join("");

    slideBodyHtml = `
      <div class="slide-step-badge">${eyebrow}</div>
      <h2 class="slide-title-content">${title}</h2>
      <p class="slide-body-intro">${body}</p>

      <div class="kami-card-main">
        <div class="bullets-wrapper">
          ${bulletsHtml || `<div class="bullet-row-card"><span class="bullet-text">${body}</span></div>`}
        </div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1080, height=1350, initial-scale=1.0" />
  <title>Desbuguei Instagram Slide</title>
  <style>
    /* OpenDesign Kami Engine Styles (1080x1350 format) */
    @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800;900&display=swap');

    :root {
      --bg: #F5F4ED; /* Warm Parchment Cream Background */
      --ivory: #FAF9F5;
      --fg: #141413;
      --brand: #1B365D;
      --accent: #FF4A1C;
      --border: #E8E6DC;
      --stone: #6B6A64;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      width: 1080px;
      height: 1350px;
      background-color: var(--bg);
      color: var(--fg);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      position: relative;
      padding: 90px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    /* Top Navigation Header */
    .top-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      border-bottom: 2px solid var(--border);
      padding-bottom: 24px;
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-badge {
      background: var(--accent);
      color: #fff;
      font-weight: 900;
      font-size: 16px;
      padding: 6px 12px;
      border-radius: 8px;
    }

    .logo-text {
      font-family: 'Instrument Serif', Georgia, serif;
      font-size: 28px;
      font-weight: 700;
      color: var(--fg);
    }

    .slide-counter {
      background: #E8E6DC;
      color: var(--stone);
      font-size: 16px;
      font-weight: 700;
      padding: 8px 18px;
      border-radius: 20px;
    }

    /* Main Slide Body */
    .main-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      margin: 40px 0;
    }

    .tag-eyebrow {
      display: inline-block;
      background: #E4ECF5;
      color: var(--brand);
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 8px 20px;
      border-radius: 20px;
      margin-bottom: 24px;
      width: fit-content;
    }

    .slide-step-badge {
      display: inline-block;
      background: #E8E6DC;
      color: var(--stone);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 6px 16px;
      border-radius: 14px;
      margin-bottom: 20px;
      width: fit-content;
    }

    .slide-title-cover {
      font-family: 'Instrument Serif', Georgia, serif;
      font-size: 64px;
      line-height: 1.15;
      font-weight: 400;
      color: var(--fg);
      margin-bottom: 20px;
      letter-spacing: -1px;
    }

    .slide-title-content {
      font-family: 'Instrument Serif', Georgia, serif;
      font-size: 52px;
      line-height: 1.2;
      font-weight: 400;
      color: var(--fg);
      margin-bottom: 24px;
    }

    .slide-subtitle {
      font-size: 26px;
      line-height: 1.5;
      color: #4A4843;
      margin-bottom: 40px;
    }

    .slide-body-intro {
      font-size: 24px;
      line-height: 1.6;
      color: #4A4843;
      margin-bottom: 32px;
    }

    /* OpenDesign UI Mockup Card (Claude Style) */
    .ui-hero-card {
      background: #1C1A17;
      color: #FAF9F5;
      border-radius: 28px;
      padding: 36px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.12);
      border: 1px solid #2A2824;
    }

    .ui-card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 24px;
      border-bottom: 1px solid #2A2824;
      padding-bottom: 16px;
    }

    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
    .dot.red { background: #FF5F56; }
    .dot.yellow { background: #FFBD2E; }
    .dot.green { background: #27C93F; }

    .card-brand-tag {
      font-family: monospace;
      font-size: 14px;
      font-weight: 700;
      color: var(--accent);
      margin-left: auto;
    }

    .ui-section-title {
      font-family: 'Instrument Serif', Georgia, serif;
      font-size: 32px;
      margin-bottom: 16px;
      color: #FAF9F5;
    }

    .ui-code-box {
      background: #252320;
      border: 1px solid #36332E;
      border-radius: 16px;
      padding: 20px;
      font-size: 20px;
      line-height: 1.6;
      color: #D6D2C9;
      margin-bottom: 20px;
    }

    .code-keyword {
      color: var(--accent);
      font-weight: 700;
    }

    .ui-swipe-hint {
      font-size: 18px;
      color: #8C867C;
      font-weight: 500;
    }

    /* Kami Main Card Container */
    .kami-card-main {
      background: var(--ivory);
      border: 2px solid var(--border);
      border-radius: 32px;
      padding: 40px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .card-label-gold {
      background: #FFF3E0;
      color: #D97706;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1.5px;
      padding: 6px 16px;
      border-radius: 12px;
      width: fit-content;
    }

    .card-body-text {
      font-size: 26px;
      line-height: 1.6;
      color: #2C2925;
      font-weight: 500;
    }

    .mockup-action-box {
      background: #1C1A17;
      color: #FAF9F5;
      border-radius: 20px;
      padding: 24px;
      margin-top: 16px;
    }

    .mockup-header {
      font-family: 'Instrument Serif', serif;
      font-size: 24px;
      color: #FAF9F5;
      margin-bottom: 8px;
    }

    .mockup-subtext {
      font-size: 18px;
      color: #A39D93;
    }

    /* Bullets List Cards */
    .bullets-wrapper {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .bullet-row-card {
      background: #FFFFFF;
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 24px;
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .bullet-icon {
      background: var(--accent);
      color: #FFF;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 18px;
      flex-shrink: 0;
    }

    .bullet-text {
      font-size: 22px;
      font-weight: 600;
      color: var(--fg);
    }

    /* CTA Card */
    .cta-container-card {
      background: #1C1A17;
      color: #FAF9F5;
      border-radius: 36px;
      padding: 60px 40px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 28px;
    }

    .cta-icon {
      font-size: 64px;
    }

    .cta-title {
      font-family: 'Instrument Serif', Georgia, serif;
      font-size: 48px;
      line-height: 1.2;
    }

    .cta-body {
      font-size: 24px;
      color: #A39D93;
      max-width: 700px;
      line-height: 1.5;
    }

    .cta-button-main {
      background: var(--accent);
      color: #FFF;
      font-size: 26px;
      font-weight: 900;
      padding: 24px 48px;
      border-radius: 50px;
      margin-top: 12px;
      box-shadow: 0 10px 30px rgba(255, 74, 28, 0.4);
    }

    /* Bottom Footer */
    .bottom-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 2px solid var(--border);
      padding-top: 24px;
    }

    .footer-handle {
      font-weight: 800;
      font-size: 20px;
      color: var(--fg);
    }

    .footer-tagline {
      font-size: 16px;
      color: var(--stone);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <!-- Top Navigation Header -->
  <div class="top-header">
    <div class="brand-logo">
      <span class="logo-badge">b.</span>
      <span class="logo-text">desbuguei.ia</span>
    </div>
    <div class="slide-counter">${slideIndexStr} / ${totalSlidesStr}</div>
  </div>

  <!-- Main Slide Body -->
  <div class="main-body">
    ${slideBodyHtml}
  </div>

  <!-- Bottom Footer Watermark -->
  <div class="bottom-footer">
    <div class="footer-handle">@desbuguei.ia</div>
    <div class="footer-tagline">Inteligência Artificial para Redes &amp; Vendas</div>
  </div>
</body>
</html>`;
}

export async function renderOpenDesignSlides(carousel: InstagramCarouselContent): Promise<OpenDesignSlideAsset[]> {
  const totalSlides = carousel.slides.length;
  const browser = await chromium.launch({ headless: true });
  const assets: OpenDesignSlideAsset[] = [];

  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 2, // Retinal HD 2160x2700 screenshot
    });

    for (const slide of carousel.slides) {
      const htmlContent = buildSlideHtml(slide, totalSlides, carousel.primary_topic);
      await page.setContent(htmlContent, { waitUntil: "networkidle" });

      // Aguardar rendering de fontes do Google Fonts
      await page.waitForTimeout(300);

      const pngBuffer = await page.screenshot({
        type: "png",
        fullPage: false,
      });

      const filename = `slide-${String(slide.index).padStart(2, "0")}.png`;

      assets.push({
        index: slide.index,
        type: slide.type,
        filename,
        htmlContent,
        pngBuffer,
      });
    }
  } finally {
    await browser.close();
  }

  return assets;
}

export async function uploadOpenDesignSlideToStorage(
  pngBuffer: Buffer,
  filepath: string
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdminClient();

    // Garantir que a imagem é enviada para o storage do Supabase em public_assets
    const { error: uploadErr } = await supabase.storage
      .from("public_assets")
      .upload(filepath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      console.warn("[OPENDESIGN STORAGE UPLOAD WARN]", uploadErr.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("public_assets")
      .getPublicUrl(filepath);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn("[OPENDESIGN STORAGE EXCEPTION]", err);
    return null;
  }
}
