import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetalhesDaReprovacao } from "../aprendizado/contrato";
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
  /**
   * O que a peça reprovada TINHA na etapa culpada (06/10/2026): a pauta, a
   * foto, a decisão de arte. É o que a seleção, o resolvedor e a arte do
   * canal aprendem a evitar. Vazio nas reprovações anteriores à migration
   * `20261006120000_aprendizado_da_fila`.
   */
  detalhes?: DetalhesDaReprovacao;
};

export type EstadoDaRegra = "proposta" | "aprovada" | "recusada";

/** De onde a proposta veio: o mesmo erro três vezes, ou o resumo semanal das edições à mão. */
export type OrigemDaRegra = "reprovacoes" | "edicoes";

export type RegraProposta = {
  id: string;
  projectId: string;
  /** A regra é de UM canal (06/10/2026), e nunca entra na voz de outro. */
  ramo: Ramo;
  etapa: Etapa;
  chave: string;
  regra: string;
  ocorrencias: number;
  exemplos: string[];
  origem: OrigemDaRegra;
  estado: EstadoDaRegra;
  decididoPor: string | null;
  decididoEm: string | null;
  createdAt: string;
};

/** Uma edição manual do texto na fila, antes e depois (06/10/2026). */
export type EdicaoDoEditor = {
  id: string;
  projectId: string;
  ramo: Ramo;
  pecaId: string;
  aprovacaoId: string | null;
  etapa: Etapa;
  antes: string;
  depois: string;
  editadoPor: string;
  criadoEm: string;
};

export type FiltroDasRegras = { ramo?: Ramo; etapa?: Etapa; estado?: EstadoDaRegra; origem?: OrigemDaRegra };

export type NovaProposta = Pick<
  RegraProposta,
  "projectId" | "ramo" | "etapa" | "chave" | "regra" | "ocorrencias" | "exemplos"
> & { origem?: OrigemDaRegra };

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
  /**
   * Reivindica uma refação, e só se ela ainda estiver como quem chama a viu
   * (06/10/2026).
   *
   * O relógio da fila roda a cada minuto e a reprovação dispara a refação logo
   * depois da resposta: os dois podem chegar à mesma linha. A condição é o
   * estado da linha (`refazendo`) mais o estado da refação dentro do `resumo`
   * (`na_fila`, ou `rodando` desde antes de um instante, que é o processo que
   * morreu no meio). Quem não vence não roda.
   *
   * `esperado.estado` "ausente" é a peça reprovada antes desta data, que ficou
   * em `refazendo` sem refação gravada.
   */
  reivindicarRefacao(
    id: string,
    esperado: { estado: "na_fila" | "rodando" | "ausente"; iniciadaAntesDe?: string },
    resumo: ResumoDaPeca,
  ): Promise<Aprovacao | null>;
  /** O que está na fila e ainda não saiu: aguardando, refazendo e aprovada sem liberação. */
  abertas(projectId: string): Promise<Aprovacao[]>;
  /**
   * As peças dos últimos dias em QUALQUER estado (06/10/2026), para os filtros
   * do painel: aprovadas, reprovadas, canceladas e as que já saíram. `abertas`
   * continua sendo o que o relógio da fila lê; esta é só do painel. Opcional
   * porque os dublês de teste antigos não a têm, e sem ela o painel mostra só
   * as abertas, como antes.
   */
  recentes?(projectId: string, desdeIso: string): Promise<Aprovacao[]>;
  /** Decididas desde `desdeIso`, para a taxa de aprovação sem retrabalho. */
  decididasDesde(projectId: string, desdeIso: string): Promise<Aprovacao[]>;
  registrarReprovacao(r: Omit<Reprovacao, "id" | "createdAt">): Promise<void>;
  /** As reprovações de UMA etapa de UM canal, mais recentes primeiro. Nunca mistura canais (06/10/2026). */
  reprovacoesDaEtapa(projectId: string, ramo: Ramo, etapa: Etapa, limite: number): Promise<Reprovacao[]>;
  /** As reprovações desde um instante, de um canal ou de todos (o painel de aprendizado). */
  reprovacoesDesde(projectId: string, desdeIso: string, limite: number, ramo?: Ramo): Promise<Reprovacao[]>;
  regras(projectId: string, filtro?: FiltroDasRegras): Promise<RegraProposta[]>;
  /**
   * Cria a proposta, ou atualiza a contagem se ela ainda for proposta. Nunca
   * ressuscita recusada, e nunca nasce aprovada: só o dono aprova, no painel.
   */
  proporRegra(p: NovaProposta): Promise<"criada" | "atualizada" | "ja_decidida">;
  decidirRegra(id: string, estado: "aprovada" | "recusada", quem: string): Promise<RegraProposta | null>;
  /** Grava o antes e o depois de uma edição manual (06/10/2026). */
  registrarEdicao(e: Omit<EdicaoDoEditor, "id" | "criadoEm">): Promise<void>;
  /** As edições desde um instante, mais recentes primeiro, de um canal ou de todos. */
  edicoesDesde(projectId: string, desdeIso: string, limite: number, ramo?: Ramo): Promise<EdicaoDoEditor[]>;
  /**
   * As peças de UM canal aprovadas pelo editor sem refação desde um instante,
   * mais recentes primeiro. O modo automático fica de fora: o exemplo é do
   * que o EDITOR aprovou olhando, e não do que a máquina deixou passar.
   */
  aprovadasSemRetrabalho(projectId: string, ramo: Ramo, desdeIso: string, limite: number): Promise<Aprovacao[]>;
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
    detalhes: l.detalhes && typeof l.detalhes === "object" ? (l.detalhes as DetalhesDaReprovacao) : {},
  };
}

/**
 * Regra com canal ilegível não é regra de canal nenhum: o `ramo` torto vira
 * `null` aqui, e quem monta o prompt filtra pelo canal, então ela nunca entra.
 * A migration de 06/10/2026 põe a coluna NOT NULL com CHECK; isto é o cinto.
 */
function linhaParaRegra(l: Linha): RegraProposta {
  const estado = l.estado === "aprovada" || l.estado === "recusada" ? l.estado : "proposta";
  return {
    id: String(l.id),
    projectId: String(l.project_id),
    ramo: (ehRamo(l.ramo) ? l.ramo : null) as Ramo,
    etapa: ehEtapa(l.etapa) ? l.etapa : "texto",
    chave: String(l.chave ?? ""),
    regra: String(l.regra ?? ""),
    ocorrencias: Number(l.ocorrencias ?? 0) || 0,
    exemplos: Array.isArray(l.exemplos) ? (l.exemplos as string[]) : [],
    origem: l.origem === "edicoes" ? "edicoes" : "reprovacoes",
    estado,
    decididoPor: texto(l.decidido_por),
    decididoEm: texto(l.decidido_em),
    createdAt: String(l.created_at ?? ""),
  };
}

function linhaParaEdicao(l: Linha): EdicaoDoEditor {
  return {
    id: String(l.id),
    projectId: String(l.project_id),
    ramo: ehRamo(l.ramo) ? l.ramo : "post",
    pecaId: String(l.peca_id ?? ""),
    aprovacaoId: texto(l.aprovacao_id),
    etapa: ehEtapa(l.etapa) ? l.etapa : "texto",
    antes: String(l.antes ?? ""),
    depois: String(l.depois ?? ""),
    editadoPor: String(l.editado_por ?? ""),
    criadoEm: String(l.criado_em ?? ""),
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

    async reivindicarRefacao(id, esperado, resumo) {
      let q = client
        .from("aprovacoes")
        .update({ resumo, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("estado", "refazendo");
      q =
        esperado.estado === "ausente"
          ? q.is("resumo->refacao", null)
          : q.eq("resumo->refacao->>estado", esperado.estado);
      if (esperado.iniciadaAntesDe) q = q.lt("resumo->refacao->>iniciadaEm", esperado.iniciadaAntesDe);
      const { data, error } = await q.select("*");
      if (error) falhou("reivindicar a refação", error.message);
      const linhas = (data ?? []) as Linha[];
      return linhas.length > 0 ? linhaParaAprovacao(linhas[0]) : null;
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

    async recentes(projectId, desdeIso) {
      const { data, error } = await client
        .from("aprovacoes")
        .select("*")
        .eq("project_id", projectId)
        .or(`publicar_em.gte.${desdeIso},updated_at.gte.${desdeIso}`)
        .order("publicar_em", { ascending: true, nullsFirst: false })
        .limit(300);
      if (error) falhou("listar as peças recentes", error.message);
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
        // Só quando há o que gravar: antes da migration de 06/10/2026 a coluna não existe.
        ...(r.detalhes && Object.keys(r.detalhes).length > 0 ? { detalhes: r.detalhes } : {}),
      });
      if (error) falhou("gravar a reprovação", error.message);
    },

    async reprovacoesDaEtapa(projectId, ramo, etapa, limite) {
      const { data, error } = await client
        .from("reprovacoes")
        .select("*")
        .eq("project_id", projectId)
        .eq("ramo", ramo)
        .eq("etapa", etapa)
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) falhou("ler a memória de reprovação", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaReprovacao);
    },

    async reprovacoesDesde(projectId, desdeIso, limite, ramo) {
      let q = client.from("reprovacoes").select("*").eq("project_id", projectId).gte("created_at", desdeIso);
      if (ramo) q = q.eq("ramo", ramo);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limite);
      if (error) falhou("ler as reprovações", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaReprovacao);
    },

    async regras(projectId, filtro = {}) {
      let q = client.from("regras_propostas").select("*").eq("project_id", projectId);
      if (filtro.ramo) q = q.eq("ramo", filtro.ramo);
      if (filtro.etapa) q = q.eq("etapa", filtro.etapa);
      if (filtro.estado) q = q.eq("estado", filtro.estado);
      if (filtro.origem) q = q.eq("origem", filtro.origem);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
      if (error) falhou("ler as regras", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaRegra);
    },

    async proporRegra(p) {
      const { data, error } = await client
        .from("regras_propostas")
        .select("id, estado")
        .eq("project_id", p.projectId)
        .eq("ramo", p.ramo)
        .eq("etapa", p.etapa)
        .eq("chave", p.chave)
        .maybeSingle();
      if (error) falhou("ler a proposta de regra", error.message);

      if (data) {
        // Recusada fica recusada, aprovada fica aprovada: só a proposta aberta conta de novo.
        if ((data as Linha).estado !== "proposta") return "ja_decidida";
        const { error: e2 } = await client
          .from("regras_propostas")
          .update({ ocorrencias: p.ocorrencias, exemplos: p.exemplos, updated_at: new Date().toISOString() })
          .eq("id", (data as Linha).id as string);
        if (e2) falhou("atualizar a proposta de regra", e2.message);
        return "atualizada";
      }

      const { error: e3 } = await client.from("regras_propostas").insert({
        project_id: p.projectId,
        ramo: p.ramo,
        etapa: p.etapa,
        chave: p.chave,
        regra: p.regra,
        ocorrencias: p.ocorrencias,
        exemplos: p.exemplos,
        origem: p.origem ?? "reprovacoes",
        // Sempre proposta: nada vira regra sem o dono aprovar no painel.
        estado: "proposta",
      });
      if (e3) falhou("gravar a proposta de regra", e3.message);
      return "criada";
    },

    async registrarEdicao(e) {
      const { error } = await client.from("edicoes_do_editor").insert({
        project_id: e.projectId,
        ramo: e.ramo,
        peca_id: e.pecaId,
        aprovacao_id: e.aprovacaoId,
        etapa: e.etapa,
        antes: e.antes,
        depois: e.depois,
        editado_por: e.editadoPor,
      });
      if (error) falhou("gravar a edição do editor", error.message);
    },

    async edicoesDesde(projectId, desdeIso, limite, ramo) {
      let q = client.from("edicoes_do_editor").select("*").eq("project_id", projectId).gte("criado_em", desdeIso);
      if (ramo) q = q.eq("ramo", ramo);
      const { data, error } = await q.order("criado_em", { ascending: false }).limit(limite);
      if (error) falhou("ler as edições do editor", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaEdicao);
    },

    async aprovadasSemRetrabalho(projectId, ramo, desdeIso, limite) {
      const { data, error } = await client
        .from("aprovacoes")
        .select("*")
        .eq("project_id", projectId)
        .eq("ramo", ramo)
        .eq("estado", "aprovada")
        .eq("refazimentos", 0)
        .eq("automatica", false)
        .gte("decidido_em", desdeIso)
        .order("decidido_em", { ascending: false })
        .limit(limite);
      if (error) falhou("ler as aprovadas sem retrabalho", error.message);
      return ((data ?? []) as Linha[]).map(linhaParaAprovacao);
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
