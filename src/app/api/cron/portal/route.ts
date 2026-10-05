import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { modoDosRamos } from "@/lib/server/ramos/modo";
import { publicarArtigosAprovados } from "@/lib/server/ramos/portal";
import { formatError, sendAlert } from "@/lib/server/alerts";

/**
 * Publicação das matérias do portal nos horários do dia (RF-14).
 *
 * O crontab chama esta rota em cada horário do portal (hoje 06:07, 12:00 e
 * 18:00 de Brasília). Ela publica só o que está `scheduled`, APROVADO e com o
 * horário vencido; o resto fica onde está. Chamar fora de hora não publica nada
 * a mais, então o cron pode ser generoso sem risco.
 *
 * Com os ramos fora de `enforce` a rota responde e não toca em nada: nenhum
 * artigo agendado existe nesse modo, e a guarda aqui é o cinto.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const projectId = req.nextUrl.searchParams.get("projectId") || DEFAULT_PROJECT_ID;
    const project = await requireActiveProject(projectId);
    const modo = modoDosRamos(process.env, project);
    if (modo !== "enforce") {
      return NextResponse.json({ ok: true, publicados: [], motivo: `ramos em ${modo}, nada a publicar` });
    }

    const r = await publicarArtigosAprovados(getSupabaseAdminClient(), project.id);
    if (r.erro) {
      await sendAlert("warning", "Portal não publicou as matérias do horário", r.erro);
      return NextResponse.json({ ok: false, error: r.erro }, { status: 500 });
    }
    return NextResponse.json({ ok: true, publicados: r.publicados });
  } catch (err) {
    await sendAlert("warning", "Cron do portal falhou", formatError(err));
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
