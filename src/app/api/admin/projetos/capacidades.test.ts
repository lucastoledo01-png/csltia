import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ligar uma capacidade não pode apagar o resto do projeto.
 *
 * `projects.settings` é um jsonb compartilhado: além das capacidades, ele
 * guarda `instagram_keyword`, `final_line` e `instagram_post_times`, todas em
 * uso em produção. Gravar o objeto inteiro a partir do que o painel mandou
 * apagaria as três no primeiro clique.
 */

const getProjectById = vi.fn();
const update = vi.fn();
const eq = vi.fn();

vi.mock("@/lib/server/projects", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/projects")>();
  return { ...real, getProjectById: (...a: unknown[]) => getProjectById(...a) };
});

vi.mock("@/lib/server/supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/supabase-admin")>();
  return {
    ...real,
    getSupabaseAdminClient: () => ({ from: () => ({ update, eq }) }),
  };
});

vi.mock("@/lib/server/api-auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/api-auth")>();
  return { ...real, requireAdmin: async () => null };
});

const { PATCH } = await import("./[id]/capacidades/route");

function pedido(corpo: unknown) {
  return new Request("https://casaloti.ia.br/api/admin/projetos/p1/capacidades", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }) as unknown as Parameters<typeof PATCH>[0];
}

const ctx = { params: Promise.resolve({ id: "p1" }) };

beforeEach(() => {
  eq.mockReset().mockResolvedValue({ error: null });
  update.mockReset().mockImplementation(() => ({ eq }));
  getProjectById.mockReset().mockResolvedValue({
    id: "p1",
    slug: "imigra-us",
    settings: {
      instagram_keyword: "VISA",
      final_line: "assinatura da newsletter",
      capacidades: { evergreen: "dry_run" },
    },
  });
});

describe("gravar capacidade", () => {
  it("preserva as outras chaves de settings", async () => {
    const r = await PATCH(pedido({ capacidade: "social", estado: "enforce" }), ctx);
    expect(r.status).toBe(200);

    const gravado = update.mock.calls[0][0].settings;
    expect(gravado.instagram_keyword).toBe("VISA");
    expect(gravado.final_line).toBe("assinatura da newsletter");
  });

  it("preserva as capacidades já declaradas e acrescenta a nova", async () => {
    await PATCH(pedido({ capacidade: "social", estado: "enforce" }), ctx);
    expect(update.mock.calls[0][0].settings.capacidades).toEqual({
      evergreen: "dry_run",
      social: "enforce",
    });
  });

  it("sobrescreve a mesma capacidade em vez de duplicar", async () => {
    await PATCH(pedido({ capacidade: "evergreen", estado: "enforce" }), ctx);
    expect(update.mock.calls[0][0].settings.capacidades).toEqual({ evergreen: "enforce" });
  });

  it("recusa capacidade desconhecida, em vez de gravar lixo", async () => {
    const r = await PATCH(pedido({ capacidade: "inventada", estado: "enforce" }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("capacidade desconhecida");
    expect(update).not.toHaveBeenCalled();
  });

  it("recusa estado inválido, e NÃO normaliza para off", async () => {
    /*
     * Na leitura, valor irreconhecível vira `off`: lá o dado já está gravado e a
     * escolha é entre interpretações. Aqui o dado está chegando, e normalizar
     * esconderia do operador que ele pediu uma coisa e recebeu outra.
     */
    const r = await PATCH(pedido({ capacidade: "social", estado: "ENFORCE!" }), ctx);
    expect(r.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("projeto inexistente responde 404 sem gravar", async () => {
    getProjectById.mockResolvedValue(null);
    const r = await PATCH(pedido({ capacidade: "social", estado: "off" }), ctx);
    expect(r.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("projeto sem settings não quebra", async () => {
    getProjectById.mockResolvedValue({ id: "p1", slug: "novo", settings: undefined });
    const r = await PATCH(pedido({ capacidade: "coleta", estado: "dry_run" }), ctx);
    expect(r.status).toBe(200);
    expect(update.mock.calls[0][0].settings.capacidades).toEqual({ coleta: "dry_run" });
  });

  it("falha do banco vira 500, e não um ok mentiroso", async () => {
    eq.mockResolvedValue({ error: { message: "permission denied" } });
    const r = await PATCH(pedido({ capacidade: "social", estado: "off" }), ctx);
    expect(r.status).toBe(500);
    expect((await r.json()).ok).toBe(false);
  });
});
