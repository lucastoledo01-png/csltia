import { randomUUID } from "node:crypto";
import type { Aprovacao } from "./contrato";
import type { FilaStore, RegraProposta, Reprovacao } from "./fila-store";

/**
 * A fila em memória, com o mesmo contrato do banco.
 *
 * Existe para os testes e para o ensaio local. Ela reproduz as duas garantias
 * que a regra depende do banco para ter: a atualização condicional por estado
 * (quem chega depois não vence) e a unicidade de uma aprovação por peça.
 */
export function criarFilaEmMemoria(relogio: () => number = Date.now): FilaStore & {
  aprovacoes: Aprovacao[];
  reprovacoes: Reprovacao[];
  regrasGravadas: RegraProposta[];
} {
  const aprovacoes: Aprovacao[] = [];
  const reprovacoes: Reprovacao[] = [];
  const regrasGravadas: RegraProposta[] = [];
  const agoraIso = () => new Date(relogio()).toISOString();

  return {
    aprovacoes,
    reprovacoes,
    regrasGravadas,

    async porId(id) {
      return aprovacoes.find((a) => a.id === id) ?? null;
    },

    async porPeca(projectId, ramo, pecaId) {
      return aprovacoes.find((a) => a.projectId === projectId && a.ramo === ramo && a.pecaId === pecaId) ?? null;
    },

    async inserir(nova) {
      if (aprovacoes.some((a) => a.projectId === nova.projectId && a.ramo === nova.ramo && a.pecaId === nova.pecaId)) {
        throw new Error("[FILA] registrar na fila: duplicate key value violates unique constraint aprovacoes_peca_unica");
      }
      const linha: Aprovacao = {
        id: randomUUID(),
        projectId: nova.projectId,
        ramo: nova.ramo,
        pecaId: nova.pecaId,
        hashArtefato: nova.hashArtefato,
        publicarEm: nova.publicarEm,
        estado: "aguardando",
        automatica: false,
        decididoPor: null,
        decididoEm: null,
        motivo: null,
        etapaCulpada: null,
        refazimentos: 0,
        avisos: nova.avisos,
        resumo: nova.resumo,
        avisadoEm: null,
        liberadoEm: null,
        createdAt: agoraIso(),
        updatedAt: agoraIso(),
      };
      aprovacoes.push(linha);
      return { ...linha };
    },

    async atualizar(id, campos, seEstadoEm) {
      const alvo = aprovacoes.find((a) => a.id === id);
      if (!alvo) return null;
      if (seEstadoEm && seEstadoEm.length > 0 && !seEstadoEm.includes(alvo.estado)) return null;
      for (const [k, v] of Object.entries(campos)) {
        if (v !== undefined) (alvo as Record<string, unknown>)[k] = v;
      }
      alvo.updatedAt = agoraIso();
      return { ...alvo };
    },

    async reivindicarLiberacao(id, quandoIso) {
      const alvo = aprovacoes.find((a) => a.id === id);
      if (!alvo || alvo.estado !== "aprovada" || alvo.liberadoEm) return false;
      alvo.liberadoEm = quandoIso;
      return true;
    },

    async soltarLiberacao(id) {
      const alvo = aprovacoes.find((a) => a.id === id);
      if (alvo) alvo.liberadoEm = null;
    },

    async abertas(projectId) {
      return aprovacoes
        .filter(
          (a) =>
            a.projectId === projectId &&
            (a.estado === "aguardando" || a.estado === "refazendo" || (a.estado === "aprovada" && !a.liberadoEm)),
        )
        .map((a) => ({ ...a }));
    },

    async decididasDesde(projectId, desdeIso) {
      return aprovacoes
        .filter(
          (a) =>
            a.projectId === projectId &&
            (a.estado === "aprovada" || a.estado === "descartada") &&
            (a.decididoEm ?? "") >= desdeIso,
        )
        .map((a) => ({ ...a }));
    },

    async registrarReprovacao(r) {
      reprovacoes.push({ ...r, id: randomUUID(), createdAt: agoraIso() });
    },

    async reprovacoesDaEtapa(projectId, etapa, limite) {
      return reprovacoes
        .filter((r) => r.projectId === projectId && r.etapa === etapa)
        .slice()
        .reverse()
        .slice(0, limite);
    },

    async regras(projectId, filtro = {}) {
      return regrasGravadas.filter(
        (r) =>
          r.projectId === projectId &&
          (!filtro.etapa || r.etapa === filtro.etapa) &&
          (!filtro.estado || r.estado === filtro.estado),
      );
    },

    async proporRegra(p) {
      const existente = regrasGravadas.find(
        (r) => r.projectId === p.projectId && r.etapa === p.etapa && r.chave === p.chave,
      );
      if (existente) {
        if (existente.estado !== "proposta") return;
        existente.ocorrencias = p.ocorrencias;
        existente.exemplos = p.exemplos;
        return;
      }
      regrasGravadas.push({
        ...p,
        id: randomUUID(),
        estado: "proposta",
        decididoPor: null,
        decididoEm: null,
        createdAt: agoraIso(),
      });
    },

    async decidirRegra(id, estado, quem) {
      const alvo = regrasGravadas.find((r) => r.id === id && r.estado === "proposta");
      if (!alvo) return null;
      alvo.estado = estado;
      alvo.decididoPor = quem;
      alvo.decididoEm = agoraIso();
      return { ...alvo };
    },
  };
}
