import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarFilaStore } from "@/lib/server/aprovacao/fila-store";
import { projetoPeloSlug } from "@/lib/server/aprovacao/rotas";

/**
 * O e-mail da newsletter, exatamente como vai sair (06/10/2026).
 *
 * Devolve `news_editions.content_html` cru, que é o corpo que a liberação
 * entrega ao Listmonk e uma das duas metades do hash aprovado. Nada é
 * redesenhado aqui: uma prévia que remonta o e-mail seria uma segunda cópia
 * do template, e a aprovação passaria a ser de uma coisa parecida com o que
 * sai.
 *
 * O painel abre isto num iframe com `sandbox` sem `allow-scripts`, e a
 * resposta ainda proíbe script por CSP: o HTML vem da redação, e nenhum
 * pedaço dele roda na sessão do dono. Só newsletter: a matéria tem prévia
 * própria, desenhada pelos componentes do portal.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const projeto = await projetoPeloSlug(req.nextUrl.searchParams.get("projeto"));
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!projeto || !id) return NextResponse.json({ ok: false, error: "projeto ou peça não encontrados" }, { status: 404 });

  try {
    const client = getSupabaseAdminClient();
    const aprovacao = await criarFilaStore(client).porId(id);
    if (!aprovacao || aprovacao.projectId !== projeto.id || aprovacao.ramo !== "newsletter") {
      return NextResponse.json({ ok: false, error: "prévia não encontrada" }, { status: 404 });
    }
    const { data, error } = await client
      .from("news_editions")
      .select("content_html")
      .eq("id", aprovacao.pecaId)
      .eq("project_id", projeto.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const html = typeof data?.content_html === "string" ? data.content_html : "";
    if (!html) return NextResponse.json({ ok: false, error: "a edição não tem HTML gravado" }, { status: 404 });

    // O HTML gravado é um fragmento com <style> e tabelas; o documento mínimo dá a ele o mesmo ponto de partida do cliente de e-mail.
    const documento = /<html[\s>]/i.test(html)
      ? html
      : `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"></head><body style="margin:0">${html}</body></html>`;

    return new NextResponse(documento, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "script-src 'none'; object-src 'none'; frame-ancestors 'self'",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err) {
    console.error("[ADMIN APROVACAO PREVIA]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Falha ao ler a prévia." }, { status: 500 });
  }
}
