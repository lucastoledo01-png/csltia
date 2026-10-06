import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarAutoresStore } from "@/lib/server/autores";
import { validarAutor, type EntradaDoAutor } from "@/lib/autores";
import { falhaDoBanco, projetoDoPedido } from "./comum";

/**
 * Os autores de um projeto e as matérias recentes com o autor de cada uma
 * (06/10/2026). As matérias vêm junto porque a mesma tela atribui o autor:
 * o painel não tem mais lista de artigos ativa (o CMS está arquivado).
 */
export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const p = await projetoDoPedido(req.nextUrl.searchParams.get("projeto"));
  if ("resposta" in p) return p.resposta;

  try {
    const client = getSupabaseAdminClient();
    const autores = await criarAutoresStore(client).listar(p.projeto.id);
    const { data: materias, error } = await client
      .from("articles")
      .select("id, slug, title, status, published_at, author_id")
      .eq("project_id", p.projeto.id)
      .in("status", ["published", "scheduled"])
      .not("slug", "like", "edicao-%")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, projeto: { id: p.projeto.id, slug: p.projeto.slug }, autores, materias: materias ?? [] });
  } catch (e) {
    return falhaDoBanco(e);
  }
}

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const corpo = (await req.json().catch(() => ({}))) as EntradaDoAutor & { projeto?: string };
  const p = await projetoDoPedido(corpo.projeto);
  if ("resposta" in p) return p.resposta;

  const v = validarAutor(corpo);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.erro }, { status: 400 });

  try {
    const autor = await criarAutoresStore(getSupabaseAdminClient()).criar(p.projeto.id, v.campos);
    return NextResponse.json({ ok: true, autor });
  } catch (e) {
    return falhaDoBanco(e);
  }
}
