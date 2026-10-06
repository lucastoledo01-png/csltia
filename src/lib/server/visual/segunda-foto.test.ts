import { describe, expect, it, vi } from "vitest";
import { buscarSegundaFoto } from "./resolver";
import type { Acervo, ImagemDoAcervo } from "./acervo/acervo";
import type { EntidadeVisual } from "./tipos";

/*
 * A busca extra da bolha (06/10/2026): mais funda que a vice comum, com a
 * mesma régua. Os testes que importam são os do "não": sem entidade, sem
 * conferência e foto repetida não viram bolha.
 */

const sanders: EntidadeVisual = {
  nome: "Bernie Sanders",
  normalizado: "bernie sanders",
  tipo: "person",
  qid: "Q359442",
  imagemPrincipal: null,
  categoriaCommons: "Bernie Sanders",
  siteOficial: null,
  origem: "teste",
  confianca: 95,
  evidencias: ["fixture"],
} as EntidadeVisual;

const PAUTA = {
  storyId: "s-1",
  titulo: "Agências federais deixariam de usar leitores de placas em projeto de Sanders",
  categoria: "seguranca",
  classificacao: { atores: ["Bernie Sanders"], lugares: [], acontecimento: [] },
};

function doAcervo(url: string): ImagemDoAcervo {
  return {
    id: url,
    arquivo: url.split("/").pop() ?? url,
    grupo: "pessoas",
    pais: "eua",
    assunto: "bernie-sanders",
    detalhe: "",
    tag: "pessoas/bernie-sanders",
    repositorio: "supabase",
    caminho: url,
    urlPublica: url,
    largura: 2160,
    altura: 2880,
    orientacao: "retrato",
    tom: "escuro",
    luminanciaDoTopo: 0.3,
    autor: "nosso",
    licenca: "acervo próprio",
    rightsStatus: "verified",
    usos: 0,
    ultimoUsoEm: null,
  };
}

function acervo(imagens: ImagemDoAcervo[]): Acervo {
  return {
    modo: "enforce",
    gravarUso: true,
    gravarFaltas: true,
    porAssunto: vi.fn(async () => imagens),
    porTag: vi.fn(async () => []),
    registrarUso: vi.fn(async () => undefined),
    registrarFalta: vi.fn(async () => undefined),
  };
}

describe("a busca extra da segunda foto", () => {
  it("pauta sem entidade nomeada não tem bolha: o círculo mostra quem a pauta cita", async () => {
    const r = await buscarSegundaFoto(PAUTA, { imageUrl: "https://x/fundo.jpg" }, null, { conferenciaVisual: false });
    expect(r.asset).toBeNull();
    expect(r.nota).toMatch(/sem entidade nomeada/);
  });

  it("o acervo vem primeiro, e a foto de fundo nunca volta como bolha", async () => {
    const r = await buscarSegundaFoto(PAUTA, { imageUrl: "https://acervo/fundo.jpg" }, sanders, {
      acervo: acervo([doAcervo("https://acervo/fundo.jpg"), doAcervo("https://acervo/outra.jpg")]),
      conferenciaVisual: false,
    });
    expect(r.asset?.imageUrl).toBe("https://acervo/outra.jpg");
    expect(r.asset?.source).toBe("acervo_proprio");
  });

  it("foto já usada hoje não vira bolha", async () => {
    const r = await buscarSegundaFoto(PAUTA, { imageUrl: "https://acervo/fundo.jpg" }, sanders, {
      acervo: acervo([doAcervo("https://acervo/outra.jpg")]),
      jaUsadosNestaEdicao: new Set(["https://acervo/outra.jpg"]),
      conferenciaVisual: false,
    });
    expect(r.asset).toBeNull();
  });

  it("sem conferência visual, nada de fora é aprovado, e nem se busca", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const r = await buscarSegundaFoto(PAUTA, { imageUrl: "https://x/fundo.jpg" }, sanders, {
      conferenciaVisual: false,
      fetcher,
    });
    expect(r.asset).toBeNull();
    expect(r.nota).toMatch(/sem conferência visual/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
