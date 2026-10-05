import type { Aprovacao, Etapa, Ramo, ResumoDaPeca } from "./contrato";

/**
 * O despacho da refação: refazer SÓ a etapa culpada (RF-22), 05/10/2026.
 *
 * A reprovação aponta uma etapa, e o sistema refaz aquela e o que depende
 * dela, nada antes. Reprovar a imagem chama a resolução visual e a arte, e não
 * chama o redator: o texto foi aprovado, e reescrevê-lo junto trocaria uma peça
 * com um defeito por uma peça com defeitos novos que ninguém olhou.
 *
 * A dependência é para a FRENTE, nunca para trás:
 *
 *   selecao  ->  refaz a peça inteira (outra pauta)
 *   texto    ->  texto, e a arte do post, porque a manchete está impressa nela
 *   imagem   ->  imagem e arte
 *   arte     ->  só a arte
 *
 * Cada etapa é um gancho tipado. Onde a regeneração ainda não está ligada, o
 * gancho padrão responde `ETAPA_SEM_REGENERACAO` e a peça fica em `refazendo`
 * com o motivo no resumo, à espera de quem saiba refazê-la. Inventar uma
 * regeneração aqui, sem o contexto da pauta, seria escrever um segundo
 * gerador do lado de fora do gerador.
 */

export type ContextoDaRefacao = {
  aprovacao: Aprovacao;
  etapa: Etapa;
  /** O bloco "não repetir" da memória de reprovação, pronto para o prompt da etapa. */
  naoRepetir: string;
  /** O motivo desta reprovação, escrito pelo editor. */
  motivo: string;
};

export type ResultadoDaEtapa =
  | { ok: true; resumo?: Partial<ResumoDaPeca> }
  | { ok: false; motivo: string };

export type GanchoDeEtapa = (ctx: ContextoDaRefacao) => Promise<ResultadoDaEtapa>;

/** Um gancho por etapa e por ramo. Ausente vale "sem regeneração ligada". */
export type GanchosDeRefazer = Partial<Record<Ramo, Partial<Record<Etapa, GanchoDeEtapa>>>>;

export const MOTIVO_SEM_REGENERACAO = "ETAPA_SEM_REGENERACAO";

/** O que é refeito quando a etapa é culpada. A ordem é a de execução. */
export function etapasARefazer(ramo: Ramo, etapa: Etapa): Etapa[] {
  if (etapa === "selecao") return ["selecao"];
  if (ramo !== "post") return [etapa];
  if (etapa === "texto") return ["texto", "arte"];
  if (etapa === "imagem") return ["imagem", "arte"];
  return ["arte"];
}

export type ResultadoDaRefacao =
  | { ok: true; executadas: Etapa[]; resumo: Partial<ResumoDaPeca> }
  | { ok: false; executadas: Etapa[]; falhou: Etapa; motivo: string };

/**
 * Executa as etapas em ordem e para na primeira que não conseguir.
 *
 * Parar é o certo: a arte refeita sobre uma imagem que não foi refeita
 * congelaria de novo a mesma peça reprovada, com hash novo, e ela voltaria à
 * fila parecendo corrigida.
 */
export async function executarRefacao(
  ctx: ContextoDaRefacao,
  ganchos: GanchosDeRefazer,
): Promise<ResultadoDaRefacao> {
  const ramo = ctx.aprovacao.ramo;
  const executadas: Etapa[] = [];
  let resumo: Partial<ResumoDaPeca> = {};

  for (const etapa of etapasARefazer(ramo, ctx.etapa)) {
    const gancho = ganchos[ramo]?.[etapa];
    if (!gancho) {
      return {
        ok: false,
        executadas,
        falhou: etapa,
        motivo: `${MOTIVO_SEM_REGENERACAO}: a etapa "${etapa}" do ramo ${ramo} ainda não tem regeneração automática`,
      };
    }
    const r = await gancho({ ...ctx, etapa });
    if (!r.ok) return { ok: false, executadas, falhou: etapa, motivo: r.motivo };
    executadas.push(etapa);
    resumo = { ...resumo, ...(r.resumo ?? {}) };
  }

  return { ok: true, executadas, resumo };
}
