import type { SupabaseClient } from "@supabase/supabase-js";
import { TABELA_DO_ACERVO } from "./acervo";
import { listaDeCompras, type ItemDaLista } from "./lista-de-compras";
import { capacidadeDoAcervo, type ModoDoAcervo } from "./modo";
import { usadaNaJanela } from "./na-resolucao";
import { TAGS_DO_CATALOGO } from "./catalogo-de-cenas";
import type { ProjetoComCapacidades } from "../../capacidades";

/**
 * O retrato do acervo para o painel: o que tem, o que está livre, o que falta.
 *
 * Erro de leitura volta como texto, e não como lista vazia (lição de
 * 13/09/2026): "o acervo está vazio" e "a tabela ainda não existe porque a
 * migration não rodou" pedem providências opostas.
 */

export type PrateleiraDaTag = { tag: string; pais: string; fotos: number; livres: number };

export type SituacaoDoAcervo = {
  modo: ModoDoAcervo;
  total: number;
  livres: number;
  janelaEmDias: number;
  prateleiras: PrateleiraDaTag[];
  /** Tags do cardápio sem nenhuma foto, para o designer ver o buraco antes de faltar. */
  tagsSemFoto: number;
  tagsNoCatalogo: number;
  listaDeCompras: ItemDaLista[];
  erros: string[];
};

type LinhaResumo = { tag: string; pais: string; ultimo_uso_em: string | null };

export function resumirPrateleiras(linhas: LinhaResumo[], janelaEmDias: number, agoraMs = Date.now()): PrateleiraDaTag[] {
  const mapa = new Map<string, PrateleiraDaTag>();
  for (const l of linhas) {
    const chave = `${l.tag}|${l.pais}`;
    const p = mapa.get(chave) ?? { tag: l.tag, pais: l.pais, fotos: 0, livres: 0 };
    p.fotos += 1;
    const naJanela = usadaNaJanela(
      { ultimoUsoEm: l.ultimo_uso_em } as Parameters<typeof usadaNaJanela>[0],
      janelaEmDias,
      agoraMs,
    );
    if (!naJanela) p.livres += 1;
    mapa.set(chave, p);
  }
  // Primeiro as prateleiras mais perto de esvaziar.
  return [...mapa.values()].sort((a, b) => a.livres - b.livres || a.tag.localeCompare(b.tag));
}

export async function situacaoDoAcervo(
  client: SupabaseClient,
  projeto: ProjetoComCapacidades & { id: string },
  janelaEmDias: number,
  dias = 7,
): Promise<SituacaoDoAcervo> {
  const erros: string[] = [];
  let linhas: LinhaResumo[] = [];

  const { data, error } = await client
    .from(TABELA_DO_ACERVO)
    .select("tag,pais,ultimo_uso_em")
    .eq("project_id", projeto.id)
    .eq("status", "ativa")
    .limit(10000);
  if (error) erros.push(`acervo: ${error.message}`);
  else linhas = (data ?? []) as LinhaResumo[];

  let lista: ItemDaLista[] = [];
  try {
    lista = await listaDeCompras(client, projeto.id, dias);
  } catch (erro) {
    erros.push((erro as Error).message);
  }

  const prateleiras = resumirPrateleiras(linhas, janelaEmDias);
  const comFoto = new Set(prateleiras.map((p) => p.tag));
  return {
    modo: capacidadeDoAcervo(projeto),
    total: linhas.length,
    livres: prateleiras.reduce((s, p) => s + p.livres, 0),
    janelaEmDias,
    prateleiras,
    tagsSemFoto: TAGS_DO_CATALOGO.filter((t) => !comFoto.has(t)).length,
    tagsNoCatalogo: TAGS_DO_CATALOGO.length,
    listaDeCompras: lista,
    erros,
  };
}
