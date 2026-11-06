import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { imagensDaPagina } from "@/lib/server/mcp/imagem";

/** `imagens_da_pagina`, para o servidor local do MCP. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "imagens_da_pagina", (acesso) => imagensDaPagina(acesso, corpo));
}

export const maxDuration = 120;
