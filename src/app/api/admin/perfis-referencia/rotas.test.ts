import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As rotas do painel de perfis de referência recusam o que nunca seria lido.
 *
 * Gravar um nome inválido não dá erro na hora: dá um perfil que nunca traz
 * nada, e o operador só descobre dias depois. A recusa é na entrada.
 */

const getProjectBySlug = vi.fn();
const insert = vi.fn();

vi.mock("@/lib/server/projects", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/projects")>();
  return { ...real, getProjectBySlug: (...a: unknown[]) => getProjectBySlug(...a) };
});

vi.mock("@/lib/server/supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/supabase-admin")>();
  return {
    ...real,
    getSupabaseAdminClient: () => ({
      from: () => ({ insert: (...a: unknown[]) => insert(...a) }),
    }),
  };
});

vi.mock("@/lib/server/api-auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/api-auth")>();
  return { ...real, requireAdmin: async () => null };
});

const { POST } = await import("./route");

function pedido(corpo: unknown) {
  return new Request("https://casaloti.ia.br/api/admin/perfis-referencia", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  getProjectBySlug.mockReset().mockResolvedValue({ id: "p1", slug: "desbuguei", settings: {} });
  insert.mockReset().mockImplementation((linha: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({
        data: { id: "x", created_at: "", ...linha },
        error: null,
      }),
    }),
  }));
});

describe("cadastrar perfil de referência", () => {
  it("NÃO: nome inválido é recusado antes do banco", async () => {
    const r = await POST(pedido({ projeto: "desbuguei", handle: "nome com espaço" }));
    expect(r.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("NÃO: projeto desconhecido é 404", async () => {
    getProjectBySlug.mockResolvedValue(null);
    const r = await POST(pedido({ projeto: "outro", handle: "braziljournal" }));
    expect(r.status).toBe(404);
  });

  it("grava normalizado e com o project_id do projeto da URL", async () => {
    const r = await POST(pedido({ projeto: "desbuguei", handle: "https://www.instagram.com/BrazilJournal/", nota: "mercado" }));
    expect(r.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "p1", handle: "braziljournal", note: "mercado", enabled: true }),
    );
  });

  it("perfil repetido vira 409 com mensagem legível", async () => {
    insert.mockImplementation(() => ({
      select: () => ({ single: async () => ({ data: null, error: { message: "duplicate key value violates unique constraint" } }) }),
    }));
    const r = await POST(pedido({ projeto: "desbuguei", handle: "braziljournal" }));
    expect(r.status).toBe(409);
  });

  it("tabela ausente diz o que fazer", async () => {
    insert.mockImplementation(() => ({
      select: () => ({
        single: async () => ({
          data: null,
          error: { message: "Could not find the table 'public.instagram_reference_profiles' in the schema cache" },
        }),
      }),
    }));
    const r = await POST(pedido({ projeto: "desbuguei", handle: "braziljournal" }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/20261005150000_perfis_de_referencia/);
  });
});
