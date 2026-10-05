import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { capacidadeDeclarada } from "@/lib/server/capacidades";
import { CATALOGO_DE_ETAPAS } from "@/lib/server/instrucoes-catalogo";
import {
  RecusaDaInstrucao,
  ativarVersao,
  criarVersao,
  listarVersoes,
  voltarAoPadrao,
} from "@/lib/server/instrucoes-store";
import { getProjectById } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * As instruções editoriais de um projeto (RF-26, 05/10/2026).
 *
 *   GET    o catálogo de etapas, com o texto do código e as versões gravadas
 *   POST   { etapa, texto, autor? }  grava a próxima versão, já ativa
 *   PATCH  { acao: "ativar", id }    rollback para uma versão anterior
 *          { acao: "padrao", etapa } volta ao texto do código
 *
 * Nada aqui toca no contrato de saída: o painel só vê e só grava o trecho
 * editorial de cada prompt. Ver `instrucoes.ts`.
 */

type Ctx = { params: Promise<{ id: string }> };

function falha(err: unknown) {
  if (err instanceof RecusaDaInstrucao) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
  console.error("[ADMIN INSTRUCOES]", err);
  return NextResponse.json(
    { ok: false, error: err instanceof Error ? err.message : "Falha nas instruções." },
    { status: 500 },
  );
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  try {
    const projeto = await getProjectById(id);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });

    /*
     * A tabela pode ainda não existir: a migration é do dono. O painel mostra o
     * catálogo assim mesmo, com o aviso, em vez de uma tela de erro que
     * esconde o texto do código, que é o que está valendo.
     */
    let versoes: Awaited<ReturnType<typeof listarVersoes>> = [];
    let aviso: string | null = null;
    try {
      versoes = await listarVersoes(getSupabaseAdminClient(), id);
    } catch (e) {
      aviso = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({
      ok: true,
      capacidade: capacidadeDeclarada(projeto, "instrucoes") ?? "off",
      aviso,
      etapas: CATALOGO_DE_ETAPAS.map((d) => ({
        ...d,
        versoes: versoes.filter((v) => v.etapa === d.etapa),
      })),
    });
  } catch (err) {
    return falha(err);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  try {
    const corpo = (await req.json().catch(() => ({}))) as { etapa?: unknown; texto?: unknown; autor?: unknown };
    const autor = typeof corpo.autor === "string" && corpo.autor.trim() ? corpo.autor.trim().slice(0, 80) : "painel";
    const versao = await criarVersao(getSupabaseAdminClient(), {
      projetoId: id,
      etapa: String(corpo.etapa ?? ""),
      texto: typeof corpo.texto === "string" ? corpo.texto : "",
      criadoPor: autor,
    });
    return NextResponse.json({ ok: true, versao });
  } catch (err) {
    return falha(err);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  try {
    const corpo = (await req.json().catch(() => ({}))) as { acao?: unknown; id?: unknown; etapa?: unknown };
    const cliente = getSupabaseAdminClient();

    if (corpo.acao === "ativar") {
      const versao = await ativarVersao(cliente, { projetoId: id, id: String(corpo.id ?? "") });
      return NextResponse.json({ ok: true, versao });
    }
    if (corpo.acao === "padrao") {
      await voltarAoPadrao(cliente, { projetoId: id, etapa: String(corpo.etapa ?? "") });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: 'acao precisa ser "ativar" ou "padrao"' }, { status: 400 });
  } catch (err) {
    return falha(err);
  }
}
