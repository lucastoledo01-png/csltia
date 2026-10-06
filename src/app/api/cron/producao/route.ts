import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { formatError, pingHealthcheck, sendAlert } from "@/lib/server/alerts";
import { produzirNaVespera, type DesfechoDaProducao } from "@/lib/server/producao-vespera";
import { DEFAULT_PROJECT_ID, getProjectBySlug } from "@/lib/server/projects";
import { avisarFimDaProducaoDoProjeto } from "@/lib/server/avisos/gancho";

export const maxDuration = 300;

/**
 * A produção das 17:00 (RF-01, 05/10/2026): segunda a quinta, tudo do dia
 * seguinte. A decisão de produzir ou não, e para qual dia, é do projeto
 * (`cadencia.ts`), e não desta rota nem do crontab: o crontab só acorda a rota.
 *
 * Responde 202 e segue trabalhando, pelo mesmo motivo da rota das 06:03: a
 * produção leva minutos e o proxy da hospedagem corta antes. O acompanhamento é
 * `newsroom_runs`, onde TODO desfecho deixa linha, inclusive "capacidade
 * desligada" e "hoje não é dia de produção". `?wait=1` aguarda o fim.
 *
 * `?projeto=<slug>` escolhe o projeto; sem ele, o projeto semente, igual à
 * rota das 06:03 (multiprojeto no cron ainda é decisão em aberto).
 */

async function relatar(
  desfecho: DesfechoDaProducao,
  healthcheck: string | undefined,
  projetoId: string,
): Promise<void> {
  console.log(
    `[CRON PRODUCAO] ${desfecho.projeto}: ${desfecho.decisao.motivo} (${desfecho.modo}), alvo ${desfecho.decisao.alvo}` +
      (desfecho.erro ? `, erro: ${desfecho.erro}` : ""),
  );

  if (!desfecho.ok) {
    await sendAlert(
      "critical",
      "Produção da véspera falhou",
      `Projeto ${desfecho.projeto}, edição de ${desfecho.decisao.alvo}.\n${desfecho.erro ?? "ver newsroom_runs"}`,
    );
    await pingHealthcheck(healthcheck, "fail");
    return;
  }

  // Dia que não produz por decisão (capacidade desligada, fim de semana) é
  // sucesso para o watchdog: a chamada chegou e foi decidida, com linha no banco.
  await pingHealthcheck(healthcheck);

  // A fila pronta (ou "não produziu nada") sai daqui, no fim da produção. Se
  // este aviso se perder, o cron dos avisos o manda a partir das 17:30.
  await avisarFimDaProducaoDoProjeto(projetoId, desfecho);
}

async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const aguardar = req.nextUrl.searchParams.get("wait") === "1";
  const slug = req.nextUrl.searchParams.get("projeto")?.trim();
  const healthcheck = process.env.HEALTHCHECK_PRODUCAO_URL;

  let projetoId = DEFAULT_PROJECT_ID;
  if (slug) {
    const projeto = await getProjectBySlug(slug).catch(() => null);
    if (!projeto) return NextResponse.json({ ok: false, error: `projeto "${slug}" não encontrado` }, { status: 404 });
    projetoId = projeto.id;
  }

  void pingHealthcheck(healthcheck, "start");
  const execucao = produzirNaVespera(projetoId);

  if (aguardar) {
    try {
      const desfecho = await execucao;
      await relatar(desfecho, healthcheck, projetoId);
      return NextResponse.json(desfecho, { status: desfecho.ok ? 200 : 500 });
    } catch (err) {
      // `produzirNaVespera` não lança por contrato; isto é a rede de baixo.
      await sendAlert("critical", "Produção da véspera quebrou", formatError(err));
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  execucao
    .then((desfecho) => relatar(desfecho, healthcheck, projetoId))
    .catch(async (err) => {
      console.error("[CRON PRODUCAO ERROR]", err);
      await sendAlert("critical", "Produção da véspera quebrou", formatError(err));
      await pingHealthcheck(healthcheck, "fail");
    });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      startedAt: new Date().toISOString(),
      message: "Produção da véspera iniciada. Acompanhe em newsroom_runs.",
    },
    { status: 202 },
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
