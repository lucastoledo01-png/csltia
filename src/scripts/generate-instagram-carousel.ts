import { runInstagramCarouselService } from "../lib/server/social/instagram/instagram-service";

async function main() {
  console.log("=== DESBUGUEI.IA — TESTE DO GERADOR DE CARROSSEL DO INSTAGRAM (FASE 1) ===\n");

  const todayStr = new Date().toISOString().split("T")[0];
  const testIdempotencyKey = `instagram-carousel-test-${Date.now()}`;

  console.log(`[FASE 1] Executando pipeline em modo DRY RUN para o dia: ${todayStr}...`);

  const result = await runInstagramCarouselService({
    dryRun: true,
    autoPost: false,
    editionDateStr: todayStr,
    idempotencyKey: testIdempotencyKey,
  });

  console.log("\n=======================================================");
  console.log("              RELATÓRIO DO CARROSSEL DO INSTAGRAM      ");
  console.log("=======================================================");
  console.log(`- Status: ${result.status}`);
  console.log(`- Modo Dry Run: ${result.dryRun ? "ATIVADO (Nenhuma postagem enviada)" : "DESATIVADO"}`);
  console.log(`- Post ID no Supabase: ${result.socialPostId || "N/A"}`);
  console.log(`- Tempo de Execução: ${result.executionTimeMs}ms`);
  if (result.tokens) {
    console.log(`- Consumo de Tokens: ${result.tokens.totalTokens} (Input: ${result.tokens.promptTokens}, Output: ${result.tokens.completionTokens})`);
    console.log(`- Custo Estimado USD: $${result.tokens.estimatedCostUsd.toFixed(5)}`);
  }
  console.log("=======================================================\n");

  if (result.carousel) {
    console.log("-------------------------------------------------------");
    console.log(`📌 TÍTULO DO CARROSSEL: ${result.carousel.title}`);
    console.log(`🎯 PÚBLICO ALVO: ${result.carousel.target_audience_focus}`);
    console.log(`📅 DATA DA EDIÇÃO: ${result.carousel.edition_date}`);
    console.log("-------------------------------------------------------\n");

    console.log("🖼️ ROTEIRO DOS SLIDES (JSON MANIFEST):\n");
    result.carousel.slides.forEach((slide) => {
      console.log(`[Slide ${slide.index} - Tipo: ${slide.type.toUpperCase()}]`);
      if (slide.eyebrow) console.log(`   Eyebrow: ${slide.eyebrow}`);
      console.log(`   Título:  ${slide.title}`);
      if (slide.body) console.log(`   Corpo:   ${slide.body}`);
      if (slide.bullet_points && slide.bullet_points.length > 0) {
        console.log(`   Bullets: ${slide.bullet_points.join(" | ")}`);
      }
      if (slide.cover_image_prompt) console.log(`   Prompt de Imagem de Capa: "${slide.cover_image_prompt}"`);
      if (slide.cta_text) console.log(`   CTA Text: ${slide.cta_text}`);
      console.log("");
    });

    console.log("-------------------------------------------------------");
    console.log("💬 LEGENDA GERADA (CAPTION PARA INSTAGRAM):\n");
    console.log(result.carousel.caption.full_caption);
    console.log("-------------------------------------------------------\n");
  } else {
    console.warn("⚠️ Nenhum carrossel gerado.");
  }
}

main().catch((err) => {
  console.error("❌ Erro ao executar script de teste de carrossel:", err);
  process.exit(1);
});
