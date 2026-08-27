import type { EditionContent } from "../../newsroom/schemas";
import type { Project } from "../../projects";
import { getSupabaseAdminClient } from "../../supabase-admin";

/**
 * Edição do dia gravada em `news_editions`.
 *
 * Não existe conteúdo de reserva aqui. O código anterior, ao não encontrar a
 * edição, seguia com um objeto de notícias fictícias escrito no próprio arquivo
 * — e publicava isso no perfil real.
 *
 * Fica num módulo à parte porque tanto a aplicação web quanto o worker
 * precisam dele, e a web não pode carregar nada que dependa do Playwright.
 */
export async function loadEdition(project: Project, editionDate: string): Promise<EditionContent> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("news_editions")
    .select("stories, headline, subject, subject_options, preheader, intro, quick_bits, closing, final_line")
    .eq("project_id", project.id)
    .eq("edition_date", editionDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar a edição de ${editionDate}: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `Não há edição gravada para ${project.slug} em ${editionDate}. O post não pode ser gerado sem a pauta real.`,
    );
  }

  return {
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
}
