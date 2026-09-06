import { describe, expect, it, vi } from "vitest";
import { carregarConfigEditorial } from "./config";
import type { Classificacao } from "./classificador";
import type { FinalistaParaVerificar, Verificacao } from "./verificador";
import { apenasConfirmadas, verificarFinalistas } from "./verificador";

/**
 * A conferência dos finalistas, e o que ela faz quando discorda.
 *
 * Medido antes de existir: a mesma candidata, classificada três vezes, mudou
 * de decisão em 24% dos casos. Diante de duas respostas sobre "os EUA saem bem
 * ou mal nesta notícia", escolher uma é sortear. Estes testes travam a recusa
 * de sortear.
 */

const CONFIG = carregarConfigEditorial({});
const ENV = { OPENAI_API_KEY: "chave-de-teste" };

function classificacao(p: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "c1",
    pais: "EUA",
    imigracao: true,
    leitura: "oportunidade",
    eixo: "oportunidade",
    natureza: "official_action",
    relevancia: 7,
    atores: ["USCIS"],
    lugares: [],
    acontecimento: [],
    justificativa: "",
    ...p,
  } as Classificacao;
}

function finalista(p: Partial<FinalistaParaVerificar> = {}): FinalistaParaVerificar {
  return {
    storyId: "s1",
    titulo: "USCIS publica guia do EB-2 NIW",
    fonte: "USCIS",
    url: "https://www.uscis.gov/x",
    contexto: "A agência publicou orientação sobre a análise de interesse nacional.",
    classificacaoPrimaria: classificacao(),
    ...p,
  };
}

/** Modelo de mentira, que devolve a leitura pedida. */
function modelo(pautas: Array<Record<string, unknown>>, opcoes: { falha?: boolean } = {}) {
  const chamadas: string[] = [];
  const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    chamadas.push(String(init?.body ?? "").slice(0, 80));
    if (opcoes.falha) return new Response("erro", { status: 500 });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ pautas }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { fetcher, chamadas };
}

const LEITURA_OK = {
  id: "s1",
  pais: "EUA",
  eua_desfavoravel: false,
  leitura: "oportunidade",
  eixo: "oportunidade",
  relevancia: 7,
  fato_principal: "A agência publicou orientação nova.",
  adequada: true,
  motivo: "fato apurável e favorável",
};

describe("verificação de finalistas", () => {
  it("concordância nos campos materiais confirma", async () => {
    const { fetcher } = modelo([LEITURA_OK]);
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher });

    const v = r.verificacoes.get("s1")!;
    expect(v.veredicto).toBe("confirm");
    expect(v.camposConfirmados).toContain("pais");
    expect(v.divergencias).toEqual([]);
  });

  it("a verificação lendo o fato como desfavorável aos EUA recusa", async () => {
    const { fetcher } = modelo([{ ...LEITURA_OK, eua_desfavoravel: true, leitura: "desfavoravel" }]);
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher });

    const v = r.verificacoes.get("s1")!;
    expect(v.veredicto).toBe("reject");
    expect(v.motivo).toContain("REJECT_US_NEGATIVE");
  });

  it("divergência em campo material vira conflito, não escolha", async () => {
    // A primária diz Brasil, a verificação diz EUA. Nenhuma das duas ganha.
    const { fetcher } = modelo([LEITURA_OK]);
    const r = await verificarFinalistas(
      [finalista({ classificacaoPrimaria: classificacao({ pais: "Brasil" }) })],
      { config: CONFIG, env: ENV, fetcher },
    );

    const v = r.verificacoes.get("s1")!;
    expect(v.veredicto).toBe("review");
    expect(v.motivo).toContain("EDITORIAL_CLASSIFICATION_CONFLICT");
    expect(v.divergencias.find((d) => d.campo === "pais")?.material).toBe(true);
  });

  it("relevância é comparada pelo lado do piso, não pelo número", async () => {
    // 7 contra 9: ruído, os dois acima do piso. Não deve gerar conflito.
    const { fetcher } = modelo([{ ...LEITURA_OK, relevancia: 9 }]);
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher });

    expect(r.verificacoes.get("s1")!.veredicto).toBe("confirm");
  });

  it("mas atravessar o piso é conflito", async () => {
    // Primária 7 (entra), verificação 2 (não entra). Muda quem publica.
    const { fetcher } = modelo([{ ...LEITURA_OK, relevancia: 2 }]);
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher });

    const v = r.verificacoes.get("s1")!;
    expect(v.veredicto).toBe("review");
    expect(v.divergencias.some((d) => d.campo === "relevancia_no_piso" && d.material)).toBe(true);
  });

  it("divergência só no eixo não segura a pauta", async () => {
    const { fetcher } = modelo([{ ...LEITURA_OK, eixo: "processo" }]);
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher });

    const v = r.verificacoes.get("s1")!;
    expect(v.veredicto).toBe("confirm");
    expect(v.divergencias.find((d) => d.campo === "eixo")?.material).toBe(false);
  });

  it("recusa vence conflito: pauta inadequada não vira review", async () => {
    const { fetcher } = modelo([{ ...LEITURA_OK, pais: "Brasil", adequada: false, motivo: "só declaração" }]);
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher });

    expect(r.verificacoes.get("s1")!.veredicto).toBe("reject");
  });

  it("falha da verificação vira review, nunca confirm", async () => {
    const { fetcher } = modelo([], { falha: true });
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher });

    const v = r.verificacoes.get("s1")!;
    expect(v.veredicto).toBe("review");
    expect(v.leitura).toBeNull();
  });

  it("pauta que o verificador não devolveu também vira review", async () => {
    const { fetcher } = modelo([{ ...LEITURA_OK, id: "outro" }]);
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher });

    expect(r.verificacoes.get("s1")!.veredicto).toBe("review");
  });
});

describe("reaproveitamento entre canais", () => {
  it("o que a newsletter verificou de manhã o social não paga de novo", async () => {
    const jaVerificadas = new Map<string, Verificacao>([
      [
        "s1",
        {
          storyId: "s1",
          veredicto: "confirm",
          camposConfirmados: ["pais", "leitura"],
          divergencias: [],
          motivo: "verificada para a newsletter",
          leitura: null,
          origem: "verificacao",
        },
      ],
    ]);

    const { fetcher, chamadas } = modelo([LEITURA_OK]);
    const r = await verificarFinalistas([finalista()], { config: CONFIG, env: ENV, fetcher, jaVerificadas });

    expect(chamadas).toHaveLength(0);
    expect(r.chamadas).toBe(0);
    expect(r.verificacoes.get("s1")!.origem).toBe("reaproveitada");
  });
});

describe("separação de aprovadas e retidas", () => {
  it("só confirm publica sozinha", () => {
    const verificacoes = new Map<string, Verificacao>([
      ["a", { storyId: "a", veredicto: "confirm", camposConfirmados: [], divergencias: [], motivo: "", leitura: null, origem: "verificacao" }],
      ["b", { storyId: "b", veredicto: "review", camposConfirmados: [], divergencias: [], motivo: "", leitura: null, origem: "verificacao" }],
      ["c", { storyId: "c", veredicto: "reject", camposConfirmados: [], divergencias: [], motivo: "", leitura: null, origem: "verificacao" }],
    ]);

    const r = apenasConfirmadas([{ storyId: "a" }, { storyId: "b" }, { storyId: "c" }, { storyId: "d" }], verificacoes);

    expect(r.aprovadas.map((x) => x.storyId)).toEqual(["a"]);
    expect(r.retidas.map((x) => x.item.storyId)).toEqual(["b", "c", "d"]);
    // A não verificada é retida, não aprovada por omissão.
    expect(r.retidas.find((x) => x.item.storyId === "d")?.verificacao.veredicto).toBe("review");
  });
});
