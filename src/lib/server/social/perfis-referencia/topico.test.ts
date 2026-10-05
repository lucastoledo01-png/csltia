import { describe, expect, it, vi } from "vitest";
import { ETAPA_DO_TOPICO, RAMO, extrairTopicos, limparConsulta, montarSystemDoTopico } from "./topico";
import type { SinalViral } from "./engajamento";

const ENV = { OPENAI_API_KEY: "chave" };

const SINAIS: SinalViral[] = [
  { postId: "p1", permalink: "https://www.instagram.com/p/1/", publicadoEm: "", engajamento: 2900, razao: 6.1, trechoDaLegenda: "BOLSA. Flávio à frente de Lula derruba o Ibovespa" },
  { postId: "p2", permalink: "https://www.instagram.com/p/2/", publicadoEm: "", engajamento: 900, razao: 3, trechoDaLegenda: "VISTOS. Nova regra do H-1B" },
];

function modeloDevolve(topicos: unknown) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        id: "x",
        choices: [{ message: { content: JSON.stringify({ topicos }) } }],
        usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
      }),
      { status: 200 },
    ),
  ) as unknown as typeof fetch;
}

describe("extração do assunto", () => {
  it("a instrução diz que o post é sinal e nunca fonte, e herda a linha editorial", () => {
    const s = montarSystemDoTopico();
    expect(s).toMatch(/nunca é a fonte/);
    expect(s).toMatch(/Imigração NÃO é assunto/);
  });

  it("devolve assunto e consulta, com custo marcado com etapa e ramo", async () => {
    const f = modeloDevolve([
      { postId: "P1", assunto: "Ibovespa cai com pesquisa eleitoral", eixo: "brasil", consulta: "Ibovespa pesquisa eleitoral", idioma: "pt", descartado: "" },
    ]);
    const r = await extrairTopicos("braziljournal", SINAIS, ENV, f);
    expect(r.erro).toBeNull();
    expect(r.topicos[0]).toMatchObject({ postId: "p1", consulta: "Ibovespa pesquisa eleitoral", idioma: "pt", descartado: null });
    expect(r.etapa).toBe(ETAPA_DO_TOPICO);
    expect(r.ramo).toBe(RAMO);
    expect(r.custoUsd).toBeGreaterThan(0);
    expect(r.tokens).toBe(1200);
  });

  it("NÃO: imigração é descartada mesmo quando o modelo aprovou", async () => {
    const f = modeloDevolve([
      { postId: "P2", assunto: "Nova regra do H-1B", eixo: "trabalho", consulta: "H-1B new rule", idioma: "en", descartado: "" },
    ]);
    const r = await extrairTopicos("perfil", SINAIS, ENV, f);
    expect(r.topicos[0].descartado).toMatch(/imigração/);
  });

  it("o id longo da Meta não passa pelo modelo: rótulo curto vai, id real volta", async () => {
    const longos = [{ ...SINAIS[0], postId: "17919356016445695" }];
    const f = modeloDevolve([{ postId: "P1", assunto: "x", consulta: "Ibovespa eleição", idioma: "pt" }]);
    const r = await extrairTopicos("perfil", longos, ENV, f);
    const chamada = (f as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0];
    expect(String(chamada[1].body)).not.toContain("17919356016445695");
    expect(r.topicos[0].postId).toBe("17919356016445695");
  });

  it("NÃO: postId que o modelo inventou não entra, e o descasamento vira aviso", async () => {
    const f = modeloDevolve([{ postId: "inventado", assunto: "x", consulta: "Fed rates decision", idioma: "en" }]);
    const r = await extrairTopicos("perfil", SINAIS, ENV, f);
    expect(r.topicos).toEqual([]);
    expect(r.erro).toMatch(/sem rótulo reconhecível/);
  });

  it("aceita o rótulo nas formas que o modelo varia", async () => {
    const f = modeloDevolve([
      { postId: 1, assunto: "a", consulta: "Ibovespa eleição", idioma: "pt" },
      { postId: " p2 ", assunto: "b", consulta: "Fed rates decision", idioma: "en" },
    ]);
    const r = await extrairTopicos("perfil", SINAIS, ENV, f);
    expect(r.topicos.map((t) => t.postId)).toEqual(["p1", "p2"]);
  });

  it("falha do modelo devolve vazio, nunca a legenda crua", async () => {
    const f = vi.fn(async () => new Response("erro", { status: 500 })) as unknown as typeof fetch;
    const r = await extrairTopicos("perfil", SINAIS, ENV, f);
    expect(r.topicos).toEqual([]);
    expect(r.erro).toMatch(/500/);
  });

  it("sem sinal não chama o modelo", async () => {
    const f = modeloDevolve([]);
    await extrairTopicos("perfil", [], ENV, f);
    expect(f).not.toHaveBeenCalled();
  });

  it("limpa hashtag, menção e aspas da consulta", () => {
    expect(limparConsulta('#Fed "juros" @braziljournal')).toBe("Fed juros braziljournal");
  });
});
