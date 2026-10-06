import { llmsTxt, materiasRecentes } from "@/lib/server/arquivos-para-maquinas";

/**
 * O `/llms.txt` (05/10/2026): índice curto do portal para agentes, montado por
 * requisição com as matérias mais recentes. O Google não lê; os outros
 * buscadores com IA e os agentes leem (`.claude/skills/ai-seo`).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  /*
   * Todas as publicadas, e não as 20 mais recentes (06/10/2026): o índice é o
   * caminho pelo qual o agente acha a matéria de três semanas atrás, e o
   * portal publica três por dia. O teto de mil é o do sitemap de notícias.
   */
  const materias = await materiasRecentes(1000);
  return new Response(llmsTxt(materias), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
