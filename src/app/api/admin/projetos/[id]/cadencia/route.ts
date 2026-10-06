import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { CADENCIA_PADRAO, lerCadencia } from "@/lib/server/cadencia";
import { avisosDoCrontab, cadenciaParaGravar } from "@/lib/server/cadencia-no-painel";
import { getProjectById, projectToday } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * A cadência do projeto, lida e gravada pelo painel (06/10/2026).
 *
 * Mesma forma das rotas de capacidades e moldes: `settings` é um jsonb com
 * outras chaves em uso em produção, então só `settings.cadencia` é tocado e o
 * resto volta como estava.
 *
 * Campo inválido é gravado como veio e cai no padrão daquele campo na leitura,
 * com aviso, que é a regra de `cadencia.ts`. A resposta já traz os avisos e a
 * cadência que vai valer, para o painel mostrar o que de fato mudou.
 */

function resposta(projeto: { id: string; slug: string; timezone: string; settings?: Record<string, unknown> | null }) {
  const declarada = (projeto.settings ?? {}).cadencia ?? null;
  const { cadencia, avisos } = lerCadencia(projeto);
  return {
    ok: true,
    projeto: { id: projeto.id, slug: projeto.slug, timezone: projeto.timezone },
    hoje: projectToday(projeto),
    declarada,
    cadencia,
    avisos,
    padrao: CADENCIA_PADRAO,
    avisosDoCrontab: avisosDoCrontab(cadencia, projeto.timezone, new Date()),
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  try {
    const projeto = await getProjectById(id);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
    return NextResponse.json(resposta(projeto));
  } catch (err) {
    console.error("[ADMIN CADENCIA]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao ler a cadência." },
      { status: 500 },
    );
  }
}

/** Corpo: `{ cadencia: {...} }` grava; `{ cadencia: null }` volta ao padrão do PRD. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  try {
    const corpo = (await req.json().catch(() => null)) as { cadencia?: unknown } | null;
    if (!corpo || !("cadencia" in corpo)) {
      return NextResponse.json({ ok: false, error: "informe `cadencia` (objeto, ou null para voltar ao padrão)" }, { status: 400 });
    }
    if (corpo.cadencia !== null && (typeof corpo.cadencia !== "object" || Array.isArray(corpo.cadencia))) {
      return NextResponse.json({ ok: false, error: "`cadencia` precisa ser objeto ou null" }, { status: 400 });
    }

    const projeto = await getProjectById(id);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });

    const settings = { ...(projeto.settings ?? {}) };
    if (corpo.cadencia === null) delete settings.cadencia;
    else settings.cadencia = cadenciaParaGravar(corpo.cadencia, settings.cadencia);

    const { error } = await getSupabaseAdminClient()
      .from("projects")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const depois = { ...projeto, settings };
    const r = resposta(depois);
    console.log(`[ADMIN CADENCIA] ${projeto.slug}: gravada, ${r.avisos.length} aviso(s)`);
    return NextResponse.json(r);
  } catch (err) {
    console.error("[ADMIN CADENCIA]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao gravar a cadência." },
      { status: 500 },
    );
  }
}
