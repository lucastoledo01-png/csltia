import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarAutoresStore } from "@/lib/server/autores";
import { falhaDoBanco, projetoDoPedido } from "../comum";

/**
 * Atribuir (ou tirar) o autor de uma matéria (06/10/2026).
 *
 * `autor: null` devolve a matéria à Redação. O autor tem que ser deste
 * projeto e estar ativo, e a matéria também tem que ser deste projeto: a
 * escrita filtra pelos dois, para um id de outro projeto nunca ser tocado.
 * Grava só `author_id`, e não toca em `updated_at`: trocar a assinatura não é
 * mudar o conteúdo, e o `dateModified` honesto lê essa coluna.
 */
export async function PATCH(req: NextRequest) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const corpo = (await req.json().catch(() => ({}))) as { projeto?: string; artigo?: unknown; autor?: unknown };
  const p = await projetoDoPedido(corpo.projeto);
  if ("resposta" in p) return p.resposta;

  const artigo = typeof corpo.artigo === "string" ? corpo.artigo.trim() : "";
  if (!artigo) return NextResponse.json({ ok: false, error: "informe a matéria" }, { status: 400 });
  if (corpo.autor !== null && typeof corpo.autor !== "string") {
    return NextResponse.json({ ok: false, error: "autor precisa ser um id ou nulo (Redação)" }, { status: 400 });
  }
  const autorId = typeof corpo.autor === "string" && corpo.autor.trim() ? corpo.autor.trim() : null;

  try {
    const client = getSupabaseAdminClient();
    if (autorId) {
      const autor = await criarAutoresStore(client).porId(p.projeto.id, autorId);
      if (!autor) return NextResponse.json({ ok: false, error: "autor não encontrado neste projeto" }, { status: 404 });
      if (!autor.ativo) return NextResponse.json({ ok: false, error: "autor desativado: reative antes de atribuir" }, { status: 409 });
    }
    const { data, error } = await client
      .from("articles")
      .update({ author_id: autorId })
      .eq("project_id", p.projeto.id)
      .eq("id", artigo)
      .select("id, slug, author_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "matéria não encontrada neste projeto" }, { status: 404 });
    return NextResponse.json({ ok: true, materia: data });
  } catch (e) {
    return falhaDoBanco(e);
  }
}
