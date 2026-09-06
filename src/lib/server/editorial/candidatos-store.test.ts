import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  criarCandidatosStore,
  garantirStatus,
  paraPersistir,
  STATUS_DE_CANDIDATA,
  verificacaoAindaVale,
} from "./candidatos-store";
import type { CandidataParaGravar, VerificacaoPersistida } from "./candidatos-store";
import type { Classificacao } from "./classificador";
import type { Verificacao } from "./verificador";

/**
 * A candidata que se classifica uma vez e se lê em todos os canais.
 *
 * A medição que motivou isto: a mesma candidata, classificada três vezes,
 * mudou de relevância em 64% dos casos e de decisão em 24%. Persistir não
 * melhora o sorteio; faz ele acontecer uma vez só.
 */

const PROJ = "proj-1";

function classificacao(p: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "c1", pais: "EUA", imigracao: true, leitura: "oportunidade", eixo: "oportunidade",
    natureza: "official_action", relevancia: 7, atores: ["USCIS"], lugares: [], acontecimento: [],
    justificativa: "", ...p,
  } as Classificacao;
}

function candidata(p: Partial<CandidataParaGravar> = {}): CandidataParaGravar {
  return {
    storyId: "s1",
    url: "https://www.uscis.gov/a",
    title: "USCIS publica guia",
    publishedAt: "2026-09-06T12:00:00Z",
    status: "classified",
    classificacao: classificacao(),
    ...p,
  };
}

/** Supabase de mentira que registra as operações. */
function bancoFalso(linhasExistentes: Array<Record<string, unknown>> = []) {
  const ops: Array<{ op: string; detalhe: unknown }> = [];

  const client = {
    from() {
      const q: Record<string, unknown> = {};
      const construtor = {
        select() { return construtor; },
        eq() { return construtor; },
        in(_col: string, valores: string[]) {
          ops.push({ op: "select.in", detalhe: valores });
          const filtradas = linhasExistentes.filter(
            (l) => valores.includes(String(l.url)) || valores.includes(String(l.story_id)),
          );
          return Promise.resolve({ data: filtradas, error: null });
        },
        upsert(linhas: unknown[], opcoes: unknown) {
          ops.push({ op: "upsert", detalhe: { n: (linhas as unknown[]).length, opcoes } });
          return Promise.resolve({ error: null });
        },
        update(campos: unknown) {
          ops.push({ op: "update", detalhe: campos });
          return {
            in: () => Promise.resolve({ error: null }),
            eq: () => Promise.resolve({ error: null }),
          };
        },
        single() { return Promise.resolve({ data: { metadata_json: { antigo: true } }, error: null }); },
      };
      void q;
      return construtor;
    },
  } as unknown as SupabaseClient;

  return { client, ops };
}

describe("vocabulário de status", () => {
  it("aceita exatamente os dez do CHECK do banco", () => {
    expect(STATUS_DE_CANDIDATA).toHaveLength(10);
    for (const s of STATUS_DE_CANDIDATA) expect(garantirStatus(s)).toBe(s);
  });

  it("recusa os conceitos que NÃO são status, e diz onde eles moram", () => {
    expect(() => garantirStatus("verified")).toThrow(/metadata_json\.verificacao/);
    expect(() => garantirStatus("conflict")).toThrow(/metadata_json\.verificacao/);
    expect(() => garantirStatus("editorial_approved")).toThrow(/status = 'approved'/);
    expect(() => garantirStatus("used_newsletter")).toThrow(/editorial_history/);
    expect(() => garantirStatus("used_social")).toThrow(/editorial_history/);
  });

  it("recusa qualquer outro valor listando os aceitos", () => {
    expect(() => garantirStatus("inventado")).toThrow(/collected, classified/);
  });

  it("a guarda roda antes de a linha chegar ao banco", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);

    await expect(
      store.gravarNovas(PROJ, [candidata({ status: "verified" as never })]),
    ).rejects.toThrow(/não é um status/);

    expect(ops.filter((o) => o.op === "upsert")).toHaveLength(0);
  });

  it("atualizarStatus também é guardado", async () => {
    const { client } = bancoFalso();
    const store = criarCandidatosStore(client);
    await expect(store.atualizarStatus(["a"], "conflict" as never)).rejects.toThrow(/não é um status/);
  });
});

describe("idempotência da gravação", () => {
  it("candidata nova é gravada", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [candidata()]);

    expect(r.gravadas).toBe(1);
    expect(r.reaproveitadas).toBe(0);
    const up = ops.find((o) => o.op === "upsert")!.detalhe as { opcoes: { onConflict: string; ignoreDuplicates: boolean } };
    expect(up.opcoes.onConflict).toBe("project_id,url");
    expect(up.opcoes.ignoreDuplicates).toBe(true);
  });

  it("candidata que já existe NÃO é regravada", async () => {
    const { client, ops } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://www.uscis.gov/a", story_id: "s1",
        classification_status: "done", relevance: 9, status: "approved", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [candidata()]);

    expect(r.gravadas).toBe(0);
    expect(r.reaproveitadas).toBe(1);
    expect(r.jaClassificadas).toEqual(["https://www.uscis.gov/a"]);
    // O ponto: nenhuma escrita. A relevância 9 já persistida sobrevive à
    // leitura 7 que o modelo acabou de devolver.
    expect(ops.filter((o) => o.op === "upsert")).toHaveLength(0);
  });

  it("mistura de novas e existentes grava só as novas", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1",
        classification_status: "done", status: "approved", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [
      candidata({ url: "https://a.com/1" }),
      candidata({ url: "https://b.com/2", storyId: "s2" }),
    ]);

    expect(r.gravadas).toBe(1);
    expect(r.reaproveitadas).toBe(1);
  });

  it("lista vazia não fala com o banco", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);
    const r = await store.gravarNovas(PROJ, []);
    expect(r.gravadas).toBe(0);
    expect(ops).toHaveLength(0);
  });
});

describe("leitura para reuso", () => {
  it("devolve a classificação persistida montada", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1", title: "T",
        classification_status: "done", country: "EUA", is_immigration: true,
        editorial_reading: "oportunidade", editorial_axis: "processo", relevance: 8,
        actors: ["USCIS"], places: [], event_terms: [], status: "approved", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const mapa = await store.buscarPorUrls(PROJ, ["https://a.com/1"]);
    const c = mapa.get("https://a.com/1")!;

    expect(c.classificacao?.pais).toBe("EUA");
    expect(c.classificacao?.relevancia).toBe(8);
    expect(c.classificacao?.eixo).toBe("processo");
  });

  it("candidata sem classificação devolve null, não um objeto vazio", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1",
        classification_status: "pending", status: "collected", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const c = (await store.buscarPorUrls(PROJ, ["https://a.com/1"])).get("https://a.com/1")!;
    expect(c.classificacao).toBeNull();
  });

  it("busca por story_id serve ao reuso entre canais", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1",
        classification_status: "done", status: "approved",
        metadata_json: { verificacao: { status: "confirm", motivo: "ok", divergencias: [], verificadoEm: "2026-09-06T10:00:00Z", canal: "newsletter" } } },
    ]);
    const store = criarCandidatosStore(client);

    const c = (await store.buscarPorStoryIds(PROJ, ["s1"])).get("s1")!;
    expect(c.verificacao?.status).toBe("confirm");
    expect(c.verificacao?.canal).toBe("newsletter");
  });
});

describe("verificação persistida", () => {
  it("preserva o metadata que já estava lá", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);

    await store.gravarVerificacao("x", {
      status: "confirm", motivo: "ok", divergencias: [], verificadoEm: "2026-09-06T10:00:00Z", canal: "newsletter",
    });

    const upd = ops.find((o) => o.op === "update")!.detalhe as { metadata_json: Record<string, unknown> };
    expect(upd.metadata_json.antigo).toBe(true);
    expect((upd.metadata_json.verificacao as VerificacaoPersistida).status).toBe("confirm");
  });

  it("review do verificador vira conflict no banco", () => {
    const v: Verificacao = {
      storyId: "s1", veredicto: "review", camposConfirmados: [],
      divergencias: [{ campo: "pais", primaria: "EUA", verificacao: "Brasil", material: true }],
      motivo: "EDITORIAL_CLASSIFICATION_CONFLICT: pais", leitura: null, origem: "verificacao",
    };

    expect(paraPersistir(v, "newsletter").status).toBe("conflict");
    expect(paraPersistir({ ...v, veredicto: "confirm" }, "social").status).toBe("confirm");
    expect(paraPersistir({ ...v, veredicto: "reject" }, "social").status).toBe("reject");
  });

  it("verificação velha não é reaproveitada", () => {
    const agora = new Date().toISOString();
    const antiga = new Date(Date.now() - 48 * 3600_000).toISOString();

    const base = { status: "confirm" as const, motivo: "", divergencias: [], canal: "newsletter" };
    expect(verificacaoAindaVale({ ...base, verificadoEm: agora })).toBe(true);
    expect(verificacaoAindaVale({ ...base, verificadoEm: antiga })).toBe(false);
    expect(verificacaoAindaVale(null)).toBe(false);
  });
});
