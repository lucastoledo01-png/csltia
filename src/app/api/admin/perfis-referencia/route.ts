import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarPerfisStore } from "@/lib/server/social/perfis-referencia/store";
import { normalizarHandle } from "@/lib/server/social/perfis-referencia/graph";
import { modoDosPerfisDeReferencia } from "@/lib/server/social/perfis-referencia/modo";
import { falhaDoBanco, projetoDoPedido } from "./comum";

/**
 * Os perfis de referência de um projeto, com a última leitura de cada um.
 *
 * A última leitura vem junto porque é a pergunta que o operador faz ao abrir a
 * tela: o perfil está sendo lido, e está trazendo alguma coisa? O modo vem
 * junto porque cadastrar perfil com a capacidade desligada não faz nada, e a
 * tela precisa dizer isso em vez de deixar o operador esperar.
 */
export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const p = await projetoDoPedido(req.nextUrl.searchParams.get("projeto"));
  if ("resposta" in p) return p.resposta;

  try {
    const store = criarPerfisStore(getSupabaseAdminClient());
    const perfis = await store.listar(p.projeto.id);
    const ultimas = await store.ultimasLeituras(
      p.projeto.id,
      perfis.map((x) => x.handle),
    );

    return NextResponse.json({
      ok: true,
      projeto: { id: p.projeto.id, slug: p.projeto.slug, nome: p.projeto.brand.displayName || p.projeto.name },
      modo: modoDosPerfisDeReferencia(p.projeto),
      perfis: perfis.map((x) => ({ ...x, ultimaLeitura: ultimas.get(x.handle) ?? null })),
    });
  } catch (e) {
    return falhaDoBanco(e);
  }
}

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const corpo = (await req.json().catch(() => ({}))) as { projeto?: string; handle?: string; nota?: string };
  const p = await projetoDoPedido(corpo.projeto);
  if ("resposta" in p) return p.resposta;

  const handle = normalizarHandle(String(corpo.handle ?? ""));
  if (!handle) {
    return NextResponse.json(
      { ok: false, error: "nome de usuário inválido: use letras, números, ponto e sublinhado, até 30" },
      { status: 400 },
    );
  }

  try {
    const perfil = await criarPerfisStore(getSupabaseAdminClient()).criar(
      p.projeto.id,
      handle,
      String(corpo.nota ?? "").trim(),
    );
    return NextResponse.json({ ok: true, perfil });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate key|23505/i.test(msg)) {
      return NextResponse.json({ ok: false, error: `@${handle} já está cadastrado neste projeto` }, { status: 409 });
    }
    return falhaDoBanco(e);
  }
}
