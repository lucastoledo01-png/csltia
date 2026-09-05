import { describe, expect, it, vi } from "vitest";
import {
  cosseno,
  criarProvedorOpenAI,
  melhorScore,
  normalizar,
  repositorioEmMemoria,
  textoParaVetor,
} from "./embeddings";

describe("cosseno", () => {
  it("dá 1 para o mesmo vetor e 0 para ortogonais", () => {
    expect(cosseno([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosseno([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it("devolve 0 quando os tamanhos divergem, em vez de comparar meio vetor", () => {
    expect(cosseno([1, 0, 0], [1, 0])).toBe(0);
  });

  it("devolve 0 para vetor nulo sem gerar NaN", () => {
    expect(cosseno([0, 0], [1, 1])).toBe(0);
  });
});

describe("normalizar", () => {
  it("deixa o vetor com norma 1", () => {
    const v = normalizar([3, 4]);
    expect(Math.hypot(...v)).toBeCloseTo(1);
  });

  it("não divide por zero", () => {
    expect(normalizar([0, 0])).toEqual([0, 0]);
  });
});

describe("repositorioEmMemoria", () => {
  const conhecidos = [
    { vetor: [1, 0], registro: "igual" },
    { vetor: [0.9, 0.436], registro: "parecido" },
    { vetor: [0, 1], registro: "outro" },
  ];

  it("devolve o mais próximo acima do limiar", async () => {
    const repo = repositorioEmMemoria(conhecidos);
    const achado = await repo.vizinhoMaisProximo([1, 0], 0.82);
    expect(achado?.registro).toBe("igual");
    expect(achado?.score).toBeCloseTo(1);
  });

  it("devolve null quando nada passa do limiar", async () => {
    const repo = repositorioEmMemoria([{ vetor: [0, 1], registro: "outro" }]);
    expect(await repo.vizinhoMaisProximo([1, 0], 0.82)).toBeNull();
  });

  it("melhorScore reporta o par mais próximo mesmo abaixo do limiar", () => {
    expect(melhorScore([1, 0], [{ vetor: [0.5, 0.866], registro: "x" }])).toBeCloseTo(0.5);
  });
});

describe("textoParaVetor", () => {
  it("junta título e resumo e ignora resumo vazio", () => {
    expect(textoParaVetor("Título", "Resumo")).toBe("Título. Resumo");
    expect(textoParaVetor("Título", "  ")).toBe("Título");
  });
});

describe("criarProvedorOpenAI", () => {
  const env = { OPENAI_API_KEY: "chave-de-teste" };

  it("reordena pelo index em vez de confiar na ordem da resposta", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
        { status: 200 }
      )
    );

    const provedor = criarProvedorOpenAI(env, fetcher as unknown as typeof fetch);
    const vetores = await provedor.gerar(["primeiro", "segundo"]);

    expect(vetores[0]).toEqual([1, 0]);
    expect(vetores[1]).toEqual([0, 1]);
  });

  it("falha quando volta menos vetor do que texto enviado", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }), { status: 200 })
    );

    const provedor = criarProvedorOpenAI(env, fetcher as unknown as typeof fetch);
    await expect(provedor.gerar(["a", "b"])).rejects.toThrow(/1 vetores para 2 textos/);
  });

  it("não chama a API para lista vazia", async () => {
    const fetcher = vi.fn();
    const provedor = criarProvedorOpenAI(env, fetcher as unknown as typeof fetch);
    expect(await provedor.gerar([])).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
