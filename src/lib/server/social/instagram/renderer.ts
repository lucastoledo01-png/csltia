import { InstagramCarouselContent, InstagramSlide } from "./schemas";

export type RenderedSlideAsset = {
  index: number;
  type: string;
  filename: string;
  dataUrl: string;
  svgContent: string;
};

export function renderSlideToSvg(slide: InstagramSlide, totalSlides: number, primaryTopic = "TECNOLOGIA & IA"): string {
  const width = 1080;
  const height = 1350;

  // Escape de caracteres especiais para SVG
  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const eyebrow = escapeXml(slide.eyebrow || primaryTopic.toUpperCase());
  const title = escapeXml(slide.title);
  const body = escapeXml(slide.body || "");
  const ctaText = escapeXml(slide.cta_text || "Siga a @desbuguei.ia");

  let contentBodySvg = "";

  if (slide.type === "cover") {
    contentBodySvg = `
      <!-- Cover Slide Special Layout -->
      <rect x="90" y="260" width="160" height="38" rx="19" fill="#ffb800" />
      <text x="170" y="285" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="900" fill="#111827" text-anchor="middle" letter-spacing="2">${eyebrow}</text>

      <text x="90" y="380" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="64" font-weight="900" fill="#ffffff" width="900" line-height="1.2">
        <tspan x="90" dy="0">${title.slice(0, 32)}</tspan>
        ${title.length > 32 ? `<tspan x="90" dy="76">${title.slice(32, 70)}</tspan>` : ""}
        ${title.length > 70 ? `<tspan x="90" dy="76">${title.slice(70, 110)}</tspan>` : ""}
      </text>

      <text x="90" y="720" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="500" fill="#9ca3af">
        <tspan x="90" dy="0">${body.slice(0, 50)}</tspan>
        ${body.length > 50 ? `<tspan x="90" dy="42">${body.slice(50, 110)}</tspan>` : ""}
      </text>

      <!-- Hero Visual Element -->
      <rect x="90" y="860" width="900" height="220" rx="24" fill="#1e293b" stroke="#ff4a1c" stroke-width="2" />
      <text x="130" y="930" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="700" fill="#ff4a1c">⚡ DESBUGUEI.IA — EDICAO DIARIA</text>
      <text x="130" y="980" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="600" fill="#f8fafc">Arraste para o lado para entender tudo em 1 minuto ➔</text>
    `;
  } else if (slide.type === "practical_impact") {
    contentBodySvg = `
      <!-- Practical Impact Slide Layout -->
      <rect x="90" y="240" width="260" height="38" rx="19" fill="#f59e0b" />
      <text x="220" y="265" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="15" font-weight="900" fill="#111827" text-anchor="middle" letter-spacing="2">💡 APLICACAO PRATICA</text>

      <text x="90" y="350" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="46" font-weight="900" fill="#ffffff">
        <tspan x="90" dy="0">${title.slice(0, 38)}</tspan>
        ${title.length > 38 ? `<tspan x="90" dy="60">${title.slice(38, 80)}</tspan>` : ""}
      </text>

      <!-- Golden Practical Box -->
      <rect x="90" y="500" width="900" height="460" rx="24" fill="#fffbeb" stroke="#f59e0b" stroke-width="3" />
      <text x="140" y="570" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="900" fill="#92400e">PASSO A PASSO NO SEU PERFIL OU VENDAS:</text>

      <text x="140" y="640" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="26" font-weight="600" fill="#1f2937">
        <tspan x="140" dy="0">${body.slice(0, 60)}</tspan>
        ${body.length > 60 ? `<tspan x="140" dy="45">${body.slice(60, 120)}</tspan>` : ""}
        ${body.length > 120 ? `<tspan x="140" dy="45">${body.slice(120, 180)}</tspan>` : ""}
        ${body.length > 180 ? `<tspan x="140" dy="45">${body.slice(180, 250)}</tspan>` : ""}
      </text>
    `;
  } else if (slide.type === "cta") {
    contentBodySvg = `
      <!-- CTA Slide Layout -->
      <circle cx="540" cy="360" r="80" fill="#ff4a1c" opacity="0.2" />
      <text x="540" y="380" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="70" text-anchor="middle">🚀</text>

      <text x="540" y="520" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="52" font-weight="900" fill="#ffffff" text-anchor="middle">
        <tspan x="540" dy="0">${title}</tspan>
      </text>

      <text x="540" y="630" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="26" font-weight="500" fill="#cbd5e1" text-anchor="middle">
        <tspan x="540" dy="0">${body.slice(0, 60)}</tspan>
        ${body.length > 60 ? `<tspan x="540" dy="42">${body.slice(60, 120)}</tspan>` : ""}
      </text>

      <rect x="180" y="780" width="720" height="90" rx="45" fill="#ff4a1c" />
      <text x="540" y="835" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="26" font-weight="900" fill="#ffffff" text-anchor="middle">${ctaText}</text>
    `;
  } else {
    // Standard Content / Intro Slide
    const bulletsSvg = (slide.bullet_points || [])
      .map(
        (bp, idx) => `
        <g transform="translate(90, ${620 + idx * 90})">
          <circle cx="20" cy="-10" r="14" fill="#ff4a1c" />
          <text x="20" y="-4" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle">✓</text>
          <text x="50" y="0" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="600" fill="#e2e8f0">${escapeXml(bp.slice(0, 65))}</text>
        </g>
      `
      )
      .join("");

    contentBodySvg = `
      <!-- Content / Intro Layout -->
      <rect x="90" y="240" width="200" height="36" rx="18" fill="#334155" />
      <text x="190" y="263" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="800" fill="#ffb800" text-anchor="middle" letter-spacing="1.5">${eyebrow}</text>

      <text x="90" y="350" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="48" font-weight="900" fill="#ffffff">
        <tspan x="90" dy="0">${title.slice(0, 35)}</tspan>
        ${title.length > 35 ? `<tspan x="90" dy="60">${title.slice(35, 75)}</tspan>` : ""}
      </text>

      <text x="90" y="490" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="26" font-weight="500" fill="#cbd5e1">
        <tspan x="90" dy="0">${body.slice(0, 65)}</tspan>
        ${body.length > 65 ? `<tspan x="90" dy="42">${body.slice(65, 130)}</tspan>` : ""}
      </text>

      ${bulletsSvg}
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg-gradient" x1="0" y1="0" x2="1080" y2="1350" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#18181b" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg-gradient)" />
  <circle cx="980" cy="100" r="300" fill="#ff4a1c" opacity="0.08" />
  <circle cx="100" cy="1200" r="250" fill="#ffb800" opacity="0.05" />

  <!-- Top Header Branding -->
  <g transform="translate(90, 90)">
    <rect width="64" height="34" rx="8" fill="#ff4a1c" />
    <text x="32" y="23" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle">b.</text>
    <text x="80" y="24" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="22" font-weight="900" fill="#ffffff" letter-spacing="1">desbuguei.ia</text>
  </g>

  <!-- Slide Content Body -->
  ${contentBodySvg}

  <!-- Footer Watermark & Page Counter -->
  <line x1="90" y1="1240" x2="990" y2="1240" stroke="#334155" stroke-width="1.5" />
  <text x="90" y="1285" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="700" fill="#64748b">desbuguei.ia • Inteligencia Artificial para Redes &amp; Vendas</text>
  <text x="990" y="1285" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="900" fill="#ffb800" text-anchor="end">${slide.index} / ${totalSlides}</text>
</svg>`;
}

export function renderCarouselSlides(carousel: InstagramCarouselContent): RenderedSlideAsset[] {
  const totalSlides = carousel.slides.length;

  return carousel.slides.map((slide) => {
    const svgContent = renderSlideToSvg(slide, totalSlides, carousel.primary_topic);
    const base64Svg = Buffer.from(svgContent, "utf-8").toString("base64");
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
    const filename = `slide-${String(slide.index).padStart(2, "0")}.svg`;

    return {
      index: slide.index,
      type: slide.type,
      filename,
      dataUrl,
      svgContent,
    };
  });
}
