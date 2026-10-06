import { chaveDoIndexNow } from "@/lib/server/indexnow";

/**
 * O arquivo da chave do IndexNow, servido em `/<chave>.txt` pela reescrita do
 * `next.config.ts` (06/10/2026). O buscador baixa este arquivo para conferir
 * que quem avisou é dono do domínio: o corpo é a própria chave, em texto puro.
 *
 * Qualquer outro nome, ou ambiente sem chave, é 404: a rota não confirma nem
 * desmente qual é a chave para quem tenta adivinhar.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ chave: string }> }): Promise<Response> {
  const { chave } = await ctx.params;
  const valida = chaveDoIndexNow();
  if (!valida || chave !== valida) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(valida, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
