/**
 * Prévia do roteiro de um carrossel, sem renderizar imagem nem publicar.
 *
 * A pauta vem da edição gravada em news_editions — não existe conteúdo de
 * exemplo embutido.
 *
 * Uso:
 *   npx tsx src/scripts/generate-instagram-carousel.ts [AAAA-MM-DD] [posicaoDaPauta]
 */

import { DEFAULT_PROJECT_ID, projectToday, requireActiveProject } from "../lib/server/projects";
import { generateInstagramCarouselPipeline } from "../lib/server/social/instagram/pipeline";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import type { EditionContent } from "../lib/server/newsroom/schemas";
import { loadEnvLocal } from "./load-env";

async function main() {
  loadEnvLocal();

  const project = await requireActiveProject(process.env.PROJECT_ID || DEFAULT_PROJECT_ID);
  const editionDate = process.argv[2] || projectToday(project);
  const storyIndex = Number(process.argv[3] ?? 0);

  console.log(`=== PRÉVIA DO CARROSSEL — ${project.slug} — ${editionDate} — pauta ${storyIndex + 1} ===\n`);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("news_editions")
    .select("stories, headline, subject, subject_options, preheader, intro, quick_bits, closing, final_line")
    .eq("project_id", project.id)
    .eq("edition_date", editionDate)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    console.error(`Não há edição gravada para ${editionDate}. Rode a redação antes.`);
    process.exit(1);
  }

  const edition = {
    subject_options: (data.subject_options as string[]) ?? [data.subject as string],
    subject: data.subject as string,
    preheader: data.preheader as string,
    headline: data.headline as string,
    intro: data.intro as string,
    stories: data.stories as EditionContent["stories"],
    quick_bits: (data.quick_bits as EditionContent["quick_bits"]) ?? [],
    closing: data.closing as string,
    final_line: data.final_line as string,
  };

  const story = edition.stories[storyIndex];
  if (!story) {
    console.error(`A edição tem ${edition.stories.length} pautas; a posição ${storyIndex} não existe.`);
    process.exit(1);
  }

  console.log(`Pauta: ${story.title}\n`);

  const { carousel, usage } = await generateInstagramCarouselPipeline(
    edition,
    editionDate,
    process.env,
    fetch,
    story,
  );

  console.log("-------------------------------------------------------");
  console.log(`TÍTULO: ${carousel.title}`);
  console.log(`PÚBLICO: ${carousel.target_audience_focus}`);
  console.log(`TOKENS: ${usage.totalTokens} — custo estimado US$ ${usage.estimatedCostUsd.toFixed(5)}`);
  console.log("-------------------------------------------------------\n");

  for (const slide of carousel.slides) {
    console.log(`[Slide ${slide.index} — ${slide.type.toUpperCase()}]`);
    if (slide.eyebrow) console.log(`   Eyebrow: ${slide.eyebrow}`);
    console.log(`   Título:  ${slide.title}`);
    if (slide.body) console.log(`   Corpo:   ${slide.body}`);
    if (slide.bullet_points?.length) console.log(`   Bullets: ${slide.bullet_points.join(" | ")}`);
    if (slide.cta_text) console.log(`   CTA:     ${slide.cta_text}`);
    console.log("");
  }

  console.log("-------------------------------------------------------");
  console.log("LEGENDA:\n");
  console.log(carousel.caption.full_caption);
  console.log("-------------------------------------------------------\n");
}

main().catch((err) => {
  console.error("Erro ao gerar prévia:", err);
  process.exit(1);
});
