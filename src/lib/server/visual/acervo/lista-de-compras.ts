import type { SupabaseClient } from "@supabase/supabase-js";
import { TABELA_DE_FALTAS, type MotivoDaFalta, type TipoDeFalta } from "./acervo";

/**
 * A lista de compras do acervo: o que foi pedido e não havia.
 *
 * Decisão de 29/09/2026: toda tag pedida e não atendida é gravada, e em uma
 * semana isso é a lista de produção ordenada por frequência, e não um chute
 * sobre o que fotografar. A contagem é por PAUTA distinta, porque a mesma
 * pauta resolvida duas vezes não é demanda dobrada (a tabela já tem unicidade
 * por pauta, e a soma aqui repete a regra por segurança).
 */

export type ItemDaLista = {
  tipo: TipoDeFalta;
  chave: string;
  pais: string;
  pautas: number;
  /** Quantas vezes faltou por não existir, e quantas por estar tudo na janela. */
  vazio: number;
  janela: number;
  ultimoPedido: string;
  exemplo: string;
};

type LinhaDeFalta = {
  story_id: string;
  tipo: TipoDeFalta;
  chave: string;
  pais: string;
  motivo: MotivoDaFalta;
  titulo: string | null;
  criado_em: string;
};

/** A agregação, separada da leitura para o teste não precisar de banco. */
export function agregarFaltas(linhas: LinhaDeFalta[]): ItemDaLista[] {
  const grupos = new Map<string, ItemDaLista & { _pautas: Set<string> }>();

  for (const l of linhas) {
    const chave = `${l.tipo}|${l.chave}|${l.pais}`;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        tipo: l.tipo,
        chave: l.chave,
        pais: l.pais,
        pautas: 0,
        vazio: 0,
        janela: 0,
        ultimoPedido: l.criado_em,
        exemplo: l.titulo ?? "",
        _pautas: new Set(),
      };
      grupos.set(chave, g);
    }
    if (g._pautas.has(l.story_id)) continue;
    g._pautas.add(l.story_id);
    g.pautas += 1;
    if (l.motivo === "janela") g.janela += 1;
    else g.vazio += 1;
    if (l.criado_em > g.ultimoPedido) {
      g.ultimoPedido = l.criado_em;
      if (l.titulo) g.exemplo = l.titulo;
    }
  }

  return [...grupos.values()]
    .map((g) => {
      const item: ItemDaLista & { _pautas?: Set<string> } = { ...g };
      delete item._pautas;
      return item as ItemDaLista;
    })
    .sort((a, b) => b.pautas - a.pautas || b.ultimoPedido.localeCompare(a.ultimoPedido));
}

export async function listaDeCompras(
  client: SupabaseClient,
  projectId: string,
  dias = 7,
  agoraMs = Date.now(),
): Promise<ItemDaLista[]> {
  const desde = new Date(agoraMs - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from(TABELA_DE_FALTAS)
    .select("story_id,tipo,chave,pais,motivo,titulo,criado_em")
    .eq("project_id", projectId)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`lista de compras, leitura falhou: ${error.message}`);
  return agregarFaltas((data ?? []) as LinhaDeFalta[]);
}
