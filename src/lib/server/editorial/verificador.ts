import { z } from "zod";
import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import type { Classificacao } from "./classificador";
import type { ConfigEditorial } from "./config";
import { MOTIVOS } from "./config";

/**
 * A segunda leitura, só de quem está disputando vaga.
 *
 * A classificação primária lê centenas de candidatas por rodada e é instável
 * no que decide: medido, a relevância muda em 64% das candidatas entre
 * rodadas idênticas e a decisão vira em 24%. Reclassificar tudo três vezes
 * resolveria pelo custo errado, porque 90% das candidatas nunca chegariam
 * perto de publicar.
 *
 * Então a segunda leitura é focada em dois sentidos. Roda só nos finalistas,
 * que são poucos, e pergunta só o que muda a admissibilidade. Não é uma
 * reclassificação: é uma conferência.
 *
 * E quando as duas leituras discordam em campo material, o resultado não é
 * escolher uma. É `EDITORIAL_CLASSIFICATION_CONFLICT`, porque diante de duas
 * respostas sobre "os EUA saem bem ou mal nesta notícia", eleger uma é
 * sortear, e sortear é o que se está tentando eliminar.
 */

const VerificacaoSchema = z.object({
  id: z.string(),
  pais: z.enum(["EUA", "Brasil", "outro"]),
  /** O FATO deixa os EUA em posição desfavorável para quem quer se mudar? */
  eua_desfavoravel: z.boolean(),
  leitura: z.enum(["oportunidade", "neutra", "desfavoravel"]),
  eixo: z.string(),
  relevancia: z.number().min(0).max(10),
  /** A matéria diz o que aconteceu, ou só que alguém falou sobre algo? */
  fato_principal: z.string().default(""),
  adequada: z.boolean(),
  motivo: z.string().default(""),
});

const RespostaSchema = z.object({ pautas: z.array(VerificacaoSchema) });

export type LeituraDaVerificacao = z.infer<typeof VerificacaoSchema>;

export type Divergencia = {
  campo: string;
  primaria: string;
  verificacao: string;
  /** Muda a admissibilidade, ou é detalhe? */
  material: boolean;
};

export type Verificacao = {
  storyId: string;
  veredicto: "confirm" | "reject" | "review";
  camposConfirmados: string[];
  divergencias: Divergencia[];
  motivo: string;
  leitura: LeituraDaVerificacao | null;
  /** De onde veio: leitura nova ou verificação já feita para o outro canal. */
  origem: "verificacao" | "reaproveitada";
};

export type FinalistaParaVerificar = {
  storyId: string;
  titulo: string;
  fonte: string;
  url: string;
  /** Texto enriquecido ou pacote factual serializado. */
  contexto: string;
  classificacaoPrimaria: Classificacao;
};

export function montarSystemDoVerificador(): string {
  return `
Você confere a classificação de uma notícia para uma publicação brasileira sobre imigração para os Estados Unidos. O leitor é brasileiro e quer se mudar legalmente.

Isto NÃO é uma reclassificação. Outra leitura já foi feita e você vai vê-la. Sua função é dizer se ela se sustenta diante do texto, não repetir o trabalho.

Responda só o que muda a admissibilidade:

pais: "EUA" se o fato acontece nos Estados Unidos ou é decidido por autoridade americana. "Brasil" se acontece no Brasil ou é decidido por autoridade brasileira. "outro" nos demais casos.

eua_desfavoravel: true quando o FATO deixa os Estados Unidos em posição pior para quem planeja se mudar. Restrição, endurecimento, corte, fila maior, custo maior, porta que fecha. É sobre o fato, não sobre o tom do texto. Para pauta do Brasil, false.

leitura: como o FATO chega a quem quer se mudar. "oportunidade", "neutra" ou "desfavoravel".

eixo: um entre oportunidade, processo, decisao_judicial, custo_de_vida, deterioracao_brasil, outro.

relevancia: 0 a 10, o quanto muda a vida de quem planeja a mudança. Seja severo: 8 ou mais é pauta que altera decisão de alguém esta semana.

fato_principal: uma frase dizendo o que aconteceu, tirada do texto. Se o texto não permitir escrever essa frase, devolva string vazia.

adequada: true se esta notícia deve ser publicada por esta marca. false quando o fato é negativo sobre os EUA, quando não há fato apurável, ou quando é só repercussão de declaração.

motivo: uma frase curta explicando o "adequada".

Regras:
- Julgue pelo TEXTO fornecido, não pelo que você sabe do assunto.
- Se o texto não sustenta a leitura anterior, diverja. Divergir é o objetivo aqui.
- Se o texto é curto demais para julgar, devolva adequada false e diga isso no motivo.

Devolva JSON: {"pautas": [{"id": "...", "pais": "...", "eua_desfavoravel": false, "leitura": "...", "eixo": "...", "relevancia": 0, "fato_principal": "...", "adequada": true, "motivo": "..."}]}
`;
}

function montarUser(lote: FinalistaParaVerificar[]): string {
  return lote
    .map((f) => {
      const c = f.classificacaoPrimaria;
      return [
        `id: ${f.storyId}`,
        `titulo: ${f.titulo}`,
        `fonte: ${f.fonte}`,
        `leitura anterior: pais ${c.pais}, leitura ${c.leitura}, eixo ${c.eixo}, relevancia ${c.relevancia}`,
        `texto: ${f.contexto.slice(0, 2500)}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

/** Campos cuja divergência muda quem entra na edição. */
const CAMPOS_MATERIAIS = new Set(["pais", "eua_desfavoravel", "leitura", "relevancia_no_piso", "adequada"]);

function comparar(
  primaria: Classificacao,
  leitura: LeituraDaVerificacao,
  config: ConfigEditorial,
): { divergencias: Divergencia[]; confirmados: string[] } {
  const divergencias: Divergencia[] = [];
  const confirmados: string[] = [];

  const registrar = (campo: string, a: string, b: string) => {
    if (a === b) confirmados.push(campo);
    else divergencias.push({ campo, primaria: a, verificacao: b, material: CAMPOS_MATERIAIS.has(campo) });
  };

  registrar("pais", primaria.pais, leitura.pais);
  registrar("leitura", primaria.leitura, leitura.leitura);
  registrar("eixo", primaria.eixo, leitura.eixo);

  /*
   * A relevância não é comparada pelo número, e sim pelo lado do piso.
   *
   * Relevância 7 contra 8 é ruído e não muda nada. Relevância 3 contra 5 muda
   * tudo, porque uma entra e a outra não. Comparar o valor bruto acusaria
   * conflito em quase toda pauta, e o alarme que toca sempre não é alarme.
   */
  const ladoPrimario = primaria.relevancia >= config.relevanciaMinima ? "acima" : "abaixo";
  const ladoVerificado = leitura.relevancia >= config.relevanciaMinima ? "acima" : "abaixo";
  registrar("relevancia_no_piso", ladoPrimario, ladoVerificado);

  /*
   * A negatividade sobre os EUA é a regra mais dura da linha editorial, então
   * ela é conferida contra o que a leitura primária IMPLICAVA, e não contra um
   * campo que a primária não tem.
   */
  const primariaDesfavoravel = primaria.pais === "EUA" && primaria.leitura === "desfavoravel";
  registrar("eua_desfavoravel", String(primariaDesfavoravel), String(leitura.eua_desfavoravel));

  return { divergencias, confirmados };
}

export type ResultadoDaVerificacao = {
  verificacoes: Map<string, Verificacao>;
  custoUsd: number;
  tokens: { prompt: number; completion: number; total: number };
  chamadas: number;
  linhasDeLog: string[];
};

const POR_LOTE = 8;

/**
 * Confere os finalistas, reaproveitando o que já foi conferido.
 *
 * `jaVerificadas` é o que faz a economia entre canais: se a newsletter
 * verificou uma pauta de manhã, o Instagram não paga por isso de novo à tarde.
 */
export async function verificarFinalistas(
  finalistas: FinalistaParaVerificar[],
  opcoes: {
    config: ConfigEditorial;
    jaVerificadas?: Map<string, Verificacao>;
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
  },
): Promise<ResultadoDaVerificacao> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);

  const verificacoes = new Map<string, Verificacao>();
  const linhas: string[] = [];
  let custoUsd = 0;
  let chamadas = 0;
  const tokens = { prompt: 0, completion: 0, total: 0 };

  const pendentes: FinalistaParaVerificar[] = [];
  for (const f of finalistas) {
    const anterior = opcoes.jaVerificadas?.get(f.storyId);
    if (anterior) {
      verificacoes.set(f.storyId, { ...anterior, origem: "reaproveitada" });
      continue;
    }
    pendentes.push(f);
  }

  if (verificacoes.size > 0) {
    linhas.push(`[VERIFICADOR] ${verificacoes.size} verificação(ões) reaproveitada(s) do outro canal`);
  }

  for (let i = 0; i < pendentes.length; i += POR_LOTE) {
    const lote = pendentes.slice(i, i + POR_LOTE);

    try {
      const { data, usage } = await callOpenAIJSON<unknown>(
        [
          { role: "system", content: montarSystemDoVerificador() },
          { role: "user", content: montarUser(lote) },
        ],
        config.editorModel,
        env,
        fetcher,
      );

      chamadas += 1;
      custoUsd += usage.estimatedCostUsd;
      tokens.prompt += usage.promptTokens;
      tokens.completion += usage.completionTokens;
      tokens.total += usage.totalTokens;

      const parsed = RespostaSchema.safeParse(data);
      if (!parsed.success) {
        linhas.push(`[VERIFICADOR] lote ${i / POR_LOTE + 1} devolveu formato inválido; finalistas ficam em review`);
        for (const f of lote) {
          verificacoes.set(f.storyId, semLeitura(f, "a verificação não retornou formato válido"));
        }
        continue;
      }

      const porId = new Map(parsed.data.pautas.map((p) => [p.id, p]));

      for (const f of lote) {
        const leitura = porId.get(f.storyId);

        if (!leitura) {
          verificacoes.set(f.storyId, semLeitura(f, "a verificação não devolveu esta pauta"));
          continue;
        }

        const { divergencias, confirmados } = comparar(f.classificacaoPrimaria, leitura, opcoes.config);
        const materiais = divergencias.filter((d) => d.material);

        /*
         * A ordem das três saídas é deliberada.
         *
         * Recusa vem antes de conflito: se a segunda leitura diz que a pauta
         * não deve ser publicada, não interessa se ela concorda com a primeira
         * sobre o eixo. E conflito vem antes de confirmação, porque concordar
         * em quatro campos e discordar sobre a negatividade dos EUA não é
         * concordância.
         */
        let veredicto: Verificacao["veredicto"];
        let motivo: string;

        if (!leitura.adequada || leitura.eua_desfavoravel) {
          veredicto = "reject";
          motivo = leitura.eua_desfavoravel
            ? `${MOTIVOS.REJEITADO_EUA_NEGATIVO}: a verificação leu o fato como desfavorável aos EUA`
            : `a verificação recusou: ${leitura.motivo || "sem motivo declarado"}`;
        } else if (materiais.length > 0) {
          veredicto = "review";
          motivo =
            `${MOTIVOS.CONFLITO_DE_CLASSIFICACAO}: ` +
            materiais.map((d) => `${d.campo} (${d.primaria} contra ${d.verificacao})`).join(", ");
        } else {
          veredicto = "confirm";
          motivo = `${confirmados.length} campo(s) confirmado(s)`;
        }

        verificacoes.set(f.storyId, {
          storyId: f.storyId,
          veredicto,
          camposConfirmados: confirmados,
          divergencias,
          motivo,
          leitura,
          origem: "verificacao",
        });

        linhas.push(
          `[VERIFICADOR] ${veredicto} :: ${motivo} :: ${f.titulo.slice(0, 55)}`,
        );
      }
    } catch (erro) {
      linhas.push(`[VERIFICADOR] lote ${i / POR_LOTE + 1} falhou: ${(erro as Error).message}`);
      for (const f of lote) {
        verificacoes.set(f.storyId, semLeitura(f, `a verificação falhou: ${(erro as Error).message}`));
      }
    }
  }

  return { verificacoes, custoUsd, tokens, chamadas, linhasDeLog: linhas };
}

/**
 * Sem segunda leitura, o resultado é `review`, nunca `confirm`.
 *
 * Falha de verificação não pode virar aprovação por omissão. Se a conferência
 * não aconteceu, a pauta não foi conferida, e é isso que o veredicto diz.
 */
function semLeitura(f: FinalistaParaVerificar, motivo: string): Verificacao {
  return {
    storyId: f.storyId,
    veredicto: "review",
    camposConfirmados: [],
    divergencias: [],
    motivo,
    leitura: null,
    origem: "verificacao",
  };
}

/** As que podem publicar sem intervenção humana. */
export function apenasConfirmadas<T extends { storyId: string }>(
  itens: T[],
  verificacoes: Map<string, Verificacao>,
): { aprovadas: T[]; retidas: Array<{ item: T; verificacao: Verificacao }> } {
  const aprovadas: T[] = [];
  const retidas: Array<{ item: T; verificacao: Verificacao }> = [];

  for (const item of itens) {
    const v = verificacoes.get(item.storyId);
    if (v && v.veredicto === "confirm") aprovadas.push(item);
    else if (v) retidas.push({ item, verificacao: v });
    else retidas.push({ item, verificacao: semLeitura({ storyId: item.storyId } as FinalistaParaVerificar, "não verificada") });
  }

  return { aprovadas, retidas };
}
