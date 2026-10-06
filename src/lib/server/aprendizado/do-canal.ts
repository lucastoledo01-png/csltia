import type { Ramo } from "../aprovacao/contrato";
import type { FilaStore, Reprovacao } from "../aprovacao/fila-store";
import { aprendizadoDaArte, aprendizadoDaArteVazio, type AprendizadoDaArte } from "./arte";
import { JANELA_DO_APRENDIZADO_DIAS } from "./contrato";
import { aprendizadoDaImagem, aprendizadoDaImagemVazio, type AprendizadoDaImagem } from "./imagem";
import { padroesDaSelecao, padroesVazios, type PadroesDaSelecao } from "./selecao";

/**
 * O que UM canal aprendeu com as reprovações dele nos últimos trinta dias
 * (06/10/2026). Uma leitura só, e cada etapa pega a parte dela.
 *
 * O texto não está aqui: ele usa `errosRecentesDaEtapa` (os erros recentes
 * mais as regras aprovadas) e os exemplos aprovados, que são blocos de prompt.
 * Aqui mora o que é CONTA: a penalidade da seleção, a foto que o canal não
 * usa mais, o molde que saiu da escolha.
 */

export type AprendizadoDoCanal = {
  ramo: Ramo;
  selecao: PadroesDaSelecao;
  imagem: AprendizadoDaImagem;
  arte: AprendizadoDaArte;
};

export function aprendizadoVazio(ramo: Ramo): AprendizadoDoCanal {
  return { ramo, selecao: padroesVazios(), imagem: aprendizadoDaImagemVazio(), arte: aprendizadoDaArteVazio() };
}

/** Pura: monta das reprovações já lidas, e descarta as de outro canal. */
export function aprendizadoDasReprovacoes(ramo: Ramo, reprovacoes: Reprovacao[]): AprendizadoDoCanal {
  const doCanal = reprovacoes.filter((r) => r.ramo === ramo);
  return {
    ramo,
    selecao: padroesDaSelecao(doCanal),
    imagem: aprendizadoDaImagem(doCanal),
    arte: ramo === "post" ? aprendizadoDaArte(doCanal) : aprendizadoDaArteVazio(),
  };
}

/**
 * Lê e monta. Falha de leitura devolve o aprendizado vazio, que é o
 * comportamento de antes: perder a pauta do dia porque a memória não
 * respondeu seria trocar um defeito pequeno por um grande.
 */
export async function aprendizadoDoCanal(
  store: Pick<FilaStore, "reprovacoesDesde">,
  projectId: string,
  ramo: Ramo,
  agora: number = Date.now(),
): Promise<AprendizadoDoCanal> {
  try {
    const desde = new Date(agora - JANELA_DO_APRENDIZADO_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const reprovacoes = await store.reprovacoesDesde(projectId, desde, 300, ramo);
    return aprendizadoDasReprovacoes(ramo, reprovacoes);
  } catch (erro) {
    console.warn(`[APRENDIZADO] reprovações do canal ${ramo} ilegíveis: ${erro instanceof Error ? erro.message : String(erro)}`);
    return aprendizadoVazio(ramo);
  }
}
