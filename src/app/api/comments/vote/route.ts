import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { commentId, type } = body;

  if (!commentId || (type !== "like" && type !== "dislike")) {
    return NextResponse.json({ ok: false, error: "commentId e tipo (like/dislike) sao obrigatorios" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  // Buscar estado atual do comentário
  const { data: comment, error: fetchErr } = await supabase
    .from("article_comments")
    .select("id, likes, dislikes")
    .eq("id", commentId)
    .single();

  if (fetchErr || !comment) {
    return NextResponse.json({ ok: false, error: "Comentario nao encontrado" }, { status: 404 });
  }

  const newLikes = type === "like" ? (comment.likes || 0) + 1 : comment.likes || 0;
  const newDislikes = type === "dislike" ? (comment.dislikes || 0) + 1 : comment.dislikes || 0;

  const { data: updated, error: updateErr } = await supabase
    .from("article_comments")
    .update({ likes: newLikes, dislikes: newDislikes, updated_at: new Date().toISOString() })
    .eq("id", commentId)
    .select("id, likes, dislikes")
    .single();

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, likes: updated.likes, dislikes: updated.dislikes });
}
