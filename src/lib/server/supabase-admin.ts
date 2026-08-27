import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "./env";

/**
 * Cliente Supabase com chave de serviço, exclusivo do servidor.
 *
 * A URL e a chave vinham com valores padrão escritos no código, o que fazia
 * um ambiente mal configurado se conectar silenciosamente a um projeto fixo.
 * Agora a falta de configuração interrompe a operação.
 */
export function getSupabaseAdminClient() {
  const { url, key } = getSupabaseAdminConfig();

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
