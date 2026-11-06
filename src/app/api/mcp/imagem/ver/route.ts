import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { verImagem } from "@/lib/server/mcp/imagem";

/** `ver_imagem`, para o servidor local do MCP. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "ver_imagem", (acesso) => verImagem(acesso, corpo));
}

export const maxDuration = 120;
