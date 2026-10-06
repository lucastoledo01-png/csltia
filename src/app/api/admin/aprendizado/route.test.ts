import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * As rotas do aprendizado (06/10/2026) negam por padrão: sem sessão de admin
 * o painel não abre nem resume nada, e sem o segredo o cron não roda. Nenhuma
 * delas chega ao banco nem ao modelo antes da autorização.
 */

const projetoPeloSlug = vi.fn();
const resumir = vi.fn();

vi.mock("@/lib/server/aprovacao/rotas", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/aprovacao/rotas")>();
  return { ...real, projetoPeloSlug: (...a: unknown[]) => projetoPeloSlug(...a) };
});

vi.mock("@/lib/server/aprendizado/edicoes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/aprendizado/edicoes")>();
  return { ...real, resumirEdicoesDaSemana: (...a: unknown[]) => resumir(...a) };
});

const listProjects = vi.fn();
vi.mock("@/lib/server/projects", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/projects")>();
  return { ...real, listProjects: (...a: unknown[]) => listProjects(...a) };
});

vi.mock("@/lib/server/supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/supabase-admin")>();
  return { ...real, getSupabaseAdminClient: () => ({}) };
});

vi.mock("@/lib/server/alerts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/alerts")>();
  return { ...real, sendAlert: async () => undefined };
});

const painel = await import("./route");
const cron = await import("../../cron/aprendizado/route");

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "segredo-de-teste-do-painel-com-tamanho");
  vi.stubEnv("CRON_SECRET", "segredo-do-cron-de-teste");
  projetoPeloSlug.mockReset();
  resumir.mockReset();
  listProjects.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("o painel de aprendizado exige sessão de admin", () => {
  it("GET sem cookie é 401, e não procura projeto", async () => {
    const r = await painel.GET(new NextRequest("https://casaloti.ia.br/api/admin/aprendizado?projeto=desbuguei"));
    expect(r.status).toBe(401);
    expect(projetoPeloSlug).not.toHaveBeenCalled();
  });

  it("POST sem cookie é 401, e não resume nada", async () => {
    const r = await painel.POST(
      new NextRequest("https://casaloti.ia.br/api/admin/aprendizado", {
        method: "POST",
        body: JSON.stringify({ projeto: "desbuguei", acao: "resumir-edicoes" }),
      }),
    );
    expect(r.status).toBe(401);
    expect(resumir).not.toHaveBeenCalled();
  });

  it("cookie forjado também é 401", async () => {
    const r = await painel.GET(
      new NextRequest("https://casaloti.ia.br/api/admin/aprendizado?projeto=desbuguei", {
        headers: { cookie: "admin_session=forjado.assinatura" },
      }),
    );
    expect(r.status).toBe(401);
  });
});

describe("o cron do aprendizado exige o segredo", () => {
  it("sem Authorization é 401", async () => {
    const r = await cron.POST(new NextRequest("https://casaloti.ia.br/api/cron/aprendizado", { method: "POST" }));
    expect(r.status).toBe(401);
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("segredo errado é 401", async () => {
    const r = await cron.POST(
      new NextRequest("https://casaloti.ia.br/api/cron/aprendizado", {
        method: "POST",
        headers: { authorization: "Bearer outro-segredo-qualquer-x" },
      }),
    );
    expect(r.status).toBe(401);
  });

  it("com o segredo, roda só os projetos com a fila ligada", async () => {
    listProjects.mockResolvedValue([
      { id: "a", slug: "ligado", settings: { capacidades: { aprovacao: "enforce" } } },
      { id: "b", slug: "desligado", settings: {} },
    ]);
    resumir.mockResolvedValue({ edicoesLidas: 0, porCanal: {}, chamouModelo: false, propostas: [], descartadas: [] });
    const r = await cron.POST(
      new NextRequest("https://casaloti.ia.br/api/cron/aprendizado", {
        method: "POST",
        headers: { authorization: "Bearer segredo-do-cron-de-teste" },
      }),
    );
    expect(r.status).toBe(200);
    expect(resumir).toHaveBeenCalledTimes(1);
    expect(resumir.mock.calls[0][0]).toEqual({ id: "a" });
  });
});
