import type { SupabaseClient } from "@supabase/supabase-js";
import type { PautaAvaliada } from "../editorial/guarda";
import type { PecaPronta } from "../ramos/peca";
import type { ProjetoComCapacidades } from "../capacidades";
import { modoDaFila } from "../aprovacao/modo";
import { getSupabaseAdminClient } from "../supabase-admin";
import type { RunNewsroomOptions } from "./newsroom-service";

/**
 * O que um ciclo DE VERDADE passa para a redação além das opções de sempre.
 *
 * Integração de 05/10/2026. Duas frentes deixaram um ponto de encaixe em
 * `RunNewsroomOptions` e ninguém o preenchia:
 *
 *   candidatasExtrasDoInstagram  as pautas dos perfis de referência (RF-16,
 *                                RF-17), que só existem com a capacidade
 *                                `perfis_referencia` em `enforce`;
 *   aoProduzirPeca               a entrada das peças dos ramos na fila de
 *                                aprovação, com a capacidade `aprovacao` fora
 *                                de `off`.
 *
 * Os dois chamadores de ciclo real (o cron das 06:03 e a produção da véspera)
 * passam por aqui, e só eles: o ensaio e os scripts continuam sem nada disto.
 *
 * Nada aqui pode derrubar o ciclo. Perfis que falham viram lista vazia; fila
 * que falha vira log, e a redação ainda embrulha `aoProduzirPeca` num `try`.
 * Com as duas capacidades desligadas, o objeto devolvido é vazio, e a chamada
 * da redação é exatamente a de antes.
 */

export type ProjetoDoCiclo = ProjetoComCapacidades & { id: string; timezone: string };

export type DepsDasLigacoes = {
  candidatos?: (projeto: ProjetoDoCiclo) => Promise<PautaAvaliada[]>;
  aoProduzirPeca?: (projeto: ProjetoDoCiclo) => (peca: PecaPronta) => Promise<void>;
};

export type LigacoesDoCiclo = Pick<RunNewsroomOptions, "candidatasExtrasDoInstagram" | "aoProduzirPeca">;

async function candidatosReais(
  projeto: ProjetoDoCiclo,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<PautaAvaliada[]> {
  const { candidatosDosPerfisDeReferencia } = await import("../social/perfis-referencia/candidatos");
  return candidatosDosPerfisDeReferencia(projeto, { env, fetcher });
}

function entradaReal(client: () => SupabaseClient) {
  return (projeto: ProjetoDoCiclo) => async (peca: PecaPronta) => {
    const [{ levarPecaDoRamoAFila, localizadorSupabase }, { depsDaFila }] = await Promise.all([
      import("../aprovacao/ramos-na-fila"),
      import("../aprovacao/integracao"),
    ]);
    const c = client();
    const p = { id: projeto.id, timezone: projeto.timezone, settings: projeto.settings ?? null };
    const desfecho = await levarPecaDoRamoAFila(p, peca, {
      ...depsDaFila(c, p),
      localizar: localizadorSupabase(c, projeto.id),
    });
    console.log(`[FILA] peça ${peca.ramo} ${peca.referenciaId}: ${desfecho.acao}`);
  };
}

export async function ligacoesDoCiclo(
  projeto: ProjetoDoCiclo | null | undefined,
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    client?: () => SupabaseClient;
    deps?: DepsDasLigacoes;
    /**
     * Sem a rodada dos perfis de referência (06/10/2026). A produção só da
     * newsletter não faz post, e uma rodada de perfis gravaria leituras do
     * dia em dobro para nada. Só a ligação com a fila fica.
     */
    semPerfis?: boolean;
  } = {},
): Promise<LigacoesDoCiclo> {
  if (!projeto) return {};
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const saida: LigacoesDoCiclo = {};

  /*
   * `candidatosDosPerfisDeReferencia` já promete não lançar e devolver vazio
   * fora de `enforce`. O `try` aqui é o cinto: o import dinâmico, ou um
   * contrato quebrado amanhã, não pode custar o ciclo do dia.
   */
  if (!opcoes.semPerfis) try {
    const extras = await (opcoes.deps?.candidatos ?? ((p) => candidatosReais(p, env, fetcher)))(projeto);
    if (extras.length > 0) saida.candidatasExtrasDoInstagram = extras;
  } catch (erro) {
    console.error(`[CICLO] perfis de referência não entraram: ${erro instanceof Error ? erro.message : String(erro)}`);
  }

  if (modoDaFila(projeto) !== "off") {
    const fabricar =
      opcoes.deps?.aoProduzirPeca ??
      entradaReal(opcoes.client ?? getSupabaseAdminClient);
    const entrar = fabricar(projeto);
    saida.aoProduzirPeca = async (peca) => {
      try {
        await entrar(peca);
      } catch (erro) {
        console.error(
          `[FILA] peça ${peca.ramo} ${peca.referenciaId} fora da fila: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    };
  }

  return saida;
}
