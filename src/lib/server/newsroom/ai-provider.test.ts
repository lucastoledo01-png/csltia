import { describe, expect, it, vi } from "vitest";
import { callOpenAIJSON } from "./ai-provider";

const mensagens = [{ role: "system" as const, content: "auditor de qualidade editorial" }];

describe("provedor de IA", () => {
  it("falha quando não há chave, em vez de devolver conteúdo inventado", async () => {
    const fetcher = vi.fn();

    await expect(
      callOpenAIJSON(mensagens, "gpt-4o", { OPENAI_API_KEY: "" }, fetcher as unknown as typeof fetch),
    ).rejects.toThrow(/OPENAI_API_KEY/);

    // O comportamento antigo respondia sem nem chamar a API: devolvia notícias
    // escritas no próprio código e, para o prompt de auditoria, aprovação com
    // nota 95. Nenhuma resposta pode ser produzida sem credencial.
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("propaga erro da API em vez de silenciar", async () => {
    const fetcher = vi.fn(async () => new Response("limite excedido", { status: 429 }));

    await expect(
      callOpenAIJSON(mensagens, "gpt-4o", { OPENAI_API_KEY: "sk-teste" }, fetcher as unknown as typeof fetch),
    ).rejects.toThrow(/429/);
  });

  it("rejeita resposta que não é JSON válido", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "isso não é json" } }] }), {
          status: 200,
        }),
    );

    await expect(
      callOpenAIJSON(mensagens, "gpt-4o", { OPENAI_API_KEY: "sk-teste" }, fetcher as unknown as typeof fetch),
    ).rejects.toThrow(/JSON válido/);
  });

  it("devolve dados e uso quando a resposta é válida", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ passed: true }) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
          { status: 200 },
        ),
    );

    const resultado = await callOpenAIJSON<{ passed: boolean }>(
      mensagens,
      "gpt-4o",
      { OPENAI_API_KEY: "sk-teste" },
      fetcher as unknown as typeof fetch,
    );

    expect(resultado.data.passed).toBe(true);
    expect(resultado.usage.promptTokens).toBe(100);
    expect(resultado.usage.estimatedCostUsd).toBeGreaterThan(0);
  });
});
