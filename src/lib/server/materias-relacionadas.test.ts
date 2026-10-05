import { describe, expect, it } from "vitest";
import { buscarRelacionadas, escolherRelacionadas, type LinhaParaRelacionar } from "./materias-relacionadas";

const linha = (slug: string, title: string, extra: Partial<LinhaParaRelacionar> = {}): LinhaParaRelacionar => ({
  slug,
  title,
  status: "published",
  category: "Política",
  published_at: "2026-10-01T10:00:00Z",
  tags: [],
  ...extra,
});

const ALVO = { slug: "chicago-data-centers", categoria: "Política", texto: "Chicago propõe moratória de data centers" };

describe("Leia também: só matérias publicadas da mesma editoria", () => {
  it("nunca liga para rascunho, agendada, arquivada, a própria matéria, edição inteira ou outra editoria", () => {
    const linhas = [
      linha("agendada", "Data centers agendada", { status: "scheduled" }),
      linha("rascunho", "Data centers rascunho", { status: "draft" }),
      linha("arquivada", "Data centers arquivada", { status: "archived" }),
      linha("chicago-data-centers", "A própria matéria"),
      linha("edicao-2026-09-24", "Edição inteira com data centers"),
      linha("outra-editoria", "Data centers em Chicago", { category: "Tecnologia" }),
      linha("publicada", "Uma publicada de política"),
    ];
    expect(escolherRelacionadas(linhas, ALVO).map((r) => r.slug)).toEqual(["publicada"]);
  });

  it("a mais parecida vem primeiro, e no empate a mais nova; no máximo três", () => {
    const linhas = [
      linha("velha-sem-relacao", "Eleição em Los Angeles", { published_at: "2026-09-01T00:00:00Z" }),
      linha("nova-sem-relacao", "Orçamento federal", { published_at: "2026-10-05T00:00:00Z" }),
      linha("parecida", "Data centers pressionam a rede", { published_at: "2026-08-01T00:00:00Z" }),
      linha("pelo-assunto", "Conta de luz sobe", { tags: ["assunto:data centers"], published_at: "2026-07-01T00:00:00Z" }),
    ];
    expect(escolherRelacionadas(linhas, ALVO).map((r) => r.slug)).toEqual(["parecida", "pelo-assunto", "nova-sem-relacao"]);
  });

  it("a consulta ao banco já pede só publicadas da editoria e do projeto", async () => {
    const filtros: Array<[string, unknown]> = [];
    const consulta = {
      select: () => consulta,
      eq: (c: string, v: unknown) => (filtros.push([c, v]), consulta),
      order: () => consulta,
      limit: async () => ({ data: [linha("a", "Data centers"), linha("b", "Rascunho", { status: "draft" })], error: null }),
    };
    const r = await buscarRelacionadas({ from: () => consulta } as never, "projeto-1", ALVO);
    expect(filtros).toEqual([["project_id", "projeto-1"], ["status", "published"], ["category", "Política"]]);
    expect(r.map((x) => x.slug)).toEqual(["a"]);
  });
});
