import { z } from "zod";
import { callOpenAIJSON } from "../newsroom/ai-provider";
import type { PacoteFactual } from "./pacote-factual";

/**
 * Conclusão sem lastro.
 *
 * A conferência determinística pega nome, número e data inventados. Ela não
 * pega o erro que a edição de validação cometeu: dizer que a medida afeta o
 * custo das compras da Shein quando o material não diz o que a medida faz.
 * Nenhuma palavra ali é inventada. A frase inteira é.
 *
 * Este módulo confere o outro tipo de afirmação: causa, consequência, impacto,
 * comparação, tendência e previsão. Não dá para conferir isso com expressão
 * regular, porque o que se compara é sentido, então quem confere é modelo,
 * recebendo o pacote factual e o texto e devolvendo claim por claim.
 */

export const TIPOS_DE_CLAIM = [
  "causalidade",
  "consequencia",
  "impacto",
  "comparacao",
  "tendencia",
  "previsao",
] as const;

export const ClaimSchema = z.object({
  /** Trecho exato do texto onde a afirmação aparece. */
  trecho: z.string(),
  tipo: z.enum(TIPOS_DE_CLAIM),
  sustentada: z.boolean(),
  /** Qual fato do pacote sustenta, ou por que não sustenta. */
  motivo: z.string().default(""),
  /** Qual pauta, pela ordem em que foram enviadas. */
  pauta: z.number().default(0),
});

export type ClaimSemantica = z.infer<typeof ClaimSchema>;

export const RespostaDeClaimsSchema = z.object({
  claims: z.array(ClaimSchema),
});

export function montarSystemDeClaims(): string {
  return `
Você audita afirmações editoriais contra um pacote factual.

Receberá, para cada pauta, o pacote factual (a íntegra do que a redação tinha) e o texto que foi escrito a partir dele.

Sua tarefa é listar as afirmações do texto que pertencem a estes tipos:

- "causalidade": diz que uma coisa causou outra.
- "consequencia": diz que algo vai provocar, gerar ou levar a algo.
- "impacto": diz que algo afeta, prejudica, beneficia ou muda a situação de alguém (consumidor, empresa, trabalhador, imigrante, brasileiro).
- "comparacao": diz que algo está melhor, pior, maior ou menor que outra coisa.
- "tendencia": diz que algo está crescendo, caindo, acelerando ou desacelerando.
- "previsao": diz que algo deve acontecer, vai acontecer ou é esperado.

Para cada uma, responda se ela está SUSTENTADA pelo pacote factual daquela pauta.

Está sustentada quando o pacote afirma aquilo, ou quando a afirmação é a leitura direta e inevitável de um fato do pacote. Exemplo de sustentada: o pacote diz que o prazo passou de 180 para 540 dias, e o texto diz que a espera ficou maior.

NÃO está sustentada quando exige informação que o pacote não tem. Exemplos:
- o pacote não diz o conteúdo da medida, e o texto afirma que ela encarece as compras.
- o pacote não traz número de empregos, e o texto afirma que a medida gera empregos.
- o pacote não compara períodos, e o texto afirma que a situação piorou.
- o pacote registra em "gaps" que a matéria não informa algo, e o texto informa assim mesmo.

Frase que apenas descreve o que aconteceu não é claim: ignore. Frase que diz explicitamente que a fonte não informou algo não é claim: ignore, é ressalva e é desejável.

Seja literal. Não invente claim que o texto não faz, e não perdoe claim que o pacote não sustenta.

Devolva JSON: {"claims": [{"trecho": "...", "tipo": "...", "sustentada": true|false, "motivo": "...", "pauta": 0}]}, com "pauta" no índice recebido.
`.trim();
}

export type PautaAuditavel = {
  indice: number;
  titulo: string;
  texto: string;
  pacote: PacoteFactual;
};

export type ResultadoDeClaims = {
  claims: ClaimSemantica[];
  naoSustentadas: ClaimSemantica[];
  custoUsd: number;
  tokens: number;
  /** Quando a auditoria não pôde rodar. Vazio não é o mesmo que aprovado. */
  erro: string | null;
};

export async function auditarClaims(
  pautas: PautaAuditavel[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<ResultadoDeClaims> {
  if (pautas.length === 0) {
    return { claims: [], naoSustentadas: [], custoUsd: 0, tokens: 0, erro: null };
  }

  const modelo = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";
  const corpo = pautas
    .map((p) =>
      [
        `PAUTA ${p.indice}: ${p.titulo}`,
        "",
        "Pacote factual:",
        JSON.stringify(
          {
            verified_facts: p.pacote.verified_facts,
            people: p.pacote.people,
            organizations: p.pacote.organizations,
            places: p.pacote.places,
            dates: p.pacote.dates,
            numbers: p.pacote.numbers,
            gaps: p.pacote.gaps,
          },
          null,
          1
        ),
        "",
        "Texto escrito:",
        p.texto,
      ].join("\n")
    )
    .join("\n\n=====\n\n");

  try {
    const { data, usage } = await callOpenAIJSON<unknown>(
      [
        { role: "system", content: montarSystemDeClaims() },
        { role: "user", content: corpo },
      ],
      modelo,
      env,
      fetcher
    );

    const parsed = RespostaDeClaimsSchema.safeParse(data);
    if (!parsed.success) {
      return {
        claims: [],
        naoSustentadas: [],
        custoUsd: usage.estimatedCostUsd,
        tokens: usage.totalTokens,
        erro: `formato inválido: ${parsed.error.issues[0]?.message ?? ""}`,
      };
    }

    return {
      claims: parsed.data.claims,
      naoSustentadas: parsed.data.claims.filter((c) => !c.sustentada),
      custoUsd: usage.estimatedCostUsd,
      tokens: usage.totalTokens,
      erro: null,
    };
  } catch (erro) {
    return {
      claims: [],
      naoSustentadas: [],
      custoUsd: 0,
      tokens: 0,
      erro: (erro as Error).message,
    };
  }
}
