import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminOrCron } from "@/lib/server/api-auth";
import { enviarAlerta } from "@/lib/server/alerts";

/**
 * Testa o canal de alerta pelo caminho REAL da aplicação.
 *
 * Existe porque a pergunta "o Telegram funciona?" só tem resposta útil quando
 * feita de dentro do contêiner, com o env do contêiner e o mesmo módulo que o
 * cron usa. Chamar a API do Telegram por fora prova que o token do
 * repositório funciona, e não é isso que se quer saber.
 *
 * A alternativa seria provocar uma falha real da redação em produção para ver
 * se o alerta sai. Esta rota é essa mesma prova, sem o efeito colateral.
 *
 * Devolve o desfecho detalhado e nenhum segredo: só se as variáveis existem,
 * o status do Telegram e a descrição que ele mandou.
 */
async function handle(req: NextRequest) {
  const denied = await requireAdminOrCron(req);
  if (denied) return denied;

  const marca = req.nextUrl.searchParams.get("marca")?.slice(0, 40) || "sem marca";

  const resultado = await enviarAlerta(
    "info",
    "Diagnóstico do canal de alerta",
    `Disparado pela rota de diagnóstico, pelo mesmo módulo que o cron usa. Marca: ${marca}. ` +
      `Se você está lendo isto no Telegram, o caminho da aplicação está saudável.`,
  );

  return NextResponse.json({
    ok: resultado.enviado,
    canal: "telegram",
    ...resultado,
    ambiente: {
      temToken: Boolean(String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim()),
      temChatId: Boolean(String(process.env.TELEGRAM_CHAT_ID ?? "").trim()),
      temHealthcheck: Boolean(String(process.env.HEALTHCHECK_NEWSROOM_URL ?? "").trim()),
    },
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
