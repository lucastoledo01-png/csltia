import sharp from "sharp";
import { InstagramCarouselContent, InstagramSlide } from "./schemas";
import { getSupabaseAdminClient } from "../../supabase-admin";

export type RenderedSlideAsset = {
  index: number;
  type: string;
  filename: string;
  svgContent: string;
  pngBuffer: Buffer;
  publicUrl?: string;
};

export function renderSlideToSvg(slide: InstagramSlide, totalSlides: number, primaryTopic = "INTELIGÊNCIA ARTIFICIAL"): string {
  const width = 1080;
  const height = 1350;

  const escapeXml = (str: string) =>
    (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const eyebrow = escapeXml((slide.eyebrow || primaryTopic).toUpperCase());
  const title = escapeXml(slide.title);
  const body = escapeXml(slide.body || "");
  const ctaText = escapeXml(slide.cta_text || "Comente NEWS para receber no Direct");
  const slideIndexStr = String(slide.index).padStart(2, "0");
  const totalSlidesStr = String(totalSlides).padStart(2, "0");

  let contentBodySvg = "";

  if (slide.type === "cover") {
    contentBodySvg = `
      <!-- Top Tag Badge -->
      <g transform="translate(90, 240)">
        <rect width="240" height="42" rx="21" fill="#E8E2D6" />
        <text x="120" y="27" font-family="'Georgia', 'Playfair Display', serif" font-size="14" font-weight="700" fill="#4A453E" text-anchor="middle" letter-spacing="2">${eyebrow}</text>
      </g>

      <!-- Main Title (Editorial Serif) -->
      <text x="90" y="390" font-family="'Playfair Display', 'Georgia', serif" font-size="58" font-weight="900" fill="#1A1816" letter-spacing="-0.5">
        <tspan x="90" dy="0">${title.slice(0, 28)}</tspan>
        ${title.length > 28 ? `<tspan x="90" dy="72">${title.slice(28, 58)}</tspan>` : ""}
        ${title.length > 58 ? `<tspan x="90" dy="72">${title.slice(58, 90)}</tspan>` : ""}
      </text>

      <!-- Subtitle -->
      <text x="90" y="650" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="400" fill="#57524A" line-height="1.5">
        <tspan x="90" dy="0">${body.slice(0, 52)}</tspan>
        ${body.length > 52 ? `<tspan x="90" dy="44">${body.slice(52, 110)}</tspan>` : ""}
      </text>

      <!-- Elegant Dark UI Card Prototype (Claude / Desbuguei Style) -->
      <g transform="translate(90, 780)">
        <rect width="900" height="300" rx="28" fill="#1C1A17" filter="drop-shadow(0px 20px 30px rgba(0,0,0,0.15))" />
        
        <!-- UI Header Bar -->
        <circle cx="50" cy="45" r="7" fill="#FF5F56" />
        <circle cx="75" cy="45" r="7" fill="#FFBD2E" />
        <circle cx="100" cy="45" r="7" fill="#27C93F" />
        <line x1="30" y1="75" x2="870" y2="75" stroke="#2D2A26" stroke-width="1.5" />

        <!-- UI Content inside Card -->
        <text x="50" y="130" font-family="monospace" font-size="16" font-weight="700" fill="#FF4A1C">⚡ DESBUGUEI.IA • GUIA PRÁTICO</text>
        <text x="50" y="185" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="700" fill="#F4F0EA">Desbugamos tudo em 1 minuto para você</text>
        <text x="50" y="235" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="400" fill="#9E988E">Arraste para o lado para ver o passo a passo ➔</text>
      </g>
    `;
  } else if (slide.type === "practical_impact") {
    contentBodySvg = `
      <!-- Practical Impact Title -->
      <text x="90" y="260" font-family="'Playfair Display', 'Georgia', serif" font-size="48" font-weight="900" fill="#1A1816">
        <tspan x="90" dy="0">${title.slice(0, 32)}</tspan>
        ${title.length > 32 ? `<tspan x="90" dy="62">${title.slice(32, 70)}</tspan>` : ""}
      </text>

      <!-- Light Elegant Card (Gio Explica Style) -->
      <g transform="translate(90, 420)">
        <rect width="900" height="660" rx="32" fill="#FFFFFF" stroke="#E3DDD3" stroke-width="2" />
        
        <!-- Header inside Card -->
        <rect x="50" y="45" width="280" height="38" rx="19" fill="#FFF3E0" />
        <text x="190" y="70" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="800" fill="#D97706" text-anchor="middle" letter-spacing="1">💡 APLICAÇÃO NO SEU PERFIL</text>

        <!-- Card Body Content -->
        <text x="50" y="160" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="26" font-weight="600" fill="#2C2925">
          <tspan x="50" dy="0">${body.slice(0, 52)}</tspan>
          ${body.length > 52 ? `<tspan x="50" dy="46">${body.slice(52, 110)}</tspan>` : ""}
          ${body.length > 110 ? `<tspan x="50" dy="46">${body.slice(110, 170)}</tspan>` : ""}
          ${body.length > 170 ? `<tspan x="50" dy="46">${body.slice(170, 240)}</tspan>` : ""}
        </text>

        <!-- Mini Inner Action UI Mockup -->
        <g transform="translate(50, 420)">
          <rect width="800" height="170" rx="20" fill="#1C1A17" />
          <text x="40" y="65" font-family="'Playfair Display', serif" font-size="22" font-weight="700" fill="#F4F0EA">Como executar em 30 segundos:</text>
          <text x="40" y="115" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" font-weight="400" fill="#B5AEA3">Ative a ferramenta e aplique a sugestão no seu próximo post.</text>
        </g>
      </g>
    `;
  } else if (slide.type === "cta") {
    contentBodySvg = `
      <!-- CTA Slide Design -->
      <g transform="translate(90, 280)">
        <rect width="900" height="800" rx="36" fill="#1C1A17" />
        
        <circle cx="450" cy="180" r="60" fill="#FF4A1C" opacity="0.15" />
        <text x="450" y="198" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="60" text-anchor="middle">📩</text>

        <text x="450" y="320" font-family="'Playfair Display', 'Georgia', serif" font-size="46" font-weight="900" fill="#F4F0EA" text-anchor="middle">
          <tspan x="450" dy="0">${title.slice(0, 32)}</tspan>
          ${title.length > 32 ? `<tspan x="450" dy="58">${title.slice(32, 70)}</tspan>` : ""}
        </text>

        <text x="450" y="470" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="400" fill="#B5AEA3" text-anchor="middle">
          <tspan x="450" dy="0">${body.slice(0, 52)}</tspan>
          ${body.length > 52 ? `<tspan x="450" dy="42">${body.slice(52, 110)}</tspan>` : ""}
        </text>

        <!-- CTA Highlight Button -->
        <g transform="translate(150, 590)">
          <rect width="600" height="96" rx="48" fill="#FF4A1C" />
          <text x="300" y="58" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="900" fill="#FFFFFF" text-anchor="middle">${ctaText}</text>
        </g>
      </g>
    `;
  } else {
    // Standard Content Slide (Claude / Gio Explica Style)
    const bulletsSvg = (slide.bullet_points || [])
      .map(
        (bp, idx) => `
        <g transform="translate(50, ${280 + idx * 105})">
          <rect width="700" height="85" rx="18" fill="#FFFFFF" stroke="#E8E2D6" stroke-width="1.5" />
          <circle cx="45" cy="42" r="16" fill="#FF4A1C" />
          <text x="45" y="48" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="900" fill="#FFFFFF" text-anchor="middle">✓</text>
          <text x="80" y="49" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="600" fill="#2C2925">${escapeXml(bp.slice(0, 50))}</text>
        </g>
      `
      )
      .join("");

    contentBodySvg = `
      <!-- Editorial Title -->
      <text x="90" y="250" font-family="'Playfair Display', 'Georgia', serif" font-size="48" font-weight="900" fill="#1A1816">
        <tspan x="90" dy="0">${title.slice(0, 32)}</tspan>
        ${title.length > 32 ? `<tspan x="90" dy="60">${title.slice(32, 70)}</tspan>` : ""}
      </text>

      <text x="90" y="380" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="400" fill="#57524A">
        <tspan x="90" dy="0">${body.slice(0, 58)}</tspan>
        ${body.length > 58 ? `<tspan x="90" dy="40">${body.slice(58, 120)}</tspan>` : ""}
      </text>

      <!-- Main UI Container Card -->
      <g transform="translate(90, 480)">
        <rect width="900" height="600" rx="32" fill="#F4F0EA" stroke="#E3DDD3" stroke-width="2" />
        ${bulletsSvg}
      </g>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Background Warm Off-White / Beige (Claude & Gio Explica Style) -->
  <rect width="${width}" height="${height}" fill="#FAF7F2" />

  <!-- Top Header Navigation & Page Badge -->
  <g transform="translate(90, 80)">
    <rect width="180" height="38" rx="19" fill="#EFEAE1" />
    <text x="90" y="24" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="800" fill="#6E675D" text-anchor="middle">${slideIndexStr} / ${totalSlidesStr} — CLAUDE &amp; IA</text>
  </g>

  <!-- Slide Main Body Content -->
  ${contentBodySvg}

  <!-- Footer Watermark -->
  <line x1="90" y1="1250" x2="990" y2="1250" stroke="#E8E2D6" stroke-width="1.5" />
  <text x="90" y="1292" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" font-weight="800" fill="#1A1816">@desbuguei.ia</text>
  <text x="990" y="1292" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="600" fill="#8C857B" text-anchor="end">Desbugando IA para Redes &amp; Vendas</text>
</svg>`;
}

export async function renderCarouselSlides(carousel: InstagramCarouselContent): Promise<RenderedSlideAsset[]> {
  const totalSlides = carousel.slides.length;
  const assets: RenderedSlideAsset[] = [];

  for (const slide of carousel.slides) {
    const svgContent = renderSlideToSvg(slide, totalSlides, carousel.primary_topic);

    // Converter SVG para PNG de altíssima definição 1080x1350 via Sharp
    const pngBuffer = await sharp(Buffer.from(svgContent))
      .png({ quality: 100 })
      .toBuffer();

    const filename = `slide-${String(slide.index).padStart(2, "0")}.png`;

    assets.push({
      index: slide.index,
      type: slide.type,
      filename,
      svgContent,
      pngBuffer,
    });
  }

  return assets;
}

export async function uploadSlideToSupabaseStorage(
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
      console.warn("[STORAGE UPLOAD WARN]", uploadErr.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("public_assets")
      .getPublicUrl(filepath);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn("[STORAGE UPLOAD EXCEPTION]", err);
    return null;
  }
}
