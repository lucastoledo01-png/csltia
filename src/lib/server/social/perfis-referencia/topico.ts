/**
 * Do post viral ao assunto, e do assunto à consulta de busca.
 *
 * Uma chamada de modelo barato por perfil, com todos os sinais dele de uma
 * vez. Ela devolve o ASSUNTO e uma consulta curta para buscar a notícia
 * original; nunca devolve texto para publicar. A consulta atravessa o mesmo
 * caminho da tendência (`fonteDeBusca`), então o que volta é matéria de
 * veículo, com URL própria, e passa pela classificação e pela guarda.
 *
 * O custo é contado e devolvido com etapa e ramo (RNF-14), para a leitura
 * gravar quanto cada perfil custou e em qual etapa.
 */

import { callOpenAIJSON } from "../../newsroom/ai-provider";
import { LEITOR } from "../../editorial/linha-editorial";
import type { SinalViral } from "./engajamento";
import { consultaEhDeImigracao } from "./sinal-nao-e-fonte";

export const ETAPA_DO_TOPICO = "perfis_referencia.topico";
export const RAMO = "instagram";

export type TopicoExtraido = {
  postId: string;
  assunto: string;
  eixo: string;
  consulta: string;
  idioma: "en" | "pt";
  /** Preenchido quando o assunto foi descartado, com o motivo. */
  descartado: string | null;
};

export type ResultadoDaExtracao = {
  topicos: TopicoExtraido[];
  custoUsd: number;
  tokens: number;
  etapa: typeof ETAPA_DO_TOPICO;
  ramo: typeof RAMO;
  erro: string | null;
};

const EIXOS = "economia, trabalho, custo_de_vida, politica, tecnologia, cultura, seguranca, brasil";

/**
 * Modelo barato por padrão.
 *
 * A tarefa é resumir uma legenda em assunto e consulta, que é o trabalho mais
 * leve da esteira. O padrão do projeto para triagem é o `gpt-4o`; aqui não há
 * julgamento editorial a fazer, porque quem julga é o classificador depois.
 */
export function modeloDoTopico(env: Record<string, string | undefined>): string {
  return env.OPENAI_MODEL_PERFIS_REFERENCIA || "gpt-4o-mini";
}

export function montarSystemDoTopico(): string {
  return `
Você lê posts que estão rendendo acima do normal em perfis de referência do Instagram e diz QUAL É O ASSUNTO, para um jornal procurar a notícia original numa ferramenta de busca.

${LEITOR}

O post é só um SINAL de que o assunto está em alta. Ele nunca é a fonte, nunca é republicado, e nada do texto dele vai para o jornal. Você não resume o post: você nomeia o fato por trás dele.

Você NÃO decide se o assunto vira pauta: quem decide é o classificador do jornal, depois, com a matéria original na mão. Política e economia do Brasil SERVEM, porque o leitor acompanha o Brasil. Só descarte pelos motivos listados abaixo.

Devolva UM item para CADA post da lista, sempre, inclusive os descartados. Para cada post:
- postId: o id como veio
- assunto: o fato, em uma frase curta em português
- eixo: um de ${EIXOS}, ou vazio quando não serve
- consulta: o que buscar numa ferramenta de notícias para achar a matéria ORIGINAL, de 2 a 6 palavras, sem aspas, sem hashtag, sem @, sem o nome do perfil
- idioma: "en" quando o fato é dos Estados Unidos, "pt" quando é do Brasil
- descartado: vazio quando serve; quando não serve, uma frase com o motivo

DESCARTE quando o post for: imigração (visto, green card, deportação, fronteira); opinião ou coluna sem fato novo; publicidade, sorteio ou chamada para evento; esporte; celebridade; meme; ou quando não houver fato identificável para buscar.

Responda EXCLUSIVAMENTE com JSON: { "topicos": [ { "postId": "", "assunto": "", "eixo": "", "consulta": "", "idioma": "en", "descartado": "" } ] }
`.trim();
}

/** Limpa a consulta para virar busca: sem hashtag, sem menção, sem aspas. */
export function limparConsulta(bruta: string): string {
  return String(bruta ?? "")
    .replace(/[#@"“”']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

export async function extrairTopicos(
  handle: string,
  sinais: SinalViral[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<ResultadoDaExtracao> {
  const base = { custoUsd: 0, tokens: 0, etapa: ETAPA_DO_TOPICO, ramo: RAMO } as const;
  if (sinais.length === 0) return { ...base, topicos: [], erro: null };

  /*
   * Rótulo curto no lugar do id do post, e não é estética.
   *
   * O id da Meta tem 17 dígitos (`17919356016445695`). Medido no ensaio de
   * 05/10/2026: o modelo às vezes o devolve como NÚMERO no JSON, o número passa
   * de 2^53, perde os últimos dígitos no `JSON.parse`, e o assunto não casa com
   * post nenhum. O perfil inteiro ficava sem pauta, sem erro. "P1" não tem como
   * virar outra coisa.
   */
  const rotulo = (i: number) => `P${i + 1}`;
  const postDoRotulo = new Map(sinais.map((s, i) => [rotulo(i), s.postId]));
  // "P1", "p1", " P1 ", "1" e 1 são o mesmo rótulo. O modelo varia a forma.
  const doRotulo = (bruto: unknown): string | undefined => {
    let r = String(bruto ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (/^\d+$/.test(r)) r = `P${r}`;
    return postDoRotulo.get(r);
  };
  const lista = sinais
    .map((s, i) => `- postId ${rotulo(i)} (engajamento ${s.razao}x o normal do perfil): ${s.trechoDaLegenda}`)
    .join("\n");

  try {
    const { data: bruto, usage } = await callOpenAIJSON<Record<string, unknown>>(
      [
        { role: "system", content: montarSystemDoTopico() },
        { role: "user", content: `PERFIL @${handle}\nPOSTS EM ALTA:\n${lista}` },
      ],
      modeloDoTopico(env),
      env,
      fetcher,
      {},
      // Rede embaixo: sem assunto, o perfil só não traz pauta hoje.
      45_000,
    );

    /*
     * A lista sob a chave pedida, ou sob a única chave que for lista.
     *
     * O ensaio de 05/10/2026 teve um perfil com custo cobrado e zero assunto,
     * sem erro: a resposta veio, e não sob `topicos`. Aceitar a variação de
     * nome ("tópicos", "posts") custa uma linha; perder o perfil do dia custa
     * a pauta.
     */
    const listas = Object.values(bruto ?? {}).filter(Array.isArray) as Array<Array<Partial<TopicoExtraido>>>;
    const recebidos: Array<Partial<TopicoExtraido>> = Array.isArray(bruto?.topicos)
      ? (bruto.topicos as Array<Partial<TopicoExtraido>>)
      : listas.length === 1
        ? listas[0]
        : [];
    const topicos: TopicoExtraido[] = recebidos
      .filter((t) => t && doRotulo(t.postId) !== undefined)
      .map((t) => {
        const consulta = limparConsulta(String(t.consulta ?? ""));
        const idioma: "en" | "pt" = t.idioma === "pt" ? "pt" : "en";
        let descartado = String(t.descartado ?? "").trim() || null;
        // As travas deterministas valem mesmo quando o modelo aprovou.
        if (!descartado && consulta.split(" ").filter(Boolean).length < 2) {
          descartado = "consulta curta demais para buscar";
        }
        if (!descartado && consultaEhDeImigracao(`${consulta} ${t.assunto ?? ""}`)) {
          descartado = "imigração está fora da linha editorial desde 05/10/2026";
        }
        return {
          postId: doRotulo(t.postId) as string,
          assunto: String(t.assunto ?? "").slice(0, 300),
          eixo: String(t.eixo ?? ""),
          consulta,
          idioma,
          descartado,
        };
      });

    return {
      ...base,
      topicos,
      custoUsd: usage.estimatedCostUsd,
      tokens: usage.totalTokens,
      /*
       * Resposta que veio e não casou com post nenhum vira aviso, e não
       * silêncio: foi assim que o ensaio de 05/10/2026 passou um perfil
       * inteiro sem pauta e sem erro.
       */
      erro:
        topicos.length > 0
          ? null
          : recebidos.length > 0
            ? `o modelo devolveu ${recebidos.length} assunto(s) sem rótulo reconhecível`
            : `o modelo não devolveu assunto nenhum (chaves: ${Object.keys(bruto ?? {}).join(", ") || "nenhuma"})`,
    };
  } catch (e) {
    // Falha devolve vazio, nunca a legenda crua como consulta: é a regra da
    // triagem de tendências, pelo mesmo motivo.
    return { ...base, topicos: [], erro: (e as Error).message.slice(0, 300) };
  }
}
