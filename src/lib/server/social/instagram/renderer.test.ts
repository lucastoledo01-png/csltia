import { describe, expect, it } from "vitest";
import { renderCarouselSlides, renderSlideToSvg } from "./renderer";
import { InstagramCarouselContent } from "./schemas";

describe("Renderer de Slides 1080x1350 Elegante/Editorial para Instagram", () => {
  const mockCarousel: InstagramCarouselContent = {
    title: "Instagram lança IA de edição",
    edition_date: "2026-08-25",
    primary_topic: "Redes Sociais",
    target_audience_focus: "Criadores e Vendedores",
    slides: [
      {
        index: 1,
        type: "cover",
        eyebrow: "UPDATE DE IA",
        title: "A nova ferramenta do Instagram",
        body: "Veja o que mudou hoje no app",
        cover_image_prompt: "3D Tech background",
      },
      {
        index: 2,
        type: "intro",
        title: "O que aconteceu?",
        body: "A Meta liberou novos recursos de IA.",
      },
      {
        index: 3,
        type: "content",
        title: "Como funciona",
        body: "Roteiros rápidos gerados em segundos.",
        bullet_points: ["Super rápido", "Edição simples"],
      },
      {
        index: 4,
        type: "practical_impact",
        title: "Como usar hoje",
        body: "Abra o aplicativo e teste na aba de criação.",
      },
      {
        index: 5,
        type: "cta",
        title: "Curtiu este desbug?",
        body: "Salve este post para consultar depois!",
        cta_text: "Siga a @desbuguei.ia",
      },
    ],
    caption: {
      headline: "A nova IA do Instagram acabou de sair! ⬇️",
      intro_summary: "Economia de tempo para o seu negócio.",
      key_takeaways: ["📌 Roteiros rápidos", "⚡ Edição direta"],
      cta_call: "Comente o que achou!",
      hashtags: ["#inteligenciaartificial", "#redessociais", "#desbuguei"],
      full_caption: "Confira a nova IA do Instagram!",
    },
  };

  it("gera arquivo SVG 1080x1350 bem formatado no tom beige editorial desbuguei.ia", () => {
    const svg = renderSlideToSvg(mockCarousel.slides[0], 5, "Redes Sociais");
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1350"');
    expect(svg).toContain("@desbuguei.ia");
    expect(svg).toContain("UPDATE DE IA");
    expect(svg).toContain("#FAF7F2"); // fundo bege estético
  });

  it("renderiza todos os slides do carrossel em PNG via Sharp", async () => {
    const rendered = await renderCarouselSlides(mockCarousel);
    expect(rendered.length).toBe(5);
    expect(rendered[0].pngBuffer).toBeInstanceOf(Buffer);
    expect(rendered[0].filename).toBe("slide-01.png");
    expect(rendered[4].filename).toBe("slide-05.png");
  });
});
