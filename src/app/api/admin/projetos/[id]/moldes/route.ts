import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { getProjectById } from "@/lib/server/projects";
import {
  MOLDES_DO_FEED,
  moldesDeclarados,
  type MoldeDoFeed,
} from "@/lib/server/social/moldes-do-feed";

/**
 * Liga e desliga um molde de arte do feed.
 *
 * Mesma forma da rota de capacidades, e pelo mesmo motivo: `settings` é um
 * jsonb com outras chaves em uso em produção, então só o ramo `moldes` é
 * tocado e o resto do objeto volta como estava. Gravar o objeto inteiro a
 * partir do que o painel mandou apagaria as outras no primeiro clique.
 *
 * O efeito não é de tela: `ciclo-do-dia` lê isto e `pipeline-v2` deixa de
 * produzir a peça. Ver `moldes-do-feed.ts`.
 */

type Corpo = { molde?: unknown; ligado?: unknown };

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { id } = await ctx.params;

  try {
    const corpo = (await req.json().catch(() => ({}))) as Corpo;
    const molde = String(corpo.molde ?? "").trim() as MoldeDoFeed;

    if (!MOLDES_DO_FEED.includes(molde)) {
      return NextResponse.json(
        {
          ok: false,
          error: `molde desconhecido: "${molde}". Conhecidos: ${MOLDES_DO_FEED.join(", ")}`,
        },
        { status: 400 },
      );
    }

    /*
     * Booleano exato, e não "o que for verdadeiro".
     *
     * A leitura trata valor torto como ligado, porque lá o dado já está no
     * banco e a escolha é entre interpretações. Aqui o dado está chegando, e
     * normalizar em silêncio esconderia do operador que ele pediu uma coisa e
     * recebeu outra.
     */
    if (typeof corpo.ligado !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "informe `ligado` como true ou false" },
        { status: 400 },
      );
    }

    const projeto = await getProjectById(id);
    if (!projeto) {
      return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
    }

    const settings = { ...(projeto.settings ?? {}) };
    const atuais = (settings.moldes ?? {}) as Record<string, unknown>;
    settings.moldes = { ...atuais, [molde]: corpo.ligado };

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from("projects")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    console.log(
      `[ADMIN MOLDES] ${projeto.slug}: ${molde} = ${corpo.ligado ? "ligado" : "desligado"}`,
    );

    return NextResponse.json({ ok: true, moldes: moldesDeclarados({ settings }) });
  } catch (err) {
    console.error("[ADMIN MOLDES]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao gravar o molde." },
      { status: 500 },
    );
  }
}
