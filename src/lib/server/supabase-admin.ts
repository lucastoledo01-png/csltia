import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://azqpdesusdzqndvsqmko.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_W40ZpaoRMiB4AtoKygSOAQ_8C5NxeoG";

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_KEY;

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
