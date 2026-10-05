import type { SupabaseClient } from "@supabase/supabase-js";
import type { LivroDeCustos } from "./custos";
import type { PecaPronta, Ramo } from "./peca";

/**
 * O que os ramos decidiram, gravado no banco (RF-10 e RNF-14).
 *
 * `platform_events` pelo mesmo motivo do diagnóstico do social: já tem
 * `event_type`, `payload` jsonb e `project_id`, e não pede DDL. O veredito do
 * auditor é gravado quando PASSA e quando BLOQUEIA: até aqui só o bloqueio
 * deixava rastro (em `newsroom_runs.error_message`), e um portão que só fala
 * quando reprova não deixa medir quantas vezes aprovou com aviso.
 *
 * Gravar nunca derruba o ciclo. Devolve o motivo para quem chamou pôr no log.
 */
export const EVENTO_VEREDITO = "ramo_veredito";
export const EVENTO_CUSTOS = "ramo_custos_do_dia";

const MAX_ITENS = 20;
const MAX_TEXTO = 240;
const cortar = (s: string) => (s.length > MAX_TEXTO ? `${s.slice(0, MAX_TEXTO - 1)}…` : s);

export type VereditoDoRamo = {
  ramo: Ramo;
  referenciaId: string;
  titulo: string;
  aprovado: boolean;
  bloqueios: string[];
  avisos: string[];
  /** Nota do auditor de QA, quando o ramo tem um. */
  nota?: number | null;
  riscoDeAlucinacao?: boolean | null;
  hashDoArtefato?: string | null;
};

export function vereditoDaPeca(peca: PecaPronta, extra: { nota?: number | null; riscoDeAlucinacao?: boolean | null } = {}): VereditoDoRamo {
  return {
    ramo: peca.ramo,
    referenciaId: peca.referenciaId,
    titulo: peca.titulo,
    aprovado: peca.aprovadaPeloAuditor,
    bloqueios: peca.bloqueios,
    avisos: peca.avisos,
    nota: extra.nota ?? null,
    riscoDeAlucinacao: extra.riscoDeAlucinacao ?? null,
    hashDoArtefato: peca.hashDoArtefato,
  };
}

export function montarRegistroDoVeredito(v: VereditoDoRamo, contexto: { data: string; dryRun: boolean; modo: string }) {
  return {
    data: contexto.data,
    dryRun: contexto.dryRun,
    modo: contexto.modo,
    ramo: v.ramo,
    referenciaId: v.referenciaId,
    titulo: cortar(v.titulo),
    aprovado: v.aprovado,
    bloqueios: v.bloqueios.slice(0, MAX_ITENS).map(cortar),
    avisos: v.avisos.slice(0, MAX_ITENS).map(cortar),
    nota: v.nota ?? null,
    riscoDeAlucinacao: v.riscoDeAlucinacao ?? null,
    hashDoArtefato: v.hashDoArtefato ?? null,
  };
}

export function montarRegistroDosCustos(livro: LivroDeCustos, contexto: { data: string; dryRun: boolean; modo: string }) {
  const porEtapa: Record<string, number> = {};
  for (const l of livro.lancamentos()) {
    const chave = `${l.ramo}:${l.etapa}`;
    porEtapa[chave] = (porEtapa[chave] ?? 0) + l.custoUsd;
  }
  return {
    data: contexto.data,
    dryRun: contexto.dryRun,
    modo: contexto.modo,
    totalUsd: livro.total(),
    porRamo: livro.porRamo(),
    porEtapa,
    lancamentos: livro.lancamentos().length,
  };
}

async function inserir(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  tipo: string,
  payload: unknown,
): Promise<string | null> {
  try {
    const { error } = await client.from("platform_events").insert({ event_type: tipo, project_id: projectId, payload });
    return error ? error.message : null;
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

export async function gravarVeredito(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  v: VereditoDoRamo,
  contexto: { data: string; dryRun: boolean; modo: string },
): Promise<string | null> {
  return inserir(client, projectId, EVENTO_VEREDITO, montarRegistroDoVeredito(v, contexto));
}

export async function gravarCustos(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  livro: LivroDeCustos,
  contexto: { data: string; dryRun: boolean; modo: string },
): Promise<string | null> {
  return inserir(client, projectId, EVENTO_CUSTOS, montarRegistroDosCustos(livro, contexto));
}
