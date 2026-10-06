import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A leitura pública de `articles` (06/10/2026, auditoria de SEO item 26).
 *
 * A página da matéria lia a tabela inteira, com corpo, para achar uma linha.
 * Estes testes prendem a forma da consulta nova: por slug, só publicada, sem
 * `select *`, e o artigo estático só quando o banco não respondeu.
 */

type Chamada = { metodo: string; args: unknown[] };
let chamadas: Chamada[] = [];
let resposta: { data: unknown; error: { message: string } | null } = { data: [], error: null };
let lancar = false;

function construtor() {
  const q: Record<string, unknown> = {};
  for (const metodo of ["from", "select", "eq", "order", "limit"]) {
    q[metodo] = (...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return q;
    };
  }
  q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, erro);
  return q;
}

vi.mock("./supabase-admin", () => ({
  getSupabaseAdminClient: () => {
    if (lancar) throw new Error("SUPABASE_URL ausente");
    return construtor();
  },
}));

const { getArticleBySlug, getPublishedArticles, COLUNAS_DA_MATERIA } = await import("./articles-service");

const SLUG_ESTATICO = "o-que-pesa-na-decisao-de-sair-do-brasil";

beforeEach(() => {
  chamadas = [];
  resposta = { data: [], error: null };
  lancar = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function filtros() {
  return chamadas.filter((c) => c.metodo === "eq").map((c) => c.args);
}

function selecionado(): string {
  return String(chamadas.find((c) => c.metodo === "select")?.args[0]);
}

describe("getArticleBySlug", () => {
  it("consulta UMA matéria pelo slug, só publicada, com as colunas da página", async () => {
    resposta = {
      data: [{ id: "1", slug: "chicago", title: "Chicago", status: "published", content_html: "<p>x</p>", category: "Política" }],
      error: null,
    };

    const artigo = await getArticleBySlug("chicago");

    expect(artigo?.title).toBe("Chicago");
    expect(filtros()).toEqual([
      ["slug", "chicago"],
      ["status", "published"],
    ]);
    expect(selecionado()).toBe(COLUNAS_DA_MATERIA);
    expect(selecionado()).not.toContain("*");
    expect(chamadas.find((c) => c.metodo === "limit")?.args[0]).toBe(1);
  });

  it("slug que o banco não tem publicado é 404, e não o artigo estático", async () => {
    resposta = { data: [], error: null };
    expect(await getArticleBySlug(SLUG_ESTATICO)).toBeNull();
  });

  it("banco que não respondeu cai no artigo estático, como antes", async () => {
    resposta = { data: null, error: { message: "Gateway Timeout" } };
    expect((await getArticleBySlug(SLUG_ESTATICO))?.slug).toBe(SLUG_ESTATICO);

    lancar = true;
    expect((await getArticleBySlug(SLUG_ESTATICO))?.slug).toBe(SLUG_ESTATICO);
  });
});

describe("getPublishedArticles", () => {
  it("lê só as publicadas e sem o corpo", async () => {
    resposta = { data: [{ slug: "a", title: "A", category: "Economia", published_at: "2026-10-05T09:00:00Z" }], error: null };

    const lista = await getPublishedArticles();

    expect(lista.map((a) => a.slug)).toEqual(["a"]);
    expect(filtros()).toEqual([["status", "published"]]);
    expect(selecionado()).not.toContain("content");
    expect(selecionado()).not.toContain("*");
  });

  it("banco que respondeu sem publicada devolve lista vazia, não os estáticos", async () => {
    resposta = { data: [], error: null };
    expect(await getPublishedArticles()).toEqual([]);
  });
});
