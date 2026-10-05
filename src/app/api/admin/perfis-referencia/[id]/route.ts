import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarPerfisStore } from "@/lib/server/social/perfis-referencia/store";
import { falhaDoBanco, projetoDoPedido } from "../comum";

/**
 * Desativar e anotar um perfil.
 *
 * Desativar é o caminho preferido a remover, pela regra do projeto: o que dá
 * para desligar não se apaga. A remoção existe porque cadastro errado
 * (digitado errado, perfil de outra pessoa) não tem por que ficar na lista.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const { id } = await ctx.params;
  const corpo = (await req.json().catch(() => ({}))) as { projeto?: string; ativo?: unknown; nota?: unknown };
  const p = await projetoDoPedido(corpo.projeto);
  if ("resposta" in p) return p.resposta;

  const mudanca: { ativo?: boolean; nota?: string } = {};
  if (typeof corpo.ativo === "boolean") mudanca.ativo = corpo.ativo;
  if (typeof corpo.nota === "string") mudanca.nota = corpo.nota.trim();
  if (Object.keys(mudanca).length === 0) {
    return NextResponse.json({ ok: false, error: "nada para mudar: envie ativo ou nota" }, { status: 400 });
  }

  try {
    const perfil = await criarPerfisStore(getSupabaseAdminClient()).atualizar(p.projeto.id, id, mudanca);
    if (!perfil) return NextResponse.json({ ok: false, error: "perfil não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, perfil });
  } catch (e) {
    return falhaDoBanco(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const { id } = await ctx.params;
  const p = await projetoDoPedido(req.nextUrl.searchParams.get("projeto"));
  if ("resposta" in p) return p.resposta;

  try {
    const removido = await criarPerfisStore(getSupabaseAdminClient()).remover(p.projeto.id, id);
    if (!removido) return NextResponse.json({ ok: false, error: "perfil não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falhaDoBanco(e);
  }
}
