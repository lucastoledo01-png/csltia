import { describe, expect, it } from "vitest";
import { EDITORIAS } from "./editorias";
import { ASSUNTOS_GENERICOS } from "./indexacao-do-artigo";
import { chaveDeTema, TEMAS, temaPeloNome, temasNoTexto, temasParaOPrompt, todosOsTemas } from "./temas";

describe("vocabulário fechado de temas (06/10/2026)", () => {
  it("cada editoria tem de 15 a 30 temas", () => {
    for (const e of EDITORIAS) {
      expect(TEMAS[e.id].length, e.id).toBeGreaterThanOrEqual(15);
      expect(TEMAS[e.id].length, e.id).toBeLessThanOrEqual(30);
    }
  });

  it("slug estável: único, minúsculo, sem acento, para as futuras páginas /tema", () => {
    const slugs = EDITORIAS.flatMap((e) => TEMAS[e.id].map((t) => t.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("nenhum nome nem sinônimo é palavra genérica da lista de descarte", () => {
    for (const t of todosOsTemas()) {
      for (const forma of [t.nome, ...(t.sinonimos ?? [])]) expect(ASSUNTOS_GENERICOS.has(chaveDeTema(forma)), forma).toBe(false);
    }
  });

  it("acha o tema pelo nome ou sinônimo, sem acento nem caixa", () => {
    expect(temaPeloNome("Data Center")?.slug).toBe("data-centers");
    expect(temaPeloNome("inteligencia artificial")?.nome).toBe("inteligência artificial");
    expect(temaPeloNome("energia")).toBeNull();
  });

  it("o texto da matéria aponta o tema quando o trata, não quando o cita de passagem", () => {
    const texto = "Chicago quer pausar novos data centers. A cidade tem 39 data centers ativos e um data center novo em obra.";
    expect(temasNoTexto(texto).map((t) => t.slug)).toContain("data-centers");
    expect(temasNoTexto("Um texto sobre um robotáxi.").map((t) => t.slug)).not.toContain("carros-autonomos");
  });

  it("o prompt leva a lista da editoria da matéria primeiro", () => {
    expect(temasParaOPrompt("tecnologia").split("\n")[0]).toMatch(/^tecnologia: inteligência artificial; data centers/);
  });
});
