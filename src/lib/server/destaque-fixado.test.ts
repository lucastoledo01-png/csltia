import { describe, expect, it } from "vitest";
import { comDestaqueFixado, montarHome, type PautaDoPortal } from "./portal";

const pauta = (id: string, imagem: string | null = "https://x/f.jpg"): PautaDoPortal => ({
  id, titulo: `Pauta ${id}`, resumo: "", rotulo: "Economia", editoria: "economia",
  imagem, fonte: "", data: "2026-10-05", href: `/artigos/${id}`,
});

const artigo = { title: "Chicago propõe um ano sem novos data centers", cover_image: "https://x/chicago.jpg", category: "Política", published_at: "2026-09-24" };

describe("manchete fixada pelo dono", () => {
  it("sem a chave, a home é a de sempre", async () => {
    const lista = [pauta("a"), pauta("b")];
    expect(await comDestaqueFixado(lista, { settings: {} }, async () => artigo)).toBe(lista);
  });

  it("com a chave, a matéria vira a manchete sem mudar a data dela", async () => {
    const lista = await comDestaqueFixado([pauta("a"), pauta("b")], { settings: { portal: { destaque: "chicago" } } }, async () => artigo);
    const home = montarHome(lista);
    expect(home.destaque?.titulo).toBe(artigo.title);
    expect(home.destaque?.data).toBe("2026-09-24");
    expect(home.destaque?.href).toBe("/artigos/chicago");
  });

  it("slug que não está no ar não muda nada", async () => {
    const lista = [pauta("a")];
    expect(await comDestaqueFixado(lista, { settings: { portal: { destaque: "sumiu" } } }, async () => null)).toBe(lista);
  });

  it("a matéria não aparece duas vezes", async () => {
    const lista = await comDestaqueFixado([pauta("chicago"), pauta("b")], { settings: { portal: { destaque: "chicago" } } }, async () => artigo);
    expect(lista.filter((p) => p.href === "/artigos/chicago")).toHaveLength(1);
  });
});
