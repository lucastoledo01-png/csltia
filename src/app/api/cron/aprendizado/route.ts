import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { formatError, sendAlert } from "@/lib/server/alerts";
import { listProjects } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarFilaStore } from "@/lib/server/aprovacao/fila-store";
import { modoDaFila } from "@/lib/server/aprovacao/modo";
import { chamarModeloDeProducao, resumirEdicoesDaSemana } from "@/lib/server/aprendizado/edicoes";

/**
 * O resumo semanal das edições do editor (06/10/2026).
 *
 * Toda segunda-feira às 08:00 de Brasília (crontab `0 11 * * 1`, em UTC),
 * cada projeto com a fila fora de `off` tem as edições à mão da semana lidas
 * por UMA chamada de modelo, que devolve os padrões de cada canal como
 * PROPOSTAS de regra, com os exemplos que as sustentam. Nada vira regra aqui:
 * o dono aprova no painel de aprendizado. O botão "Resumir agora" do painel
 * roda a mesma função, por `/api/admin/aprendizado`.
 *
 * Projeto sem edição na semana não chama o modelo. Rodar duas vezes na mesma
 * semana não duplica proposta: a chave da proposta sai da regra, e a
 * unicidade (projeto, canal, etapa, chave) atualiza a mesma linha.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const store = criarFilaStore(getSupabaseAdminClient());
    const chamarModelo = chamarModeloDeProducao();
    const resultados: Record<string, unknown> = {};
    for (const projeto of await listProjects(true)) {
      if (modoDaFila(projeto) === "off") continue;
      const r = await resumirEdicoesDaSemana({ id: projeto.id }, { store, chamarModelo });
      resultados[projeto.slug] = r;
      if (r.erro) await sendAlert("warning", "Resumo semanal das edições falhou", `${projeto.slug}: ${r.erro}`);
      if (r.propostas.length > 0) {
        await sendAlert(
          "info",
          "Novas propostas de regra",
          `${projeto.slug}: ${r.propostas.length} proposta(s) das edições da semana esperam decisão no painel de aprendizado.`,
        );
      }
    }
    return NextResponse.json({ ok: true, resultados });
  } catch (err) {
    await sendAlert("critical", "Cron do aprendizado falhou", formatError(err));
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
