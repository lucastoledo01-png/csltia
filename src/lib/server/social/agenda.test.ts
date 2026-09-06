import { describe, expect, it } from "vitest";
import { carregarConfigDaAgenda, descreverAgenda, distribuirVagas } from "./agenda";

/**
 * A grade nasce da quantidade, e não o contrário.
 *
 * O scheduler antigo tinha quatro horários fixos e publicava o menor entre
 * horários e pautas. Com dez vagas fixas, a pressão passa a ser encontrar dez
 * notícias, que é como se enche um feed com o que não deveria ter saído.
 */

const CONFIG = carregarConfigDaAgenda({}, "America/Sao_Paulo");
const DIA = "2026-09-10";
// Bem antes da janela, para o piso do "agora" não interferir.
const MADRUGADA = Date.parse("2026-09-10T05:00:00Z");

function minutosEntre(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 60_000;
}

describe("distribuição dinâmica", () => {
  it("zero pautas não gera vaga nenhuma", () => {
    expect(distribuirVagas(0, DIA, CONFIG, MADRUGADA)).toEqual([]);
  });

  it("um post só vai para o horário nobre, não para o começo da janela", () => {
    const [v] = distribuirVagas(1, DIA, CONFIG, MADRUGADA);
    expect(v.horaLocal).toBe("12:00");
  });

  it("três posts cobrem manhã, tarde e noite", () => {
    const vagas = distribuirVagas(3, DIA, CONFIG, MADRUGADA);
    expect(vagas.map((v) => v.horaLocal)).toEqual(["08:00", "14:45", "21:30"]);
  });

  it("dez posts usam a janela inteira e nada se empilha", () => {
    const vagas = distribuirVagas(10, DIA, CONFIG, MADRUGADA);

    expect(vagas).toHaveLength(10);
    expect(vagas[0].horaLocal).toBe("08:00");
    expect(vagas[9].horaLocal).toBe("21:30");

    for (let i = 1; i < vagas.length; i += 1) {
      const gap = minutosEntre(vagas[i - 1].quandoIso, vagas[i].quandoIso);
      expect(gap).toBeGreaterThanOrEqual(CONFIG.espacamentoMinimoEmMinutos);
    }
  });

  it("a janela cede antes do espaçamento quando o dia é cheio demais", () => {
    // Janela de duas horas para seis posts: o passo teórico é de 24 minutos,
    // menor que o mínimo. O último post sai depois do fim da janela, e é isso
    // que se quer: dois posts em 24 minutos parecem robô.
    const apertada = { ...CONFIG, inicio: "08:00", fim: "10:00" };
    const vagas = distribuirVagas(6, DIA, apertada, MADRUGADA);

    for (let i = 1; i < vagas.length; i += 1) {
      expect(minutosEntre(vagas[i - 1].quandoIso, vagas[i].quandoIso)).toBeGreaterThanOrEqual(45);
    }
    expect(vagas[5].horaLocal > "10:00").toBe(true);
  });

  it("execução tardia não despeja os horários vencidos de uma vez", () => {
    // Às 18h locais, os três primeiros horários da grade já passaram.
    const tarde = Date.parse("2026-09-10T21:00:00Z");
    const vagas = distribuirVagas(5, DIA, CONFIG, tarde);

    for (const v of vagas) {
      expect(Date.parse(v.quandoIso)).toBeGreaterThanOrEqual(tarde);
    }
    for (let i = 1; i < vagas.length; i += 1) {
      expect(minutosEntre(vagas[i - 1].quandoIso, vagas[i].quandoIso)).toBeGreaterThanOrEqual(45);
    }
  });

  it("o slot é estável, para a idempotência do agendamento", () => {
    const a = distribuirVagas(4, DIA, CONFIG, MADRUGADA);
    const b = distribuirVagas(4, DIA, CONFIG, MADRUGADA);
    expect(a.map((v) => v.slot)).toEqual(b.map((v) => v.slot));
    expect(a[0].slot).toBe("2026-09-10-01");
  });

  it("descreve a grade em uma linha", () => {
    expect(descreverAgenda([])).toContain("nenhuma vaga");
    expect(descreverAgenda(distribuirVagas(2, DIA, CONFIG, MADRUGADA))).toBe("2 post(s): 08:00, 21:30");
  });
});
