import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import {
  carregarFunilPermanente,
  garantirFunilPermanente,
} from "@/lib/server/prompt-system/funil-permanente";

/**
 * Estado e acionamento do funil permanente.
 *
 * A automação é criada na primeira publicação depois de a campanha existir, e
 * o worker roda em ciclo de 15 minutos. Sem esta rota, conferir se o funil
 * está de pé significaria publicar um post e esperar — e, se algo estivesse
 * errado, descobrir só quando alguém comentasse a palavra e não recebesse
 * nada.
 *
 * O POST é idempotente porque `garantirFunilPermanente` é: com a automação já
 * criada, ele lê uma linha do banco e sai sem falar com o OpenReply.
 */
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const campanha = await carregarFunilPermanente();

  if (!campanha) {
    return NextResponse.json({
      ok: true,
      configurado: false,
      resumo: "Nenhuma campanha marcada como permanente neste projeto.",
    });
  }

  const faltando = [
    campanha.destination_url ? null : "destino",
    campanha.dm_message ? null : "mensagem do Direct",
    campanha.opening_dm_message ? null : "mensagem de abertura",
  ].filter(Boolean);

  return NextResponse.json({
    ok: true,
    configurado: true,
    keyword: campanha.keyword,
    destino: campanha.destination_url,
    automacaoId: campanha.openreply_automation_id,
    faltando,
    resumo: campanha.openreply_automation_id
      ? `Funil "${campanha.keyword}" ativo no OpenReply.`
      : faltando.length > 0
        ? `Falta preencher: ${faltando.join(", ")}.`
        : `Funil "${campanha.keyword}" pronto, mas a automação ainda não foi criada.`,
  });
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const r = await garantirFunilPermanente();

  return NextResponse.json({
    ok: r.ligado,
    ...r,
    resumo: r.ligado
      ? `Funil "${r.keyword}" ativo (automação ${r.automationId}` +
        `${r.criadaAgora ? ", criada agora" : ", já existia"}).`
      : `Não foi possível ativar: ${r.motivo}`,
  });
}
