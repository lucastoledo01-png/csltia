import { chromium } from "playwright-core";
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

export async function fetchImageAsBase64(url: string): Promise<string> {
  if (!url || !url.startsWith("http")) return url;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return url;
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mime = response.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${base64}`;
  } catch {
    return url;
  }
}

export async function generateCoverImageWithAI(title: string, coverPrompt?: string, primaryTopic?: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";

  const subject = coverPrompt || `${title} (${primaryTopic || "Inteligência Artificial"})`;
  const finalPrompt = `High impact Instagram news carousel cover background image. Subject: ${subject}. Style: Photorealistic editorial news portrait or 3D render with dramatic lighting, tech journalism aesthetic, rich dark bottom contrast for text legibility, 4k resolution. ABSOLUTELY NO TEXT, NO WORDS, NO TYPOGRAPHY IN THE IMAGE.`;

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url"
      }),
    });

    if (!res.ok) return "";
    const data = await res.json();
    return data?.data?.[0]?.url || "";
  } catch {
    return "";
  }
}

export function getContextualBrandImage(title: string, primaryTopic: string, providedUrl?: string): string {
  if (providedUrl && providedUrl.startsWith("http") && !providedUrl.includes("photo-1618005182384")) {
    return providedUrl;
  }

  const text = (title + " " + primaryTopic).toLowerCase();

  if (text.includes("whatsapp") || text.includes("zap")) {
    return "https://images.unsplash.com/photo-1614680376593-902f749f7b2c?auto=format&fit=crop&w=1080&q=80";
  }
  if (text.includes("instagram") || text.includes("reels") || text.includes("meta")) {
    return "https://images.unsplash.com/photo-1611262588024-d12430b98920?auto=format&fit=crop&w=1080&q=80";
  }
  if (text.includes("chatgpt") || text.includes("openai") || text.includes("gpt")) {
    return "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=1080&q=80";
  }
  if (text.includes("google") || text.includes("gemini") || text.includes("busca")) {
    return "https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?auto=format&fit=crop&w=1080&q=80";
  }
  if (text.includes("apple") || text.includes("iphone") || text.includes("mac")) {
    return "https://images.unsplash.com/photo-1616469829941-c7200edec809?auto=format&fit=crop&w=1080&q=80";
  }

  return "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=1080&q=80";
}

export function getBrandHeroVisual(title: string, primaryTopic: string): { brandName: string; brandClass: string; iconSvg: string } {
  const text = (title + " " + primaryTopic).toLowerCase();

  if (text.includes("whatsapp") || text.includes("zap")) {
    return {
      brandName: "WhatsApp AI",
      brandClass: "brand-whatsapp",
      iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`
    };
  }
  if (text.includes("chatgpt") || text.includes("openai") || text.includes("gpt")) {
    return {
      brandName: "OpenAI / ChatGPT",
      brandClass: "brand-openai",
      iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10A37F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v12M6 12h12"/></svg>`
    };
  }
  if (text.includes("instagram") || text.includes("reels") || text.includes("meta")) {
    return {
      brandName: "Instagram & Meta AI",
      brandClass: "brand-instagram",
      iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E1306C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`
    };
  }
  if (text.includes("google") || text.includes("gemini") || text.includes("busca")) {
    return {
      brandName: "Google Gemini",
      brandClass: "brand-google",
      iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`
    };
  }

  return {
    brandName: "Desbuguei.ia Intel",
    brandClass: "brand-default",
    iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FF4A1C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
  };
}

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
    const coverTag = "BUGNEWS";
    const brand = getBrandHeroVisual(title, primaryTopic);
    const hasCustomImage = Boolean(slide.bg_image_url && (slide.bg_image_url.startsWith("data:") || slide.bg_image_url.startsWith("http")));

    const headlineStyle = slide.headline_style || "clean";
    const highlightTarget = slide.highlight_text || "";

    let formattedTitle = title;
    if (headlineStyle === "underline_stroke") {
      if (highlightTarget && title.includes(highlightTarget)) {
        formattedTitle = title.replace(
          highlightTarget,
          `<span class="underline-stroke-wrapper">${highlightTarget}<svg class="brush-stroke-svg" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M 5,14 Q 100,2 195,14 Q 100,18 5,14" fill="#FF4A1C"/></svg></span>`
        );
      } else {
        const words = title.split(" ");
        if (words.length > 3) {
          const lastWords = words.slice(-3).join(" ");
          const firstPart = words.slice(0, -3).join(" ");
          formattedTitle = `${firstPart} <span class="underline-stroke-wrapper">${lastWords}<svg class="brush-stroke-svg" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M 5,14 Q 100,2 195,14 Q 100,18 5,14" fill="#FF4A1C"/></svg></span>`;
        }
      }
    } else if (headlineStyle === "pen_highlight") {
      if (highlightTarget && title.includes(highlightTarget)) {
        formattedTitle = title.replace(
          highlightTarget,
          `<span class="pen-highlight-tag">${highlightTarget}</span>`
        );
      } else {
        const words = title.split(" ");
        if (words.length > 3) {
          const lastWords = words.slice(-3).join(" ");
          const firstPart = words.slice(0, -3).join(" ");
          formattedTitle = `${firstPart} <span class="pen-highlight-tag">${lastWords}</span>`;
        }
      }
    }

    const variant = slide.cover_variant || "dark_speaker";

    if (variant === "clean_editorial") {
      // CAPA TIPO 2: Editorial Papel Claro com Retrato de CEO Famoso + Destaque Serif Italic + Adesivo Flutuante
      const bgImg = slide.bg_image_url || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=1080&q=80';
      slideBodyHtml = `
        <div class="cover-editorial-container">
          <div class="editorial-top-icon">
            <div class="asterisk-badge">✳</div>
          </div>

          <h1 class="slide-title-clean-editorial">
            ${formattedTitle}
          </h1>

          <div class="editorial-hero-frame">
            <img src="${bgImg}" alt="Tech CEO Portrait" class="editorial-hero-photo" />
            
            <div class="floating-brand-sticker">
              <span class="sticker-icon">${brand.iconSvg}</span>
              <span class="sticker-text">${brand.brandName}</span>
            </div>
            <div class="hero-arrow-annotation">⤵</div>
          </div>

          <div class="cover-bottom-bar-light">
            <span class="swipe-indicator-dark">Arrasta que eu te atualizo em 1 minuto ➔</span>
          </div>
        </div>
      `;
    } else if (variant === "brand_cutout") {
      // CAPA TIPO 3: Retrato de Especialista/Criador com Badge 3D Glassmorphic da Marca
      const bgImg = slide.bg_image_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1080&q=80';
      slideBodyHtml = `
        <div class="cover-cutout-container">
          <div class="cutout-header">
            <h1 class="slide-title-cutout">
              ${formattedTitle}
            </h1>
          </div>

          <div class="cutout-hero-frame">
            <img src="${bgImg}" class="cutout-hero-photo" alt="Creator Portrait" />
            
            <div class="hero-3d-badge ${brand.brandClass}">
              <div class="badge-3d-icon">${brand.iconSvg}</div>
              <div class="badge-3d-label">⚡ ${brand.brandName} 3D</div>
            </div>
            <div class="hero-arrow-annotation">⤵</div>
          </div>

          <div class="cover-bottom-bar-light">
            <span class="swipe-indicator-dark">Arrasta que eu te atualizo em 1 minuto ➔</span>
          </div>
        </div>
      `;
    } else {
      // CAPA TIPO 1: Retrato Escuro Cinematográfico do Palestrante/CEO + Card Perfil Social (@desbuguei.ia)
      const bgImg = slide.bg_image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1080&q=80';
      slideBodyHtml = `
        <div class="cover-full-bleed-wrapper">
          <img src="${bgImg}" class="cover-bg-img" alt="Speaker Portrait" />
          <div class="cover-gradient-overlay"></div>
          <div class="cover-minimal-inner">
            <div class="social-profile-card">
              <div class="profile-avatar">b.</div>
              <div class="profile-meta">
                <div class="profile-name">Desbuguei IA <span class="blue-check">✓</span></div>
                <div class="profile-handle">@desbuguei.ia</div>
              </div>
            </div>

            <h1 class="slide-title-cover-minimal">${formattedTitle}</h1>
          </div>
          <div class="cover-bottom-bar">
            <span class="swipe-indicator">Arrasta que eu te atualizo em 1 minuto ➔</span>
          </div>
        </div>
      `;
    }
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

    if (bulletPoints.length > 0) {
      slideBodyHtml = `
        <div class="slide-step-badge">${eyebrow}</div>
        <h2 class="slide-title-content">${title}</h2>
        <p class="slide-body-intro">${body}</p>

        <div class="kami-card-main">
          <div class="bullets-wrapper">
            ${bulletsHtml}
          </div>
        </div>
      `;
    } else {
      slideBodyHtml = `
        <div class="slide-step-badge">${eyebrow}</div>
        <h2 class="slide-title-content">${title}</h2>

        <div class="kami-card-main">
          <div class="card-body-text-highlight">${body}</div>
        </div>
      `;
    }
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

    /* 3D Brand Hero Card Cover Layout */
    .cover-brand-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      justify-content: space-between;
      margin: 20px 0;
    }

    .brand-hero-card {
      position: relative;
      width: 100%;
      height: 380px;
      border-radius: 28px;
      padding: 36px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 20px 40px rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.06);
      margin: 24px 0;
    }

    .brand-whatsapp {
      background: linear-gradient(135deg, #075E54 0%, #128C7E 50%, #25D366 100%);
      color: #FFFFFF;
    }

    .brand-openai {
      background: linear-gradient(135deg, #052e16 0%, #064e3b 50%, #10b981 100%);
      color: #FFFFFF;
    }

    .brand-instagram {
      background: linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%);
      color: #FFFFFF;
    }

    .brand-google {
      background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
      color: #FFFFFF;
    }

    .brand-default {
      background: linear-gradient(135deg, #18181b 0%, #27272a 50%, #3f3f46 100%);
      color: #FFFFFF;
    }

    .brand-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand-icon-wrapper {
      width: 76px;
      height: 76px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    }

    .brand-status-badge {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1px;
      padding: 8px 18px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.3);
    }

    .brand-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 42px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: -0.5px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }

    .slide-title-cover-brand {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 54px;
      line-height: 1.25;
      font-weight: 800;
      color: var(--fg);
      margin-bottom: 24px;
      letter-spacing: -0.5px;
    }

    .cover-bottom-bar-light {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      border-top: 1px solid var(--border);
      padding-top: 20px;
    }

    .swipe-indicator-dark {
      font-size: 17px;
      font-weight: 700;
      color: var(--stone);
      letter-spacing: 1px;
    }

    /* Full-Bleed Cover Slide Styling */
    .cover-full-bleed-wrapper {
      position: absolute;
      inset: 0;
      overflow: hidden;
      padding: 80px 80px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      z-index: 10;
    }

    .cover-bg-img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      z-index: 1;
    }

    .cover-gradient-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(10,10,12,0.45) 0%, rgba(10,10,12,0.65) 45%, rgba(10,10,12,0.96) 90%);
      z-index: 2;
    }

    .cover-minimal-inner {
      position: relative;
      z-index: 3;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      margin-bottom: 40px;
    }

    .social-profile-card {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .profile-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #FF4A1C;
      color: #FFFFFF;
      font-weight: 900;
      font-size: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid rgba(255,255,255,0.8);
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }

    .profile-meta {
      display: flex;
      flex-direction: column;
    }

    .profile-name {
      font-size: 20px;
      font-weight: 800;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .blue-check {
      background: #3B82F6;
      color: #FFFFFF;
      font-size: 11px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
    }

    .profile-handle {
      font-size: 16px;
      color: rgba(255,255,255,0.8);
      font-weight: 500;
    }

    /* Headline Style: Underline Brush Stroke */
    .underline-stroke-wrapper {
      position: relative;
      display: inline-block;
      white-space: normal;
    }

    .brush-stroke-svg {
      position: absolute;
      bottom: -12px;
      left: 0;
      width: 100%;
      height: 18px;
      z-index: 2;
      overflow: visible;
    }

    /* Headline Style: Pen Highlight Marker */
    .pen-highlight-tag {
      background: #FF4A1C;
      color: #FFFFFF !important;
      padding: 4px 16px;
      border-radius: 12px;
      display: inline-block;
      transform: rotate(-1.5deg);
      box-shadow: 0 6px 20px rgba(255, 74, 28, 0.45);
      margin: 0 4px;
    }

    .slide-title-cover-minimal {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 64px;
      line-height: 1.2;
      font-weight: 800;
      color: #FFFFFF;
      margin-top: 16px;
      letter-spacing: -0.5px;
      text-shadow: 0 4px 20px rgba(0,0,0,0.8);
      max-width: 920px;
    }

    .cover-bottom-bar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      border-top: 1px solid rgba(255,255,255,0.2);
      padding-top: 20px;
    }

    .swipe-indicator {
      font-size: 18px;
      font-weight: 700;
      color: #E4E4E7;
      letter-spacing: 1px;
      text-shadow: 0 2px 8px rgba(0,0,0,0.6);
    }

    .tag-bugnews {
      display: inline-block;
      background: #FF4A1C;
      color: #FFFFFF;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 8px 22px;
      border-radius: 20px;
      margin-bottom: 24px;
      width: fit-content;
      box-shadow: 0 4px 15px rgba(255, 74, 28, 0.4);
    }

    /* CAPA TIPO 2: Editorial Papel Claro */
    .cover-editorial-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .editorial-top-icon {
      margin-bottom: 20px;
    }

    .asterisk-badge {
      font-size: 32px;
      color: #FF4A1C;
      font-weight: 900;
    }

    .slide-title-clean-editorial {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 56px;
      line-height: 1.25;
      font-weight: 700;
      color: #18181B;
      letter-spacing: -0.5px;
      margin-bottom: 30px;
    }

    .serif-italic-accent {
      font-family: 'Playfair Display', Georgia, serif;
      font-style: italic;
      color: #FF4A1C;
      font-weight: 600;
    }

    /* CAPA TIPO 2: Editorial Papel Claro */
    .editorial-hero-frame {
      position: relative;
      width: 100%;
      height: 600px;
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.12);
      margin-bottom: 24px;
    }

    .editorial-hero-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center top;
    }

    .floating-brand-sticker {
      position: absolute;
      top: 24px;
      right: 28px;
      z-index: 5;
      background: #FFFFFF;
      border: 2px solid #E4E4E7;
      padding: 12px 20px;
      border-radius: 22px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.18);
      transform: rotate(6deg);
    }

    .floating-brand-sticker .sticker-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .floating-brand-sticker .sticker-text {
      font-size: 16px;
      font-weight: 800;
      color: #18181B;
    }

    .hero-arrow-annotation {
      position: absolute;
      bottom: 24px;
      left: 28px;
      font-size: 56px;
      color: #FF4A1C;
      font-weight: 900;
      transform: rotate(-15deg);
      filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3));
    }

    /* CAPA TIPO 3: Recorte / Criador + Badge 3D */
    .cutout-hero-frame {
      position: relative;
      width: 100%;
      height: 620px;
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.15);
      margin-bottom: 24px;
    }

    .cutout-hero-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center top;
    }

    .hero-3d-badge {
      position: absolute;
      bottom: 30px;
      right: 30px;
      background: rgba(18, 18, 20, 0.9);
      backdrop-filter: blur(16px);
      color: #FFFFFF;
      padding: 16px 26px;
      border-radius: 24px;
      display: flex;
      align-items: center;
      gap: 14px;
      border: 1px solid rgba(255,255,255,0.25);
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      z-index: 5;
    }

    .hero-3d-badge .badge-3d-icon {
      width: 36px;
      height: 36px;
    }

    .hero-3d-badge .badge-3d-label {
      font-size: 18px;
      font-weight: 800;
      color: #FFFFFF;
    }
      transform: rotate(45deg);
      font-weight: 900;
    }

    .slide-title-cover-dark {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 60px;
      line-height: 1.2;
      font-weight: 700;
      color: #FFFFFF;
      margin-bottom: 20px;
      letter-spacing: -0.5px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    }

    .slide-subtitle-dark {
      font-size: 24px;
      line-height: 1.6;
      color: #E4E4E7;
      margin-bottom: 36px;
      font-weight: 500;
      text-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }

    .ui-hero-card-dark {
      background: rgba(24, 24, 27, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      color: #FAFAFA;
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 20px 45px rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.15);
    }

    .ui-section-title-dark {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 28px;
      margin-bottom: 14px;
      color: #FAFAFA;
      font-weight: 600;
    }

    .ui-code-box-dark {
      background: rgba(39, 39, 42, 0.9);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px;
      padding: 18px;
      font-size: 19px;
      line-height: 1.6;
      color: #E4E4E7;
      margin-bottom: 18px;
    }

    .ui-swipe-hint-dark {
      font-size: 16px;
      color: #A1A1AA;
      font-weight: 600;
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

    .card-body-text-highlight {
      font-size: 26px;
      line-height: 1.65;
      color: #27272A;
      font-weight: 500;
      letter-spacing: -0.2px;
      padding: 10px 4px;
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
      if (slide.type === "cover") {
        let imageUrl = slide.bg_image_url;

        if (!imageUrl) {
          const aiUrl = await generateCoverImageWithAI(slide.title, slide.cover_image_prompt, carousel.primary_topic);
          if (aiUrl) {
            imageUrl = aiUrl;
          }
        }

        if (!imageUrl) {
          imageUrl = getContextualBrandImage(slide.title, carousel.primary_topic, slide.bg_image_url);
        }

        if (imageUrl && imageUrl.startsWith("http")) {
          const b64 = await fetchImageAsBase64(imageUrl);
          if (b64 && b64.startsWith("data:")) {
            slide.bg_image_url = b64;
          }
        }
      }
      const htmlContent = buildSlideHtml(slide, totalSlides, carousel.primary_topic);
      await page.setContent(htmlContent, { waitUntil: "networkidle" });

      // Aguardar explicitamente o carregamento completo das fontes e imagens
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() =>
        Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise((resolve) => {
                  img.onload = img.onerror = resolve;
                })
            )
        )
      );
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
