import { describe, expect, it } from "vitest";
import { comDestaqueFixado, montarHome, type PautaDoPortal } from "./portal";
import { EDITORIAS } from "@/lib/editorias";

const editorias = EDITORIAS.map((e) => e.id);
const pautas: PautaDoPortal[] = Array.from({ length: 40 }, (_, i) => ({
  id: `p${i}`,
  titulo: `Pauta ${i}`,
  resumo: "",
  rotulo: "",
  editoria: editorias[i % editorias.length],
  imagem: i % 3 === 2 ? null : `https://x/${i}.jpg`,
  fonte: "",
  data: "2026-10-05",
  href: `/artigos/p${i}`,
}));

describe("home sem repetição", () => {
  it("cada pauta aparece em um bloco só", () => {
    const h = montarHome(pautas);
    const ids = [
      h.destaque!.id,
      ...h.chamadas.map((p) => p.id),
      ...h.secundarias.map((p) => p.id),
      ...h.ultimas.map((p) => p.id),
      ...h.maisNovaPorEditoria.map((m) => m.pauta.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a grade de três só tem pauta com foto, e o índice por editoria é da editoria certa", () => {
    const h = montarHome(pautas);
    expect(h.secundarias.every((p) => p.imagem)).toBe(true);
    for (const { editoria, pauta } of h.maisNovaPorEditoria) expect(pauta.editoria).toBe(editoria);
  });

  it("manchete fixada com prazo vencido some sozinha", async () => {
    const lista = await comDestaqueFixado(
      pautas,
      { settings: { portal: { destaque: "chicago", destaque_ate: "2000-01-01" } } },
      async () => ({ title: "Chicago", cover_image: "https://x/c.jpg" }),
    );
    expect(lista).toBe(pautas);
  });
});
