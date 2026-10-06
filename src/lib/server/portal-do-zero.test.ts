import { describe, expect, it } from "vitest";
import { soComMateriaPublicada, type PautaDoPortal } from "./portal";

const pauta = (href: string): PautaDoPortal => ({
  id: href, titulo: href, resumo: "", rotulo: "", editoria: "economia",
  imagem: null, fonte: "", data: "2026-10-06", href,
});

describe("portal do zero (06/10/2026)", () => {
  it("pauta sem matéria publicada não vira cartão", () => {
    const lista = [pauta("/artigos/chicago"), pauta("/artigos/antiga"), pauta("/artigos/edicao-2026-09-24")];
    expect(soComMateriaPublicada(lista, new Set(["chicago"])).map((p) => p.href)).toEqual(["/artigos/chicago"]);
  });
});
