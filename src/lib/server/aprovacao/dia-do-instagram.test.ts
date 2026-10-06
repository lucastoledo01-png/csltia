import { describe, expect, it } from "vitest";
import { explicarDiaDoInstagram } from "./dia-do-instagram";
import { montarRegistroDoSocial } from "../social/diagnostico-gravado";
import { diagnosticoSocialAusente } from "../social/ciclo-do-dia";
import { criarFilaEmMemoria } from "./fila-memoria";
import { visaoDaFila } from "./painel";
import type { DepsDaFila, ProjetoDaFila } from "./fila";

/*
 * 06/10/2026: a aba de posts dizia "sem decisões nos últimos 30 dias", e a
 * suspeita era a fila filtrando os posts. Lido no banco (só leitura): nenhuma
 * linha em `social_posts` com `edition_date` 2026-10-06, nenhuma aprovação de
 * post, e o diagnóstico do ciclo das 06:11 com `verified: 7, selected: 0,
 * scheduled: 0` e custo de post só de verificação. Este é aquele registro.
 */
const REGISTRO_DE_06_10 = {
  criadoEm: "2026-10-06T09:11:45Z",
  payload: {
    dryRun: false,
    editionDate: "2026-10-06",
    diagnostico: { mode: "enforce", executed: true, candidates: 33, verified: 7, selected: 0, scheduled: 0, skipped: 3, errors: [] },
    recusadas: [{ titulo: "O que está por trás da euforia do mercado", motivo: "a verificação recusou" }],
    descartados: [
      { etapa: "composicao", titulo: "Trump libera compra de diesel vermelho", motivo: "EIXO_OVERLOAD: eixo custo_de_vida já tem 3" },
      { etapa: "composicao", titulo: "Pesquisa com 760 funcionários", motivo: "ALEM_DO_MAXIMO: o dia já tem 5 posts" },
    ],
  },
};

describe("a aba do Instagram explica o dia sem post", () => {
  it("o registro de 06/10, sem o bloqueio gravado, diz o que se sabe e o que não", () => {
    const d = explicarDiaDoInstagram(REGISTRO_DE_06_10);
    expect(d.gravados).toBe(0);
    expect(d.frase).toMatch(/rodou às 06:11, conferiu 7 pautas e não gravou nenhum post/);
    expect(d.frase).toMatch(/não diz por quê/);
    expect(d.detalhes).toContain('Ficou de fora: "Pesquisa com 760 funcionários", porque o dia já tinha o máximo de posts.');
  });

  it("com o bloqueio gravado, o motivo vira frase", () => {
    const d = explicarDiaDoInstagram({
      ...REGISTRO_DE_06_10,
      payload: { ...REGISTRO_DE_06_10.payload, bloqueio: "SOCIAL_PERSISTENCE_UNAVAILABLE", escolhidasNaComposicao: 5 },
    });
    expect(d.frase).toMatch(/gravação das pautas candidatas falhou/);
    expect(d.frase).toMatch(/5 posts foram calculados e nenhum liberado/);
  });

  it("em ensaio do Instagram não acusa bloqueio que não houve", () => {
    const d = explicarDiaDoInstagram({
      criadoEm: "2026-10-06T09:11:45Z",
      payload: { diagnostico: { mode: "dry_run", verified: 4, selected: 3, scheduled: 0 }, enforcePermitido: false },
    });
    expect(d.frase).toMatch(/em ensaio \(dry_run\): 3 posts calculados/);
  });

  it("sem registro, diz que não há registro", () => {
    expect(explicarDiaDoInstagram(null).frase).toMatch(/Não há registro do ciclo do Instagram/);
  });
});

describe("o diagnóstico gravado passa a levar o bloqueio da composição", () => {
  it("bloqueio, quantas a composição escolheu e a liberação do enforce", () => {
    const registro = montarRegistroDoSocial(
      {
        diagnostico: diagnosticoSocialAusente("enforce"),
        ciclo: {
          descartados: [],
          composicao: { bloqueio: "SOCIAL_PERSISTENCE_UNAVAILABLE", escolhidas: [{}, {}, {}, {}, {}] },
          diagnostico: { enforcePermitido: true, motivoDoBloqueio: "" },
        } as never,
        conferencia: null,
      },
      { editionDate: "2026-10-06", dryRun: false },
    );
    expect(registro).toMatchObject({ bloqueio: "SOCIAL_PERSISTENCE_UNAVAILABLE", escolhidasNaComposicao: 5, enforcePermitido: true });
    expect(explicarDiaDoInstagram({ criadoEm: "2026-10-06T09:11:45Z", payload: registro as never }).frase).toMatch(/nenhum liberado/);
  });

  it("sem ciclo, os campos ficam nulos e o registro antigo continua igual no resto", () => {
    const registro = montarRegistroDoSocial({ diagnostico: diagnosticoSocialAusente("off"), ciclo: null, conferencia: null }, { editionDate: "x", dryRun: true });
    expect(registro).toMatchObject({ bloqueio: null, escolhidasNaComposicao: null });
  });
});

describe("o post gravado no ensaio aparece no painel", () => {
  const projeto: ProjetoDaFila = { id: "proj", timezone: "America/Sao_Paulo", settings: { capacidades: { aprovacao: "dry_run" } } };
  const deps = (store = criarFilaEmMemoria()): DepsDaFila => ({
    store,
    pecas: { ler: async () => null, gravarTexto: async () => ({ hashNovo: "" }), despachar: async () => ({ ok: true, detalhe: "" }), retirar: async () => undefined },
  });

  it("aguardando, aprovado e já decidido, todos voltam na visão", async () => {
    const d = deps();
    const agora = new Date().toISOString();
    const post = await d.store.inserir({ projectId: "proj", ramo: "post", pecaId: "sp-1", hashArtefato: "h", publicarEm: agora, avisos: [], resumo: {} });
    const outro = await d.store.inserir({ projectId: "proj", ramo: "post", pecaId: "sp-2", hashArtefato: "h", publicarEm: agora, avisos: [], resumo: {} });
    await d.store.atualizar(outro.id, { estado: "cancelada" });
    const v = await visaoDaFila(projeto, d);
    expect(v.fila.map((a) => a.pecaId).sort()).toEqual(["sp-1", "sp-2"]);
    expect(v.fila.find((a) => a.id === post.id)?.estado).toBe("aguardando");
  });

  it("um dublê de store sem `recentes` continua funcionando, com só as abertas", async () => {
    const base = criarFilaEmMemoria();
    const semRecentes = { ...base, recentes: undefined };
    await base.inserir({ projectId: "proj", ramo: "post", pecaId: "sp-1", hashArtefato: "h", publicarEm: null, avisos: [], resumo: {} });
    const v = await visaoDaFila(projeto, deps(semRecentes));
    expect(v.fila).toHaveLength(1);
  });
});
