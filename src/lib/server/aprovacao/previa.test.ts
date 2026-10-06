import { describe, expect, it } from "vitest";
import { hashDaNewsletter, hashDoArtigo, hashDoPostDaLinha } from "./hash";
import { previaDaNewsletter, previaDoArtigo, previaDoPost, previasDaFila, telasDoPost } from "./previa";
import type { Aprovacao } from "./contrato";

const POST = {
  id: "p1",
  status: "scheduled",
  title: "Trump libera diesel vermelho",
  caption: "Primeira linha.\n\nSegunda linha.",
  scheduled_at: "2026-10-06T17:45:00Z",
  published_at: null,
  slides_manifest: [
    { index: 2, url: "https://x/2.png", sha256: "b" },
    { index: 1, url: "https://x/1.png", sha256: "a" },
  ],
  content_json: {},
  error_message: null,
};

describe("a prévia do post é a arte congelada e a legenda como sai", () => {
  it("as telas na ordem de publicação, e o formato pelo número de telas", () => {
    const p = previaDoPost(POST, { hashArtefato: hashDoPostDaLinha(POST) });
    expect(p.telas).toEqual(["https://x/1.png", "https://x/2.png"]);
    expect(p.formato).toBe("carrossel");
    expect(p.legenda).toBe("Primeira linha.\n\nSegunda linha.");
    expect(p.hashConfere).toBe(true);
    expect(p.noAr).toBe(false);
  });

  it("sem manifesto, lê a arte do content_json, como o hash", () => {
    const linha = { caption: "x", content_json: { arte: { artefato: { index: 1, url: "https://x/u.png", sha256: "c" } } } };
    expect(telasDoPost(linha)).toEqual(["https://x/u.png"]);
    expect(previaDoPost(linha, { hashArtefato: "outro" })).toMatchObject({ formato: "post único", hashConfere: false });
  });
});

describe("a prévia do artigo", () => {
  const linha = {
    title: "Ibovespa bate recorde",
    description: "Linha fina",
    status: "published",
    category: "Brasil",
    content_html: "<p>Um dois três.</p><p>Quatro.</p>",
    cover_image: "https://c/x.jpg",
    tags: ["Brasil", "assunto:Flávio Bolsonaro", "sobre:Person:Flávio Bolsonaro", "assunto:dólar"],
    aeo_questions: [{}, {}, {}],
  };
  it("assuntos, contagens e no ar", () => {
    const p = previaDoArtigo(linha, { hashArtefato: hashDoArtigo(linha.title, linha.content_html, linha.cover_image) });
    expect(p).toMatchObject({ assuntos: ["Flávio Bolsonaro", "dólar"], perguntas: 3, palavras: 4, noAr: true, hashConfere: true, linhaFina: "Linha fina" });
  });
});

describe("a newsletter no ar", () => {
  const linha = { subject: "diesel vermelho para todo mundo?", preheader: "pre", content_html: "<p>x</p>", status: "published", edition_date: "2026-10-06" };
  const hash = hashDaNewsletter(linha.subject, linha.content_html);
  const agora = Date.parse("2026-10-06T19:16:00Z");

  it("no ensaio, gravada publicada e com o horário passado, saiu", () => {
    expect(previaDaNewsletter(linha, { hashArtefato: hash, liberadoEm: null, publicarEm: "2026-10-06T09:07:00Z" }, "dry_run", agora).noAr).toBe(true);
  });

  it("valendo, só a liberação da fila conta", () => {
    expect(previaDaNewsletter(linha, { hashArtefato: hash, liberadoEm: null, publicarEm: "2026-10-06T09:07:00Z" }, "enforce", agora).noAr).toBe(false);
    expect(
      previaDaNewsletter(linha, { hashArtefato: hash, liberadoEm: "2026-10-06T09:07:10Z", publicarEm: "2026-10-06T09:07:00Z" }, "enforce", agora).noAr,
    ).toBe(true);
  });
});

describe("previasDaFila", () => {
  function clientFalso(tabelas: Record<string, Array<Record<string, unknown>>>, lidas: string[]) {
    return {
      from: (t: string) => {
        lidas.push(t);
        const q = {
          select: () => q,
          eq: () => q,
          in: async (_c: string, ids: string[]) => ({ data: (tabelas[t] ?? []).filter((l) => ids.includes(String(l.id))), error: null }),
        };
        return q;
      },
    } as never;
  }

  const fila = [
    { id: "a1", ramo: "post", pecaId: "p1", hashArtefato: hashDoPostDaLinha(POST) },
    { id: "a2", ramo: "artigo", pecaId: "sumiu", hashArtefato: "h" },
  ] as Aprovacao[];

  it("uma leitura por tabela com peça, e a peça que sumiu é dita", async () => {
    const lidas: string[] = [];
    const r = await previasDaFila(clientFalso({ social_posts: [POST] }, lidas), "proj", fila, "dry_run");
    expect(lidas.sort()).toEqual(["articles", "social_posts"]);
    expect(r.a1).toMatchObject({ ramo: "post", hashConfere: true });
    expect(r.a2).toEqual({ ramo: "artigo", ausente: true });
  });
});
