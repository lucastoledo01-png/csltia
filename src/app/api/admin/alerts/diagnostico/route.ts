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

  /*
   * O modo que reproduz a forma do cron.
   *
   * O alerta de 06, 07 e 08 de setembro não saía de dentro do handler: a rota
   * do cron responde 202 e deixa o trabalho numa promise solta, e o
   * `sendAlert` acontecia dezenas de segundos DEPOIS da resposta. A
   * documentação desta versão do Next diz que trabalho depois da resposta
   * precisa de `after()`; promise solta não é caminho suportado, e o `fetch`
   * global é envolvido pelo framework dentro do escopo da requisição.
   *
   * Este modo manda dois alertas com marcadores distintos: um de dentro do
   * handler e um de uma promise solta, exatamente como o cron fazia. Qual dos
   * dois falta no Telegram nomeia a causa, sem precisar provocar uma falha
   * real da redação em produção.
   */
  if (req.nextUrl.searchParams.get("desanexado") === "1") {
    const marcador = `${Date.now()}`;

    const doHandler = await enviarAlerta(
      "info",
      `[INLINE ${marcador}] alerta de dentro do handler`,
      "Este saiu antes da resposta, no mesmo escopo da requisição.",
    );

    // Exatamente a forma da rota do cron: promise solta, sem await, depois da
    // resposta. Se este alerta não chegar, a causa está aqui.
    void (async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await enviarAlerta(
        "info",
        `[DESANEXADO ${marcador}] alerta de promise solta`,
        "Este saiu depois da resposta, fora do escopo da requisição, como o cron fazia.",
      );
      console.log(`[DIAGNOSTICO ALERTA] desanexado: ${JSON.stringify(r)}`);
    })();

    return NextResponse.json({
      modo: "comparacao",
      marcador,
      inline: doHandler,
      desanexado: "disparado numa promise solta; confira o Telegram",
      comoLer:
        "Se os dois chegarem, promise solta funciona e a causa e outra. Se so o INLINE chegar, " +
        "a causa e o alerta rodar fora do escopo da requisicao.",
    });
  }

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
