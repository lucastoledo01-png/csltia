import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { getProjectById } from "@/lib/server/projects";
import { CAPACIDADES, capacidadesDeclaradas } from "@/lib/server/capacidades";
import type { Capacidade, EstadoDaCapacidade } from "@/lib/server/capacidades";

/**
 * Liga e desliga capacidade de um projeto.
 *
 * Até a Fase 0, mudar isto significava editar variável de ambiente no painel da
 * hospedagem e esperar o contêiner reiniciar, com efeito sobre TODOS os
 * projetos ao mesmo tempo. Agora é uma escrita em `projects.settings`.
 *
 * ## Por que a escrita é de leitura-modificação-escrita
 *
 * `settings` é um jsonb com outras chaves dentro (`instagram_keyword`,
 * `final_line`, `instagram_post_times`), e todas estão em uso em produção.
 * Gravar o objeto inteiro a partir do que o painel mandou apagaria as outras na
 * primeira vez que alguém clicasse num interruptor. Então só o ramo
 * `capacidades` é tocado, e o resto do objeto volta como estava.
 */

const ESTADOS: EstadoDaCapacidade[] = ["off", "dry_run", "enforce"];

type Corpo = { capacidade?: unknown; estado?: unknown };

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { id } = await ctx.params;

  try {
    const corpo = (await req.json().catch(() => ({}))) as Corpo;
    const capacidade = String(corpo.capacidade ?? "").trim() as Capacidade;
    const estado = String(corpo.estado ?? "").trim() as EstadoDaCapacidade;

    /*
     * Recusa explícita, e não normalização silenciosa.
     *
     * O contrato de leitura trata valor irreconhecível como `off`, porque lá o
     * dado já está gravado e a escolha é entre interpretações. Aqui o dado está
     * chegando, e aceitar lixo normalizando-o esconderia do operador que ele
     * pediu uma coisa e recebeu outra.
     */
    if (!CAPACIDADES.includes(capacidade)) {
      return NextResponse.json(
        { ok: false, error: `capacidade desconhecida: "${capacidade}". Conhecidas: ${CAPACIDADES.join(", ")}` },
        { status: 400 },
      );
    }
    if (!ESTADOS.includes(estado)) {
      return NextResponse.json(
        { ok: false, error: `estado inválido: "${estado}". Válidos: ${ESTADOS.join(", ")}` },
        { status: 400 },
      );
    }

    const projeto = await getProjectById(id);
    if (!projeto) {
      return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
    }

    const settings = { ...(projeto.settings ?? {}) };
    const atuais = (settings.capacidades ?? {}) as Record<string, unknown>;
    settings.capacidades = { ...atuais, [capacidade]: estado };

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from("projects")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    console.log(`[ADMIN PROJETOS] ${projeto.slug}: ${capacidade} = ${estado}`);

    return NextResponse.json({
      ok: true,
      capacidades: capacidadesDeclaradas({ settings }),
    });
  } catch (err) {
    console.error("[ADMIN PROJETOS CAPACIDADES]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao gravar a capacidade." },
      { status: 500 },
    );
  }
}
