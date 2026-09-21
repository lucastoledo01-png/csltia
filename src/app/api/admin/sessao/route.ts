import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";

/**
 * A pergunta que o navegador faz antes de desenhar o painel: eu ainda estou
 * dentro?
 *
 * O painel respondia isso sozinho, com uma marca em `sessionStorage` gravada no
 * login. A marca não expira junto com o cookie assinado, que é quem manda de
 * verdade: com a sessão vencida, a tela abria inteira, mostrava a barra lateral,
 * e todas as chamadas por trás devolviam 401 em silêncio. Quem opera via um
 * painel vazio sem saber que precisa entrar de novo.
 *
 * Aqui quem responde é o mesmo `requireAdmin` que protege as outras rotas, e a
 * resposta é a verdade, não uma lembrança.
 */
export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  return NextResponse.json({ ok: true });
}
