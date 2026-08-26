import { chromium } from "playwright";
import { getSupabaseAdminClient } from "../../supabase-admin.ts";
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    /* OpenDesign Kami Engine Styles (1080x1350 format) */
    :root {
      --bg: #F7F5F0; /* Warm Parchment Cream Background */
      --ivory: #FFFFFF;
      --fg: #18181B;
      --brand: #1E3A8A;
      --accent: #FF4A1C;
      --border: #E4E4E7;
      --stone: #71717A;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }

    html, body {
      width: 1080px;
      height: 1350px;
      background-color: var(--bg);
      color: var(--fg);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
    }

    body {
      padding: 80px 80px;
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
      font-weight: 800;
      font-size: 16px;
      padding: 6px 12px;
      border-radius: 8px;
    }

    .logo-text {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 28px;
      font-weight: 700;
      color: var(--fg);
    }

    .slide-counter {
      background: #E4E4E7;
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
      margin: 36px 0;
    }

    .tag-eyebrow {
      display: inline-block;
      background: #DBEAFE;
      color: var(--brand);
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 8px 20px;
      border-radius: 20px;
      margin-bottom: 24px;
      width: fit-content;
    }

    .slide-step-badge {
      display: inline-block;
      background: #E4E4E7;
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
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 58px;
      line-height: 1.25;
      font-weight: 700;
      color: var(--fg);
      margin-bottom: 20px;
      letter-spacing: -0.5px;
    }

    .slide-title-content {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 48px;
      line-height: 1.3;
      font-weight: 700;
      color: var(--fg);
      margin-bottom: 24px;
    }

    .slide-subtitle {
      font-size: 24px;
      line-height: 1.6;
      color: #3F3F46;
      margin-bottom: 36px;
      font-weight: 500;
    }

    .slide-body-intro {
      font-size: 22px;
      line-height: 1.6;
      color: #3F3F46;
      margin-bottom: 28px;
      font-weight: 500;
    }

    /* OpenDesign UI Mockup Card (Claude Style) */
    .ui-hero-card {
      background: #18181B;
      color: #FAFAFA;
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.1);
      border: 1px solid #27272A;
    }

    .ui-card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 1px solid #27272A;
      padding-bottom: 14px;
    }

    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
    .dot.red { background: #EF4444; }
    .dot.yellow { background: #F59E0B; }
    .dot.green { background: #10B981; }

    .card-brand-tag {
      font-family: 'Plus Jakarta Sans', monospace;
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
      margin-left: auto;
      letter-spacing: 1px;
    }

    .ui-section-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 28px;
      margin-bottom: 14px;
      color: #FAFAFA;
      font-weight: 600;
    }

    .ui-code-box {
      background: #27272A;
      border: 1px solid #3F3F46;
      border-radius: 14px;
      padding: 18px;
      font-size: 19px;
      line-height: 1.6;
      color: #E4E4E7;
      margin-bottom: 18px;
    }

    .code-keyword {
      color: var(--accent);
      font-weight: 700;
    }

    .ui-swipe-hint {
      font-size: 16px;
      color: #A1A1AA;
      font-weight: 600;
    }

    /* Kami Main Card Container */
    .kami-card-main {
      background: var(--ivory);
      border: 2px solid var(--border);
      border-radius: 28px;
      padding: 36px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .card-label-gold {
      background: #FEF3C7;
      color: #D97706;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1.2px;
      padding: 6px 16px;
      border-radius: 12px;
      width: fit-content;
    }

    .card-body-text {
      font-size: 24px;
      line-height: 1.6;
      color: #27272A;
      font-weight: 500;
    }

    .mockup-action-box {
      background: #18181B;
      color: #FAFAFA;
      border-radius: 18px;
      padding: 20px;
      margin-top: 12px;
    }

    .mockup-header {
      font-family: 'Playfair Display', serif;
      font-size: 22px;
      color: #FAFAFA;
      margin-bottom: 6px;
    }

    .mockup-subtext {
      font-size: 17px;
      color: #A1A1AA;
    }

    /* Bullets List Cards */
    .bullets-wrapper {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .bullet-row-card {
      background: #F4F4F5;
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .bullet-icon {
      background: var(--accent);
      color: #FFF;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 16px;
      flex-shrink: 0;
    }

    .bullet-text {
      font-size: 20px;
      font-weight: 600;
      color: var(--fg);
      line-height: 1.4;
    }

    /* CTA Card */
    .cta-container-card {
      background: #18181B;
      color: #FAFAFA;
      border-radius: 32px;
      padding: 50px 36px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }

    .cta-icon {
      font-size: 56px;
    }

    .cta-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 44px;
      line-height: 1.25;
      font-weight: 700;
    }

    .cta-body {
      font-size: 22px;
      color: #A1A1AA;
      max-width: 680px;
      line-height: 1.5;
    }

    .cta-button-main {
      background: var(--accent);
      color: #FFF;
      font-size: 24px;
      font-weight: 800;
      padding: 20px 44px;
      border-radius: 50px;
      margin-top: 10px;
      box-shadow: 0 10px 25px rgba(255, 74, 28, 0.35);
    }

    /* Bottom Footer */
    .bottom-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 2px solid var(--border);
      padding-top: 20px;
    }

    .footer-handle {
      font-weight: 800;
      font-size: 18px;
      color: var(--fg);
    }

    .footer-tagline {
      font-size: 15px;
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

      // Aguardar explicitamente o carregamento completo das fontes do Google Fonts
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);

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
