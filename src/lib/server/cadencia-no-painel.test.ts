import { describe, expect, it } from "vitest";
import { CADENCIA_PADRAO, cadenciaDoProjeto } from "./cadencia";
import {
  avisosDoCrontab,
  cadenciaParaGravar,
  chegouAHoraDaProducao,
  leituraDoRascunho,
  previaDaSemana,
  proximaSegunda,
} from "./cadencia-no-painel";

/*
 * A cadência editada no painel (06/10/2026). Três regras presas aqui: o que se
 * grava não é normalizado (o inválido cai no padrão NA LEITURA, com aviso);
 * a prévia é o plano da cadência, dia a dia; e o relógio da rota de produção
 * só abre a janela no horário gravado, e o aviso do crontab aparece quando a
 * linha fixa das 20:00 UTC não acompanha mais.
 */

const TZ = "America/Sao_Paulo";
const SEGUNDA = "2026-10-12";

describe("cadenciaParaGravar", () => {
  it("guarda só as chaves conhecidas, sem corrigir valor, e mantém as fontes já gravadas", () => {
    const atual = { portal: { fontes: ["axios"], horarios: ["06:07"] }, outra: 1 };
    const corpo = {
      portal: { dias: [2, 3], horarios: ["25:00"], volume: { minimo: 1, maximo: 2 }, lixo: true },
      producao: { horario: "18:00", qualquer: "x" },
      desconhecida: { a: 1 },
    };

    const gravada = cadenciaParaGravar(corpo, atual);

    expect(gravada).toEqual({
      portal: { dias: [2, 3], horarios: ["25:00"], volume: { minimo: 1, maximo: 2 }, fontes: ["axios"] },
      producao: { horario: "18:00" },
    });
    const { cadencia, avisos } = leituraDoRascunho(gravada);
    expect(cadencia.portal.horarios).toEqual(CADENCIA_PADRAO.portal.horarios);
    expect(avisos).toEqual([expect.stringContaining("portal.horarios")]);
    expect(cadencia.producao.horario).toBe("18:00");
  });
});

describe("previaDaSemana", () => {
  it("a tabela do PRD: produção de segunda a quinta, publicação de terça a sexta, fim de semana parado", () => {
    const dias = previaDaSemana(CADENCIA_PADRAO, SEGUNDA);

    expect(dias.map((d) => d.data)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    const [seg, ter, , , sex, sab, dom] = dias;
    expect(seg.producao).toBe("17:00");
    expect(seg.producaoPara).toBe("2026-10-13");
    expect(seg.canais.portal).toBeNull();
    expect(ter.canais.portal).toEqual({ horarios: ["06:07", "12:00", "18:00"], volume: { minimo: 3, maximo: 3 } });
    expect(ter.canais.instagram?.horarios).toHaveLength(5);
    expect(sex.producao).toBeNull();
    expect(sex.canais.newsletter?.horarios).toEqual(["06:07"]);
    for (const d of [sab, dom]) {
      expect(d.producao).toBeNull();
      expect(d.aprovacao).toBeNull();
      expect(Object.values(d.canais).every((c) => c === null)).toBe(true);
    }
  });

  it("a semana seguinte começa na segunda que vem, também quando hoje é domingo ou segunda", () => {
    expect(proximaSegunda("2026-10-06")).toBe("2026-10-12");
    expect(proximaSegunda("2026-10-11")).toBe("2026-10-12");
    expect(proximaSegunda("2026-10-12")).toBe("2026-10-19");
  });
});

describe("chegouAHoraDaProducao", () => {
  const padrao = cadenciaDoProjeto({ settings: {} });

  it("abre do horário até 15 minutos depois, e só aí", () => {
    // 17:00 em Brasília é 20:00 UTC.
    expect(chegouAHoraDaProducao(padrao, new Date("2026-10-12T20:00:00Z"), TZ).naJanela).toBe(true);
    expect(chegouAHoraDaProducao(padrao, new Date("2026-10-12T20:14:59Z"), TZ).naJanela).toBe(true);
    expect(chegouAHoraDaProducao(padrao, new Date("2026-10-12T20:15:00Z"), TZ).naJanela).toBe(false);
    expect(chegouAHoraDaProducao(padrao, new Date("2026-10-12T19:45:00Z"), TZ).naJanela).toBe(false);
  });

  it("segue o horário gravado no painel, e não o das 20:00 UTC", () => {
    const as1807 = cadenciaDoProjeto({ settings: { cadencia: { producao: { horario: "18:07" } } } });
    expect(chegouAHoraDaProducao(as1807, new Date("2026-10-12T21:00:00Z"), TZ).naJanela).toBe(false);
    expect(chegouAHoraDaProducao(as1807, new Date("2026-10-12T21:15:00Z"), TZ).naJanela).toBe(true);
    expect(chegouAHoraDaProducao(as1807, new Date("2026-10-12T20:00:00Z"), TZ).naJanela).toBe(false);
  });
});

describe("avisosDoCrontab", () => {
  const agora = new Date("2026-10-12T12:00:00Z");

  it("sem aviso enquanto a produção for às 17:00 de Brasília, que é a linha das 20:00 UTC", () => {
    expect(avisosDoCrontab(CADENCIA_PADRAO, TZ, agora)).toEqual([]);
  });

  it("horário novo pede a troca da linha, com as duas horas na mão", () => {
    const c = cadenciaDoProjeto({ settings: { cadencia: { producao: { horario: "18:00" } } } });
    const avisos = avisosDoCrontab(c, TZ, agora);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("18:00");
    expect(avisos[0]).toContain("17:00");
    expect(avisos[0]).toContain("?relogio=1");
  });

  it("horário do portal fora dos do PRD pede a linha de 5 em 5 minutos", () => {
    const c = cadenciaDoProjeto({ settings: { cadencia: { portal: { horarios: ["07:30", "12:00"] } } } });
    const avisos = avisosDoCrontab(c, TZ, agora);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("07:30");
    expect(avisos[0]).toContain("/api/cron/portal");
  });

  it("horário fora da grade de 15 minutos avisa do atraso", () => {
    const c = cadenciaDoProjeto({ settings: { cadencia: { producao: { horario: "17:07" } } } });
    expect(avisosDoCrontab(c, TZ, agora).some((a) => a.includes("até 15 minutos"))).toBe(true);
  });
});
