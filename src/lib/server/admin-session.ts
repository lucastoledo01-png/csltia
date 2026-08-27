import { getSupabaseAdminClient } from "./supabase-admin";
import type { AdminSessionPayload } from "./admin-auth";

/**
 * Registro das sessões de admin na tabela `admin_sessions`.
 *
 * A assinatura do cookie prova que o token foi emitido por nós, mas só o
 * registro no banco permite encerrar uma sessão antes do prazo. Sem isso não
 * existe logout de verdade nem como cortar acesso de um token vazado.
 *
 * Todas as funções falham fechado: se o banco não responder, a sessão é
 * tratada como inválida.
 */

export async function persistAdminSession(
  payload: AdminSessionPayload,
  label = "admin-panel",
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("admin_sessions").insert({
      id: payload.sessionId,
      label,
      expires_at: new Date(payload.expiresAt).toISOString(),
    });

    if (error) {
      console.error("[ADMIN SESSION] Falha ao registrar sessão:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[ADMIN SESSION] Exceção ao registrar sessão:", err);
    return false;
  }
}

export async function isAdminSessionActive(sessionId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("admin_sessions")
      .select("id, expires_at, revoked_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (error || !data) return false;
    if (data.revoked_at) return false;

    return new Date(data.expires_at).getTime() > Date.now();
  } catch (err) {
    console.error("[ADMIN SESSION] Exceção ao validar sessão:", err);
    return false;
  }
}

export async function revokeAdminSession(sessionId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", sessionId);
  } catch (err) {
    console.error("[ADMIN SESSION] Exceção ao revogar sessão:", err);
  }
}
