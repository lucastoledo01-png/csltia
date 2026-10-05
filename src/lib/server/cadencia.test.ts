import { describe, expect, it } from "vitest";
import {
  CADENCIA_PADRAO,
  agendaDoPortal,
  ambientePelaCadencia,
  cadenciaDoProjeto,
  decidirProducao,
  diaDaSemana,
  fontesDoRamo,
  horarioDaNewsletter,
  horariosDoInstagram,
  horariosDoPortal,
  lerCadencia,
  volumeDoCanal,
} from "./cadencia";
import { carregarConfigDaAgenda, distribuirVagas } from "./social/agenda";

/*
 * A cadência do PRD de 05/10/2026 é configuração do projeto. Estes testes
 * travam três coisas: o projeto que não declara nada recebe a tabela do PRD;
 * o que declara errado recebe o padrão daquele campo e um aviso; e a decisão
 * de produzir diz NÃO, com motivo, em cada caso em que não deve produzir.
 */

const BRASILIA = { timezone: "America/Sao_Paulo", settings: {} };

// 05/10/2026 é segunda-feira. A semana inteira, para os testes de dia.
const SEGUNDA = "2026-10-05";
const QUINTA = "2026-10-08";
const SEXTA = "2026-10-09";
const DOMINGO = "2026-10-11";

describe("os padrões são a tabela do PRD", () => {
  it("projeto sem cadência declarada recebe exatamente o PRD", () => {
    expect(cadenciaDoProjeto(BRASILIA)).toEqual(CADENCIA_PADRAO);
    expect(lerCadencia(BRASILIA).avisos).toEqual([]);
  });

  it("os getters que os ramos leem devolvem os horários do PRD", () => {
    expect(horariosDoPortal(BRASILIA)).toEqual(["06:07", "12:00", "18:00"]);
    expect(horarioDaNewsletter(BRASILIA)).toBe("06:07");
    expect(horariosDoInstagram(BRASILIA)).toEqual(["08:00", "11:22", "14:45", "18:07", "21:30"]);
    expect(volumeDoCanal(BRASILIA, "newsletter")).toEqual({ minimo: 2, maximo: 4 });
    expect(volumeDoCanal(BRASILIA, "portal")).toEqual({ minimo: 3, maximo: 3 });
    expect(volumeDoCanal(BRASILIA, "instagram")).toEqual({ minimo: 0, maximo: 5 });
    expect(fontesDoRamo(BRASILIA, "portal")).toEqual([]);
  });

  it("projeto nulo também recebe o PRD, e não quebra", () => {
    expect(cadenciaDoProjeto(null)).toEqual(CADENCIA_PADRAO);
  });
});

describe("o projeto manda, campo a campo", () => {
  it("o horário declarado vence, e o resto continua no padrão", () => {
    const projeto = {
      ...BRASILIA,
      settings: { cadencia: { portal: { horarios: ["18:00", "07:00"] } } },
    };
    const c = cadenciaDoProjeto(projeto);
    expect(c.portal.horarios).toEqual(["07:00", "18:00"]);
    expect(c.portal.dias).toEqual(CADENCIA_PADRAO.portal.dias);
    expect(c.newsletter).toEqual(CADENCIA_PADRAO.newsletter);
  });

  it("horário torto cai no padrão e vira aviso, nunca lista vazia", () => {
    const projeto = { ...BRASILIA, settings: { cadencia: { portal: { horarios: ["6h07"] } } } };
    const { cadencia, avisos } = lerCadencia(projeto);
    expect(cadencia.portal.horarios).toEqual(CADENCIA_PADRAO.portal.horarios);
    expect(avisos.join(" ")).toContain("portal.horarios");
  });

  it("volume invertido cai no padrão", () => {
    const projeto = { ...BRASILIA, settings: { cadencia: { instagram: { volume: { minimo: 6, maximo: 2 } } } } };
    const { cadencia, avisos } = lerCadencia(projeto);
    expect(cadencia.instagram.volume).toEqual(CADENCIA_PADRAO.instagram.volume);
    expect(avisos).toHaveLength(1);
  });

  it("dia fora de 0 a 6 cai no padrão", () => {
    const projeto = { ...BRASILIA, settings: { cadencia: { producao: { dias: [1, 9] } } } };
    expect(cadenciaDoProjeto(projeto).producao.dias).toEqual([1, 2, 3, 4]);
  });

  it("lista de dias vazia é decisão do projeto, e não erro", () => {
    const projeto = { ...BRASILIA, settings: { cadencia: { instagram: { dias: [] } } } };
    const { cadencia, avisos } = lerCadencia(projeto);
    expect(cadencia.instagram.dias).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it("fontes do ramo vêm do projeto", () => {
    const projeto = { ...BRASILIA, settings: { cadencia: { portal: { fontes: ["cnbc", " fed "] } } } };
    expect(fontesDoRamo(projeto, "portal")).toEqual(["cnbc", "fed"]);
  });
});

describe("datas", () => {
  it("dia da semana de uma data local", () => {
    expect(diaDaSemana(SEGUNDA)).toBe(1);
    expect(diaDaSemana(SEXTA)).toBe(5);
    expect(diaDaSemana(DOMINGO)).toBe(0);
  });

  it("a agenda do portal vira instantes UTC no fuso do projeto", () => {
    // Terça, 06/10/2026. Brasília é UTC-3 sem horário de verão.
    expect(agendaDoPortal(BRASILIA, "2026-10-06")).toEqual([
      { horaLocal: "06:07", quandoIso: "2026-10-06T09:07:00.000Z" },
      { horaLocal: "12:00", quandoIso: "2026-10-06T15:00:00.000Z" },
      { horaLocal: "18:00", quandoIso: "2026-10-06T21:00:00.000Z" },
    ]);
  });

  it("no dia em que o portal não publica, a agenda é vazia", () => {
    expect(agendaDoPortal(BRASILIA, SEGUNDA)).toEqual([]);
  });
});

describe("decidir a produção: cada NÃO tem motivo", () => {
  const c = CADENCIA_PADRAO;

  it("capacidade desligada não produz, mesmo numa segunda", () => {
    const d = decidirProducao(c, SEGUNDA, false);
    expect(d.produzir).toBe(false);
    expect(d.motivo).toBe("PRODUCAO_VESPERA_OFF");
  });

  it("sexta não é dia de produção", () => {
    const d = decidirProducao(c, SEXTA, true);
    expect(d.produzir).toBe(false);
    expect(d.motivo).toBe("NAO_E_DIA_DE_PRODUCAO");
    expect(d.explicacao).toContain("sexta");
  });

  it("domingo não é dia de produção", () => {
    expect(decidirProducao(c, DOMINGO, true).motivo).toBe("NAO_E_DIA_DE_PRODUCAO");
  });

  it("alvo sem canal publicando não produz", () => {
    // Produção que roda também na sexta, com antecedência de um dia: o alvo é
    // sábado, e nenhum canal publica no sábado.
    const sexta = { ...c, producao: { ...c.producao, dias: [5] as const } } as unknown as typeof c;
    const d = decidirProducao(sexta, SEXTA, true);
    expect(d.produzir).toBe(false);
    expect(d.motivo).toBe("ALVO_SEM_PUBLICACAO");
    expect(d.alvo).toBe("2026-10-10");
  });

  it("segunda produz terça, para os três canais", () => {
    const d = decidirProducao(c, SEGUNDA, true);
    expect(d).toMatchObject({ produzir: true, motivo: "PRODUZIR", alvo: "2026-10-06" });
    expect(d.canais).toEqual(["newsletter", "portal", "instagram"]);
  });

  it("quinta produz sexta", () => {
    expect(decidirProducao(c, QUINTA, true).alvo).toBe(SEXTA);
  });
});

describe("o ambiente do social na produção da véspera", () => {
  it("leva a grade e o volume do Instagram, e o volume da newsletter", () => {
    const env = ambientePelaCadencia(CADENCIA_PADRAO, { OUTRA: "x" });
    expect(env).toMatchObject({
      OUTRA: "x",
      SOCIAL_HORARIOS: "08:00,11:22,14:45,18:07,21:30",
      SOCIAL_POSTS_MAX_PER_DAY: "5",
      EDITORIAL_MIN_PAUTAS: "2",
      EDITORIAL_MAX_PAUTAS: "4",
    });
  });

  it("a agenda do social respeita a grade: cinco posts, os cinco horários do PRD", () => {
    const config = carregarConfigDaAgenda(ambientePelaCadencia(CADENCIA_PADRAO, {}), "America/Sao_Paulo");
    // Produzido na véspera às 17:00: o piso do "agora" fica no dia anterior.
    const vespera = Date.parse("2026-10-05T20:00:00Z");
    const vagas = distribuirVagas(5, "2026-10-06", config, vespera);
    expect(vagas.map((v) => v.horaLocal)).toEqual(["08:00", "11:22", "14:45", "18:07", "21:30"]);
  });

  it("com três posts a grade é espalhada, e nenhum horário sai dela", () => {
    const config = carregarConfigDaAgenda(ambientePelaCadencia(CADENCIA_PADRAO, {}), "America/Sao_Paulo");
    const vagas = distribuirVagas(3, "2026-10-06", config, Date.parse("2026-10-05T20:00:00Z"));
    expect(vagas.map((v) => v.horaLocal)).toEqual(["08:00", "14:45", "21:30"]);
  });

  it("um post só vai para o horário da grade mais perto do nobre", () => {
    const config = carregarConfigDaAgenda(ambientePelaCadencia(CADENCIA_PADRAO, {}), "America/Sao_Paulo");
    const [v] = distribuirVagas(1, "2026-10-06", config, Date.parse("2026-10-05T20:00:00Z"));
    expect(v.horaLocal).toBe("11:22");
  });

  it("sem a grade, que é o ciclo das 06:03, a agenda não muda", () => {
    const config = carregarConfigDaAgenda({}, "America/Sao_Paulo");
    expect(config.horarios).toBeUndefined();
  });

  it("grade com um horário torto é recusada inteira", () => {
    expect(carregarConfigDaAgenda({ SOCIAL_HORARIOS: "08:00,9h" }).horarios).toBeUndefined();
  });
});
