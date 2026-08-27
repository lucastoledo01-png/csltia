import { getOpenAIKey } from "../env";

type OpenAIResponse = {
  id: string;
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type AITokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

const REQUEST_TIMEOUT_MS = 120_000;

export function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  if (model.includes("mini") || model.includes("3.5")) {
    return (promptTokens / 1_000_000) * 0.15 + (completionTokens / 1_000_000) * 0.60;
  }
  return (promptTokens / 1_000_000) * 2.50 + (completionTokens / 1_000_000) * 10.00;
}

export function getAIProviderConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.OPENAI_API_KEY;
  const triageModel = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";
  const editorModel = env.OPENAI_MODEL_EDITOR || "gpt-4o";

  return {
    apiKey,
    triageModel,
    editorModel,
    isConfigured: Boolean(apiKey && apiKey.trim().length > 0),
  };
}

/**
 * Chama o modelo e devolve JSON estruturado.
 *
 * Esta função existia com um caminho de contingência que, na ausência da chave
 * da OpenAI, devolvia notícias escritas à mão dentro do próprio código como se
 * fossem resposta do modelo — e, quando o prompt era o de auditoria editorial,
 * devolvia aprovação com nota 95. O resultado era o sistema publicar conteúdo
 * inventado no portal, na newsletter e no Instagram sem sinalizar erro algum.
 *
 * Falta de credencial agora interrompe o pipeline. Conteúdo fabricado nunca é
 * um resultado aceitável.
 */
export async function callOpenAIJSON<T>(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ data: T; usage: AITokenUsage }> {
  const apiKey = getOpenAIKey(env);

  const response = await fetcher("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const json = (await response.json()) as OpenAIResponse;
  const contentStr = json.choices?.[0]?.message?.content;

  if (!contentStr) {
    throw new Error("OpenAI devolveu resposta sem conteúdo utilizável.");
  }

  let parsedData: T;
  try {
    parsedData = JSON.parse(contentStr) as T;
  } catch {
    throw new Error("OpenAI devolveu conteúdo que não é JSON válido.");
  }

  const promptTokens = json.usage?.prompt_tokens ?? 0;
  const completionTokens = json.usage?.completion_tokens ?? 0;
  const totalTokens = json.usage?.total_tokens ?? (promptTokens + completionTokens);

  return {
    data: parsedData,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: calculateCost(model, promptTokens, completionTokens),
    },
  };
}
