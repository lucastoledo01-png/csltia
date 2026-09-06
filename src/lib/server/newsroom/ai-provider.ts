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
  // Mesmo default do editor: ver a nota em `classificador.ts`.
  const triageModel = env.OPENAI_MODEL_TRIAGE || "gpt-4o";
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
export type OpcoesDeAmostragem = {
  /**
   * Amostragem para tarefa de JULGAMENTO, não de escrita.
   *
   * Nenhuma chamada deste arquivo definia `temperature`, então todas rodavam
   * no padrão da API. Para a redação isso é desejável: variação é o que separa
   * um texto de um formulário. Para o classificador é defeito, e foi medido:
   * o mesmo conjunto de 120 candidatas, classificado três vezes sem nova
   * coleta, aprovou 17, depois 11, depois 26. A relevância mudou em 64% das
   * candidatas e a decisão virou em 24%, boa parte longe do piso.
   *
   * `pais` e `imigracao`, que são categóricos e objetivos, não variaram uma
   * única vez. O que oscila é o juízo graduado, e é justamente ele que decide
   * o que entra na edição.
   *
   * Quem passa isto é só o classificador. A redação continua exatamente como
   * está, e esse é o ponto: o parâmetro é opcional para não mudar nada de
   * quem não pedir.
   */
  temperature?: number;
  /** Mesma semente, mesma entrada, resposta mais estável. */
  seed?: number;
};

export async function callOpenAIJSON<T>(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  amostragem: OpcoesDeAmostragem = {}
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
      ...(amostragem.temperature !== undefined ? { temperature: amostragem.temperature } : {}),
      ...(amostragem.seed !== undefined ? { seed: amostragem.seed } : {}),
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
