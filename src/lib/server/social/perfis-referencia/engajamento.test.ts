import { describe, expect, it } from "vitest";
import { engajamentoDoPost, mediana, sinaisVirais } from "./engajamento";
import type { PostDoPerfil } from "./graph";

const AGORA = new Date("2026-10-05T18:00:00Z");

function post(id: string, curtidas: number | null, comentarios: number, horasAtras: number, legenda = "Uma legenda com assunto de verdade"): PostDoPerfil {
  return {
    id,
    legenda,
    curtidas,
    comentarios,
    publicadoEm: new Date(AGORA.getTime() - horasAtras * 3600 * 1000).toISOString(),
    tipo: "IMAGE",
    permalink: `https://www.instagram.com/p/${id}/`,
  };
}

/*
 * Inspirado no @braziljournal medido em 05/10/2026: posts comuns na casa das
 * centenas de curtidas, e um de 2.710 com 92 comentários.
 */
const COMUNS = [
  post("a", 96, 5, 3),
  post("b", 195, 11, 28),
  post("c", 330, 13, 50),
  post("d", 94, 41, 60),
  post("e", 300, 20, 90),
  post("f", 250, 15, 100),
  post("g", 180, 9, 110),
];

describe("engajamento relativo ao próprio perfil", () => {
  it("comentário pesa o dobro, e curtida escondida não zera o post", () => {
    expect(engajamentoDoPost({ curtidas: 10, comentarios: 5 })).toBe(20);
    expect(engajamentoDoPost({ curtidas: null, comentarios: 5 })).toBe(10);
  });

  it("mediana resiste ao post viral", () => {
    expect(mediana([1, 2, 3, 1000])).toBe(2.5);
    expect(mediana([])).toBe(0);
  });

  it("acha o post que rendeu acima do normal", () => {
    const r = sinaisVirais([...COMUNS, post("viral", 2710, 92, 4)], AGORA);
    expect(r.sinais.map((s) => s.postId)).toEqual(["viral"]);
    expect(r.sinais[0].razao).toBeGreaterThan(2);
  });

  it("NÃO: post bom mas dentro do normal do perfil não é sinal", () => {
    const r = sinaisVirais(COMUNS, AGORA);
    expect(r.sinais).toEqual([]);
    expect(r.motivo).toMatch(/nenhum post/);
  });

  it("NÃO: viral fora da janela já foi pauta", () => {
    const r = sinaisVirais([...COMUNS, post("velho", 5000, 300, 24 * 6)], AGORA);
    expect(r.sinais).toEqual([]);
  });

  it("NÃO: perfil com poucos posts não tem linha de base", () => {
    const r = sinaisVirais([post("x", 5000, 10, 1), post("y", 10, 1, 2)], AGORA);
    expect(r.sinais).toEqual([]);
    expect(r.motivo).toMatch(/mínimo/);
  });

  it("NÃO: post sem legenda não tem assunto para buscar", () => {
    const r = sinaisVirais([...COMUNS, post("muda", 5000, 300, 2, "")], AGORA);
    expect(r.sinais).toEqual([]);
  });
});
