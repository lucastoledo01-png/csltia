import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * As rotas da fila de aprovação negam por padrão (06/10/2026): sem sessão de
 * admin não se lê a fila, não se decide nada e não se vê a prévia do e-mail
 * nem a da matéria, que ainda não foram publicados. Nenhuma delas procura o
 * projeto nem toca o banco antes da autorização.
 */

const projetoPeloSlug = vi.fn();
const executarAcao = vi.fn();
const cookiesFalsos = vi.fn();

vi.mock("@/lib/server/aprovacao/rotas", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/aprovacao/rotas")>();
  return { ...real, projetoPeloSlug: (...a: unknown[]) => projetoPeloSlug(...a) };
});

vi.mock("@/lib/server/aprovacao/painel", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/aprovacao/painel")>();
  return { ...real, executarAcao: (...a: unknown[]) => executarAcao(...a) };
});

const tocouNoBanco = vi.fn();
vi.mock("@/lib/server/supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/supabase-admin")>();
  return {
    ...real,
    getSupabaseAdminClient: () => {
      tocouNoBanco();
      return {
        from: () => {
          throw new Error("o banco não devia ser lido sem sessão");
        },
      };
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => cookiesFalsos() }));

const fila = await import("./route");
const previa = await import("./previa/route");
const pagina = await import("@/app/admin/[projeto]/aprovacao/previa/[id]/page");

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "segredo-de-teste-do-painel-com-tamanho");
  projetoPeloSlug.mockReset();
  executarAcao.mockReset();
  tocouNoBanco.mockReset();
  cookiesFalsos.mockReset().mockReturnValue({ get: () => undefined });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a fila exige sessão de admin", () => {
  it("GET sem cookie é 401, e não procura projeto", async () => {
    const r = await fila.GET(new NextRequest("https://casaloti.ia.br/api/admin/aprovacao?projeto=desbuguei"));
    expect(r.status).toBe(401);
    expect(projetoPeloSlug).not.toHaveBeenCalled();
  });

  it("POST sem cookie é 401, e nenhuma decisão é executada", async () => {
    const r = await fila.POST(
      new NextRequest("https://casaloti.ia.br/api/admin/aprovacao", {
        method: "POST",
        body: JSON.stringify({ projeto: "desbuguei", acao: "aprovar", id: "x" }),
      }),
    );
    expect(r.status).toBe(401);
    expect(executarAcao).not.toHaveBeenCalled();
  });

  it("cookie forjado também é 401", async () => {
    const req = new NextRequest("https://casaloti.ia.br/api/admin/aprovacao?projeto=desbuguei", {
      headers: { cookie: "casaloti_admin=forjado.assinatura" },
    });
    expect((await fila.GET(req)).status).toBe(401);
    expect(projetoPeloSlug).not.toHaveBeenCalled();
  });
});

describe("a prévia do e-mail exige sessão de admin", () => {
  it("sem cookie é 401, sem ler a edição", async () => {
    const r = await previa.GET(new NextRequest("https://casaloti.ia.br/api/admin/aprovacao/previa?projeto=desbuguei&id=a1"));
    expect(r.status).toBe(401);
    expect(projetoPeloSlug).not.toHaveBeenCalled();
    expect(tocouNoBanco).not.toHaveBeenCalled();
  });
});

describe("a prévia da matéria exige sessão de admin", () => {
  it("sem cookie, a página diz que a sessão expirou e não lê a matéria", async () => {
    const el = (await pagina.default({ params: Promise.resolve({ projeto: "desbuguei", id: "a1" }) })) as { props: { texto: string } };
    expect(el.props.texto).toMatch(/Sessão do painel expirada/);
    expect(projetoPeloSlug).not.toHaveBeenCalled();
    expect(tocouNoBanco).not.toHaveBeenCalled();
  });

  it("cookie com assinatura errada também não passa", async () => {
    cookiesFalsos.mockReturnValue({ get: () => ({ value: "forjado.assinatura" }) });
    const el = (await pagina.default({ params: Promise.resolve({ projeto: "desbuguei", id: "a1" }) })) as { props: { texto: string } };
    expect(el.props.texto).toMatch(/Sessão do painel expirada/);
    expect(tocouNoBanco).not.toHaveBeenCalled();
  });
});
