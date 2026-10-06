import { describe, expect, it, vi } from "vitest";
import { carregarConfigSocial } from "./selecao";
import { calorNaAberturaDaNewsletter, calorNoPoolDoInstagram } from "./calor-no-feed";
import type { FontesDoCalor } from "../editorial/calor-do-dia";
import { pautaDeTeste } from "../editorial/calor.fixture";

/**
 * O interruptor do calor (06/10/2026): `off` não chama nada, `dry_run` grava
 * e devolve o mesmo pool, `enforce` muda a ordem.
 */

const AGORA = Date.parse("2026-10-06T12:00:00Z");

function fontes(): FontesDoCalor & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    termosEmAlta: async () => {
      chamadas.push("tendencias");
      return [{ termo: "Elon Musk", fonte: "google_trends_us" }, { termo: "Elon Musk", fonte: "wikipedia_pt" }];
    },
    publicadasNoDia: async () => {
      chamadas.push("publicadas");
      return ["cnbc.com", "axios.com", "nyt.com", "wsj.com"].map((d) => ({
        titulo: `Musk ${d}`,
        dominio: d,
        publicadoEm: "2026-10-06T09:00:00Z",
      }));
    },
    vetores: async (t) => {
      chamadas.push("vetores");
      return t.map((x) => (/musk/i.test(x) ? [1, 0] : [0, 1]));
    },
    fama: async (nome) => {
      chamadas.push("fama");
      return /musk/i.test(nome) ? { nome: "Elon Musk", sitelinks: 190 } : null;
    },
  };
}

function cliente() {
  const inseridos: Array<Record<string, unknown>> = [];
  return {
    inseridos,
    from: vi.fn(() => ({
      insert: async (linha: Record<string, unknown>) => {
        inseridos.push(linha);
        return { error: null };
      },
    })),
  };
}

// Teto de um post, para a diferença entre as duas ordens aparecer no feed.
const config = { ...carregarConfigSocial({}), alvoPorDia: 1, maximoPorDia: 1 };

function pool() {
  return [
    pautaDeTeste({ titulo: "Companhia aérea muda regra de status de elite", nota: 70, storyId: "fria", publicadoEm: "2026-10-04T10:00:00Z" }),
    pautaDeTeste({ titulo: "Elon Musk volta ao governo para ajudar o Pentágono", nota: 55, storyId: "musk", atores: ["Elon Musk"] }),
  ];
}

describe("o calor no pool do Instagram", () => {
  it("off: devolve o mesmo array e não chama fonte nenhuma nem grava nada", async () => {
    const f = fontes();
    const c = cliente();
    const p = pool();
    const r = await calorNoPoolDoInstagram(p, { modo: "off", fontes: f, configSocial: config, client: c, projectId: "x", editionDate: "2026-10-06", agoraMs: AGORA });
    expect(r.pool).toBe(p);
    expect(f.chamadas).toEqual([]);
    expect(c.inseridos).toEqual([]);
  });

  it("dry_run: o pool volta o mesmo, e o registro diz qual feed sairia", async () => {
    const c = cliente();
    const p = pool();
    const r = await calorNoPoolDoInstagram(p, { modo: "dry_run", fontes: fontes(), configSocial: config, client: c, projectId: "x", editionDate: "2026-10-06", agoraMs: AGORA });
    expect(r.pool).toBe(p);
    expect(c.inseridos).toHaveLength(1);
    const linha = c.inseridos[0] as { event_type: string; payload: Record<string, unknown> };
    expect(linha.event_type).toBe("calor_da_selecao");
    expect(linha.payload.feedAtual).toEqual(["Companhia aérea muda regra de status de elite"]);
    expect(linha.payload.feedComCalor).toEqual(["Elon Musk volta ao governo para ajudar o Pentágono"]);
  });

  it("enforce: a pauta quente passa a fria de nota parecida, e a original não muda", async () => {
    const p = pool();
    const r = await calorNoPoolDoInstagram(p, { modo: "enforce", fontes: fontes(), configSocial: config, client: cliente(), projectId: "x", editionDate: "2026-10-06", agoraMs: AGORA });
    const musk = r.pool.find((x) => x.storyId === "musk")!;
    const fria = r.pool.find((x) => x.storyId === "fria")!;
    expect(musk.pontuacao.total).toBeGreaterThan(fria.pontuacao.total);
    expect(p[1].pontuacao.total).toBe(55);
  });
});

describe("o calor na abertura da newsletter", () => {
  it("dry_run não muda a ordem; enforce põe a mais quente na frente sem trocar as pautas", async () => {
    const p = pool();
    const ensaio = await calorNaAberturaDaNewsletter(p, { modo: "dry_run", fontes: fontes(), client: null, projectId: "x", editionDate: "2026-10-06", agoraMs: AGORA });
    expect(ensaio.escolhidas).toBe(p);

    const valendo = await calorNaAberturaDaNewsletter(p, { modo: "enforce", fontes: fontes(), client: null, projectId: "x", editionDate: "2026-10-06", agoraMs: AGORA });
    expect(valendo.escolhidas.map((x) => x.storyId)).toEqual(["musk", "fria"]);
    expect(new Set(valendo.escolhidas)).toEqual(new Set(p));
  });

  it("off não chama fonte nenhuma", async () => {
    const f = fontes();
    const r = await calorNaAberturaDaNewsletter(pool(), { modo: "off", fontes: f, client: null, projectId: "x", editionDate: "2026-10-06" });
    expect(f.chamadas).toEqual([]);
    expect(r.linhas).toEqual([]);
  });
});
