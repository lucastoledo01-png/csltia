import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarAutoresStore } from "@/lib/server/autores";
import { validarAutor, type EntradaDoAutor } from "@/lib/autores";
import { falhaDoBanco, projetoDoPedido } from "../comum";

/**
 * Editar e desativar um autor. Não há remoção, pela regra do projeto: o que
 * dá para desligar não se apaga. Desativado, o autor sai do portal (a página
 * dá 404, as matérias dele voltam a assinar como a Redação) e some da lista
 * de atribuição, e volta inteiro ao ser reativado.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const { id } = await ctx.params;
  const corpo = (await req.json().catch(() => ({}))) as EntradaDoAutor & { projeto?: string };
  const p = await projetoDoPedido(corpo.projeto);
  if ("resposta" in p) return p.resposta;

  const { projeto: _projeto, ...campos } = corpo;
  void _projeto;
  const v = validarAutor(campos, true);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.erro }, { status: 400 });

  try {
    const autor = await criarAutoresStore(getSupabaseAdminClient()).atualizar(p.projeto.id, id, v.campos);
    if (!autor) return NextResponse.json({ ok: false, error: "autor não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, autor });
  } catch (e) {
    return falhaDoBanco(e);
  }
}
