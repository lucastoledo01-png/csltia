import type { PautaAvaliada } from "../editorial/guarda";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import { dominioDe } from "../editorial/url-canonica";
import type { Reprovacao } from "../aprovacao/fila-store";
import { PENALIDADE_MAXIMA, PENALIDADE_POR_RECUSA, RECUSAS_PARA_BLOQUEAR } from "./contrato";

/**
 * A seleção de cada canal aprende com as pautas que o editor recusou NAQUELE
 * canal (06/10/2026).
 *
 * A seleção dos ramos é determinística (nota, tetos, cosseno), então o que ela
 * aprende também é: uma conta, e não um parágrafo no prompt. Três camadas, da
 * mais leve para a mais dura:
 *
 *   1. Cada recusa anterior do mesmo padrão (a mesma fonte, um ator em comum,
 *      o mesmo eixo) tira `PENALIDADE_POR_RECUSA` pontos da nota, até
 *      `PENALIDADE_MAXIMA`. A pauta parecida desce na fila e a seguinte sobe.
 *   2. A fonte ou o ator recusado `RECUSAS_PARA_BLOQUEAR` vezes em trinta dias
 *      sai da seleção daquele canal. O eixo NUNCA bloqueia: tirar "economia"
 *      do canal por três recusas seria decidir a linha editorial por soma.
 *   3. A pauta recusada na seleção não volta àquele canal, nunca.
 *
 * Canal é canal: a recusa no post não mexe na seleção da newsletter. Quem
 * chama passa só as reprovações do próprio ramo, e há teste disso.
 */

export type TracosDaPauta = { storyId: string; titulo: string; fonte: string; atores: string[]; eixo: string };

export type PadroesDaSelecao = {
  fontes: Map<string, number>;
  atores: Map<string, number>;
  eixos: Map<string, number>;
  storyIds: Set<string>;
  /** Os motivos escritos pelo editor, para o log dizer por que a pauta desceu. */
  motivos: string[];
};

export function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function somar(m: Map<string, number>, chave: string) {
  if (!chave) return;
  m.set(chave, (m.get(chave) ?? 0) + 1);
}

export function padroesVazios(): PadroesDaSelecao {
  return { fontes: new Map(), atores: new Map(), eixos: new Map(), storyIds: new Set(), motivos: [] };
}

/** Os padrões das reprovações de SELEÇÃO de um canal. Reprovação de outra etapa não conta aqui. */
export function padroesDaSelecao(reprovacoes: Pick<Reprovacao, "etapa" | "motivo" | "detalhes">[]): PadroesDaSelecao {
  const p = padroesVazios();
  for (const r of reprovacoes) {
    if (r.etapa !== "selecao") continue;
    const pautas = r.detalhes?.pautas ?? [];
    if (pautas.length === 0) continue;
    if (r.motivo.trim()) p.motivos.push(r.motivo.trim());
    for (const pauta of pautas) {
      if (pauta.storyId) p.storyIds.add(pauta.storyId);
      somar(p.fontes, normalizar(pauta.fonte ?? ""));
      somar(p.eixos, normalizar(pauta.eixo ?? ""));
      for (const a of new Set((pauta.atores ?? []).map(normalizar))) somar(p.atores, a);
    }
  }
  return p;
}

export function semPadroes(p: PadroesDaSelecao): boolean {
  return p.storyIds.size === 0 && p.fontes.size === 0 && p.atores.size === 0 && p.eixos.size === 0;
}

export type AvaliacaoDaPauta = { bloqueio: string | null; penalidade: number; razoes: string[] };

export function avaliarPauta(t: TracosDaPauta, p: PadroesDaSelecao): AvaliacaoDaPauta {
  if (p.storyIds.has(t.storyId)) {
    return { bloqueio: "a pauta já foi recusada pelo editor neste canal", penalidade: 0, razoes: [] };
  }
  const fonte = normalizar(t.fonte);
  const nFonte = p.fontes.get(fonte) ?? 0;
  if (fonte && nFonte >= RECUSAS_PARA_BLOQUEAR) {
    return { bloqueio: `a fonte ${fonte} foi recusada ${nFonte} vezes neste canal em 30 dias`, penalidade: 0, razoes: [] };
  }
  const atores = [...new Set(t.atores.map(normalizar))].filter(Boolean);
  for (const a of atores) {
    const n = p.atores.get(a) ?? 0;
    if (n >= RECUSAS_PARA_BLOQUEAR) {
      return { bloqueio: `o ator "${a}" foi recusado ${n} vezes neste canal em 30 dias`, penalidade: 0, razoes: [] };
    }
  }

  let recusas = 0;
  const razoes: string[] = [];
  if (nFonte > 0) {
    recusas += nFonte;
    razoes.push(`fonte ${fonte} (${nFonte})`);
  }
  for (const a of atores) {
    const n = p.atores.get(a) ?? 0;
    if (n > 0) {
      recusas += n;
      razoes.push(`ator ${a} (${n})`);
    }
  }
  const eixo = normalizar(t.eixo);
  const nEixo = p.eixos.get(eixo) ?? 0;
  if (eixo && nEixo > 0) {
    recusas += nEixo;
    razoes.push(`eixo ${eixo} (${nEixo})`);
  }
  return { bloqueio: null, penalidade: Math.min(PENALIDADE_MAXIMA, recusas * PENALIDADE_POR_RECUSA), razoes };
}

export type ResultadoDoAprendizadoDaSelecao<P> = {
  pool: P[];
  bloqueadas: Array<{ storyId: string; titulo: string; motivo: string }>;
  penalizadas: number;
  linhas: string[];
};

/**
 * Aplica os padrões a um pool, sem mudar a ordem de ninguém que não casa.
 *
 * Sem padrão nenhum devolve o MESMO array: o canal sem reprovação de seleção
 * escolhe byte a byte como antes.
 */
export function aplicarAprendizadoDaSelecao<P>(
  pool: P[],
  padroes: PadroesDaSelecao,
  tracos: (p: P) => TracosDaPauta,
  penalizar: (p: P, penalidade: number, razao: string) => P,
  rotulo: string,
): ResultadoDoAprendizadoDaSelecao<P> {
  if (semPadroes(padroes)) return { pool, bloqueadas: [], penalizadas: 0, linhas: [] };
  const saida: P[] = [];
  const bloqueadas: ResultadoDoAprendizadoDaSelecao<P>["bloqueadas"] = [];
  let penalizadas = 0;
  for (const p of pool) {
    const t = tracos(p);
    const a = avaliarPauta(t, padroes);
    if (a.bloqueio) {
      bloqueadas.push({ storyId: t.storyId, titulo: t.titulo, motivo: a.bloqueio });
      continue;
    }
    if (a.penalidade > 0) {
      penalizadas += 1;
      saida.push(penalizar(p, a.penalidade, `recusas parecidas: ${a.razoes.join(", ")}`));
    } else saida.push(p);
  }
  const linhas: string[] = [];
  if (bloqueadas.length || penalizadas) {
    linhas.push(
      `[APRENDIZADO ${rotulo}] seleção: ${bloqueadas.length} fora por recusa repetida, ${penalizadas} com nota rebaixada`,
    );
    for (const b of bloqueadas) linhas.push(`[APRENDIZADO ${rotulo}] fora: ${b.titulo.slice(0, 60)} :: ${b.motivo}`);
  }
  return { pool: saida, bloqueadas, penalizadas, linhas };
}

export function tracosDaPautaAvaliada(p: PautaAvaliada): TracosDaPauta {
  return {
    storyId: p.storyId,
    titulo: p.grupo.primary.title,
    fonte: dominioDe(p.grupo.primary.url),
    atores: p.classificacao.atores ?? [],
    eixo: p.classificacao.eixo ?? "",
  };
}

/** A pauta com a nota rebaixada. Clona: a mesma pauta é lida pelos outros canais com a nota original. */
export function penalizarPautaAvaliada(p: PautaAvaliada, penalidade: number, razao: string): PautaAvaliada {
  return {
    ...p,
    pontuacao: {
      ...p.pontuacao,
      total: p.pontuacao.total - penalidade,
      explicacao: `${p.pontuacao.explicacao} - ${penalidade} (${razao})`,
    },
  };
}

export function tracosDaCandidata(c: CandidataPersistida): TracosDaPauta {
  return {
    storyId: c.storyId,
    titulo: c.title,
    fonte: c.sourceDomain || dominioDe(c.url),
    atores: c.classificacao?.atores ?? [],
    eixo: c.classificacao?.eixo ?? "",
  };
}

/** O aprendizado sobre o pool de pautas avaliadas de um canal, como os ramos o recebem. */
export function aprenderNaSelecao(
  pool: PautaAvaliada[],
  padroes: PadroesDaSelecao,
  rotulo: string,
): ResultadoDoAprendizadoDaSelecao<PautaAvaliada> {
  const r = aplicarAprendizadoDaSelecao(pool, padroes, tracosDaPautaAvaliada, penalizarPautaAvaliada, rotulo);
  if (r.pool === pool) return r;
  // A composição é gulosa por nota: a penalidade só vale se a ordem refletir a nota nova.
  return { ...r, pool: r.pool.slice().sort((a, b) => b.pontuacao.total - a.pontuacao.total) };
}
