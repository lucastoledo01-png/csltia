import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "../admin-auth";
import { isAdminSessionActive } from "../admin-session";
import { getAdminSessionSecret } from "../env";

/**
 * A mesma porta de `requireAdmin`, para uma PÁGINA do servidor (06/10/2026).
 *
 * As telas do painel são clientes que perguntam à API, e a API confere o
 * cookie. A prévia da matéria na fila é diferente: ela é renderizada no
 * servidor, com os componentes do portal, a partir de uma matéria que ainda
 * não foi publicada. Sem esta conferência, quem tivesse o endereço leria a
 * matéria antes da hora. Falha fechado: segredo ausente, assinatura torta ou
 * sessão revogada no banco, tudo é "fora".
 */
export async function sessaoDoPainelValida(): Promise<boolean> {
  try {
    const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
    const payload = verifyAdminSessionToken(getAdminSessionSecret(), token);
    if (!payload) return false;
    return await isAdminSessionActive(payload.sessionId);
  } catch {
    return false;
  }
}
