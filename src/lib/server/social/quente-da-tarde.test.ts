import { describe, expect, it } from "vitest";
import {
  CONFIG_DA_TARDE_PADRAO,
  ambienteDaTarde,
  chegouAHoraDaTarde,
  configDaTarde,
  escolherQuentes,
  instagramPublicaHoje,
  modoDaQuenteDaTarde,
  ocupaVaga,
  vagasDaTarde,
} from "./quente-da-tarde";
import { atoresParaAFoto } from "./ciclo-do-dia";
import type { PautaAvaliada } from "../editorial/guarda";
import type { Calor } from "../editorial/calor";

const TZ = "America/Sao_Paulo";
// Terça, 06/10/2026, 15:30 em São Paulo (18:30 UTC).
const AS_15_30 = Date.parse("2026-10-06T18:30:00Z");
const HORARIOS = ["08:00", "11:22", "14:45", "18:07", "21:30"];
const em = (hhmm: string) => new Date(`2026-10-06T${hhmm}:00-03:00`).toISOString();

describe("a capacidade e a configuração", () => {
  it("ausente vale off, sem fallback de ambiente", () => {
    expect(modoDaQuenteDaTarde({ settings: {} })).toBe("off");
    expect(modoDaQuenteDaTarde({ settings: { capacidades: { quente_da_tarde: "dry_run" } } })).toBe("dry_run");
    expect(modoDaQuenteDaTarde({ settings: { capacidades: { quente_da_tarde: "ligado" } } })).toBe("off");
  });

  it("campo inválido cai no padrão daquele campo", () => {
    expect(configDaTarde(null)).toEqual(CONFIG_DA_TARDE_PADRAO);
    expect(
      configDaTarde({ settings: { quente_da_tarde: { horario: "25:00", janela_horas: 6, calor_minimo: -1, maximo_posts: 3 } } }),
    ).toEqual({ horario: "15:30", janelaHoras: 6, calorMinimo: 35, maximoDePosts: 3 });
  });

  it("o relógio roda só na janela de 15 minutos do horário", () => {
    const config = CONFIG_DA_TARDE_PADRAO;
    expect(chegouAHoraDaTarde(config, new Date(AS_15_30), TZ).naJanela).toBe(true);
    expect(chegouAHoraDaTarde(config, new Date(AS_15_30 + 14 * 60_000), TZ).naJanela).toBe(true);
    expect(chegouAHoraDaTarde(config, new Date(AS_15_30 + 15 * 60_000), TZ).naJanela).toBe(false);
    expect(chegouAHoraDaTarde(config, new Date(AS_15_30 - 60_000), TZ).naJanela).toBe(false);
  });

  it("dia sem Instagram na cadência não roda", () => {
    expect(instagramPublicaHoje({ settings: {}, timezone: TZ }, "2026-10-06")).toBe(true);
    // Segunda não publica na cadência do PRD.
    expect(instagramPublicaHoje({ settings: {}, timezone: TZ }, "2026-10-05")).toBe(false);
  });
});

describe("as vagas livres de hoje", () => {
  const base = { horarios: HORARIOS, dataIso: "2026-10-06", timezone: TZ, agoraMs: AS_15_30, maximoDoDia: 5, maximoDoCiclo: 2 };

  it("só horários futuros e sem post perto, até o que sobra do teto", () => {
    const v = vagasDaTarde({
      ...base,
      postsDoDia: [
        { status: "published", scheduled_at: em("08:00") },
        { status: "published", scheduled_at: em("11:22") },
        { status: "scheduled", scheduled_at: em("18:07") },
      ],
    });
    expect(v.horarios).toEqual(["21:30"]);
    expect(v.teto).toBe(1);
    expect(v.ocupadas).toBe(3);
  });

  it("o teto do dia manda: cinco posts no dia, nenhuma vaga", () => {
    const cheio = HORARIOS.map((h) => ({ status: "scheduled", scheduled_at: em(h) }));
    const v = vagasDaTarde({ ...base, postsDoDia: cheio });
    expect(v.teto).toBe(0);
    expect(v.motivo).toContain("teto é 5");
  });

  it("rascunho na fila ocupa; cancelado, falho e ensaio não", () => {
    expect(ocupaVaga({ status: "draft", scheduled_at: null })).toBe(true);
    expect(ocupaVaga({ status: "draft", scheduled_at: null, error_message: "CANCELADO: marca antiga" })).toBe(false);
    expect(ocupaVaga({ status: "failed", scheduled_at: null })).toBe(false);
    expect(ocupaVaga({ status: "scheduled", scheduled_at: null, dry_run: true })).toBe(false);
  });

  it("dia vazio às 15:30: as duas vagas da noite, e não mais que o máximo do ciclo", () => {
    const v = vagasDaTarde({ ...base, postsDoDia: [] });
    expect(v.horarios).toEqual(["18:07", "21:30"]);
    expect(v.teto).toBe(2);
  });

  it("o ambiente do ciclo leva só a grade livre e o teto", () => {
    const v = vagasDaTarde({ ...base, postsDoDia: [] });
    const env = ambienteDaTarde({ settings: {}, timezone: TZ }, {}, v);
    expect(env.SOCIAL_HORARIOS).toBe("18:07,21:30");
    expect(env.SOCIAL_POSTS_MAX_PER_DAY).toBe("2");
    expect(env.SOCIAL_JANELA_INICIO).toBe("18:07");
  });
});

function pauta(id: string, horasAtras: number, nota = 50): PautaAvaliada {
  return {
    storyId: id,
    grupo: { primary: { title: `pauta ${id}`, published_at: new Date(AS_15_30 - horasAtras * 3_600_000).toISOString() } },
    pontuacao: { total: nota },
  } as unknown as PautaAvaliada;
}
const calor = (total: number) => ({ total }) as Calor;

describe("as pautas quentes e novas", () => {
  it("fica a nova E quente, da mais quente para a menos, até o limite", () => {
    const pool = [pauta("velha", 20), pauta("fria", 2), pauta("morna", 3), pauta("quente", 1), pauta("sem-data", 0)];
    (pool[4].grupo.primary as { published_at: string }).published_at = "";
    const porStory = new Map([
      ["velha", calor(80)],
      ["fria", calor(20)],
      ["morna", calor(40)],
      ["quente", calor(70)],
      ["sem-data", calor(90)],
    ]);
    const r = escolherQuentes(pool, porStory, { janelaHoras: 10, calorMinimo: 35, agoraMs: AS_15_30, limite: 5 });
    expect(r.escolhidas.map((e) => e.pauta.storyId)).toEqual(["quente", "morna"]);
    expect(r.descartadas.map((d) => d.titulo).sort()).toEqual(["pauta fria", "pauta sem-data", "pauta velha"]);
    expect(escolherQuentes(pool, porStory, { janelaHoras: 10, calorMinimo: 35, agoraMs: AS_15_30, limite: 1 }).escolhidas).toHaveLength(1);
  });
});

describe("a foto da citação de famoso", () => {
  it("quem fala vai à frente dos atores, uma vez só", () => {
    const p = {
      classificacao: { atores: ["Nvidia", "jensen huang"], eixo: "tecnologia", citacao_de_famoso: true, quem_fala: "Jensen Huang" },
    } as unknown as PautaAvaliada;
    expect(atoresParaAFoto(p)).toEqual(["Jensen Huang", "Nvidia"]);
  });

  it("fora do formato, a ordem do classificador", () => {
    const p = { classificacao: { atores: ["Nvidia"], eixo: "tecnologia", quem_fala: "Jensen Huang" } } as unknown as PautaAvaliada;
    expect(atoresParaAFoto(p)).toEqual(["Nvidia"]);
  });
});
