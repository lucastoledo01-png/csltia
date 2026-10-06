import { capacidadeDeclarada, resolverCapacidade, type EstadoDaCapacidade } from "./capacidades";
import {
  agendaDoCanal,
  ambientePelaCadencia,
  cadenciaDoProjeto,
  decidirProducao,
  type DecisaoDeProducao,
} from "./cadencia";
import { DEFAULT_PROJECT_ID, projectToday, requireActiveProject, type Project } from "./projects";
import { getSupabaseAdminClient } from "./supabase-admin";
import type { RunNewsroomOptions } from "./newsroom/newsroom-service";
import { ligacoesDoCiclo, type LigacoesDoCiclo } from "./newsroom/ligacoes-do-ciclo";
import { modoDaFila } from "./aprovacao/modo";
import { limitesDoDia } from "./avisos/avisos";

/**
 * A produção na véspera (RF-01, PRD de 05/10/2026).
 *
 * Segunda a quinta, às 17:00, a redação produz TUDO do dia seguinte: a edição
 * da newsletter, o artigo do portal e os posts do Instagram, cada um com a hora
 * de ir ao ar marcada pela cadência do projeto. A noite fica para a aprovação,
 * e a manhã só publica.
 *
 * ## A regra que este módulo existe para cumprir
 *
 * TODO dia de produção deixa uma linha em `newsroom_runs`, qualquer que seja o
 * desfecho. É a lição de agosto e de setembro somadas: tabela vazia significou
 * cron morto em agosto e linha editorial funcionando em setembro, e nos dois
 * casos ninguém sabia qual era. A redação já grava sucesso, dia sem pauta e
 * falha; o que ela NÃO grava é ensaio, idempotência e o caso em que a própria
 * escrita do run falhou. Então, no fim, este módulo confere se a linha existe,
 * e grava uma se não existir. Conferir em vez de confiar é o ponto: cada
 * caminho novo da redação reintroduziria o buraco.
 *
 * ## O que NÃO muda enquanto a capacidade estiver desligada
 *
 * Nada. A rota das 17:00 grava a linha `cancelled` dizendo que a capacidade
 * está desligada e volta. O ciclo das 06:03 só passa a ceder quando a
 * capacidade `producao_vespera` está em `enforce` neste projeto
 * (`cicloDasSeisCede`).
 */

export type DesfechoDaProducao = {
  ok: boolean;
  projeto: string;
  modo: EstadoDaCapacidade;
  decisao: DecisaoDeProducao;
  /** O que a redação devolveu, quando rodou. */
  resultado?: unknown;
  erro?: string;
  /** A linha de garantia que este módulo gravou, quando gravou. */
  linhaDeGarantia?: string | null;
  /**
   * A newsletter do alvo foi barrada pelo QA, e só ela (06/10/2026). Posts e
   * matérias seguiram para a fila; o aviso `newsletter_ausente` sai daqui.
   */
  newsletterAusente?: { data: string; motivo: string };
};

type LinhaDoRun = {
  project_id: string;
  started_at: string;
  finished_at: string;
  status: "success" | "failed" | "cancelled";
  dry_run: boolean;
  error_message: string | null;
  idempotency_key: string;
};

export type DependenciasDaProducao = {
  agora?: () => Date;
  carregarProjeto?: (id: string) => Promise<Project>;
  rodarRedacao?: (
    options: RunNewsroomOptions,
    env: Record<string, string | undefined>,
  ) => Promise<unknown>;
  /** As ligações do ciclo real (perfis e fila). Ausente, as de verdade. Ver `ligacoes-do-ciclo.ts`. */
  ligacoes?: (projeto: Project, env: Record<string, string | undefined>) => Promise<LigacoesDoCiclo>;
  /** Existe alguma linha do run com este prefixo desde o início? */
  existeLinha?: (projetoId: string, prefixo: string, desdeIso: string) => Promise<boolean>;
  gravarLinha?: (linha: LinhaDoRun) => Promise<void>;
  env?: Record<string, string | undefined>;
};

/** O instante em hora curta, para a chave: `idempotency_key` é UNIQUE global. */
function carimbo(d: Date): string {
  return d.toISOString().replace(/\.\d+Z$/, "Z");
}

export function chaveDaEdicao(alvo: string): string {
  return `daily-edition-${alvo}`;
}

/** O modo da produção na véspera. Não declarada é `off`: nada muda sem alguém ligar. */
export function modoDaProducaoNaVespera(projeto: Pick<Project, "settings"> | null | undefined): EstadoDaCapacidade {
  return resolverCapacidade("producao_vespera", () => "off", projeto);
}

/**
 * O ciclo das 06:03 deve ceder para este projeto?
 *
 * Só em `enforce`. Em `dry_run` a produção das 17:00 é ensaio, e quem publica
 * o dia continua sendo o ciclo das 06:03. Projeto que não declara nada não
 * cede: é o que mantém o ciclo de amanhã igual ao de hoje no dia do deploy.
 */
export function cicloDasSeisCede(projeto: Pick<Project, "settings"> | null | undefined): boolean {
  return capacidadeDeclarada(projeto, "producao_vespera") === "enforce";
}

async function existeLinhaNoBanco(projetoId: string, prefixo: string, desdeIso: string): Promise<boolean> {
  const { count, error } = await getSupabaseAdminClient()
    .from("newsroom_runs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projetoId)
    .like("idempotency_key", `${prefixo}%`)
    .gte("created_at", desdeIso);
  // Não conseguir olhar NÃO é "não existe" (ver `projects.ts`, 13/09). Mas
  // aqui o custo dos dois erros é assimétrico: uma linha a mais de garantia é
  // ruído, uma linha a menos é um dia invisível. Então, na dúvida, grava.
  if (error) return false;
  return (count ?? 0) > 0;
}

async function gravarLinhaNoBanco(linha: LinhaDoRun): Promise<void> {
  const { error } = await getSupabaseAdminClient().from("newsroom_runs").insert(linha);
  if (error) throw new Error(error.message);
}

function resumoDoResultado(resultado: unknown): { status: LinhaDoRun["status"]; motivo: string } {
  const r = (resultado ?? {}) as Record<string, unknown>;
  if (r.ok === true) return { status: "success", motivo: "PRODUZIDO" };
  const reason = typeof r.reason === "string" ? r.reason : "desconhecido";
  if (reason === "already_executed_today") {
    return { status: "cancelled", motivo: "JA_PRODUZIDO: a edição deste dia já tinha um run de sucesso" };
  }
  const detalhe = typeof r.detail === "string" ? ` ${r.detail}` : "";
  return { status: "cancelled", motivo: `${reason.toUpperCase()}:${detalhe}` };
}

/**
 * Os horários de publicação da edição de `alvo`, pela cadência do projeto.
 *
 * Canal que não publica no alvo não tem horário. A newsletter cai no primeiro
 * horário do portal e vice-versa; sem nenhum dos dois, o portal sai junto do
 * primeiro post. Nunca "agora": publicar agora o conteúdo de amanhã é
 * exatamente o erro que a produção na véspera não pode cometer.
 *
 * Função própria desde 06/10/2026: a produção só da newsletter
 * (`produzirSoANewsletter`) precisa do MESMO horário que a véspera daria.
 */
export function agendamentoDaEdicao(
  projeto: Project,
  alvo: string,
): { newsletterEm: string; portalEm: string } {
  const newsletter = agendaDoCanal(projeto, "newsletter", alvo)[0];
  const portal = agendaDoCanal(projeto, "portal", alvo)[0];
  const primeiroPost = agendaDoCanal(projeto, "instagram", alvo)[0];
  const reserva = newsletter ?? portal ?? primeiroPost;
  return {
    newsletterEm: (newsletter ?? reserva).quandoIso,
    portalEm: (portal ?? reserva).quandoIso,
  };
}

/**
 * Roda a produção da véspera de um projeto.
 *
 * Nunca lança: todo desfecho, inclusive a falha, volta como dado e deixa
 * linha no banco. Quem chama (a rota) decide o alerta.
 */
export async function produzirNaVespera(
  projetoId: string = DEFAULT_PROJECT_ID,
  deps: DependenciasDaProducao = {},
): Promise<DesfechoDaProducao> {
  const agora = (deps.agora ?? (() => new Date()))();
  const inicioIso = agora.toISOString();
  const env = deps.env ?? process.env;
  const carregar = deps.carregarProjeto ?? requireActiveProject;
  const existeLinha = deps.existeLinha ?? existeLinhaNoBanco;
  const gravarLinha = deps.gravarLinha ?? gravarLinhaNoBanco;

  let projeto: Project;
  try {
    projeto = await carregar(projetoId);
  } catch (e) {
    // Sem projeto não há fuso nem cadência. A linha sai com a data UTC, que é
    // o melhor que existe, porque a alternativa é dia sem linha.
    const erro = e instanceof Error ? e.message : String(e);
    const hoje = agora.toISOString().slice(0, 10);
    let linhaDeGarantia: string | null = null;
    try {
      const chave = `producao-${hoje}#projeto-ilegivel-${carimbo(agora)}`;
      await gravarLinha({
        project_id: projetoId,
        started_at: inicioIso,
        finished_at: new Date().toISOString(),
        status: "failed",
        dry_run: false,
        error_message: `PRODUCAO_SEM_PROJETO: ${erro}`.slice(0, 2000),
        idempotency_key: chave,
      });
      linhaDeGarantia = chave;
    } catch (gravacao) {
      console.error("[PRODUCAO] nem a linha de falha foi gravada:", gravacao);
    }
    return {
      ok: false,
      projeto: projetoId,
      modo: "off",
      decisao: {
        produzir: false,
        motivo: "PRODUCAO_VESPERA_OFF",
        hoje,
        alvo: hoje,
        canais: [],
        explicacao: "projeto ilegível",
      },
      erro,
      linhaDeGarantia,
    };
  }

  const modo = modoDaProducaoNaVespera(projeto);
  const cadencia = cadenciaDoProjeto(projeto);
  const hoje = projectToday(projeto, agora);
  const decisao = decidirProducao(cadencia, hoje, modo !== "off");
  const chave = chaveDaEdicao(decisao.alvo);

  const garantir = async (
    status: LinhaDoRun["status"],
    motivo: string,
    prefixo: string,
    sufixo: string,
    ensaio: boolean,
  ): Promise<string | null> => {
    try {
      if (await existeLinha(projeto.id, prefixo, inicioIso)) return null;
      const idempotencyKey = `${prefixo}#${sufixo}-${carimbo(agora)}`;
      await gravarLinha({
        project_id: projeto.id,
        started_at: inicioIso,
        finished_at: new Date().toISOString(),
        status,
        dry_run: ensaio,
        error_message: motivo.slice(0, 2000),
        idempotency_key: idempotencyKey,
      });
      return idempotencyKey;
    } catch (e) {
      console.error("[PRODUCAO] linha de garantia não gravada:", e);
      return null;
    }
  };

  if (!decisao.produzir) {
    const linha = await garantir(
      "cancelled",
      `${decisao.motivo}: ${decisao.explicacao}`,
      `producao-${hoje}`,
      decisao.motivo.toLowerCase(),
      modo !== "enforce",
    );
    return { ok: true, projeto: projeto.slug, modo, decisao, linhaDeGarantia: linha };
  }

  const ensaio = modo === "dry_run";
  const agendamento = agendamentoDaEdicao(projeto, decisao.alvo);

  const options: RunNewsroomOptions = {
    projectId: projeto.id,
    dryRun: ensaio,
    publishToPortal: !ensaio && decisao.canais.includes("portal"),
    createNewsletterCampaign: !ensaio && decisao.canais.includes("newsletter"),
    autoSend: !ensaio,
    editionDate: decisao.alvo,
    idempotencyKey: chave,
    agendamento,
  };

  const rodar =
    deps.rodarRedacao ??
    (async (o: RunNewsroomOptions, e: Record<string, string | undefined>) => {
      const { runNewsroom } = await import("./newsroom/newsroom-service");
      return runNewsroom(o, e);
    });

  const envDaCadencia = ambientePelaCadencia(cadencia, env);

  /*
   * As ligações do ciclo de verdade (integração de 05/10/2026): perfis de
   * referência e fila de aprovação. Só fora do ensaio: em `dry_run` a redação
   * não chama `aoProduzirPeca`, e uma rodada de perfis a mais gravaria
   * leituras em dobro no dia. Falha aqui nunca segura a produção.
   */
  if (!ensaio) {
    try {
      const ligar = deps.ligacoes ?? ((p: Project, e: Record<string, string | undefined>) => ligacoesDoCiclo(p, { env: e }));
      Object.assign(options, await ligar(projeto, envDaCadencia));
    } catch (e) {
      console.error(`[PRODUCAO] ligações do ciclo não entraram: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Sem Instagram no alvo, o teto do dia é zero: o ciclo social roda a
  // verificação e não agenda nada, em vez de agendar posts para um dia que a
  // cadência deixou sem feed.
  if (!decisao.canais.includes("instagram")) envDaCadencia.SOCIAL_POSTS_MAX_PER_DAY = "0";

  try {
    const resultado = await rodar(options, envDaCadencia);
    const { status, motivo } = resumoDoResultado(resultado);
    const prefixo = ensaio ? `producao-${decisao.alvo}` : chave;
    const linha = await garantir(
      status,
      ensaio ? `ENSAIO ${motivo}` : `${motivo} (linha de garantia: a redação não gravou o próprio run)`,
      prefixo,
      ensaio ? "ensaio" : "garantia",
      ensaio,
    );
    return {
      ok: status !== "failed",
      projeto: projeto.slug,
      modo,
      decisao,
      resultado,
      linhaDeGarantia: linha,
    };
  } catch (e) {
    // O detalhe do bloqueio (o trecho reprovado e o motivo) entra junto. Em
    // ensaio a redação não grava a própria falha, e no primeiro ensaio, em
    // 05/10/2026, a linha ficou só com "1 conclusão", sem dizer qual.
    // Import dinâmico: este módulo só importa tipos da redação, e continua assim.
    const { detalheDoBloqueioDoErro, resumoDoBloqueio, motivoDoErro, MOTIVO_QA_BLOQUEOU } = await import(
      "./newsroom/newsroom-service"
    );
    const detalhe = detalheDoBloqueioDoErro(e);
    const erro =
      (e instanceof Error ? e.message : String(e)) + (detalhe ? `\n${resumoDoBloqueio(detalhe)}` : "");
    // A redação grava a própria falha (`registrarFalhaDaRedacao`), mas essa
    // gravação é melhor esforço. Se ela não estiver lá, esta está.
    const prefixo = ensaio ? `producao-${decisao.alvo}` : chave;
    const linha = await garantir("failed", `RUN_FAILED: ${erro}`, prefixo, ensaio ? "ensaio-falha" : "falha", ensaio);

    /*
     * Só a NEWSLETTER foi barrada (06/10/2026). O portão do QA sai por `throw`
     * no fim da redação, DEPOIS de o Instagram e o portal terem produzido e
     * enfileirado as peças deles. Tratar isso como "a produção falhou" mandava
     * um alerta crítico genérico e calava a fila pronta, e o dono não sabia
     * que tinha posts e matérias esperando, nem que faltava só a newsletter.
     *
     * Agora o desfecho é parcial: a linha `failed` do run continua gravada
     * (a edição de fato não saiu), e o aviso de operação diz qual newsletter
     * falta, por quê, e o comando que produz só ela. A fila pronta segue o
     * caminho de sempre com o que entrou.
     */
    if (motivoDoErro(e) === MOTIVO_QA_BLOQUEOU) {
      return {
        ok: true,
        projeto: projeto.slug,
        modo,
        decisao,
        erro,
        linhaDeGarantia: linha,
        newsletterAusente: { data: decisao.alvo, motivo: erro },
      };
    }
    return { ok: false, projeto: projeto.slug, modo, decisao, erro, linhaDeGarantia: linha };
  }
}

// ---------------------------------------------------------------------------
// Só a newsletter de uma edição (06/10/2026)
// ---------------------------------------------------------------------------

/**
 * Por que existe: em 06/10/2026 a produção das 17:00 escreveu e enfileirou os
 * posts e as matérias de 07/10, e a edição da newsletter foi barrada pelo QA
 * (risco de alucinação). A linha do run ficou `failed`, e com a fila em
 * `enforce` a newsletter do dia simplesmente não existiria. Rodar a produção
 * inteira de novo criaria posts e matérias em dobro.
 *
 * Esta função refaz SÓ a edição, pelo mesmo caminho da véspera: a mesma
 * redação (`runNewsroom` com `somenteNewsletter`), o mesmo horário da cadência
 * (`agendamentoDaEdicao`), a mesma entrada na fila e o mesmo Listmonk (que,
 * com a fila em `enforce`, só é chamado na liberação). Ensaio por padrão.
 *
 * O que ela NUNCA faz, por construção, e há teste de cada um: rodar o ciclo do
 * Instagram, rodar o ramo do portal, gravar a edição como artigo, chamar o
 * agendador legado de posts, ler os perfis de referência, ou mandar post e
 * matéria para a fila.
 */
export type PedidoDeSoNewsletter = {
  projetoId?: string;
  /** A data da edição, AAAA-MM-DD no fuso do projeto. */
  data: string;
  /** Sem isto é ensaio: nada é gravado, nada é enfileirado, nada é enviado. */
  aplicar?: boolean;
};

export type DesfechoDaSoNewsletter = {
  ok: boolean;
  projeto: string;
  data: string;
  aplicar: boolean;
  /** Por que não rodou, quando não rodou. */
  recusa?: string;
  agendamento?: { newsletterEm: string; portalEm: string };
  resultado?: unknown;
  erro?: string;
};

export type DependenciasDaSoNewsletter = {
  carregarProjeto?: (id: string) => Promise<Project>;
  rodarRedacao?: (
    options: RunNewsroomOptions,
    env: Record<string, string | undefined>,
  ) => Promise<unknown>;
  ligacoes?: (projeto: Project, env: Record<string, string | undefined>) => Promise<LigacoesDoCiclo>;
  /** A edição deste dia já está gravada em `news_editions`? */
  edicaoExistente?: (projetoId: string, data: string) => Promise<{ existe: boolean; erro?: string }>;
  /** Já existe linha de newsletter em `aprovacoes` com envio neste dia? */
  newsletterNaFila?: (projetoId: string, inicioIso: string, fimIso: string) => Promise<{ existe: boolean; erro?: string }>;
  env?: Record<string, string | undefined>;
};

/** A chave do run só da newsletter: prefixo do dia, para os leitores por prefixo a verem. */
export function chaveDaSoNewsletter(data: string): string {
  return `${chaveDaEdicao(data)}#so-newsletter`;
}

async function edicaoNoBanco(projetoId: string, data: string): Promise<{ existe: boolean; erro?: string }> {
  const { data: linhas, error } = await getSupabaseAdminClient()
    .from("news_editions")
    .select("id")
    .eq("project_id", projetoId)
    .eq("edition_date", data)
    .limit(1);
  // Não conseguir olhar NÃO é "não existe": aqui o erro barato é recusar,
  // porque gravar por cima da edição de alguém seria trocar o que está na fila.
  if (error) return { existe: false, erro: error.message };
  return { existe: (linhas ?? []).length > 0 };
}

async function newsletterNaFilaNoBanco(
  projetoId: string,
  inicioIso: string,
  fimIso: string,
): Promise<{ existe: boolean; erro?: string }> {
  const { data: linhas, error } = await getSupabaseAdminClient()
    .from("aprovacoes")
    .select("id")
    .eq("project_id", projetoId)
    .eq("ramo", "newsletter")
    .gte("publicar_em", inicioIso)
    .lt("publicar_em", fimIso)
    .limit(1);
  if (error) return { existe: false, erro: error.message };
  return { existe: (linhas ?? []).length > 0 };
}

export async function produzirSoANewsletter(
  pedido: PedidoDeSoNewsletter,
  deps: DependenciasDaSoNewsletter = {},
): Promise<DesfechoDaSoNewsletter> {
  const aplicar = pedido.aplicar === true;
  const env = deps.env ?? process.env;
  const projetoId = pedido.projetoId ?? DEFAULT_PROJECT_ID;
  const base = { projeto: projetoId, data: pedido.data, aplicar };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(pedido.data)) {
    return { ...base, ok: false, recusa: `data inválida: "${pedido.data}". Esperado AAAA-MM-DD.` };
  }

  const projeto = await (deps.carregarProjeto ?? requireActiveProject)(projetoId);
  const comProjeto = { ...base, projeto: projeto.slug };

  if (agendaDoCanal(projeto, "newsletter", pedido.data).length === 0) {
    return { ...comProjeto, ok: false, recusa: `a cadência do projeto não publica newsletter em ${pedido.data}.` };
  }

  /*
   * A edição gravada é a que está (ou esteve) na fila. Gravar outra por cima
   * trocaria o assunto e o HTML de uma peça que alguém pode ter aprovado, e o
   * upsert de `news_editions` casa por (projeto, data). Só no `--aplicar`: o
   * ensaio não grava, então pode rodar com a edição já lá, para comparar.
   */
  if (aplicar) {
    /*
     * Só com a fila em `enforce`. É ela que garante que nada sai antes da
     * aprovação: com a fila em `enforce` a redação NÃO chama o Listmonk, e a
     * campanha só nasce na liberação. Fora dele a redação dispararia (ou
     * agendaria) a campanha sozinha, e "refazer a newsletter" viraria enviar.
     */
    if (modoDaFila(projeto) !== "enforce") {
      return {
        ...comProjeto,
        ok: false,
        recusa: `a fila de aprovação do projeto não está em enforce (${modoDaFila(projeto)}): sem ela, a edição seria enviada sem aprovação.`,
      };
    }
    // Uma newsletter na fila para o dia (aguardando, aprovada ou já liberada) é a do dia: não se cria outra.
    const { inicioIso, fimIso } = limitesDoDia(pedido.data, projeto.timezone);
    const naFila = await (deps.newsletterNaFila ?? newsletterNaFilaNoBanco)(projeto.id, inicioIso, fimIso);
    if (naFila.erro) {
      return { ...comProjeto, ok: false, recusa: `não deu para conferir a fila de aprovação: ${naFila.erro}` };
    }
    if (naFila.existe) {
      return {
        ...comProjeto,
        ok: false,
        recusa: `já existe newsletter de ${pedido.data} na fila de aprovação. Nada foi feito.`,
      };
    }
    const existente = await (deps.edicaoExistente ?? edicaoNoBanco)(projeto.id, pedido.data);
    if (existente.erro) {
      return { ...comProjeto, ok: false, recusa: `não deu para conferir se a edição já existe: ${existente.erro}` };
    }
    if (existente.existe) {
      return {
        ...comProjeto,
        ok: false,
        recusa: `a edição de ${pedido.data} já está gravada em news_editions. Nada foi feito.`,
      };
    }
  }

  const agendamento = agendamentoDaEdicao(projeto, pedido.data);
  const options: RunNewsroomOptions = {
    projectId: projeto.id,
    dryRun: !aplicar,
    publishToPortal: false,
    createNewsletterCampaign: aplicar,
    autoSend: aplicar,
    editionDate: pedido.data,
    idempotencyKey: chaveDaSoNewsletter(pedido.data),
    agendamento,
    somenteNewsletter: true,
  };

  const envDaCadencia = ambientePelaCadencia(cadenciaDoProjeto(projeto), env);
  // Cinto: mesmo que algum caminho chegasse ao social, o teto do dia é zero.
  envDaCadencia.SOCIAL_POSTS_MAX_PER_DAY = "0";

  if (aplicar) {
    try {
      const ligar =
        deps.ligacoes ??
        ((p: Project, e: Record<string, string | undefined>) => ligacoesDoCiclo(p, { env: e, semPerfis: true }));
      const ligacoes = await ligar(projeto, envDaCadencia);
      // Só a fila. Candidata extra do Instagram não tem o que fazer aqui.
      if (ligacoes.aoProduzirPeca) options.aoProduzirPeca = ligacoes.aoProduzirPeca;
    } catch (e) {
      console.error(`[SO NEWSLETTER] ligação com a fila não entrou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const rodar =
    deps.rodarRedacao ??
    (async (o: RunNewsroomOptions, e: Record<string, string | undefined>) => {
      const { runNewsroom } = await import("./newsroom/newsroom-service");
      return runNewsroom(o, e);
    });

  try {
    const resultado = await rodar(options, envDaCadencia);
    const r = (resultado ?? {}) as Record<string, unknown>;
    return { ...comProjeto, ok: r.ok === true, agendamento, resultado };
  } catch (e) {
    const { detalheDoBloqueioDoErro, resumoDoBloqueio } = await import("./newsroom/newsroom-service");
    const detalhe = detalheDoBloqueioDoErro(e);
    const erro = (e instanceof Error ? e.message : String(e)) + (detalhe ? `\n${resumoDoBloqueio(detalhe)}` : "");
    return { ...comProjeto, ok: false, agendamento, erro };
  }
}
