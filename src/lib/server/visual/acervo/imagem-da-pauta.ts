import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVisualAsset, type OpcoesDeResolucao, type PautaParaImagem } from "../resolver";
import type { ResultadoVisual } from "../tipos";
import { acervoDoProjeto, type Acervo } from "./acervo";
import { capacidadeDoAcervo } from "./modo";
import type { ProjetoComCapacidades } from "../../capacidades";

/**
 * A imagem de uma pauta, resolvida UMA vez e reusada por todos os ramos.
 *
 * Newsletter, portal e Instagram resolviam cada um a sua, e a mesma pauta
 * podia sair com três fotos diferentes em três canais, pagando três vezes a
 * pergunta da cena e a conferência visual. Com o acervo próprio, há um
 * motivo a mais (05/10/2026): resolver duas vezes marcaria duas fotos do
 * acervo como usadas para uma pauta só, e queimaria a prateleira na metade do
 * tempo.
 *
 * Quem chama passa a identidade da pauta (`storyId`, a mesma de
 * `identidadeDaPauta`) e recebe sempre o mesmo resultado. Duas camadas:
 *
 *   memória  dentro do processo, guardando a PROMESSA, para duas chamadas
 *            simultâneas da mesma pauta não resolverem em paralelo;
 *   banco    `imagem_da_pauta`, para o worker do Instagram, que é outro
 *            contêiner, reusar o que o web resolveu.
 *
 * As duas só valem com `acervo: enforce`. Fora disso esta função é um repasse
 * direto para `resolveVisualAsset`, sem cache nenhum: a capacidade desligada
 * não pode mudar nem a quantidade de vezes que o resolvedor roda.
 */

export const TABELA_DA_IMAGEM_DA_PAUTA = "imagem_da_pauta";

/** Teto da memória do processo. Um dia tem dezenas de pautas, não milhares. */
const TETO_DA_MEMORIA = 500;

const memoria = new Map<string, Promise<ResultadoVisual>>();

function guardarNaMemoria(chave: string, valor: Promise<ResultadoVisual>): void {
  if (memoria.size >= TETO_DA_MEMORIA) {
    const maisAntiga = memoria.keys().next().value;
    if (maisAntiga !== undefined) memoria.delete(maisAntiga);
  }
  memoria.set(chave, valor);
}

/** Só para teste: a memória é do módulo e vazaria de um caso para o outro. */
export function esquecerImagensDasPautas(): void {
  memoria.clear();
}

export type ContextoDaImagemDaPauta = {
  client?: SupabaseClient | null;
  projeto?: (ProjetoComCapacidades & { id: string }) | null;
  /** As opções de sempre do resolvedor. `acervo` é decidido aqui, pela capacidade. */
  opcoes?: Omit<OpcoesDeResolucao, "acervo">;
  /** Injetáveis para o teste. */
  resolver?: typeof resolveVisualAsset;
  acervo?: Acervo | null;
};

export async function lerImagemDaPauta(
  client: SupabaseClient,
  projectId: string,
  storyId: string,
): Promise<ResultadoVisual | null> {
  const { data, error } = await client
    .from(TABELA_DA_IMAGEM_DA_PAUTA)
    .select("resultado")
    .eq("project_id", projectId)
    .eq("story_id", storyId)
    .maybeSingle();
  /*
   * Erro de leitura é "não consegui olhar", e não "não existe" (lição de
   * 13/09/2026). Aqui os dois levam ao mesmo lugar, resolver de novo, mas o
   * erro sobe para quem chama decidir, em vez de virar `null` calado.
   */
  if (error) throw new Error(`imagem da pauta, leitura falhou: ${error.message}`);
  const resultado = (data as { resultado?: ResultadoVisual } | null)?.resultado;
  return resultado ?? null;
}

async function gravarImagemDaPauta(
  client: SupabaseClient,
  projectId: string,
  resultado: ResultadoVisual,
): Promise<void> {
  const { error } = await client.from(TABELA_DA_IMAGEM_DA_PAUTA).upsert(
    {
      project_id: projectId,
      story_id: resultado.storyId,
      resultado,
      fonte: resultado.asset?.source ?? null,
      status: resultado.status,
    },
    /*
     * Primeiro a gravar vence. Se dois processos resolveram a mesma pauta ao
     * mesmo tempo, o segundo não sobrescreve o primeiro: um canal pode já ter
     * publicado com a foto gravada.
     */
    { onConflict: "project_id,story_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`imagem da pauta, gravação falhou: ${error.message}`);
}

export async function imagemDaPauta(
  pauta: PautaParaImagem,
  ctx: ContextoDaImagemDaPauta = {},
): Promise<ResultadoVisual> {
  const resolver = ctx.resolver ?? resolveVisualAsset;
  const opcoes = ctx.opcoes ?? {};
  const modo = capacidadeDoAcervo(ctx.projeto);
  const acervo = ctx.acervo !== undefined ? ctx.acervo : acervoDoProjeto(ctx.client, ctx.projeto);

  // Capacidade desligada: o caminho de antes, sem memória e sem tabela.
  if (modo === "off") return resolver(pauta, opcoes);

  // Ensaio: o acervo é consultado e anotado, mas nada é reusado nem gravado.
  if (modo !== "enforce" || !ctx.projeto?.id || !pauta.storyId) {
    return resolver(pauta, { ...opcoes, acervo });
  }

  const chave = `${ctx.projeto.id}:${pauta.storyId}`;
  const jaNaMemoria = memoria.get(chave);
  if (jaNaMemoria) return reaproveitar(await jaNaMemoria, opcoes);

  const projectId = ctx.projeto.id;
  const promessa = (async () => {
    if (ctx.client) {
      try {
        const gravado = await lerImagemDaPauta(ctx.client, projectId, pauta.storyId);
        if (gravado) return gravado;
      } catch {
        // Ver `lerImagemDaPauta`: sem conseguir olhar, resolve de novo.
      }
    }

    const resultado = await resolver(pauta, { ...opcoes, acervo });

    /*
     * Só grava quando a execução publica. O dry-run da redação passa
     * `somenteLeitura`, e gravar ali faria o ensaio decidir a foto do dia
     * seguinte.
     */
    if (ctx.client && !opcoes.somenteLeitura) {
      try {
        await gravarImagemDaPauta(ctx.client, projectId, resultado);
      } catch (erro) {
        resultado.fontesConsultadas.push({
          fonte: "acervo_proprio",
          encontrados: 0,
          nota: `resultado não gravado para reuso: ${(erro as Error).message}`,
        });
      }
    }
    return resultado;
  })();

  guardarNaMemoria(chave, promessa);
  try {
    // Vale também para o que veio do banco: ele não passou pelo resolvedor desta edição.
    return reaproveitar(await promessa, opcoes);
  } catch (erro) {
    // Promessa que falhou não pode ficar guardada: a próxima chamada tenta de novo.
    memoria.delete(chave);
    throw erro;
  }
}

/**
 * O resultado reusado ainda conta para a edição que pergunta.
 *
 * Sem isto, a pauta A reusada não entraria em `jaUsadosNestaEdicao`, e a pauta
 * B, resolvida em seguida, poderia escolher a mesma foto. É a causa 3 do
 * incidente de 13/09/2026 por outro caminho.
 */
function reaproveitar(resultado: ResultadoVisual, opcoes: Omit<OpcoesDeResolucao, "acervo">): ResultadoVisual {
  if (resultado.asset?.imageUrl) opcoes.jaUsadosNestaEdicao?.add(resultado.asset.imageUrl);
  return resultado;
}
