import type { ConfigEditorial } from "./config";
import type { PautaAvaliada } from "./guarda";
import type { CandidatosStore, VerificacaoPersistida } from "./candidatos-store";
import { hashDaVerificacao, paraPersistir, verificacaoAindaVale } from "./candidatos-store";
import { verificarFinalistas } from "./verificador";
import type { FinalistaParaVerificar, Verificacao } from "./verificador";

/**
 * A conferência de quem disputa vaga, e só de quem disputa.
 *
 * O pool aprovado pode ter oitenta pautas num dia bom. Verificar as oitenta
 * pagaria o preço da conferência para setenta que nunca chegariam perto de
 * publicar. Verificar as duas que a newsletter leva deixaria a seleção sem
 * substituta quando uma cai.
 *
 * O meio é uma margem: confere as vagas mais uma folga. Quando uma candidata
 * é recusada ou entra em conflito, a próxima já vem conferida, e o feed não
 * encolhe por causa de uma pauta problemática. É o item que diz que uma
 * candidata ruim não pode derrubar o conjunto.
 *
 * A verificação pertence à PAUTA, não ao canal. A newsletter confere de manhã,
 * o Instagram lê de tarde, e a segunda chamada não acontece.
 */

export type ResultadoDosFinalistas = {
  /** Passaram e podem publicar. Na ordem da nota. */
  confirmadas: PautaAvaliada[];
  /** A verificação recusou. Saem da disputa. */
  recusadas: Array<{ pauta: PautaAvaliada; motivo: string }>;
  /** Divergiram em campo material. Não publicam sozinhas. */
  emConflito: Array<{ pauta: PautaAvaliada; motivo: string; divergencias: Verificacao["divergencias"] }>;
  /** Estavam no pool e não foram conferidas, porque não disputavam vaga. */
  naoConferidas: PautaAvaliada[];
  diagnostico: {
    finalistas: number;
    verificadasAgora: number;
    reaproveitadasDoBanco: number;
    chamadasAoVerificador: number;
    tokens: number;
    custoUsd: number;
  };
  linhasDeLog: string[];
};

export type OpcoesDosFinalistas = {
  canal: string;
  /** Quantas vagas o canal tem. A margem é somada a isto. */
  vagas: number;
  /** Folga sobre as vagas, para haver substituta quando uma cai. */
  margem?: number;
  config: ConfigEditorial;
  store?: CandidatosStore | null;
  projectId?: string;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

function contextoDaPauta(p: PautaAvaliada): string {
  return (p.enriquecimento?.texto || p.grupo.primary.description || "").trim();
}

function paraVerificar(p: PautaAvaliada): FinalistaParaVerificar {
  return {
    storyId: p.storyId,
    titulo: p.grupo.primary.title,
    fonte: p.grupo.primary.source_name,
    url: p.grupo.primary.url,
    contexto: contextoDaPauta(p),
    classificacaoPrimaria: p.classificacao,
  };
}

export function hashDaPauta(p: PautaAvaliada): string {
  return hashDaVerificacao({
    titulo: p.grupo.primary.title,
    fonte: p.grupo.primary.source_name,
    contexto: contextoDaPauta(p),
    classificacao: {
      pais: p.classificacao.pais,
      leitura: p.classificacao.leitura,
      eixo: p.classificacao.eixo,
      relevancia: p.classificacao.relevancia,
    },
  });
}

export async function conferirFinalistas(
  pool: PautaAvaliada[],
  opcoes: OpcoesDosFinalistas,
): Promise<ResultadoDosFinalistas> {
  const linhas: string[] = [];
  const margem = opcoes.margem ?? Math.max(2, Math.ceil(opcoes.vagas * 0.5));

  const ordenado = [...pool].sort((a, b) => b.pontuacao.total - a.pontuacao.total);
  const quantos = Math.min(ordenado.length, opcoes.vagas + margem);
  const finalistas = ordenado.slice(0, quantos);
  const naoConferidas = ordenado.slice(quantos);

  linhas.push(
    `[FINALISTAS] ${finalistas.length} de ${pool.length} vão à conferência ` +
      `(${opcoes.vagas} vagas mais ${margem} de folga)`,
  );

  /*
   * O que a newsletter já conferiu, o Instagram não paga de novo.
   *
   * Duas condições, e as duas importam. O hash garante que a conferência
   * anterior leu o MESMO texto: se o pacote factual foi enriquecido depois,
   * ela julgou outra coisa. A janela garante que o julgamento não é de duas
   * semanas atrás.
   */
  const jaVerificadas = new Map<string, Verificacao>();
  const idPorStory = new Map<string, string>();
  let reaproveitadas = 0;

  if (opcoes.store && opcoes.projectId) {
    try {
      const persistidas = await opcoes.store.buscarPorStoryIds(
        opcoes.projectId,
        finalistas.map((f) => f.storyId),
      );

      for (const f of finalistas) {
        const anterior = persistidas.get(f.storyId);
        if (anterior?.id) idPorStory.set(f.storyId, anterior.id);
        if (!anterior?.verificacao) continue;

        if (!verificacaoAindaVale(anterior.verificacao, hashDaPauta(f))) continue;

        const v = anterior.verificacao;
        jaVerificadas.set(f.storyId, {
          storyId: f.storyId,
          veredicto: v.status === "conflict" ? "review" : v.status,
          camposConfirmados: [],
          divergencias: v.divergencias,
          motivo: v.motivo,
          leitura: null,
          origem: "reaproveitada",
        });
        reaproveitadas += 1;
      }

      if (reaproveitadas > 0) {
        linhas.push(
          `[FINALISTAS] ${reaproveitadas} verificação(ões) reaproveitada(s) de outro canal, sem nova chamada`,
        );
      }
    } catch (erro) {
      linhas.push(`[FINALISTAS] leitura de verificações falhou, conferindo tudo: ${(erro as Error).message}`);
    }
  }

  const r = await verificarFinalistas(finalistas.map(paraVerificar), {
    config: opcoes.config,
    jaVerificadas,
    env: opcoes.env,
    fetcher: opcoes.fetcher,
  });
  linhas.push(...r.linhasDeLog);

  const confirmadas: PautaAvaliada[] = [];
  const recusadas: ResultadoDosFinalistas["recusadas"] = [];
  const emConflito: ResultadoDosFinalistas["emConflito"] = [];

  for (const f of finalistas) {
    const v = r.verificacoes.get(f.storyId);

    if (!v) {
      // Sem veredicto não é aprovação por omissão.
      emConflito.push({ pauta: f, motivo: "a verificação não devolveu esta pauta", divergencias: [] });
      continue;
    }

    if (v.veredicto === "confirm") confirmadas.push(f);
    else if (v.veredicto === "reject") recusadas.push({ pauta: f, motivo: v.motivo });
    else emConflito.push({ pauta: f, motivo: v.motivo, divergencias: v.divergencias });

    /*
     * Guardar o veredicto é o que torna o reuso possível amanhã e no outro
     * canal. Só se grava o que foi conferido AGORA: reaproveitado já está lá.
     */
    if (opcoes.store && v.origem === "verificacao") {
      const id = idPorStory.get(f.storyId);
      if (id) {
        try {
          await opcoes.store.gravarVerificacao(id, paraPersistir(v, opcoes.canal, hashDaPauta(f)));
        } catch (erro) {
          linhas.push(`[FINALISTAS] verificação de ${f.storyId} não gravada: ${(erro as Error).message}`);
        }
      }
    }
  }

  linhas.push(
    `[FINALISTAS] ${confirmadas.length} confirmada(s), ${recusadas.length} recusada(s), ` +
      `${emConflito.length} em conflito`,
  );

  return {
    confirmadas,
    recusadas,
    emConflito,
    naoConferidas,
    diagnostico: {
      finalistas: finalistas.length,
      verificadasAgora: finalistas.length - reaproveitadas,
      reaproveitadasDoBanco: reaproveitadas,
      chamadasAoVerificador: r.chamadas,
      tokens: r.tokens.total,
      custoUsd: r.custoUsd,
    },
    linhasDeLog: linhas,
  };
}

/** Só o que a conferência liberou. Nunca o pool inteiro. */
export function apenasPublicaveis(r: ResultadoDosFinalistas): PautaAvaliada[] {
  return r.confirmadas;
}

export type { VerificacaoPersistida };
