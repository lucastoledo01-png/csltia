import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O plano do dia, gravado (29/10/2026). Uma linha por projeto e data em
 * `planos_do_dia`: a etapa em que o dia está, o plano proposto pelo Claude e o
 * estado da aprovação. É o que deixa o "faça o dia" retomar de onde parou
 * quando a conversa do Claude cai.
 */

export const ETAPAS_DO_DIA = ["triagem", "plano", "aguardando_aprovacao", "preparo", "producao", "pronto"] as const;
export type EtapaDoDia = (typeof ETAPAS_DO_DIA)[number];

export type EstadoDoPlano = "rascunho" | "aguardando" | "aprovado" | "reprovado";

export type ItensDoPlano = {
  newsletter: string[];
  artigos: string[];
  posts: string[];
  reels: string[];
  /** Uma frase por item, para o dono decidir: por que esta pauta, neste canal. */
  porque: Record<string, string>;
  /** O que fotografar quando a pauta não tem pessoa nem órgão: a busca em inglês e o objeto em português. */
  cenas: Record<string, { consulta: string; objeto: string }>;
  /**
   * O formato de cada post (09/11/2026): Reel de foto, o padrão desde 30/10, a
   * peça estática ou o carrossel de notícia (um por dia). Plano gravado antes
   * disso não tem o campo e sai estático.
   */
  formatos?: Record<string, FormatoDoPostDoClaude>;
  /**
   * As pautas que entraram FORA do plano proposto (10/11/2026): o complemento
   * do dia, pedido quando a aprovação deixou menos posts que o alvo, e o link
   * que o dono mandou ao Claude. Cada uma vira post, matéria e, se couber,
   * newsletter, e não passa de novo pela aprovação do plano: cada peça já
   * espera aprovação no painel.
   */
  extras?: string[];
};

const unicos = (lista: string[]) => [...new Set(lista)];

/** Os posts do dia: os do plano e os extras. */
export function postsDoPlano(itens: Pick<ItensDoPlano, "posts" | "extras">): string[] {
  return unicos([...itens.posts, ...(itens.extras ?? [])]);
}

/**
 * As matérias do dia (10/11/2026, regra do dono): todo post gerado pelo MCP
 * vira matéria do blog também, além das que o plano escolheu.
 */
export function artigosDoPlano(itens: Pick<ItensDoPlano, "artigos" | "posts" | "extras">): string[] {
  return unicos([...itens.artigos, ...postsDoPlano(itens)]);
}

/**
 * As pautas da newsletter (10/11/2026, regra do dono): as do plano primeiro,
 * depois todo post do dia, até o teto da cadência. O que passa do teto fica de
 * fora, por decisão do dono.
 */
export function newsletterDoPlano(itens: Pick<ItensDoPlano, "newsletter" | "posts" | "extras">, maximo: number): string[] {
  return unicos([...itens.newsletter, ...postsDoPlano(itens)]).slice(0, Math.max(0, maximo));
}

/** Toda pauta que o dia produz, em qualquer canal. */
export function pautasDoPlano(itens: ItensDoPlano): string[] {
  return unicos([...itens.newsletter, ...artigosDoPlano(itens)]);
}

export const FORMATOS_DO_POST = ["reel", "estatico", "carrossel"] as const;
export type FormatoDoPostDoClaude = (typeof FORMATOS_DO_POST)[number];

/**
 * O formato do post no plano. Imagem estática não sai mais (10/11/2026, decisão
 * do dono): o "estatico" de um plano antigo e o post sem formato saem em Reel de foto.
 */
export function formatoDoPost(itens: Pick<ItensDoPlano, "formatos">, storyId: string): FormatoDoPostDoClaude {
  const f = itens.formatos?.[storyId];
  return f === "carrossel" ? "carrossel" : "reel";
}

export const PLANO_VAZIO: ItensDoPlano = { newsletter: [], artigos: [], posts: [], reels: [], porque: {}, cenas: {} };

export type PlanoDoDia = {
  id: string;
  projectId: string;
  data: string;
  etapa: EtapaDoDia;
  estado: EstadoDoPlano;
  itens: ItensDoPlano;
  motivo: string | null;
  tarefaId: string | null;
  atualizadoEm: string;
};

export type PlanosStore = {
  /** O plano do dia; cria em `triagem` se não existe. */
  doDia(projectId: string, data: string): Promise<PlanoDoDia>;
  porId(id: string): Promise<PlanoDoDia | null>;
  atualizar(id: string, campos: Partial<Pick<PlanoDoDia, "etapa" | "estado" | "itens" | "motivo" | "tarefaId">>): Promise<PlanoDoDia>;
  /** Os planos aprovados da janela, para não repetir pauta no mesmo canal (os extras contam como posts). */
  aprovadosDesde(projectId: string, desde: string): Promise<PlanoDoDia[]>;
};

type Linha = {
  id: string;
  project_id: string;
  data: string;
  etapa: EtapaDoDia;
  estado: EstadoDoPlano;
  itens: Partial<ItensDoPlano> | null;
  motivo: string | null;
  tarefa_id: string | null;
  atualizado_em: string;
};

function daLinha(l: Linha): PlanoDoDia {
  return {
    id: l.id,
    projectId: l.project_id,
    data: l.data,
    etapa: l.etapa,
    estado: l.estado,
    itens: { ...PLANO_VAZIO, ...(l.itens ?? {}) },
    motivo: l.motivo,
    tarefaId: l.tarefa_id,
    atualizadoEm: l.atualizado_em,
  };
}

export function planosSupabase(client: SupabaseClient): PlanosStore {
  const tabela = () => client.from("planos_do_dia");
  async function um(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<PlanoDoDia | null> {
    const { data, error } = await q;
    if (error) throw new Error(`planos_do_dia: ${error.message}`);
    return data ? daLinha(data as Linha) : null;
  }
  return {
    async doDia(projectId, data) {
      const { error } = await tabela().upsert({ project_id: projectId, data }, { onConflict: "project_id,data", ignoreDuplicates: true });
      if (error) throw new Error(`planos_do_dia: ${error.message}`);
      const plano = await um(tabela().select("*").eq("project_id", projectId).eq("data", data).maybeSingle());
      if (!plano) throw new Error("planos_do_dia: o plano do dia não foi criado");
      return plano;
    },
    porId: (id) => um(tabela().select("*").eq("id", id).maybeSingle()),
    async atualizar(id, campos) {
      const linha: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
      if (campos.etapa) linha.etapa = campos.etapa;
      if (campos.estado) linha.estado = campos.estado;
      if (campos.itens) linha.itens = campos.itens;
      if (campos.motivo !== undefined) linha.motivo = campos.motivo;
      if (campos.tarefaId !== undefined) linha.tarefa_id = campos.tarefaId;
      const plano = await um(tabela().update(linha).eq("id", id).select("*").single());
      if (!plano) throw new Error(`planos_do_dia: o plano ${id} não existe`);
      return plano;
    },
    async aprovadosDesde(projectId, desde) {
      const { data, error } = await tabela().select("*").eq("project_id", projectId).eq("estado", "aprovado").gte("data", desde);
      if (error) throw new Error(`planos_do_dia: ${error.message}`);
      return ((data ?? []) as Linha[]).map(daLinha);
    },
  };
}

export function planosEmMemoria(): PlanosStore & { todos: PlanoDoDia[] } {
  const todos: PlanoDoDia[] = [];
  let seq = 0;
  return {
    todos,
    async doDia(projectId, data) {
      let p = todos.find((x) => x.projectId === projectId && x.data === data);
      if (!p) {
        seq += 1;
        p = { id: `plano-${seq}`, projectId, data, etapa: "triagem", estado: "rascunho", itens: { ...PLANO_VAZIO }, motivo: null, tarefaId: null, atualizadoEm: new Date().toISOString() };
        todos.push(p);
      }
      return p;
    },
    porId: async (id) => todos.find((x) => x.id === id) ?? null,
    async atualizar(id, campos) {
      const p = todos.find((x) => x.id === id);
      if (!p) throw new Error(`plano ${id} não existe`);
      Object.assign(p, campos, { atualizadoEm: new Date().toISOString() });
      return p;
    },
    aprovadosDesde: async (projectId, desde) => todos.filter((p) => p.projectId === projectId && p.estado === "aprovado" && p.data >= desde),
  };
}
