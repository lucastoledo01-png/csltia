import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { modoDosRamos } from "@/lib/server/ramos/modo";
import { publicarArtigosAprovados, revisaoExigidaPeloProjeto } from "@/lib/server/ramos/portal";
import { formatError, sendAlert } from "@/lib/server/alerts";
import { criarFilaStore } from "@/lib/server/aprovacao/fila-store";
import {
  artigosLiberadosPeloPortao,
  portalPerguntaAFila,
  type ArtigoCandidato,
} from "@/lib/server/aprovacao/portao-do-portal";

/**
 * Publicação das matérias do portal nos horários do dia (RF-14).
 *
 * O crontab chama esta rota em cada horário do portal (hoje 06:07, 12:00 e
 * 18:00 de Brasília). Ela publica só o que está `scheduled` e com o horário
 * vencido, e APROVADO quando a fila de aprovação está em `enforce`; o resto
 * fica onde está. Chamar fora de hora não publica nada
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

    /*
     * Portão único (integração de 05/10/2026): com a fila de aprovação fora de
     * `off`, cada matéria vencida passa por `decidirPublicacao` antes de sair,
     * a mesma pergunta que a liberação da fila e o relógio da publicação
     * fazem. Em `off` a publicação é a de antes, sem uma leitura a mais.
     */
    const client = getSupabaseAdminClient();
    const portao = portalPerguntaAFila(project)
      ? (candidatos: ArtigoCandidato[]) => artigosLiberadosPeloPortao(project, candidatos, criarFilaStore(client))
      : undefined;
    /*
     * Sem a fila em `enforce` não há quem grave `approved`, e exigir isso
     * deixava a matéria `scheduled` para sempre (correção de 05/10/2026).
     */
    const r = await publicarArtigosAprovados(client, project.id, new Date(), portao, revisaoExigidaPeloProjeto(project));
    for (const s of r.segurados ?? []) console.log(`[CRON PORTAL] segurado pela fila: ${s.rotulo} (${s.motivo})`);
    if (r.erro) {
      await sendAlert("warning", "Portal não publicou as matérias do horário", r.erro);
      return NextResponse.json({ ok: false, error: r.erro }, { status: 500 });
    }
    return NextResponse.json({ ok: true, publicados: r.publicados, segurados: r.segurados ?? [] });
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
