import { describe, expect, it, vi } from "vitest";

/**
 * Quem grava post novo pergunta ao portão com que status gravar.
 *
 * O complemento do teste do worker: lá se prova que `scheduled` sem aprovação
 * é barrado na publicação; aqui, que com a fila em `enforce` os escritores que
 * passam pelo portão nem chegam a gravar `scheduled`.
 */

const upserts: Array<Record<string, unknown>> = [];

vi.mock("../supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      upsert: (linha: Record<string, unknown>) => {
        upserts.push(linha);
        return { select: () => ({ single: async () => ({ data: { id: `id-${upserts.length}` }, error: null }) }) };
      },
    }),
  }),
}));

const { scheduleEditionPosts } = await import("../social/instagram/scheduler");
const { opcoesDaFilaParaOStore } = await import("./integracao");

function projeto(aprovacao?: string) {
  return {
    id: "proj-1",
    slug: "desbuguei",
    name: "eua.journal",
    status: "active" as const,
    niche: "",
    contentLanguage: "pt-BR",
    timezone: "America/Sao_Paulo",
    siteUrl: null,
    brand: { displayName: "", tagline: "", primaryColor: "", logoUrl: null, socialLinks: {} },
    newsletterFromName: "",
    publishHourLocal: 6,
    publishMinuteLocal: 3,
    editorialPromptExtra: "",
    settings: aprovacao ? { capacidades: { aprovacao } } : {},
  };
}

const STORIES = [{ title: "Pauta um" }, { title: "Pauta dois" }] as never;

describe("agendador legado", () => {
  it("sem fila grava scheduled, como sempre", async () => {
    upserts.length = 0;
    await scheduleEditionPosts({ project: projeto(), editionDate: "2026-10-09", articleSlug: "a", stories: STORIES });
    expect(upserts.map((u) => u.status)).toEqual(["scheduled", "scheduled"]);
  });

  it("com a fila em enforce grava draft: nenhuma vaga nasce publicável", async () => {
    upserts.length = 0;
    await scheduleEditionPosts({ project: projeto("enforce"), editionDate: "2026-10-09", articleSlug: "a", stories: STORIES });
    expect(upserts.map((u) => u.status)).toEqual(["draft", "draft"]);
  });
});

describe("store do Social V2", () => {
  const client = {} as never;

  it("sem projeto ou com a fila desligada, o store é o de sempre", () => {
    expect(opcoesDaFilaParaOStore(null, client)).toEqual({});
    expect(opcoesDaFilaParaOStore({ id: "p", timezone: "UTC", settings: {} }, client)).toEqual({});
  });

  it("em ensaio grava scheduled e enfileira; em enforce grava draft e enfileira", () => {
    const ensaio = opcoesDaFilaParaOStore({ id: "p", timezone: "UTC", settings: { capacidades: { aprovacao: "dry_run" } } }, client);
    expect(ensaio.statusDeEntrada).toBe("scheduled");
    expect(typeof ensaio.aoGravar).toBe("function");

    const valendo = opcoesDaFilaParaOStore({ id: "p", timezone: "UTC", settings: { capacidades: { aprovacao: "enforce" } } }, client);
    expect(valendo.statusDeEntrada).toBe("draft");
    expect(typeof valendo.aoGravar).toBe("function");
  });
});
