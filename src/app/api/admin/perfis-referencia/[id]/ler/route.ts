import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { envDoInstagram } from "@/lib/server/credenciais-do-projeto";
import { getMetaConfig } from "@/lib/server/social/instagram/meta-client";
import { criarPerfisStore } from "@/lib/server/social/perfis-referencia/store";
import { lerPerfilPorBusinessDiscovery } from "@/lib/server/social/perfis-referencia/graph";
import { sinaisVirais } from "@/lib/server/social/perfis-referencia/engajamento";
import { ETAPA_DO_TOPICO, RAMO } from "@/lib/server/social/perfis-referencia/topico";
import { falhaDoBanco, projetoDoPedido } from "../../comum";

/**
 * Ler um perfil agora, a pedido do operador.
 *
 * Serve para a pergunta que vem logo depois de cadastrar: "este perfil dá para
 * ler?". Conta pessoal, nome errado e token vencido aparecem aqui, na hora, e
 * não no dia seguinte como um perfil mudo.
 *
 * É só a leitura e o ranking, sem extração de assunto e sem busca: não tem
 * custo de modelo, e funciona com a capacidade desligada. A linha é gravada
 * com `modo = manual`, para não se confundir com as do ciclo.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const { id } = await ctx.params;
  const corpo = (await req.json().catch(() => ({}))) as { projeto?: string };
  const p = await projetoDoPedido(corpo.projeto);
  if ("resposta" in p) return p.resposta;

  try {
    const store = criarPerfisStore(getSupabaseAdminClient());
    const perfil = (await store.listar(p.projeto.id)).find((x) => x.id === id);
    if (!perfil) return NextResponse.json({ ok: false, error: "perfil não encontrado" }, { status: 404 });

    const { accountId, accessToken } = getMetaConfig(await envDoInstagram(p.projeto.id));
    const leitura = await lerPerfilPorBusinessDiscovery(perfil.handle, { accountId, accessToken });
    const ranking = leitura.status === "ok" ? sinaisVirais(leitura.posts, new Date()) : null;

    await store.gravarLeituras([
      {
        projectId: p.projeto.id,
        profileId: perfil.id,
        handle: perfil.handle,
        modo: "manual",
        status: leitura.status,
        httpStatus: leitura.httpStatus,
        codigoDeErro: leitura.codigoDeErro,
        subcodigoDeErro: leitura.subcodigoDeErro,
        mensagemDeErro: leitura.mensagemDeErro,
        seguidores: leitura.seguidores,
        postsLidos: leitura.posts.length,
        linhaDeBase: ranking?.linhaDeBase ?? null,
        sinais: ranking?.sinais ?? [],
        topicos: [],
        candidatas: 0,
        aprovadas: 0,
        custoUsd: 0,
        tokens: 0,
        etapa: ETAPA_DO_TOPICO,
        ramo: RAMO,
        observacao: ranking?.motivo ?? null,
      },
    ]);

    return NextResponse.json({
      ok: true,
      leitura: {
        status: leitura.status,
        mensagemDeErro: leitura.mensagemDeErro,
        seguidores: leitura.seguidores,
        postsLidos: leitura.posts.length,
        sinais: ranking?.sinais ?? [],
        observacao: ranking?.motivo ?? null,
      },
    });
  } catch (e) {
    return falhaDoBanco(e);
  }
}
