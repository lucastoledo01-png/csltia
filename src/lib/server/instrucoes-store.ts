import type { SupabaseClient } from "@supabase/supabase-js";
import { TABELA, ehEtapaEditorial, motivoParaRecusarTexto } from "./instrucoes";

/**
 * As versões das instruções editoriais, para o painel.
 *
 * Versão nunca é editada nem apagada: editar cria a próxima, e voltar atrás é
 * ATIVAR uma anterior. É o que torna o rollback trivial e o histórico
 * confiável, e é a mesma razão de `article_revisions` existir.
 *
 * ## A ordem das duas escritas
 *
 * Ativar é desativar a vigente e ativar a escolhida. Sem transação pelo
 * PostgREST, a ordem decide o estado intermediário, e ela é: desativa primeiro.
 * Se a segunda escrita falhar, o projeto fica SEM versão ativa, e sem versão
 * ativa vale o texto do código, que é publicável por definição. A ordem
 * inversa deixaria duas ativas, que o índice único parcial recusa, e o erro
 * apareceria para o operador como "não consegui ativar" sem explicar por quê.
 */

export type VersaoDaInstrucao = {
  id: string;
  etapa: string;
  texto: string;
  versao: number;
  criado_por: string;
  criado_em: string;
  ativo: boolean;
};

type Cliente = Pick<SupabaseClient, "from">;

export class RecusaDaInstrucao extends Error {}

export async function listarVersoes(cliente: Cliente, projetoId: string): Promise<VersaoDaInstrucao[]> {
  const { data, error } = await cliente
    .from(TABELA)
    .select("id, etapa, texto, versao, criado_por, criado_em, ativo")
    .eq("project_id", projetoId)
    .order("etapa")
    .order("versao", { ascending: false });

  if (error) throw new Error(`Falha ao ler as instruções: ${error.message}`);
  return (data ?? []) as VersaoDaInstrucao[];
}

async function desativarVigente(cliente: Cliente, projetoId: string, etapa: string): Promise<void> {
  const { error } = await cliente
    .from(TABELA)
    .update({ ativo: false })
    .eq("project_id", projetoId)
    .eq("etapa", etapa)
    .eq("ativo", true);
  if (error) throw new Error(`Falha ao desativar a versão vigente: ${error.message}`);
}

/** Grava o texto como a próxima versão da etapa, já ativa. */
export async function criarVersao(
  cliente: Cliente,
  dados: { projetoId: string; etapa: string; texto: string; criadoPor: string },
): Promise<VersaoDaInstrucao> {
  if (!ehEtapaEditorial(dados.etapa)) throw new RecusaDaInstrucao(`etapa desconhecida: "${dados.etapa}"`);
  const motivo = motivoParaRecusarTexto(dados.texto);
  if (motivo) throw new RecusaDaInstrucao(motivo);

  const { data: ultima, error: erroLeitura } = await cliente
    .from(TABELA)
    .select("versao")
    .eq("project_id", dados.projetoId)
    .eq("etapa", dados.etapa)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroLeitura) throw new Error(`Falha ao ler a última versão: ${erroLeitura.message}`);

  const proxima = ((ultima as { versao?: number } | null)?.versao ?? 0) + 1;

  await desativarVigente(cliente, dados.projetoId, dados.etapa);

  const { data, error } = await cliente
    .from(TABELA)
    .insert({
      project_id: dados.projetoId,
      etapa: dados.etapa,
      texto: dados.texto.trim(),
      versao: proxima,
      criado_por: dados.criadoPor,
      ativo: true,
    })
    .select("id, etapa, texto, versao, criado_por, criado_em, ativo")
    .single();

  if (error) throw new Error(`Falha ao gravar a versão ${proxima}: ${error.message}`);
  return data as VersaoDaInstrucao;
}

/** Rollback: a versão escolhida volta a valer. */
export async function ativarVersao(
  cliente: Cliente,
  dados: { projetoId: string; id: string },
): Promise<VersaoDaInstrucao> {
  const { data: alvo, error: erroLeitura } = await cliente
    .from(TABELA)
    .select("id, etapa, texto, versao, criado_por, criado_em, ativo")
    .eq("project_id", dados.projetoId)
    .eq("id", dados.id)
    .maybeSingle();
  if (erroLeitura) throw new Error(`Falha ao ler a versão: ${erroLeitura.message}`);
  if (!alvo) throw new RecusaDaInstrucao("versão não encontrada neste projeto");

  const versao = alvo as VersaoDaInstrucao;
  const motivo = motivoParaRecusarTexto(versao.texto);
  if (motivo) throw new RecusaDaInstrucao(`a versão ${versao.versao} não vale mais: ${motivo}`);

  await desativarVigente(cliente, dados.projetoId, versao.etapa);

  const { error } = await cliente.from(TABELA).update({ ativo: true }).eq("id", versao.id);
  if (error) throw new Error(`Falha ao ativar a versão ${versao.versao}: ${error.message}`);
  return { ...versao, ativo: true };
}

/** Volta ao texto do código: nenhuma versão ativa. As versões continuam no histórico. */
export async function voltarAoPadrao(cliente: Cliente, dados: { projetoId: string; etapa: string }): Promise<void> {
  if (!ehEtapaEditorial(dados.etapa)) throw new RecusaDaInstrucao(`etapa desconhecida: "${dados.etapa}"`);
  await desativarVigente(cliente, dados.projetoId, dados.etapa);
}
