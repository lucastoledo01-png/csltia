import { describe, expect, it, vi } from "vitest";
import { classificarErroDaGraph, lerPerfilPorBusinessDiscovery, normalizarHandle } from "./graph";
import { modoDosPerfisDeReferencia } from "./modo";

const CRED = { accountId: "1789", accessToken: "TOKEN-SECRETO-123" };

function responde(status: number, corpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;
}

describe("o modo dos perfis de referência", () => {
  it("não declarado é off, sem variável de ambiente nenhuma por trás", () => {
    expect(modoDosPerfisDeReferencia(null)).toBe("off");
    expect(modoDosPerfisDeReferencia({ settings: { capacidades: { social: "enforce" } } })).toBe("off");
  });

  it("valor irreconhecível vira off, nunca enforce", () => {
    expect(modoDosPerfisDeReferencia({ settings: { capacidades: { perfis_referencia: "ligado" } } })).toBe("off");
  });

  it("declarado vale", () => {
    expect(modoDosPerfisDeReferencia({ settings: { capacidades: { perfis_referencia: "dry_run" } } })).toBe("dry_run");
    expect(modoDosPerfisDeReferencia({ settings: { capacidades: { perfis_referencia: "enforce" } } })).toBe("enforce");
  });
});

describe("normalizarHandle", () => {
  it("aceita arroba, link e maiúscula", () => {
    expect(normalizarHandle("@BrazilJournal")).toBe("braziljournal");
    expect(normalizarHandle("https://www.instagram.com/notjournal.ai/?hl=pt")).toBe("notjournal.ai");
    expect(normalizarHandle(" eua.journal ")).toBe("eua.journal");
  });

  it("recusa o que a Graph API nunca vai ler", () => {
    expect(normalizarHandle("")).toBeNull();
    expect(normalizarHandle("nome com espaço")).toBeNull();
    expect(normalizarHandle("a".repeat(31))).toBeNull();
    expect(normalizarHandle("perfil{username}")).toBeNull();
  });
});

describe("classificarErroDaGraph", () => {
  it("separa conta inválida de limite e de token", () => {
    // A resposta real de 05/10/2026 para conta pessoal e para nome inexistente.
    expect(classificarErroDaGraph(400, { code: 110, error_subcode: 2207013 })).toBe("nao_encontrado_ou_nao_business");
    expect(classificarErroDaGraph(400, { code: 4 })).toBe("limite_da_api");
    expect(classificarErroDaGraph(400, { code: 32 })).toBe("limite_da_api");
    expect(classificarErroDaGraph(429, {})).toBe("limite_da_api");
    expect(classificarErroDaGraph(401, { code: 190 })).toBe("token_invalido");
    expect(classificarErroDaGraph(500, { code: 1 })).toBe("erro");
  });
});

describe("lerPerfilPorBusinessDiscovery", () => {
  it("lê posts com curtidas e comentários, e curtida escondida vira null", async () => {
    const f = responde(200, {
      business_discovery: {
        username: "braziljournal",
        followers_count: 375778,
        media: {
          data: [
            { id: "1", caption: "BOLSA. Texto", like_count: 2710, comments_count: 92, timestamp: "2026-10-05T14:37:16+0000", media_type: "IMAGE", permalink: "https://www.instagram.com/p/a/" },
            { id: "2", caption: "Outro", comments_count: 5, timestamp: "2026-10-05T15:00:25+0000", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/b/" },
          ],
        },
      },
    });
    const r = await lerPerfilPorBusinessDiscovery("braziljournal", CRED, { fetcher: f });
    expect(r.status).toBe("ok");
    expect(r.seguidores).toBe(375778);
    expect(r.posts).toHaveLength(2);
    expect(r.posts[0].curtidas).toBe(2710);
    expect(r.posts[1].curtidas).toBeNull();
  });

  it("conta pessoal vira resultado, não exceção, e não vaza o token", async () => {
    const f = responde(400, {
      error: { message: "Invalid user id TOKEN-SECRETO-123", code: 110, error_subcode: 2207013 },
    });
    const r = await lerPerfilPorBusinessDiscovery("contapessoal", CRED, { fetcher: f });
    expect(r.status).toBe("nao_encontrado_ou_nao_business");
    expect(r.codigoDeErro).toBe(110);
    expect(r.subcodigoDeErro).toBe(2207013);
    expect(r.mensagemDeErro).not.toContain("TOKEN-SECRETO-123");
    expect(r.posts).toEqual([]);
  });

  it("limite da API vira status próprio", async () => {
    const f = responde(400, { error: { message: "Application request limit reached", code: 4 } });
    expect((await lerPerfilPorBusinessDiscovery("x", CRED, { fetcher: f })).status).toBe("limite_da_api");
  });

  it("rede fora vira erro gravável, não exceção", async () => {
    const f = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const r = await lerPerfilPorBusinessDiscovery("x", CRED, { fetcher: f });
    expect(r.status).toBe("erro");
    expect(r.mensagemDeErro).toBe("fetch failed");
  });

  it("sem credencial não chama a Meta", async () => {
    const f = responde(200, {});
    const r = await lerPerfilPorBusinessDiscovery("x", { accountId: "", accessToken: "" }, { fetcher: f });
    expect(r.status).toBe("sem_credencial");
    expect(f).not.toHaveBeenCalled();
  });
});
