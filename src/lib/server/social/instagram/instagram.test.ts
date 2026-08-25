import { describe, expect, it } from "vitest";
import { runInstagramCarouselService } from "./instagram-service";
import { InstagramCarouselSchema } from "./schemas";

describe("Módulo de Instagram (Fase 1)", () => {
  it("valida o Zod Schema de um carrossel do Instagram perfeitamente", () => {
    const mockData = {
      title: "Carrossel de Teste Desbuguei",
      edition_date: "2026-08-25",
      primary_topic: "Redes Sociais",
      target_audience_focus: "Criadores e Vendedores",
      slides: [
        {
          index: 1,
          type: "cover" as const,
          eyebrow: "UPDATE DE IA",
          title: "Instagram lança IA de edição",
          body: "Veja o que muda no seu perfil hoje",
          cover_image_prompt: "Minimalist 3D render tech background",
        },
        {
          index: 2,
          type: "intro" as const,
          title: "O que aconteceu?",
          body: "A Meta liberou novas ferramentas automáticas para Reels.",
        },
        {
          index: 3,
          type: "content" as const,
          title: "Como funciona",
          body: "Você escolhe o tema e a IA gera 3 opções de roteiros.",
          bullet_points: ["Mais rápido", "Sem travamentos"],
        },
        {
          index: 4,
          type: "practical_impact" as const,
          title: "Como usar hoje",
          body: "Abra o app do Instagram e teste na aba de criação.",
        },
        {
          index: 5,
          type: "cta" as const,
          title: "Curtiu?",
          body: "Salve este post!",
          cta_text: "Siga a @desbuguei.ia",
        },
      ],
      caption: {
        headline: "A IA do Instagram atualizou! ⬇️",
        intro_summary: "Novas ferramentas de edição direta no app.",
        key_takeaways: ["Roteiros rápidos", "Mais engajamento"],
        cta_call: "Comente o que achou!",
        hashtags: ["#inteligenciaartificial", "#redessociais", "#desbuguei"],
        full_caption: "Confira a nova IA do Instagram! Agora você está desbugado.",
      },
    };

    const parsed = InstagramCarouselSchema.safeParse(mockData);
    expect(parsed.success).toBe(true);
  });

  it("executa o instagram-service em modo DRY RUN com sucesso", async () => {
    const result = await runInstagramCarouselService({
      dryRun: true,
      autoPost: false,
      editionDateStr: "2026-08-25",
      idempotencyKey: `test-inst-key-${Date.now()}`,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.autoPost).toBe(false);
    expect(result.carousel).toBeDefined();
    expect(result.carousel?.slides.length).toBeGreaterThanOrEqual(5);
    expect(result.carousel?.caption.full_caption).toContain("Agora você está desbugado.");
  });
});
