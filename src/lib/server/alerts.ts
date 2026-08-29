import { optionalEnv } from "./env";

/**
 * Alertas operacionais via Telegram + ping do watchdog (healthchecks.io).
 *
 * Duas regras aqui:
 * 1. Nada nunca lança. Um alerta que falha não pode derrubar o cron que o
 *    disparou — todo caminho é try/catch com log.
 * 2. Sem env configurada, é no-op silencioso (só um `console.warn` na primeira
 *    vez). Mesmo padrão do `isConfigured` do `meta-client.ts`.
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

/**
 * Manda um alerta pro Telegram. Retorna `true` se enviou, `false` se no-op ou
 * falhou (o motivo vai pro log).
 */
export async function sendAlert(
  level: AlertLevel,
  title: string,
  detail?: string,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const token = optionalEnv("TELEGRAM_BOT_TOKEN", env);
  const chatId = optionalEnv("TELEGRAM_CHAT_ID", env);

  if (!token || !chatId) {
    console.warn(`[ALERT ${level}] ${title}${detail ? ` — ${detail}` : ""} (Telegram não configurado)`);
    return false;
  }

  const lines = [`<b>${LEVEL_PREFIX[level]}</b>`, escapeHtml(title)];
  if (detail) lines.push("", `<pre>${escapeHtml(detail.slice(0, 3500))}</pre>`);
  const text = lines.join("\n");

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[ALERT] Telegram respondeu ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ALERT] Falha ao enviar pro Telegram:", err);
    return false;
  }
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
