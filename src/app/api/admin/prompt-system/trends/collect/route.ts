import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrCron } from "@/lib/server/api-auth";
import { coletarETriarTendencias, type TendenciaBruta } from "@/lib/server/prompt-system/trends";

/**
 * Etapa 1: coleta e tria tendências.
 *
 * Aceita sessão de admin **ou** o segredo do cron — a coleta é candidata a
 * rodar diária, e o topo do funil não deveria depender de alguém abrir o painel.
 */
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authErr = await requireAdminOrCron(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));

  // Entrada manual: o painel pode injetar tendências que o operador viu antes
  // dos coletores. É o caminho previsto enquanto a busca por hashtag segue
  // bloqueada pela Meta.
  const extras: TendenciaBruta[] = Array.isArray(body.extras)
    ? body.extras
        .map((e: unknown) => {
          const o = (e ?? {}) as Record<string, unknown>;
          const titulo = String(o.titulo ?? "").trim();
          return titulo ? { titulo, fonte: "manual" as const, categoria: "manual" } : null;
        })
        .filter(Boolean)
        .slice(0, 20)
    : [];

  try {
    const r = await coletarETriarTendencias({
      extras,
      minimoParaPromover: Number(body.minimo ?? 50),
    });

    return NextResponse.json({
      ok: true,
      ...r,
      resumo: `${r.coletadas} coletada(s), ${r.candidatas} candidata(s), ${r.reprovadas} reprovada(s)`,
    });
  } catch (err) {
    console.error("[PROMPT-SYSTEM] Falha na coleta de tendências:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao coletar tendências." },
      { status: 500 },
    );
  }
}
