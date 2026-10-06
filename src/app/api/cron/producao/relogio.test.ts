import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * A rota da produção no modo relógio (06/10/2026): chamada de 15 em 15
 * minutos, produz só na janela do horário gravado na cadência do projeto, e
 * fora dela não grava, não pinga o watchdog e não alerta.
 */

const produzir = vi.fn();
const ping = vi.fn(async () => {});
let projeto: unknown = {
  id: "p1",
  slug: "desbuguei",
  timezone: "America/Sao_Paulo",
  settings: { cadencia: { producao: { horario: "18:00" } } },
};

vi.mock("@/lib/server/api-auth", () => ({ requireCron: () => null }));
vi.mock("@/lib/server/alerts", () => ({ formatError: String, pingHealthcheck: ping, sendAlert: vi.fn(async () => {}) }));
vi.mock("@/lib/server/producao-vespera", () => ({ produzirNaVespera: produzir }));
vi.mock("@/lib/server/projects", () => ({
  DEFAULT_PROJECT_ID: "p1",
  getProjectBySlug: vi.fn(async () => projeto),
  getProjectById: vi.fn(async () => {
    if (projeto instanceof Error) throw projeto;
    return projeto;
  }),
}));

const { POST } = await import("./route");

function chamar(query: string) {
  return POST(new NextRequest(`https://casaloti.ia.br/api/cron/producao${query}`, { method: "POST" }));
}

beforeEach(() => {
  vi.useFakeTimers();
  produzir.mockReset();
  produzir.mockResolvedValue({ ok: true, projeto: "desbuguei", modo: "enforce", decisao: { motivo: "PRODUZIR", alvo: "2026-10-13" } });
  ping.mockClear();
  projeto = { id: "p1", slug: "desbuguei", timezone: "America/Sao_Paulo", settings: { cadencia: { producao: { horario: "18:00" } } } };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/api/cron/producao?relogio=1", () => {
  it("fora da janela responde 200 e não produz, não pinga nada", async () => {
    vi.setSystemTime(new Date("2026-10-12T20:00:00Z")); // 17:00 em Brasília, a hora VELHA

    const r = await chamar("?relogio=1");
    const corpo = await r.json();

    expect(r.status).toBe(200);
    expect(corpo).toMatchObject({ ok: true, produzido: false, motivo: "FORA_DO_HORARIO", horario: "18:00", agoraLocal: "17:00" });
    expect(produzir).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
  });

  it("na janela do horário gravado, produz", async () => {
    vi.setSystemTime(new Date("2026-10-12T21:00:00Z")); // 18:00 em Brasília

    const r = await chamar("?relogio=1&wait=1");

    expect(r.status).toBe(200);
    expect(produzir).toHaveBeenCalledWith("p1");
  });

  it("projeto ilegível responde 503 e não produz no escuro", async () => {
    vi.setSystemTime(new Date("2026-10-12T21:00:00Z"));
    projeto = new Error("Gateway Timeout");

    const r = await chamar("?relogio=1");

    expect(r.status).toBe(503);
    expect(produzir).not.toHaveBeenCalled();
  });

  it("sem o parâmetro a rota produz quando é chamada, como antes", async () => {
    vi.setSystemTime(new Date("2026-10-12T20:00:00Z"));

    await chamar("?wait=1");

    expect(produzir).toHaveBeenCalledWith("p1");
  });
});
