import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ID, projectToday } from "./projects";

describe("data corrente do projeto", () => {
  const brasilia = { timezone: "America/Sao_Paulo" };

  it("usa o fuso do projeto, não UTC", () => {
    // 27/08 às 22h em Brasília já é 28/08 em UTC. O pipeline gravava a data
    // do dia seguinte em toda execução noturna.
    const noite = new Date("2026-08-28T01:30:00Z");

    expect(projectToday(brasilia, noite)).toBe("2026-08-27");
    expect(noite.toISOString().split("T")[0]).toBe("2026-08-28");
  });

  it("mantém a data no horário da edição matinal", () => {
    const manha = new Date("2026-08-27T09:03:00Z");
    expect(projectToday(brasilia, manha)).toBe("2026-08-27");
  });

  it("acompanha o fuso configurado em cada projeto", () => {
    const instante = new Date("2026-08-28T01:30:00Z");

    expect(projectToday({ timezone: "America/Sao_Paulo" }, instante)).toBe("2026-08-27");
    expect(projectToday({ timezone: "Europe/Lisbon" }, instante)).toBe("2026-08-28");
    expect(projectToday({ timezone: "Asia/Tokyo" }, instante)).toBe("2026-08-28");
  });
});

describe("projeto semente", () => {
  it("mantém o identificador fixo usado como DEFAULT na migração", () => {
    // Alterar este valor órfã todo o conteúdo já gravado.
    expect(DEFAULT_PROJECT_ID).toBe("00000000-0000-4000-8000-000000000001");
  });
});
