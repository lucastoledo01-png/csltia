import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * A rota que grava a cadência (06/10/2026): exige sessão do painel, toca só
 * em `settings.cadencia`, e devolve os avisos do que vai valer o padrão.
 */

let negar = false;
const gravacoes: Array<Record<string, unknown>> = [];
let projeto: Record<string, unknown>;

vi.mock("@/lib/server/api-auth", () => ({
  requireAdmin: async () => (negar ? new Response(JSON.stringify({ ok: false }), { status: 401 }) : null),
}));
vi.mock("@/lib/server/projects", () => ({
  getProjectById: vi.fn(async () => projeto),
  projectToday: () => "2026-10-06",
}));
vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      update: (linha: Record<string, unknown>) => {
        gravacoes.push(linha);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

const { GET, PUT } = await import("./route");
const ctx = { params: Promise.resolve({ id: "p1" }) };

function put(corpo: unknown) {
  return PUT(
    new NextRequest("https://casaloti.ia.br/api/admin/projetos/p1/cadencia", { method: "PUT", body: JSON.stringify(corpo) }),
    ctx,
  );
}

beforeEach(() => {
  negar = false;
  gravacoes.length = 0;
  projeto = {
    id: "p1",
    slug: "desbuguei",
    timezone: "America/Sao_Paulo",
    settings: { capacidades: { ramos: "enforce" }, portal: { destaque: "chicago" } },
  };
});

describe("/api/admin/projetos/[id]/cadencia", () => {
  it("sem sessão do painel, 401 e nada gravado", async () => {
    negar = true;
    const r = await put({ cadencia: { producao: { horario: "18:00" } } });
    expect(r.status).toBe(401);
    expect(gravacoes).toHaveLength(0);
  });

  it("grava só a cadência e devolve as outras chaves de settings como estavam", async () => {
    const r = await put({ cadencia: { producao: { horario: "18:00" }, portal: { horarios: ["25:00"] } } });
    const corpo = await r.json();

    expect(r.status).toBe(200);
    const settings = gravacoes[0].settings as Record<string, unknown>;
    expect(settings.capacidades).toEqual({ ramos: "enforce" });
    expect(settings.portal).toEqual({ destaque: "chicago" });
    expect(settings.cadencia).toEqual({ producao: { horario: "18:00" }, portal: { horarios: ["25:00"] } });
    expect(corpo.cadencia.producao.horario).toBe("18:00");
    expect(corpo.cadencia.portal.horarios).toEqual(["06:07", "12:00", "18:00"]);
    expect(corpo.avisos).toEqual([expect.stringContaining("portal.horarios")]);
    expect(corpo.avisosDoCrontab[0]).toContain("?relogio=1");
  });

  it("null volta ao padrão do PRD apagando só a chave da cadência", async () => {
    projeto.settings = { ...(projeto.settings as object), cadencia: { producao: { horario: "18:00" } } };
    await put({ cadencia: null });
    const settings = gravacoes[0].settings as Record<string, unknown>;
    expect("cadencia" in settings).toBe(false);
    expect(settings.capacidades).toEqual({ ramos: "enforce" });
  });

  it("corpo sem cadência é 400", async () => {
    const r = await put({ outra: 1 });
    expect(r.status).toBe(400);
    expect(gravacoes).toHaveLength(0);
  });

  it("GET devolve a cadência que vale e o padrão", async () => {
    const r = await GET(new NextRequest("https://casaloti.ia.br/api/admin/projetos/p1/cadencia"), ctx);
    const corpo = await r.json();
    expect(corpo.declarada).toBeNull();
    expect(corpo.cadencia.producao.horario).toBe("17:00");
    expect(corpo.avisosDoCrontab).toEqual([]);
  });
});
