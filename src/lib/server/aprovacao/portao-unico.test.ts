import { describe, expect, it, vi } from "vitest";
import type { Project } from "../projects";
import { publicarDoProjeto } from "../publicacao-agendada";
import { publicarArtigosAprovados } from "../ramos/portal";
import type { Ramo } from "./contrato";
import { cicloDaFila, horariosDaRedacaoNaFila, type AdaptadorDePecas, type ProjetoDaFila } from "./fila";
import { criarFilaEmMemoria } from "./fila-memoria";
import { hashDaNewsletter, hashDoArtigo } from "./hash";
import { criarAdaptadorSupabase } from "./pecas-supabase";
import { artigosLiberadosPeloPortao, type ArtigoCandidato } from "./portao-do-portal";
import { filtro, supabaseFalso, type Operacao } from "./supabase-falso";

/**
 * O portão único, ponta a ponta (integração de 05/10/2026).
 *
 * Três caminhos punham um artigo no portal e só um perguntava à fila. Cada
 * bloco abaixo pega UM caminho e prova o "não": com a fila em `enforce`, a
 * peça que ninguém aprovou (ou cuja versão mudou depois da aprovação) não
 * recebe a escrita que a poria no ar. E prova também o "sim", senão um portão
 * que segura tudo passaria nestes testes.
 */

const TZ = "America/Sao_Paulo";
const PROJ = "00000000-0000-4000-8000-000000000001";

function settings(capacidades: Record<string, string>): Record<string, unknown> {
  return { capacidades };
}

const ARTIGO: ArtigoCandidato = {
  id: "art-1",
  slug: "fed-corta-juros-2026-10-06",
  title: "Fed corta juros nos EUA",
  content_html: "<p>O Fed cortou os juros.</p>",
  cover_image: "https://x/capa.jpg",
};

async function filaCom(
  itens: Array<{ ramo: Ramo; pecaId: string; hash: string; estado: "aguardando" | "aprovada"; publicarEm?: string | null }>,
) {
  const fila = criarFilaEmMemoria();
  for (const i of itens) {
    const a = await fila.inserir({
      projectId: PROJ,
      ramo: i.ramo,
      pecaId: i.pecaId,
      hashArtefato: i.hash,
      publicarEm: i.publicarEm ?? null,
      avisos: [],
      resumo: {},
    });
    if (i.estado === "aprovada") await fila.atualizar(a.id, { estado: "aprovada", decididoPor: "dono:teste" });
  }
  return fila;
}

const escritas = (ops: Operacao[], tabela: string) => ops.filter((o) => o.tabela === tabela && o.tipo !== "select");

// ---------------------------------------------------------------------------
// Caminho 1: /api/cron/portal (ramos), `publicarArtigosAprovados`
// ---------------------------------------------------------------------------

describe("caminho 1, o relógio do ramo do portal, com o portão", () => {
  const projeto = { id: PROJ, settings: settings({ aprovacao: "enforce" }) };
  const agora = new Date("2026-10-06T15:00:00.000Z");
  const lidos = () => supabaseFalso((op) => (op.tipo === "select" ? { data: [ARTIGO] } : { data: [{ slug: ARTIGO.slug }] }));

  it("NÃO publica a matéria aprovada pelo ramo e sem aprovação na fila", async () => {
    const { client, ops } = lidos();
    const fila = await filaCom([]);
    const r = await publicarArtigosAprovados(client, PROJ, agora, (c) => artigosLiberadosPeloPortao(projeto, c, fila));
    expect(r.publicados).toEqual([]);
    expect(r.segurados?.[0].motivo).toMatch(/APROVACAO_AUSENTE/);
    expect(escritas(ops, "articles")).toHaveLength(0);
  });

  it("NÃO publica a matéria cuja versão mudou depois da aprovação", async () => {
    const { client, ops } = lidos();
    const fila = await filaCom([
      { ramo: "artigo", pecaId: ARTIGO.id, hash: hashDoArtigo("Outro título", ARTIGO.content_html, ARTIGO.cover_image), estado: "aprovada" },
    ]);
    const r = await publicarArtigosAprovados(client, PROJ, agora, (c) => artigosLiberadosPeloPortao(projeto, c, fila));
    expect(r.publicados).toEqual([]);
    expect(r.segurados?.[0].motivo).toMatch(/APROVACAO_HASH_DIVERGENTE/);
    expect(escritas(ops, "articles")).toHaveLength(0);
  });

  it("NÃO publica quando a capa foi trocada depois da aprovação (a capa está no hash)", async () => {
    const { client, ops } = lidos();
    const fila = await filaCom([
      { ramo: "artigo", pecaId: ARTIGO.id, hash: hashDoArtigo(ARTIGO.title, ARTIGO.content_html, "https://x/outra.jpg"), estado: "aprovada" },
    ]);
    await publicarArtigosAprovados(client, PROJ, agora, (c) => artigosLiberadosPeloPortao(projeto, c, fila));
    expect(escritas(ops, "articles")).toHaveLength(0);
  });

  it("publica a versão aprovada, e só ela, repetindo as três condições na escrita", async () => {
    const { client, ops } = lidos();
    const fila = await filaCom([
      { ramo: "artigo", pecaId: ARTIGO.id, hash: hashDoArtigo(ARTIGO.title, ARTIGO.content_html, ARTIGO.cover_image), estado: "aprovada" },
    ]);
    const r = await publicarArtigosAprovados(client, PROJ, agora, (c) => artigosLiberadosPeloPortao(projeto, c, fila));
    expect(r.publicados).toEqual([ARTIGO.slug]);
    const [escrita] = escritas(ops, "articles");
    expect(filtro(escrita, "in", "id")).toEqual([[ARTIGO.id]]);
    expect(filtro(escrita, "eq", "manual_review_status")).toEqual(["approved"]);
    expect(filtro(escrita, "eq", "status")).toEqual(["scheduled"]);
  });

  it("fila em off: nenhum portão, o update de antes numa consulta só", async () => {
    const { client, ops } = supabaseFalso(() => ({ data: [{ slug: "a" }] }));
    await publicarArtigosAprovados(client, PROJ, agora);
    expect(ops).toHaveLength(1);
    expect(ops[0].tipo).toBe("update");
  });
});

// ---------------------------------------------------------------------------
// Caminho 2: /api/cron/publicacao, `publicarDoProjeto`
// ---------------------------------------------------------------------------

describe("caminho 2, o relógio da publicação da véspera, com o portão", () => {
  const EDICAO = { id: "ed-1", edition_date: "2026-10-06", subject: "o Fed cortou", content_html: "<p>edição</p>" };
  const agora = new Date("2026-10-06T15:00:00.000Z");

  function projetoCom(capacidades: Record<string, string>): Project {
    return { id: PROJ, slug: "desbuguei", timezone: TZ, settings: settings(capacidades) } as unknown as Project;
  }

  function banco() {
    return supabaseFalso((op) => {
      if (op.tipo === "select" && op.tabela === "news_editions") return { data: [EDICAO] };
      if (op.tipo === "select" && op.tabela === "articles") return { data: [ARTIGO] };
      if (op.tipo === "update" && op.tabela === "articles") return { data: [{ slug: ARTIGO.slug }] };
      return { data: [] };
    });
  }

  it("fila em enforce e nada aprovado: nem a edição nem o artigo vão ao ar", async () => {
    const { client, ops } = banco();
    const fila = await filaCom([]);
    const r = await publicarDoProjeto(projetoCom({ producao_vespera: "enforce", aprovacao: "enforce" }), agora, client, { fila });
    expect(escritas(ops, "news_editions")).toHaveLength(0);
    expect(escritas(ops, "articles")).toHaveLength(0);
    expect(r.edicoesPublicadas).toEqual([]);
    expect(r.artigosPublicados).toEqual([]);
    expect(r.seguradas).toHaveLength(2);
  });

  it("newsletter aguardando decisão: a edição NÃO aparece no portal", async () => {
    const { client, ops } = banco();
    const fila = await filaCom([
      { ramo: "newsletter", pecaId: EDICAO.id, hash: hashDaNewsletter(EDICAO.subject, EDICAO.content_html), estado: "aguardando" },
    ]);
    await publicarDoProjeto(projetoCom({ producao_vespera: "enforce", aprovacao: "enforce" }), agora, client, { fila });
    expect(escritas(ops, "news_editions")).toHaveLength(0);
  });

  it("as duas aprovadas, na versão que está na linha: as duas saem", async () => {
    const { client, ops } = banco();
    const fila = await filaCom([
      { ramo: "newsletter", pecaId: EDICAO.id, hash: hashDaNewsletter(EDICAO.subject, EDICAO.content_html), estado: "aprovada" },
      { ramo: "artigo", pecaId: ARTIGO.id, hash: hashDoArtigo(ARTIGO.title, ARTIGO.content_html, ARTIGO.cover_image), estado: "aprovada" },
    ]);
    const r = await publicarDoProjeto(projetoCom({ producao_vespera: "enforce", aprovacao: "enforce" }), agora, client, { fila });
    expect(escritas(ops, "news_editions")).toHaveLength(1);
    expect(filtro(escritas(ops, "articles")[0], "in", "id")).toEqual([[ARTIGO.id]]);
    expect(r.artigosPublicados).toEqual([ARTIGO.slug]);
  });

  it("ramos em enforce e fila em off: só sai o artigo com revisão aprovada (regra do ramo)", async () => {
    const { client, ops } = banco();
    await publicarDoProjeto(projetoCom({ producao_vespera: "enforce", ramos: "enforce" }), agora, client, { env: {} });
    const leitura = ops.find((o) => o.tabela === "articles" && o.tipo === "select");
    const escrita = escritas(ops, "articles")[0];
    expect(filtro(leitura!, "eq", "manual_review_status")).toEqual(["approved"]);
    expect(filtro(escrita, "eq", "manual_review_status")).toEqual(["approved"]);
  });

  it("tudo desligado: o update de antes, sem leitura de artigo e sem filtro de revisão", async () => {
    const { client, ops } = banco();
    await publicarDoProjeto(projetoCom({ producao_vespera: "enforce" }), agora, client, { env: {} });
    const artigos = ops.filter((o) => o.tabela === "articles");
    expect(artigos).toHaveLength(1);
    expect(artigos[0].tipo).toBe("update");
    expect(filtro(artigos[0], "eq", "manual_review_status")).toBeUndefined();
    expect(ops.find((o) => o.tabela === "news_editions")?.colunas).toBe("id, edition_date");
  });
});

// ---------------------------------------------------------------------------
// Caminho 3: a liberação da fila (`cicloDaFila`), com o adaptador de verdade
// ---------------------------------------------------------------------------

describe("caminho 3, a liberação da fila", () => {
  const projeto: ProjetoDaFila = { id: PROJ, timezone: TZ, settings: settings({ aprovacao: "enforce" }) };

  function adaptadorQueConta() {
    const despachos: Array<{ ramo: Ramo; pecaId: string }> = [];
    const adaptador: AdaptadorDePecas = {
      ler: async (ramo) => ({
        hashAtual: ramo === "artigo" ? hashDoArtigo(ARTIGO.title, ARTIGO.content_html, ARTIGO.cover_image) : hashDaNewsletter("a", "b"),
        texto: "",
        titulo: "",
        material: [],
      }),
      gravarTexto: async () => ({ hashNovo: "" }),
      despachar: async (ramo, pecaId) => {
        despachos.push({ ramo, pecaId });
        return { ok: true, detalhe: "ok" };
      },
      retirar: async () => {},
    };
    return { adaptador, despachos };
  }

  it("artigo aguardando e newsletter aguardando: nada é despachado", async () => {
    const fila = await filaCom([
      { ramo: "artigo", pecaId: ARTIGO.id, hash: hashDoArtigo(ARTIGO.title, ARTIGO.content_html, ARTIGO.cover_image), estado: "aguardando" },
      { ramo: "newsletter", pecaId: "ed-1", hash: hashDaNewsletter("a", "b"), estado: "aguardando", publicarEm: "2026-10-06T09:07:00.000Z" },
    ]);
    const { adaptador, despachos } = adaptadorQueConta();
    await cicloDaFila(projeto, { store: fila, pecas: adaptador, agora: () => Date.parse("2026-10-06T12:00:00.000Z"), alertar: async () => {} });
    expect(despachos).toEqual([]);
  });

  it("artigo aprovado com horário futuro fica esperando o horário, e sai quando ele chega", async () => {
    const fila = await filaCom([
      {
        ramo: "artigo",
        pecaId: ARTIGO.id,
        hash: hashDoArtigo(ARTIGO.title, ARTIGO.content_html, ARTIGO.cover_image),
        estado: "aprovada",
        publicarEm: "2026-10-06T15:00:00.000Z",
      },
    ]);
    const { adaptador, despachos } = adaptadorQueConta();
    const antes = await cicloDaFila(projeto, { store: fila, pecas: adaptador, agora: () => Date.parse("2026-10-06T01:00:00.000Z") });
    expect(despachos).toEqual([]);
    expect(antes.seguradas[0].motivo).toMatch(/sai em/);

    await cicloDaFila(projeto, { store: fila, pecas: adaptador, agora: () => Date.parse("2026-10-06T15:00:30.000Z") });
    expect(despachos).toEqual([{ ramo: "artigo", pecaId: ARTIGO.id }]);
  });
});

describe("o despacho do artigo no banco", () => {
  const projeto: ProjetoDaFila = { id: PROJ, timezone: TZ, settings: settings({ aprovacao: "enforce" }) };
  const aprovacao = { publicarEm: null } as never;

  it("horário futuro na linha: fica `scheduled` e aprovado, e NÃO vira `published`", async () => {
    const { client, ops } = supabaseFalso((op) =>
      op.tipo === "select"
        ? { data: { id: "art-1", status: "scheduled", published_at: "2099-01-01T15:00:00.000Z" } }
        : { data: [{ id: "art-1" }] },
    );
    const r = await criarAdaptadorSupabase(client, projeto).despachar("artigo", "art-1", aprovacao);
    expect(r.ok).toBe(true);
    const [escrita] = escritas(ops, "articles");
    expect(escrita.valores).toMatchObject({ status: "scheduled", manual_review_status: "approved" });
    expect((escrita.valores as Record<string, unknown>).published_at).toBeUndefined();
  });

  it("horário vencido: publica agora, e marca a revisão do ramo como aprovada", async () => {
    const { client, ops } = supabaseFalso((op) =>
      op.tipo === "select"
        ? { data: { id: "art-1", status: "scheduled", published_at: "2020-01-01T15:00:00.000Z" } }
        : { data: [{ id: "art-1" }] },
    );
    await criarAdaptadorSupabase(client, projeto).despachar("artigo", "art-1", aprovacao);
    expect(escritas(ops, "articles")[0].valores).toMatchObject({ status: "published", manual_review_status: "approved" });
  });

  it("já publicado pelo relógio do portal: sucesso, sem escrita e sem alerta a cada giro", async () => {
    const { client, ops } = supabaseFalso(() => ({ data: { id: "art-1", status: "published", published_at: null } }));
    const r = await criarAdaptadorSupabase(client, projeto).despachar("artigo", "art-1", aprovacao);
    expect(r.ok).toBe(true);
    expect(escritas(ops, "articles")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A newsletter: a data e a hora que a fila grava
// ---------------------------------------------------------------------------

describe("a newsletter da produção na véspera", () => {
  const projeto: ProjetoDaFila = { id: PROJ, timezone: TZ, settings: settings({ aprovacao: "enforce", producao_vespera: "enforce" }) };

  it("produzida segunda às 17:00, ela é marcada para terça às 06:07, e não para segunda", () => {
    // Sem agendamento (a véspera passa a data do ALVO, que é terça).
    const h = horariosDaRedacaoNaFila(projeto, "2026-10-06", null);
    expect(h.newsletter).toBe("2026-10-06T09:07:00.000Z");
    expect(h.newsletter).not.toMatch(/^2026-10-05/);
  });

  it("com o agendamento da véspera, a fila usa a hora da cadência, a mesma do Listmonk e do artigo", () => {
    const h = horariosDaRedacaoNaFila(projeto, "2026-10-06", {
      newsletterEm: "2026-10-06T09:30:00.000Z",
      portalEm: "2026-10-06T09:07:00.000Z",
    });
    expect(h).toEqual({ newsletter: "2026-10-06T09:30:00.000Z", artigoDaEdicao: "2026-10-06T09:07:00.000Z" });
  });

  it("aprovada antes da hora, a campanha NÃO é criada até a hora chegar", async () => {
    const fila = await filaCom([
      { ramo: "newsletter", pecaId: "ed-1", hash: hashDaNewsletter("a", "b"), estado: "aprovada", publicarEm: "2026-10-06T09:07:00.000Z" },
    ]);
    const despachar = vi.fn(async () => ({ ok: true as const, detalhe: "campanha" }));
    const pecas: AdaptadorDePecas = {
      ler: async () => ({ hashAtual: hashDaNewsletter("a", "b"), texto: "", titulo: "", material: [] }),
      gravarTexto: async () => ({ hashNovo: "" }),
      despachar,
      retirar: async () => {},
    };
    await cicloDaFila(projeto, { store: fila, pecas, agora: () => Date.parse("2026-10-05T23:00:00.000Z") });
    expect(despachar).not.toHaveBeenCalled();
    await cicloDaFila(projeto, { store: fila, pecas, agora: () => Date.parse("2026-10-06T09:07:10.000Z") });
    expect(despachar).toHaveBeenCalledTimes(1);
  });
});
