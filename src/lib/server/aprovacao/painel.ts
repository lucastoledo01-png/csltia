import { ehEtapa, ehRamo, RAMOS, type Aprovacao, type Ramo } from "./contrato";
import {
  aprovar,
  aprovarEmLote,
  cancelar,
  editarTexto,
  ordenarFila,
  reprovar,
  taxaSemRetrabalho,
  type DepsDaFila,
  type ProjetoDaFila,
  type TaxaDoRamo,
} from "./fila";
import type { RegraProposta } from "./fila-store";
import { horariosDaNewsletter, modoDaFila, modoDoRamo, type HorariosDaNewsletter, type ModoDoRamo } from "./modo";

/**
 * O que o painel da fila pede e o que ele recebe, sem HTTP no meio.
 *
 * As rotas só autenticam, acham o projeto e chamam daqui. Separar é o que deixa
 * a validação do corpo testável: um clique com etapa errada ou sem motivo
 * precisa virar "não" com a frase certa, e isso não depende de Next.
 */

export type VisaoDaFila = {
  modo: string;
  ramos: Record<Ramo, ModoDoRamo>;
  horarios: HorariosDaNewsletter;
  fila: Aprovacao[];
  taxa: TaxaDoRamo[];
  regras: RegraProposta[];
};

export async function visaoDaFila(projeto: ProjetoDaFila, deps: DepsDaFila): Promise<VisaoDaFila> {
  const [abertas, taxa, regras] = await Promise.all([
    deps.store.abertas(projeto.id),
    taxaSemRetrabalho(projeto, deps),
    deps.store.regras(projeto.id),
  ]);
  return {
    modo: modoDaFila(projeto),
    ramos: Object.fromEntries(RAMOS.map((r) => [r, modoDoRamo(projeto, r)])) as Record<Ramo, ModoDoRamo>,
    horarios: horariosDaNewsletter(projeto),
    fila: ordenarFila(abertas),
    taxa,
    regras: regras.filter((r) => r.estado !== "recusada"),
  };
}

export type CorpoDaAcao = {
  acao?: unknown;
  id?: unknown;
  ids?: unknown;
  ramo?: unknown;
  etapa?: unknown;
  motivo?: unknown;
  texto?: unknown;
  /** Newsletter: a pauta (storyId) que a reprovação aponta. */
  alvo?: unknown;
};

export type RespostaDaAcao = { ok: boolean; status: number; corpo: Record<string, unknown> };

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function falha(status: number, error: string, extra: Record<string, unknown> = {}): RespostaDaAcao {
  return { ok: false, status, corpo: { ok: false, error, ...extra } };
}

export async function executarAcao(
  projeto: ProjetoDaFila,
  corpo: CorpoDaAcao,
  quem: string,
  deps: DepsDaFila,
): Promise<RespostaDaAcao> {
  const acao = texto(corpo.acao);
  const id = texto(corpo.id);

  switch (acao) {
    case "aprovar": {
      if (!id) return falha(400, "informe o id da aprovação");
      const r = await aprovar(projeto, id, quem, deps);
      return r.ok ? { ok: true, status: 200, corpo: { ok: true, aprovacao: r.aprovacao, liberacao: r.liberacao } } : falha(409, r.motivo);
    }
    case "lote": {
      const ramo = corpo.ramo === undefined ? undefined : corpo.ramo;
      if (ramo !== undefined && !ehRamo(ramo)) return falha(400, `ramo desconhecido: ${String(ramo)}`);
      const ids = Array.isArray(corpo.ids) ? corpo.ids.filter((x): x is string => typeof x === "string") : undefined;
      if (!ramo && !ids) return falha(400, "lote precisa de um ramo ou de uma lista de ids");
      const r = await aprovarEmLote(projeto, { ramo, ids }, quem, deps);
      return { ok: true, status: 200, corpo: { ok: true, ...r } };
    }
    case "reprovar": {
      if (!id) return falha(400, "informe o id da aprovação");
      if (!ehEtapa(corpo.etapa)) return falha(400, "informe a etapa culpada: selecao, texto, imagem ou arte");
      const r = await reprovar(projeto, id, corpo.etapa, texto(corpo.motivo), quem, deps, {
        alvo: texto(corpo.alvo) || null,
      });
      return r.ok
        ? { ok: true, status: 200, corpo: { ok: true, aprovacao: r.aprovacao, desfecho: r.desfecho, detalhe: r.detalhe } }
        : falha(409, r.motivo);
    }
    case "cancelar": {
      if (!id) return falha(400, "informe o id da aprovação");
      const r = await cancelar(projeto, id, texto(corpo.motivo), quem, deps);
      return r.ok ? { ok: true, status: 200, corpo: { ok: true, aprovacao: r.aprovacao } } : falha(409, r.motivo);
    }
    case "editar": {
      if (!id) return falha(400, "informe o id da aprovação");
      const r = await editarTexto(projeto, id, texto(corpo.texto), quem, deps);
      return r.ok
        ? { ok: true, status: 200, corpo: { ok: true, aprovacao: r.aprovacao } }
        : falha(422, r.motivo, { problemas: r.problemas ?? [] });
    }
    default:
      return falha(400, `ação desconhecida: "${acao}". Conhecidas: aprovar, lote, reprovar, cancelar, editar`);
  }
}
