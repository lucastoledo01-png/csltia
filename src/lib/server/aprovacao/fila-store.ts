import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ehEstado,
  ehEtapa,
  ehRamo,
  type Aprovacao,
  type AvisoDaPeca,
  type EstadoDaAprovacao,
  type Etapa,
  type Ramo,
  type ResumoDaPeca,
} from "./contrato";

/**
 * O acesso ao banco da fila, e nada além dele.
 *
 * Separado do serviço para que a regra (quem aprova, quando refaz, quando
 * descarta) seja testada contra uma memória, e o teste produza um "não" de
 * verdade sem rede. A implementação de memória mora em `fila-memoria.ts`.
 *
 * As três tabelas são novas, de 05/10/2026, e só existem depois de o dono rodar
 * `supabase/migrations/20261005120000_fila_de_aprovacao.sql`. Até lá a fila está
 * desligada em todo projeto (capacidade ausente vale `off`) e nada daqui é lido.
 */

export type NovaAprovacao = {
  projectId: string;
  ramo: Ramo;
  pecaId: string;
  hashArtefato: string;
  publicarEm: string | null;
  avisos: AvisoDaPeca[];
  resumo: ResumoDaPeca;
};

export type CamposDaAprovacao = Partial<
  Pick<
    Aprovacao,
    | "hashArtefato"
    | "publicarEm"
    | "estado"
    | "automatica"
    | "decididoPor"
    | "decididoEm"
    | "motivo"
    | "etapaCulpada"
    | "refazimentos"
    | "avisos"
    | "resumo"
    | "avisadoEm"
    | "liberadoEm"
  >
>;

export type Reprovacao = {
  id: string;
  projectId: string;
  aprovacaoId: string | null;
  ramo: Ramo;
  etapa: Etapa;
  motivo: string;
  textoReprovado: string;
  decididoPor: string;
  createdAt: string;
};

export type EstadoDaRegra = "proposta" | "aprovada" | "recusada";

export type RegraProposta = {
  id: string;
  projectId: string;
  etapa: Etapa;
  chave: string;
  regra: string;
  ocorrencias: number;
  exemplos: string[];
  estado: EstadoDaRegra;
  decididoPor: string | null;
  decididoEm: string | null;
  createdAt: string;
};

export type FilaStore = {
  porId(id: string): Promise<Aprovacao | null>;
  porPeca(projectId: string, ramo: Ramo, pecaId: string): Promise<Aprovacao | null>;
  inserir(nova: NovaAprovacao): Promise<Aprovacao>;
  /**
   * Atualiza só se o estado atual estiver em `seEstadoEm`.
   *
   * É a mesma ideia de `reivindicarVaga`: dois cliques de aprovar ao mesmo
   * tempo, ou um aprovar e um reprovar, não podem os dois vencer. Quem chega
   * depois não afeta linha nenhuma e recebe `null`.
   */
  atualizar(id: string, campos: CamposDaAprovacao, seEstadoEm?: EstadoDaAprovacao[]): Promise<Aprovacao | null>;
  /**
   * Marca a liberação ANTES do despacho, e só se ninguém marcou ainda.
   *
   * O clique de aprovar e o cron das 06:07 podem chegar juntos à mesma
   * newsletter, e dois despachos são dois e-mails na caixa de cada assinante.
   * Quem não vence a marcação não despacha.
   */
  reivindicarLiberacao(id: string, quandoIso: string): Promise<boolean>;
  /** Desfaz a marcação quando o despacho falhou, para o próximo ciclo tentar de novo. */
  soltarLiberacao(id: string): Promise<void>;
  /** O que está na fila e ainda não saiu: aguardando, refazendo e aprovada sem liberação. */
  abertas(projectId: string): Promise<Aprovacao[]>;
  /** Decididas desde `desdeIso`, para a taxa de aprovação sem retrabalho. */
  decididasDesde(projectId: string, desdeIso: string): Promise<Aprovacao[]>;
  registrarReprovacao(r: Omit<Reprovacao, "id" | "createdAt">): Promise<void>;
  reprovacoesDaEtapa(projectId: string, etapa: Etapa, limite: number): Promise<Reprovacao[]>;
  regras(projectId: string, filtro?: { etapa?: Etapa; estado?: EstadoDaRegra }): Promise<RegraProposta[]>;
  /** Cria a proposta, ou atualiza a contagem se ela ainda for proposta. Nunca ressuscita recusada. */
  proporRegra(p: Pick<RegraProposta, "projectId" | "etapa" | "chave" | "regra" | "ocorrencias" | "exemplos">): Promise<void>;
  decidirRegra(id: string, estado: "aprovada" | "recusada", quem: string): Promise<RegraProposta | null>;
};

type Linha = Record<string, unknown>;

function texto(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function linhaParaAprovacao(l: Linha): Aprovacao {
  const ramo = ehRamo(l.ramo) ? l.ramo : "post";
  const estado = ehEstado(l.estado) ? l.estado : "aguardando";
  return {
    id: String(l.id),
    projectId: String(l.project_id),
    ramo,
    pecaId: String(l.peca_id),
    hashArtefato: String(l.hash_artefato ?? ""),
    publicarEm: texto(l.publicar_em),
    estado,
    automatica: l.automatica === true,
    decididoPor: texto(l.decidido_por),
    decididoEm: texto(l.decidido_em),
    motivo: texto(l.motivo),
    etapaCulpada: ehEtapa(l.etapa_culpada) ? l.etapa_culpada : null,
    refazimentos: Number(l.refazimentos ?? 0) || 0,
    avisos: Array.isArray(l.avisos) ? (l.avisos as AvisoDaPeca[]) : [],
    resumo: l.resumo && typeof l.resumo === "object" ? (l.resumo as ResumoDaPeca) : {},
    avisadoEm: texto(l.avisado_em),
    liberadoEm: texto(l.liberado_em),
    createdAt: String(l.created_at ?? ""),
    updatedAt: String(l.updated_at ?? ""),
  };
}

const COLUNA: Record<keyof CamposDaAprovacao, string> = {
  hashArtefato: "hash_artefato",
  publicarEm: "publicar_em",
  estado: "estado",
  automatica: "automatica",
  decididoPor: "decidido_por",
  decididoEm: "decidido_em",
  motivo: "motivo",
  etapaCulpada: "etapa_culpada",
  refazimentos: "refazimentos",
  avisos: "avisos",
  resumo: "resumo",
  avisadoEm: "avisado_em",
  liberadoEm: "liberado_em",
};

export function camposParaColunas(campos: CamposDaAprovacao): Linha {
  const saida: Linha = {};
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue;
    saida[COLUNA[k as keyof CamposDaAprovacao]] = v;
  }
  return saida;
}

function linhaParaReprovacao(l: Linha): Reprovacao {
  return {
    id: String(l.id),
    projectId: String(l.project_id),
    aprovacaoId: texto(l.aprovacao_id),
    ramo: ehRamo(l.ramo) ? l.ramo : "post",
    etapa: ehEtapa(l.etapa) ? l.etapa : "texto",
    motivo: String(l.motivo ?? ""),
    textoReprovado: String(l.texto_reprovado ?? ""),
    decididoPor: String(l.decidido_por ?? ""),
    createdAt: String(l.created_at ?? ""),
  };
}

function linhaParaRegra(l: Linha): RegraProposta {
  const estado = l.estado === "aprovada" || l.estado === "recusada" ? l.estado : "proposta";
  return {
    id: String(l.id),
    projectId: String(l.project_id),
    etapa: ehEtapa(l.etapa) ? l.etapa : "texto",
    chave: String(l.chave ?? ""),
    regra: String(l.regra ?? ""),
    ocorrencias: Number(l.ocorrencias ?? 0) || 0,
    exemplos: Array.isArray(l.exemplos) ? (l.exemplos as string[]) : [],
    estado,
    decididoPor: texto(l.decidido_por),
    decididoEm: texto(l.decidido_em),
    createdAt: String(l.created_at ?? ""),
  };
}

/**
 * Falha de leitura sobe como exceção, nunca como "não achei".
 *
 * `if (error || !data)` é a armadilha registrada em `decisoes.md`: colapsa "a
 * peça não tem aprovação" com "não consegui olhar". Aqui as duas respostas têm
 * consequências opostas, porque "sem aprovação" segura o post e "não consegui
 * olhar" também deveria segurar, mas com alerta e não em silêncio.
 */
function falhou(onde: string, mensagem: string): never {
  throw new Error(`[FILA] ${onde}: ${mensagem}`);
}

export function criarFilaStore(client: SupabaseClient): FilaStore {
  return {
    async porId(id) {
      const { data, error } = await client.from("aprovacoes").select("*").eq("id", id).maybeSingle();
      if (error) falhou("ler aprovação", error.message);
      return data ? linhaParaAprovacao(data as Linha) : null;
    },

    async porPeca(projectId, ramo, pecaId) {
      const { data, error } = await client
        .from("aprovacoes")
        .select("*")
        .eq("project_id", projectId)
        .eq("ramo", ramo)
        .eq("peca_id", pecaId)
        .maybeSingle();
      if (error) falhou("ler aprovação da peça", error.message);
      return data ? linhaParaAprovacao(data as Linha) : null;
    },

    async inserir(nova) {
      const { data, error } = await client
        .from("aprovacoes")
        .insert({
          project_id: nova.projectId,
          ramo: nova.ramo,
          peca_id: nova.pecaId,
          hash_artefato: nova.hashArtefato,
          publicar_em: nova.publicarEm,
          estado: "aguardando",
          avisos: nova.avisos,
          resumo: nova.resumo,
        })
        .select("*")
        .single();
      if (error || !data) falhou("registrar na fila", error?.message ?? "sem linha devolvida");
      return linhaParaAprovacao(data as Linha);
    },

    async atualizar(id, campos, seEstadoEm) {
      let q = client
        .from("aprovacoes")
        .update({ ...camposParaColunas(campos), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (seEstadoEm && seEstadoEm.length > 0) q = q.in("estado", seEstadoEm);
      const { data, error } = await q.select("*");
      if (error) falhou("atualizar aprovação", error.message);
      const linhas = (data ?? []) as Linha[];
      return linhas.length > 0 ? linhaParaAprovacao(linhas[0]) : null;
    },

    async reivindicarLiberacao(id, quandoIso) {
      const { data, error } = await client
        .from("aprovacoes")
        .update({ liberado_em: quandoIso, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("estado", "aprovada")
        .is("liberado_em", null)
        .select("id");
      if (error) falhou("reivindicar a liberação", error.message);
      return ((data ?? []) as Linha[]).length > 0;
    },

    async soltarLiberacao(id) {
      const { error } = await client
        .from("aprovacoes")
        .update({ liberado_em: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) falhou("soltar a liberação", error.message);
    },

    async abertas(projectId) {
      const { data, error } = await client
        .from("aprovacoes")
        .select("*")
        .eq("project_id", projectId)
        .or("estado.in.(aguardando,refazendo),and(estado.eq.aprovada,liberado_em.is.null)")
        .order("publicar_em", { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) falhou("listar a fila", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaAprovacao);
    },

    async decididasDesde(projectId, desdeIso) {
      const { data, error } = await client
        .from("aprovacoes")
        .select("*")
        .eq("project_id", projectId)
        .in("estado", ["aprovada", "descartada"])
        .gte("decidido_em", desdeIso)
        .limit(2000);
      if (error) falhou("ler as decisões", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaAprovacao);
    },

    async registrarReprovacao(r) {
      const { error } = await client.from("reprovacoes").insert({
        project_id: r.projectId,
        aprovacao_id: r.aprovacaoId,
        ramo: r.ramo,
        etapa: r.etapa,
        motivo: r.motivo,
        texto_reprovado: r.textoReprovado,
        decidido_por: r.decididoPor,
      });
      if (error) falhou("gravar a reprovação", error.message);
    },

    async reprovacoesDaEtapa(projectId, etapa, limite) {
      const { data, error } = await client
        .from("reprovacoes")
        .select("*")
        .eq("project_id", projectId)
        .eq("etapa", etapa)
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) falhou("ler a memória de reprovação", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaReprovacao);
    },

    async regras(projectId, filtro = {}) {
      let q = client.from("regras_propostas").select("*").eq("project_id", projectId);
      if (filtro.etapa) q = q.eq("etapa", filtro.etapa);
      if (filtro.estado) q = q.eq("estado", filtro.estado);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
      if (error) falhou("ler as regras", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaRegra);
    },

    async proporRegra(p) {
      const { data, error } = await client
        .from("regras_propostas")
        .select("id, estado")
        .eq("project_id", p.projectId)
        .eq("etapa", p.etapa)
        .eq("chave", p.chave)
        .maybeSingle();
      if (error) falhou("ler a proposta de regra", error.message);

      if (data) {
        // Recusada fica recusada, aprovada fica aprovada: só a proposta aberta conta de novo.
        if ((data as Linha).estado !== "proposta") return;
        const { error: e2 } = await client
          .from("regras_propostas")
          .update({ ocorrencias: p.ocorrencias, exemplos: p.exemplos, updated_at: new Date().toISOString() })
          .eq("id", (data as Linha).id as string);
        if (e2) falhou("atualizar a proposta de regra", e2.message);
        return;
      }

      const { error: e3 } = await client.from("regras_propostas").insert({
        project_id: p.projectId,
        etapa: p.etapa,
        chave: p.chave,
        regra: p.regra,
        ocorrencias: p.ocorrencias,
        exemplos: p.exemplos,
      });
      if (e3) falhou("gravar a proposta de regra", e3.message);
    },

    async decidirRegra(id, estado, quem) {
      const { data, error } = await client
        .from("regras_propostas")
        .update({ estado, decidido_por: quem, decidido_em: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("estado", "proposta")
        .select("*");
      if (error) falhou("decidir a regra", error.message);
      const linhas = (data ?? []) as Linha[];
      return linhas.length > 0 ? linhaParaRegra(linhas[0]) : null;
    },
  };
}
