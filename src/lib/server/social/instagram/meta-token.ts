import { optionalEnv } from "../../env";
import { getProjectCredentials, upsertProjectCredentials } from "../../projects";
import { sendAlert } from "../../alerts";

/**
 * Token de longa duração da Meta: persistência + renovação automática + alerta
 * de expiração.
 *
 * O token vinha só de `INSTAGRAM_ACCESS_TOKEN` (env fixa) e expira em ~60 dias
 * sem aviso. Agora ele mora em `project_credentials` (provider "instagram",
 * `config.access_token`), com a env servindo de semente inicial. Um cron diário
 * (`/api/cron/refresh-instagram-token`) checa a validade, renova quando falta
 * pouco e alerta se não conseguir.
 */

const GRAPH = "https://graph.facebook.com/v22.0";
const REFRESH_THRESHOLD_DAYS = 10;
const URGENT_THRESHOLD_DAYS = 3;

type Env = Record<string, string | undefined>;

/**
 * Token efetivo pra publicar: o de `project_credentials` se houver, senão a env.
 */
export async function resolveInstagramToken(projectId: string, env: Env = process.env): Promise<string> {
  try {
    const cred = await getProjectCredentials(projectId, "instagram");
    const stored = cred?.access_token;
    if (typeof stored === "string" && stored.trim().length > 0) return stored.trim();
  } catch (err) {
    console.error("[META TOKEN] Falha ao ler credencial persistida, usando env:", err);
  }
  return optionalEnv("INSTAGRAM_ACCESS_TOKEN", env) ?? "";
}

type DebugTokenData = {
  is_valid?: boolean;
  expires_at?: number; // epoch seconds; 0 = nunca expira
  scopes?: string[];
};

async function debugToken(token: string): Promise<DebugTokenData | null> {
  try {
    const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return (json?.data as DebugTokenData) ?? null;
  } catch {
    return null;
  }
}

async function exchangeForLongLived(token: string, appId: string, appSecret: string): Promise<{ token: string; expiresInSec: number } | null> {
  try {
    const url =
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.access_token) return null;
    return { token: json.access_token as string, expiresInSec: Number(json.expires_in ?? 60 * 24 * 3600) };
  } catch {
    return null;
  }
}

export type TokenCheckResult = {
  ok: boolean;
  isValid: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
  refreshed: boolean;
  message: string;
};

export async function checkAndRefreshInstagramToken(
  projectId: string,
  env: Env = process.env,
): Promise<TokenCheckResult> {
  const token = await resolveInstagramToken(projectId, env);
  if (!token) {
    await sendAlert("critical", "Instagram sem token", "Nenhum INSTAGRAM_ACCESS_TOKEN configurado nem persistido.", env);
    return { ok: false, isValid: false, expiresAt: null, daysLeft: null, refreshed: false, message: "sem token" };
  }

  const info = await debugToken(token);
  if (!info) {
    await sendAlert("critical", "Token do Instagram: falha ao verificar", "A chamada ao debug_token da Meta não respondeu ou deu erro.", env);
    return { ok: false, isValid: false, expiresAt: null, daysLeft: null, refreshed: false, message: "debug_token falhou" };
  }

  const neverExpires = !info.expires_at || info.expires_at === 0;
  const expiresAtIso = neverExpires ? null : new Date(info.expires_at! * 1000).toISOString();
  const daysLeft = neverExpires ? null : Math.floor((info.expires_at! * 1000 - Date.now()) / 86_400_000);

  // Persiste o que sabemos (mantém o token atual, atualiza a validade).
  await safePersist(projectId, token, expiresAtIso);

  if (info.is_valid === false) {
    await sendAlert("critical", "Token do Instagram inválido", "O token foi revogado ou expirou. Gere um novo no painel da Meta e atualize INSTAGRAM_ACCESS_TOKEN.", env);
    return { ok: false, isValid: false, expiresAt: expiresAtIso, daysLeft, refreshed: false, message: "token inválido" };
  }

  if (neverExpires || (daysLeft ?? 999) > REFRESH_THRESHOLD_DAYS) {
    return { ok: true, isValid: true, expiresAt: expiresAtIso, daysLeft, refreshed: false, message: "token ok" };
  }

  // Falta pouco: tentar renovar.
  const appId = optionalEnv("META_APP_ID", env);
  const appSecret = optionalEnv("META_APP_SECRET", env);

  if (appId && appSecret) {
    const exchanged = await exchangeForLongLived(token, appId, appSecret);
    if (exchanged) {
      const newExpiry = new Date(Date.now() + exchanged.expiresInSec * 1000).toISOString();
      await safePersist(projectId, exchanged.token, newExpiry);
      await sendAlert("info", "Token do Instagram renovado", `Nova validade: ${newExpiry.slice(0, 10)}.`, env);
      return { ok: true, isValid: true, expiresAt: newExpiry, daysLeft: Math.floor(exchanged.expiresInSec / 86_400), refreshed: true, message: "renovado" };
    }
  }

  const why = appId && appSecret ? "a troca fb_exchange_token falhou" : "META_APP_ID/META_APP_SECRET não configurados";
  const level = (daysLeft ?? 0) <= URGENT_THRESHOLD_DAYS ? "critical" : "warning";
  await sendAlert(
    level,
    `Token do Instagram expira em ${daysLeft} dia(s)`,
    `Não foi possível renovar automaticamente (${why}). Gere um token de longa duração novo e atualize INSTAGRAM_ACCESS_TOKEN antes de ${expiresAtIso?.slice(0, 10)}.`,
    env,
  );
  return { ok: false, isValid: true, expiresAt: expiresAtIso, daysLeft, refreshed: false, message: "renovação necessária" };
}

async function safePersist(projectId: string, token: string, expiresAt: string | null): Promise<void> {
  try {
    await upsertProjectCredentials(projectId, "instagram", { access_token: token }, expiresAt);
  } catch (err) {
    console.error("[META TOKEN] Falha ao persistir credencial:", err);
  }
}
