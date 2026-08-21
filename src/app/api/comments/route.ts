import { NextResponse } from "next/server";
import { evaluateCommentContent } from "@/lib/server/comment-filter";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ ok: false, error: "slug e obrigatorio" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("article_comments")
    .select("id, user_name, content, created_at, status, likes, dislikes")
    .eq("article_slug", slug)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar comentarios:", error);
    return NextResponse.json({ ok: true, comments: [] });
  }

  // Ordenar pelo saldo de votos (likes - dislikes), mantendo os mais populares no topo
  const sorted = (data ?? []).sort((a: any, b: any) => {
    const scoreA = (a.likes || 0) - (a.dislikes || 0);
    const scoreB = (b.likes || 0) - (b.dislikes || 0);
    return scoreB - scoreA;
  });

  return NextResponse.json({ ok: true, comments: sorted });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { articleSlug, userName, userEmail, content } = body;

  if (!articleSlug || !userName || !userEmail || !content) {
    return NextResponse.json({ ok: false, error: "Todos os campos sao obrigatorios." }, { status: 400 });
  }

  const { status, reason } = evaluateCommentContent(content, userName);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("article_comments")
    .insert({
      article_slug: articleSlug,
      user_name: userName.trim(),
      user_email: userEmail.trim().toLowerCase(),
      content: content.trim(),
      status,
      likes: 0,
      dislikes: 0,
    })
    .select("id, user_name, content, status, likes, dislikes, created_at")
    .single();

  if (error || !data) {
    console.error("Erro ao salvar comentario:", error);
    return NextResponse.json({ ok: false, error: "Erro ao registrar comentario." }, { status: 500 });
  }

  if (status === "rejected") {
    return NextResponse.json({
      ok: false,
      error: `Comentário recusado pelo filtro automático: ${reason}`,
    }, { status: 422 });
  }

  return NextResponse.json({ ok: true, comment: data });
}
