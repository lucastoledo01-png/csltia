import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin, requireCron } from "./api-auth";
import { createAdminSessionPayload, signAdminSession } from "./admin-auth";

const isAdminSessionActive = vi.fn(async () => true);

vi.mock("./admin-session", () => ({
  isAdminSessionActive: (...args: unknown[]) => isAdminSessionActive(...args),
}));

const ambienteOriginal = { ...process.env };

function requisicao(headers: Record<string, string> = {}, url = "https://desbuguei.ia/api/cron/newsroom") {
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  isAdminSessionActive.mockClear();
  isAdminSessionActive.mockResolvedValue(true);
  process.env.CRON_SECRET = "segredo-do-agendador";
  process.env.ADMIN_SESSION_SECRET = "segredo-de-sessao";
});

afterEach(() => {
  process.env = { ...ambienteOriginal };
});

describe("autorização do agendador", () => {
  it("libera com o segredo correto no cabeçalho", () => {
    expect(requireCron(requisicao({ authorization: "Bearer segredo-do-agendador" }))).toBeNull();
  });

  it("nega quando não há cabeçalho de autorização", () => {
    expect(requireCron(requisicao())?.status).toBe(401);
  });

  it("nega o segredo na query string, que vaza em log e Referer", () => {
    const req = requisicao({}, "https://desbuguei.ia/api/cron/newsroom?secret=segredo-do-agendador");
    expect(requireCron(req)?.status).toBe(401);
  });

  it("nega os segredos que antes estavam fixos no código", () => {
    for (const antigo of ["casaloti_admin_secret_key", "internal_secret"]) {
      expect(requireCron(requisicao({ authorization: `Bearer ${antigo}` }))?.status).toBe(401);
    }
  });

  it("nega em ambiente de desenvolvimento também, não só em produção", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(requireCron(requisicao())?.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("responde 500 quando o segredo não está configurado, em vez de liberar", () => {
    delete process.env.CRON_SECRET;
    expect(requireCron(requisicao())?.status).toBe(500);
  });
});

describe("autorização do admin", () => {
  function comCookie(token: string) {
    return requisicao({ cookie: `casaloti_admin=${token}` }, "https://desbuguei.ia/api/admin/pipeline-logs");
  }

  it("libera sessão assinada, dentro do prazo e ativa no banco", async () => {
    const token = signAdminSession("segredo-de-sessao", createAdminSessionPayload());
    expect(await requireAdmin(comCookie(token))).toBeNull();
  });

  it("nega quando não há cookie", async () => {
    const resposta = await requireAdmin(requisicao({}, "https://desbuguei.ia/api/admin/pipeline-logs"));
    expect(resposta?.status).toBe(401);
  });

  it("nega token assinado com outro segredo", async () => {
    const token = signAdminSession("outro-segredo", createAdminSessionPayload());
    expect((await requireAdmin(comCookie(token)))?.status).toBe(401);
  });

  it("nega sessão revogada mesmo com token válido", async () => {
    isAdminSessionActive.mockResolvedValue(false);
    const token = signAdminSession("segredo-de-sessao", createAdminSessionPayload());
    expect((await requireAdmin(comCookie(token)))?.status).toBe(401);
  });
});
