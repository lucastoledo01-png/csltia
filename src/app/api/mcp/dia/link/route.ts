import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { pautaDoLink } from "@/lib/server/mcp/dia/servico";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `pauta_do_link`: a notícia de um link vira post, matéria e newsletter do dia (10/11/2026). */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "pauta do link", (acesso) => pautaDoLink(acesso, corpo, getSupabaseAdminClient()));
}

export const maxDuration = 120;
