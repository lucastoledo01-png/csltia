import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENDPOINT_DO_INDEXNOW,
  _reiniciarAvisoSemChave,
  avisarBuscadores,
  avisarSemEsperar,
  chaveDoIndexNow,
  enderecosDoAviso,
  enviarAoIndexNow,
} from "./indexnow";
import { GET as arquivoDaChave } from "@/app/api/indexnow/chave/[chave]/route";
import { publicarArtigosAprovados } from "./ramos/portal";

/**
 * O IndexNow (06/10/2026): sem chave não faz nada, com chave avisa sem
 * segurar a publicação, e a falha vai para `platform_events`.
 */

const CHAVE = "0123456789abcdef0123456789abcdef";
const ENV = { INDEXNOW_KEY: CHAVE };

/** Um banco de mentira que anota o que leu e o que gravou. */
function banco(categorias: Record<string, string> = {}) {
  const eventos: Array<Record<string, unknown>> = [];
  const client = {
    from(tabela: string) {
      if (tabela === "platform_events") {
        return { insert: async (linha: Record<string, unknown>) => (eventos.push(linha), { error: null }) };
      }
      const q = {
        select: () => q,
        eq: () => q,
        in: async (_c: string, slugs: string[]) => ({ data: slugs.map((slug) => ({ slug, category: categorias[slug] ?? null })), error: null }),
      };
      return q;
    },
  };
  return { client: client as never, eventos };
}

afterEach(() => {
  _reiniciarAvisoSemChave();
  vi.restoreAllMocks();
});

describe("a chave", () => {
  it("só letra e número, de 8 a 128; fora disso é como não ter", () => {
    expect(chaveDoIndexNow(ENV)).toBe(CHAVE);
    expect(chaveDoIndexNow({})).toBeNull();
    expect(chaveDoIndexNow({ INDEXNOW_KEY: "curta" })).toBeNull();
    expect(chaveDoIndexNow({ INDEXNOW_KEY: "com/barra/0123456789" })).toBeNull();
  });

  it("o arquivo da chave responde a chave em texto puro, e 404 para qualquer outro nome", async () => {
    vi.stubEnv("INDEXNOW_KEY", CHAVE);
    const ok = await arquivoDaChave(new Request("https://x/"), { params: Promise.resolve({ chave: CHAVE }) });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe(CHAVE);
    const outro = await arquivoDaChave(new Request("https://x/"), { params: Promise.resolve({ chave: "naoeachave123" }) });
    expect(outro.status).toBe(404);
    vi.unstubAllEnvs();
    const semChave = await arquivoDaChave(new Request("https://x/"), { params: Promise.resolve({ chave: CHAVE }) });
    expect(semChave.status).toBe(404);
  });
});

describe("o aviso", () => {
  it("avisa a matéria, a página da editoria e a home, sem repetir", () => {
    expect(
      enderecosDoAviso(
        [
          { slug: "a", category: "Política" },
          { slug: "b", category: "Política" },
        ],
        "https://casaloti.ia.br",
      ),
    ).toEqual(["https://casaloti.ia.br/artigos/a", "https://casaloti.ia.br/editoria/governo", "https://casaloti.ia.br/artigos/b", "https://casaloti.ia.br"]);
  });

  it("sem chave, nada sai e o log avisa uma vez só", async () => {
    const fetcher = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect((await enviarAoIndexNow(["https://casaloti.ia.br/artigos/a"], { env: {}, fetcher: fetcher as never })).situacao).toBe("sem_chave");
    await enviarAoIndexNow(["https://casaloti.ia.br/artigos/b"], { env: {}, fetcher: fetcher as never });
    expect(fetcher).not.toHaveBeenCalled();
    expect(log.mock.calls.filter((c) => String(c[0]).includes("INDEXNOW"))).toHaveLength(1);
  });

  it("com chave, o POST do protocolo: host, chave, endereço da chave e a lista", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 202 }));
    const r = await enviarAoIndexNow(["https://casaloti.ia.br/artigos/a"], { env: ENV, fetcher: fetcher as never, site: "https://casaloti.ia.br" });
    expect(r.situacao).toBe("enviado");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT_DO_INDEXNOW);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      host: "casaloti.ia.br",
      key: CHAVE,
      keyLocation: `https://casaloti.ia.br/${CHAVE}.txt`,
      urlList: ["https://casaloti.ia.br/artigos/a"],
    });
  });

  it("a recusa e a rede fora vão para platform_events, e nada lança", async () => {
    const { client, eventos } = banco({ a: "Economia" });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const recusa = await avisarBuscadores(client, "p1", ["a"], "teste", { env: ENV, fetcher: (async () => new Response("chave errada", { status: 403 })) as never });
    expect(recusa.situacao).toBe("falhou");
    const fora = await avisarBuscadores(client, "p1", ["a"], "teste", {
      env: ENV,
      fetcher: (async () => {
        throw new Error("rede fora");
      }) as never,
    });
    expect(fora.situacao).toBe("falhou");
    expect(eventos.map((e) => e.event_type)).toEqual(["indexnow_falhou", "indexnow_falhou"]);
    expect((eventos[0].payload as { status: number; urls: string[] }).status).toBe(403);
    expect((eventos[0].payload as { urls: string[] }).urls).toContain("https://casaloti.ia.br/editoria/economia");
  });

  it("sem chave, o banco nem é lido", async () => {
    const from = vi.fn();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const r = await avisarBuscadores({ from } as never, "p1", ["a"], "teste", { env: {} });
    expect(r.situacao).toBe("sem_chave");
    expect(from).not.toHaveBeenCalled();
  });

  it("o aviso sem esperar nunca lança, nem com o fetch quebrando", async () => {
    const { client } = banco();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() =>
      avisarSemEsperar(client, "p1", ["a"], "teste", {
        env: ENV,
        fetcher: (() => {
          throw new Error("explodiu");
        }) as never,
      }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });

  it("a publicação do relógio do portal não espera nem quebra pelo aviso", async () => {
    const atualizacao = {
      update: () => atualizacao,
      eq: () => atualizacao,
      neq: () => atualizacao,
      lte: () => atualizacao,
      select: async () => ({ data: [{ slug: "a" }], error: null }),
    };
    const r = await publicarArtigosAprovados({ from: () => atualizacao } as never, "p1", new Date(), undefined, "nao_bloqueada");
    expect(r).toEqual({ publicados: ["a"], erro: null });
  });
});
