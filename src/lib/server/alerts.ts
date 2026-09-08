import { optionalEnv } from "./env";

/**
 * Alertas operacionais via Telegram + ping do watchdog (healthchecks.io).
 *
 * Duas regras aqui:
 * 1. Nada nunca lança. Um alerta que falha não pode derrubar o cron que o
 *    disparou — todo caminho é try/catch com log.
 * 2. Sem env configurada, é no-op. Mas NÃO silencioso: ver a nota abaixo.
 *
 * Sobre o silêncio, que já custou caro. A regra 2 dizia "no-op silencioso", e
 * em 06, 07 e 08 de setembro de 2026 três alertas críticos da redação não
 * chegaram sem deixar rastro utilizável: a única evidência era um
 * `console.warn` dentro do contêiner, que ninguém lê e que não distingue
 * "não configurado" de "o Telegram recusou". Canal de monitoramento quebrado
 * precisa gritar, e gritar com o dado que permite consertar.
 *
 * Agora todo desfecho sai como uma linha estruturada em JSON, com o motivo
 * nomeado e sem nenhum segredo. E `enviarAlerta` devolve esse desfecho, para
 * quem quiser conferir o canal sem ter que ler log de contêiner.
 */

export type AlertLevel = "critical" | "warning" | "info";

const LEVEL_PREFIX: Record<AlertLevel, string> = {
  critical: "🔴 CRÍTICO",
  warning: "🟡 ATENÇÃO",
  info: "🔵 INFO",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Teto do Telegram para o texto inteiro da mensagem. */
const LIMITE_DO_TELEGRAM = 4096;

/** Quanto do detalhe entra ANTES do escape, que pode multiplicar por até 4. */
const LIMITE_DO_DETALHE = 3500;

/**
 * Garante que a mensagem cabe no limite do Telegram.
 *
 * O corte de 3500 é aplicado ao detalhe cru e o escape vem depois: um stack
 * trace cheio de `<` e `&` cresce e pode passar de 4096, e aí o Telegram
 * responde 400 "message is too long" e o alerta simplesmente não chega. Cortar
 * a mensagem é sempre melhor que não mandá-la.
 */
function cortarNoLimite(texto: string): string {
  if (texto.length <= LIMITE_DO_TELEGRAM) return texto;
  const fecha = "\n...</pre>";
  return texto.slice(0, LIMITE_DO_TELEGRAM - fecha.length) + fecha;
}

/**
 * O desfecho de uma tentativa de alerta, sem nenhum segredo dentro.
 *
 * `tamanhoDoTexto` está aqui porque o limite do Telegram é 4096 caracteres no
 * texto inteiro, e o corpo é escapado depois de cortado: um detalhe cheio de
 * `<` ou `&` cresce até 4x no escape e pode passar do limite sem que o corte
 * de 3500 tenha percebido.
 */
export type ResultadoDoAlerta = {
  enviado: boolean;
  motivo:
    | "enviado"
    | "sem_token"
    | "sem_chat_id"
    | "telegram_recusou"
    | "erro_de_rede";
  /** Status HTTP do Telegram, quando houve resposta. */
  status: number | null;
  /** `description` do Telegram, que é onde o motivo real aparece. */
  descricao: string | null;
  tamanhoDoTexto: number;
  ms: number;
};

/**
 * Manda um alerta pro Telegram e devolve o desfecho detalhado.
 *
 * Nunca lança e nunca devolve segredo. É esta função que o diagnóstico do
 * canal usa, para o teste passar exatamente pelo mesmo módulo, processo e
 * ambiente que o cron usa.
 */
export async function enviarAlerta(
  level: AlertLevel,
  title: string,
  detail?: string,
  env: Record<string, string | undefined> = process.env,
): Promise<ResultadoDoAlerta> {
  const inicio = Date.now();
  const token = optionalEnv("TELEGRAM_BOT_TOKEN", env);
  const chatId = optionalEnv("TELEGRAM_CHAT_ID", env);

  const registrar = (r: ResultadoDoAlerta): ResultadoDoAlerta => {
    if (!r.enviado) {
      // Linha única, estruturada, sem segredo: é o que permite descobrir um
      // canal quebrado sem entrar no contêiner.
      console.error(
        `[ALERT FALHOU] ${JSON.stringify({
          alertType: title,
          level,
          motivo: r.motivo,
          status: r.status,
          descricao: r.descricao,
          tamanhoDoTexto: r.tamanhoDoTexto,
          ms: r.ms,
          temToken: Boolean(token),
          temChatId: Boolean(chatId),
        })}`,
      );
    }
    return r;
  };

  if (!token) {
    return registrar({
      enviado: false,
      motivo: "sem_token",
      status: null,
      descricao: "TELEGRAM_BOT_TOKEN ausente ou vazio",
      tamanhoDoTexto: 0,
      ms: Date.now() - inicio,
    });
  }

  if (!chatId) {
    return registrar({
      enviado: false,
      motivo: "sem_chat_id",
      status: null,
      descricao: "TELEGRAM_CHAT_ID ausente ou vazio",
      tamanhoDoTexto: 0,
      ms: Date.now() - inicio,
    });
  }

  const lines = [`<b>${LEVEL_PREFIX[level]}</b>`, escapeHtml(title)];
  if (detail) lines.push("", `<pre>${escapeHtml(detail.slice(0, LIMITE_DO_DETALHE))}</pre>`);
  const text = cortarNoLimite(lines.join("\n"));

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      let descricao = corpo.slice(0, 300);
      try {
        const json = JSON.parse(corpo) as { description?: string };
        if (json.description) descricao = json.description;
      } catch {
        // Corpo não-JSON: fica o texto cru, já cortado.
      }
      return registrar({
        enviado: false,
        motivo: "telegram_recusou",
        status: res.status,
        descricao,
        tamanhoDoTexto: text.length,
        ms: Date.now() - inicio,
      });
    }

    return {
      enviado: true,
      motivo: "enviado",
      status: res.status,
      descricao: null,
      tamanhoDoTexto: text.length,
      ms: Date.now() - inicio,
    };
  } catch (err) {
    return registrar({
      enviado: false,
      motivo: "erro_de_rede",
      status: null,
      descricao: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      tamanhoDoTexto: text.length,
      ms: Date.now() - inicio,
    });
  }
}

/**
 * Manda um alerta pro Telegram. Retorna `true` se enviou, `false` se no-op ou
 * falhou (o motivo vai pro log estruturado, ver `enviarAlerta`).
 */
export async function sendAlert(
  level: AlertLevel,
  title: string,
  detail?: string,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const r = await enviarAlerta(level, title, detail, env);
  return r.enviado;
}

/**
 * Ping do healthchecks.io. `event` undefined = sucesso; "start" antes de rodar;
 * "fail" quando deu erro. No-op sem url.
 */
export async function pingHealthcheck(
  url: string | undefined,
  event?: "start" | "fail",
): Promise<void> {
  if (!url) return;
  const target = event ? `${url.replace(/\/$/, "")}/${event}` : url;
  try {
    await fetch(target, { method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    console.error(`[HEALTHCHECK] Falha ao pingar (${event ?? "success"}):`, err);
  }
}

export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ? `${err.message}\n${err.stack.split("\n").slice(1, 4).join("\n")}` : err.message;
  }
  return String(err);
}
