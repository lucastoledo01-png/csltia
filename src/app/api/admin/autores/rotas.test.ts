import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * As rotas do painel de autores (06/10/2026).
 *
 * Primeiro a porta: sem sessão de admin, nenhuma rota responde nem toca no
 * banco. Depois a entrada: autor inválido é recusado antes do banco, e a
 * atribuição não cruza projeto nem aceita autor desativado.
 */

const getProjectBySlug = vi.fn();
const chamadasAoBanco = vi.fn();
let autorDoBanco: Record<string, unknown> | null = null;
let materiaAtualizada: Record<string, unknown> | null = null;
const updates: Array<{ tabela: string; campos: unknown; filtros: Array<[string, unknown]> }> = [];
let sessaoValida = false;

vi.mock("@/lib/server/projects", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/projects")>();
  return { ...real, getProjectBySlug: (...a: unknown[]) => getProjectBySlug(...a) };
});

vi.mock("@/lib/server/api-auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/api-auth")>();
  return {
    ...real,
    // Sem sessão, a função REAL decide (e nega); com sessão, libera.
    requireAdmin: async (req: Parameters<typeof real.requireAdmin>[0]) => (sessaoValida ? null : real.requireAdmin(req)),
  };
});

/** Um cliente de mentira que anota cada escrita com os filtros aplicados. */
function consulta(tabela: string) {
  const filtros: Array<[string, unknown]> = [];
  let campos: unknown = null;
  let modo: "select" | "update" | "insert" = "select";
  const q = {
    select: () => q,
    insert: (c: unknown) => {
      modo = "insert";
      campos = c;
      return q;
    },
    update: (c: unknown) => {
      modo = "update";
      campos = c;
      return q;
    },
    eq: (col: string, v: unknown) => {
      filtros.push([col, v]);
      return q;
    },
    in: () => q,
    not: () => q,
    order: () => q,
    limit: () => q,
    single: async () => {
      if (modo === "insert") updates.push({ tabela, campos, filtros });
      return { data: { id: "novo", project_id: "p1", criado_em: "", ...(campos as object) }, error: null };
    },
    maybeSingle: async () => {
      if (modo === "update") {
        updates.push({ tabela, campos, filtros });
        return { data: tabela === "articles" ? materiaAtualizada : autorDoBanco, error: null };
      }
      return { data: tabela === "autores" ? autorDoBanco : null, error: null };
    },
  };
  return q;
}

vi.mock("@/lib/server/supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/supabase-admin")>();
  return {
    ...real,
    getSupabaseAdminClient: () => {
      chamadasAoBanco();
      return { from: (t: string) => consulta(t) };
    },
  };
});

const lista = await import("./route");
const umAutor = await import("./[id]/route");
const materia = await import("./materia/route");
const foto = await import("./foto/route");

function pedido(url: string, metodo: string, corpo?: unknown) {
  return new NextRequest(`https://casaloti.ia.br${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  sessaoValida = false;
  process.env.ADMIN_SESSION_SECRET = "segredo-de-teste";
  getProjectBySlug.mockReset().mockResolvedValue({ id: "p1", slug: "desbuguei", settings: {} });
  chamadasAoBanco.mockReset();
  updates.length = 0;
  autorDoBanco = { id: "a1", project_id: "p1", slug: "ana", nome: "Ana", ativo: true, redes: {} };
  materiaAtualizada = { id: "m1", slug: "materia", author_id: "a1" };
});

describe("a porta: sem sessão de admin é 401 e o banco não é tocado", () => {
  it.each([
    ["GET lista", () => lista.GET(pedido("/api/admin/autores?projeto=desbuguei", "GET"))],
    ["POST cria", () => lista.POST(pedido("/api/admin/autores", "POST", { projeto: "desbuguei", nome: "Ana" }))],
    ["PATCH edita", () => umAutor.PATCH(pedido("/api/admin/autores/a1", "PATCH", { projeto: "desbuguei", ativo: false }), ctx("a1"))],
    ["PATCH atribui", () => materia.PATCH(pedido("/api/admin/autores/materia", "PATCH", { projeto: "desbuguei", artigo: "m1", autor: "a1" }))],
    ["POST foto", () => foto.POST(pedido("/api/admin/autores/foto", "POST", {}))],
  ])("%s", async (_nome, chamar) => {
    const r = await chamar();
    expect(r.status).toBe(401);
    expect(chamadasAoBanco).not.toHaveBeenCalled();
    expect(getProjectBySlug).not.toHaveBeenCalled();
  });

  it("cookie forjado também é 401", async () => {
    const req = new NextRequest("https://casaloti.ia.br/api/admin/autores", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "casaloti_admin=forjado.assinatura" },
      body: JSON.stringify({ projeto: "desbuguei", nome: "Ana" }),
    });
    const r = await lista.POST(req);
    expect(r.status).toBe(401);
    expect(chamadasAoBanco).not.toHaveBeenCalled();
  });
});

describe("com sessão", () => {
  beforeEach(() => {
    sessaoValida = true;
  });

  it("NÃO: autor sem nome é recusado antes do banco", async () => {
    const r = await lista.POST(pedido("/api/admin/autores", "POST", { projeto: "desbuguei", nome: " " }));
    expect(r.status).toBe(400);
    expect(chamadasAoBanco).not.toHaveBeenCalled();
  });

  it("cria com o project_id do projeto da URL e o slug derivado", async () => {
    const r = await lista.POST(pedido("/api/admin/autores", "POST", { projeto: "desbuguei", nome: "Ana Silva", project_id: "outro" }));
    expect(r.status).toBe(200);
    expect(updates[0]).toMatchObject({ tabela: "autores", campos: { project_id: "p1", slug: "ana-silva", nome: "Ana Silva", ativo: true } });
  });

  it("desativar filtra pelo projeto além do id", async () => {
    const r = await umAutor.PATCH(pedido("/api/admin/autores/a1", "PATCH", { projeto: "desbuguei", ativo: false }), ctx("a1"));
    expect(r.status).toBe(200);
    expect(updates[0].campos).toEqual({ ativo: false });
    expect(updates[0].filtros).toEqual([
      ["project_id", "p1"],
      ["id", "a1"],
    ]);
  });

  it("atribui o autor à matéria só dentro do projeto", async () => {
    const r = await materia.PATCH(pedido("/api/admin/autores/materia", "PATCH", { projeto: "desbuguei", artigo: "m1", autor: "a1" }));
    expect(r.status).toBe(200);
    const escrita = updates.find((u) => u.tabela === "articles")!;
    expect(escrita.campos).toEqual({ author_id: "a1" });
    expect(escrita.filtros).toEqual([
      ["project_id", "p1"],
      ["id", "m1"],
    ]);
  });

  it("autor nulo devolve a matéria à Redação", async () => {
    const r = await materia.PATCH(pedido("/api/admin/autores/materia", "PATCH", { projeto: "desbuguei", artigo: "m1", autor: null }));
    expect(r.status).toBe(200);
    expect(updates.find((u) => u.tabela === "articles")!.campos).toEqual({ author_id: null });
  });

  it("NÃO: autor de outro projeto (ou inexistente) é 404, e a matéria não é tocada", async () => {
    autorDoBanco = null;
    const r = await materia.PATCH(pedido("/api/admin/autores/materia", "PATCH", { projeto: "desbuguei", artigo: "m1", autor: "de-outro" }));
    expect(r.status).toBe(404);
    expect(updates.some((u) => u.tabela === "articles")).toBe(false);
  });

  it("NÃO: autor desativado não é atribuído", async () => {
    autorDoBanco = { ...autorDoBanco, ativo: false };
    const r = await materia.PATCH(pedido("/api/admin/autores/materia", "PATCH", { projeto: "desbuguei", artigo: "m1", autor: "a1" }));
    expect(r.status).toBe(409);
    expect(updates.some((u) => u.tabela === "articles")).toBe(false);
  });
});
