import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_PROJECT_SLUG, getProjectBySlug } from "@/lib/server/projects";
import { carregarConfigDeImagem } from "@/lib/server/visual/relevancia";
import { situacaoDoAcervo } from "@/lib/server/visual/acervo/situacao";

/**
 * O estado do acervo próprio, só leitura: prateleiras, o que está livre na
 * janela, e a lista de compras da última semana (decisão de 29/09/2026).
 *
 * Dinâmica por natureza: o build na VPS não tem as variáveis do banco.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const slug = req.nextUrl.searchParams.get("projeto") || DEFAULT_PROJECT_SLUG;
  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias") ?? 7) || 7, 1), 90);

  try {
    const projeto = await getProjectBySlug(slug);
    if (!projeto) return NextResponse.json({ ok: false, error: `projeto "${slug}" não existe` }, { status: 404 });

    const situacao = await situacaoDoAcervo(
      getSupabaseAdminClient(),
      projeto,
      carregarConfigDeImagem(process.env).janelaEmDias,
      dias,
    );
    return NextResponse.json({ ok: true, projeto: projeto.slug, dias, ...situacao });
  } catch (erro) {
    return NextResponse.json(
      { ok: false, error: erro instanceof Error ? erro.message : String(erro) },
      { status: 500 },
    );
  }
}
