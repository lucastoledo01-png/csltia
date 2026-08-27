import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "./time";

describe("horário local do projeto para UTC", () => {
  const brasilia = "America/Sao_Paulo";

  it("converte a edição das 06:03 de Brasília", () => {
    expect(zonedTimeToUtc("2026-08-28", "06:03", brasilia).toISOString()).toBe(
      "2026-08-28T09:03:00.000Z",
    );
  });

  it("converte os horários dos posts ao longo do dia", () => {
    expect(zonedTimeToUtc("2026-08-28", "12:30", brasilia).toISOString()).toBe(
      "2026-08-28T15:30:00.000Z",
    );
    expect(zonedTimeToUtc("2026-08-28", "19:00", brasilia).toISOString()).toBe(
      "2026-08-28T22:00:00.000Z",
    );
  });

  it("um post noturno cai no dia seguinte em UTC, sem mudar a data da edição", () => {
    expect(zonedTimeToUtc("2026-08-28", "22:00", brasilia).toISOString()).toBe(
      "2026-08-29T01:00:00.000Z",
    );
  });

  it("respeita fusos diferentes por projeto", () => {
    expect(zonedTimeToUtc("2026-08-28", "09:00", "Europe/Lisbon").toISOString()).toBe(
      "2026-08-28T08:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-08-28", "09:00", "UTC").toISOString()).toBe(
      "2026-08-28T09:00:00.000Z",
    );
  });

  it("rejeita entrada malformada em vez de gerar data inválida", () => {
    expect(() => zonedTimeToUtc("28/08/2026", "06:03", brasilia)).toThrow();
  });
});
