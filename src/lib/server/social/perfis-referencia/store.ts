import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatusDaLeitura } from "./graph";
import type { SinalViral } from "./engajamento";
import type { TopicoExtraido } from "./topico";

/**
 * Persistência dos perfis de referência e de cada leitura deles.
 *
 * Duas tabelas, criadas por `20261005150000_perfis_de_referencia.sql`:
 *
 *   instagram_reference_profiles   o cadastro, por projeto, editado no painel
 *   instagram_reference_readings   uma linha por leitura: o que foi lido,
 *                                  quando, o resultado, os sinais, os
 *                                  assuntos, o custo com etapa e ramo
 *
 * A segunda é o RNF-02: a leitura fica no banco, e não só no log do contêiner,
 * que o usuário `deploy` não alcança. Uma conta que virou pessoal aparece no
 * painel como "não encontrado ou não profissional" com a data, e não como um
 * perfil que simplesmente parou de trazer pauta.
 *
 * Remover um perfil não apaga as leituras dele: `profile_id` vira nulo e o
 * `handle` continua na linha. Auditoria que some junto com o cadastro não
 * responde à pergunta "por que tal pauta entrou naquele dia".
 */

export type PerfilDeReferencia = {
  id: string;
  projectId: string;
  handle: string;
  nota: string;
  ativo: boolean;
  criadoEm: string;
};

export type LeituraParaGravar = {
  projectId: string;
  profileId: string | null;
  handle: string;
  modo: "dry_run" | "enforce" | "manual";
  status: StatusDaLeitura;
  httpStatus: number | null;
  codigoDeErro: number | null;
  subcodigoDeErro: number | null;
  mensagemDeErro: string | null;
  seguidores: number | null;
  postsLidos: number;
  linhaDeBase: number | null;
  sinais: SinalViral[];
  topicos: TopicoExtraido[];
  candidatas: number;
  aprovadas: number;
  custoUsd: number;
  tokens: number;
  etapa: string;
  ramo: string;
  observacao: string | null;
};

export type UltimaLeitura = {
  handle: string;
  lidoEm: string;
  modo: string;
  status: StatusDaLeitura;
  mensagemDeErro: string | null;
  seguidores: number | null;
  postsLidos: number;
  sinais: SinalViral[];
  topicos: TopicoExtraido[];
  candidatas: number;
  aprovadas: number;
  custoUsd: number;
  observacao: string | null;
};

export const TABELA_PERFIS = "instagram_reference_profiles";
export const TABELA_LEITURAS = "instagram_reference_readings";

type LinhaDePerfil = {
  id: string;
  project_id: string;
  handle: string;
  note: string | null;
  enabled: boolean;
  created_at: string;
};

function doPerfil(l: LinhaDePerfil): PerfilDeReferencia {
  return {
    id: l.id,
    projectId: l.project_id,
    handle: l.handle,
    nota: l.note ?? "",
    ativo: Boolean(l.enabled),
    criadoEm: l.created_at,
  };
}

export type PerfisStore = {
  listar(projectId: string, apenasAtivos?: boolean): Promise<PerfilDeReferencia[]>;
  criar(projectId: string, handle: string, nota: string): Promise<PerfilDeReferencia>;
  atualizar(projectId: string, id: string, mudanca: { ativo?: boolean; nota?: string }): Promise<PerfilDeReferencia | null>;
  remover(projectId: string, id: string): Promise<boolean>;
  gravarLeituras(leituras: LeituraParaGravar[]): Promise<number>;
  ultimasLeituras(projectId: string, handles: string[]): Promise<Map<string, UltimaLeitura>>;
};

export function criarPerfisStore(client: SupabaseClient): PerfisStore {
  return {
    async listar(projectId, apenasAtivos = false) {
      let q = client
        .from(TABELA_PERFIS)
        .select("id, project_id, handle, note, enabled, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (apenasAtivos) q = q.eq("enabled", true);
      const { data, error } = await q;
      // Erro de leitura sobe: "não consegui olhar" não pode virar "não há
      // perfis", que é a lição do `if (error || !data)`.
      if (error) throw new Error(`perfis de referência, leitura falhou: ${error.message}`);
      return ((data ?? []) as LinhaDePerfil[]).map(doPerfil);
    },

    async criar(projectId, handle, nota) {
      const { data, error } = await client
        .from(TABELA_PERFIS)
        .insert({ project_id: projectId, handle, note: nota.slice(0, 500), enabled: true })
        .select("id, project_id, handle, note, enabled, created_at")
        .single();
      if (error) throw new Error(error.message);
      return doPerfil(data as LinhaDePerfil);
    },

    async atualizar(projectId, id, mudanca) {
      const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof mudanca.ativo === "boolean") campos.enabled = mudanca.ativo;
      if (typeof mudanca.nota === "string") campos.note = mudanca.nota.slice(0, 500);
      const { data, error } = await client
        .from(TABELA_PERFIS)
        .update(campos)
        .eq("project_id", projectId)
        .eq("id", id)
        .select("id, project_id, handle, note, enabled, created_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? doPerfil(data as LinhaDePerfil) : null;
    },

    async remover(projectId, id) {
      const { data, error } = await client
        .from(TABELA_PERFIS)
        .delete()
        .eq("project_id", projectId)
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },

    async gravarLeituras(leituras) {
      if (leituras.length === 0) return 0;
      const linhas = leituras.map((l) => ({
        project_id: l.projectId,
        profile_id: l.profileId,
        handle: l.handle,
        modo: l.modo,
        status: l.status,
        http_status: l.httpStatus,
        error_code: l.codigoDeErro,
        error_subcode: l.subcodigoDeErro,
        error_message: l.mensagemDeErro,
        followers_count: l.seguidores,
        posts_lidos: l.postsLidos,
        linha_de_base: l.linhaDeBase,
        sinais: l.sinais,
        topicos: l.topicos,
        candidatas: l.candidatas,
        aprovadas: l.aprovadas,
        custo_usd: Number(l.custoUsd.toFixed(6)),
        tokens: l.tokens,
        etapa: l.etapa,
        ramo: l.ramo,
        observacao: l.observacao,
      }));
      const { error } = await client.from(TABELA_LEITURAS).insert(linhas);
      if (error) throw new Error(`leituras de perfis, gravação falhou: ${error.message}`);
      return linhas.length;
    },

    async ultimasLeituras(projectId, handles) {
      const saida = new Map<string, UltimaLeitura>();
      if (handles.length === 0) return saida;
      /*
       * Uma consulta só, ordenada, e o primeiro de cada handle vence.
       *
       * O teto de linhas é generoso para o painel: com um ciclo por dia e uma
       * dezena de perfis, 300 linhas cobrem semanas. Um perfil que não aparece
       * nelas simplesmente mostra "sem leitura recente".
       */
      const { data, error } = await client
        .from(TABELA_LEITURAS)
        .select(
          "handle, read_at, modo, status, error_message, followers_count, posts_lidos, sinais, topicos, candidatas, aprovadas, custo_usd, observacao",
        )
        .eq("project_id", projectId)
        .in("handle", handles)
        .order("read_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(`leituras de perfis, leitura falhou: ${error.message}`);
      for (const l of (data ?? []) as Array<Record<string, any>>) {
        if (saida.has(l.handle)) continue;
        saida.set(l.handle, {
          handle: l.handle,
          lidoEm: l.read_at,
          modo: l.modo,
          status: l.status,
          mensagemDeErro: l.error_message ?? null,
          seguidores: l.followers_count ?? null,
          postsLidos: l.posts_lidos ?? 0,
          sinais: Array.isArray(l.sinais) ? l.sinais : [],
          topicos: Array.isArray(l.topicos) ? l.topicos : [],
          candidatas: l.candidatas ?? 0,
          aprovadas: l.aprovadas ?? 0,
          custoUsd: Number(l.custo_usd ?? 0),
          observacao: l.observacao ?? null,
        });
      }
      return saida;
    },
  };
}
