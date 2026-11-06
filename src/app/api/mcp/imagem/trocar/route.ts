import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { trocarImagem } from "@/lib/server/mcp/imagem";

/** `trocar_imagem`, para o servidor local do MCP. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "trocar_imagem", (acesso) => trocarImagem(acesso, corpo));
}

export const maxDuration = 120;
