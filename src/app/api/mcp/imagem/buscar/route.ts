import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { buscarImagens } from "@/lib/server/mcp/imagem";

/** `buscar_imagens`, para o servidor local do MCP. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "buscar_imagens", (acesso) => buscarImagens(acesso, corpo));
}

export const maxDuration = 120;
