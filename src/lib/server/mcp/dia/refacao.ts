import type { SupabaseClient } from "@supabase/supabase-js";
import type { GanchosDeRefazer } from "@/lib/server/aprovacao/refazer";

/**
 * A reprovação do plano do dia volta ao Claude (29/10/2026): a tarefa
 * `propor_plano` reabre em `reparar` com o motivo do dono, e a fila espera a
 * versão nova (`com_o_claude`). O Claude refaz e a entrega devolve o plano à
 * fila com hash novo. A terceira reprovação descarta, pela regra da fila.
 */
export function comPlano(ganchos: GanchosDeRefazer, client: () => SupabaseClient): GanchosDeRefazer {
  return {
    ...ganchos,
    plano: {
      selecao: async (ctx) => {
        const [{ planosSupabase }, { tarefasSupabase }, { reabrirPlano, reelsDoPlano }, { candidatosSupabase }, { manchetesDoPerfil, DIAS_DO_PERFIL_NO_PLANO }] =
          await Promise.all([
            import("./plano-store"),
            import("../tarefas-store"),
            import("./plano"),
            import("@/lib/server/social/reels/candidatos"),
            import("./deps"),
          ]);
        const planos = planosSupabase(client());
        const plano = await planos.porId(ctx.aprovacao.pecaId);
        if (!plano) return { ok: false, motivo: "o plano não existe mais" };
        // Os vídeos e o feed de agora, não os de quando o plano foi proposto (10/11/2026).
        const renovar = async () => ({
          reels: reelsDoPlano(await candidatosSupabase(client()).sugeridos(plano.projectId, 10)),
          noPerfil: await manchetesDoPerfil(
            client(),
            plano.projectId,
            new Date(Date.now() - DIAS_DO_PERFIL_NO_PLANO * 86_400_000).toISOString().slice(0, 10),
          ),
        });
        const tarefa = await reabrirPlano(plano, ctx.motivo, { planos, tarefas: tarefasSupabase(client()), renovar });
        if (!tarefa) return { ok: false, motivo: "a tarefa do plano não existe mais: peça ao Claude um plano novo" };
        return { ok: true, assincrona: `voltou ao Claude (tarefa ${tarefa.id}): o plano novo entra aqui quando ele refizer` };
      },
    },
  };
}

type GanchoDaImagem = NonNullable<NonNullable<GanchosDeRefazer["artigo"]>["imagem"]>;

/**
 * A foto reprovada no motor Claude volta ao Claude (06/11/2026). Antes o
 * servidor rodava o resolvedor, que respondia "não achou outra foto", e a
 * peça voltava como estava; o Claude da Bruna, no chat, dizia não ter
 * autonomia. Agora a peça espera em `com_o_claude` com o motivo do dono, e o
 * Claude acha opções (na web, pelo chat, ou com as ferramentas de imagem),
 * mostra a quem pediu e troca com `trocar_imagem`, que a devolve à fila.
 * Projeto no motor da OpenAI segue com o resolvedor de sempre.
 */
export function comImagemDoClaude(ganchos: GanchosDeRefazer, ehClaude: (projectId: string) => Promise<boolean>): GanchosDeRefazer {
  const pedido =
    (ramo: "artigo" | "post"): GanchoDaImagem =>
    async (ctx) => {
      const original = ganchos[ramo]?.imagem;
      if (!(await ehClaude(ctx.aprovacao.projectId))) {
        return original ? original(ctx) : { ok: false, motivo: "sem refação de imagem" };
      }
      return {
        ok: true,
        assincrona:
          `voltou ao Claude: no chat, peça "troque a foto ${ramo === "artigo" ? "da matéria" : "do post"}"; ` +
          `ele busca opções, mostra e troca com trocar_imagem (motivo: ${ctx.motivo || "sem motivo"})`,
      };
    };
  return {
    ...ganchos,
    artigo: { ...ganchos.artigo, imagem: pedido("artigo") },
    post: { ...ganchos.post, imagem: pedido("post") },
  };
}
