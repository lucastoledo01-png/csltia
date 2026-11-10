import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { complementarODia } from "@/lib/server/mcp/dia/servico";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `complementar_o_dia`: mais pautas para um dia já aprovado (10/11/2026). */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "complementar o dia", (acesso) => complementarODia(acesso, corpo, getSupabaseAdminClient()));
}

export const maxDuration = 120;
