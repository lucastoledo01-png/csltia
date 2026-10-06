import { agendaDoCanal } from "./cadencia";
import { avisarSemEsperar } from "./indexnow";
import { listProjects, projectToday, type Project } from "./projects";
import { cicloDasSeisCede } from "./producao-vespera";
import { getSupabaseAdminClient } from "./supabase-admin";
import { criarFilaStore, type FilaStore } from "./aprovacao/fila-store";
import {
  artigosLiberadosPeloPortao,
  edicoesLiberadasPeloPortao,
  portalPerguntaAFila,
  type ArtigoCandidato,
  type EdicaoCandidata,
} from "./aprovacao/portao-do-portal";
import { modoDosRamos } from "./ramos/modo";
import { revisaoExigidaPeloProjeto } from "./ramos/portal";

/**
 * O lado da publicação da produção na véspera (RF-01, 05/10/2026).
 *
 * A produção das 17:00 deixa tudo pronto e com hora marcada. Três canais, três
 * mecanismos, e só um deles precisa deste módulo:
 *
 *   newsletter   a campanha sai do Listmonk AGENDADA (`send_at`), e quem
 *                dispara na hora é o próprio Listmonk
 *   Instagram    o post é gravado `scheduled` com `scheduled_at`, e quem
 *                publica na hora é o worker, como sempre foi
 *   portal       a edição é gravada `approved` e o artigo `scheduled`; o
 *                portal só lista `published`, e ninguém virava a chave.
 *                Este módulo vira.
 *
 * Roda de minuto em minuto pelo cron (instrução no PR), e é idempotente: o que
 * já foi publicado não volta a ser tocado, e o que ainda não venceu espera.
 * Só age em projeto com `producao_vespera` em `enforce`; os demais continuam
 * publicando às 06:03, na hora em que produzem.
 *
 * Os horários vêm da cadência do projeto, nunca do código (RNF-08).
 */

export type PublicacaoDoProjeto = {
  projeto: string;
  edicoesPublicadas: string[];
  artigosPublicados: string[];
  /** O que venceu e o portão da fila segurou, com o motivo. Vazio com a fila em `off`. */
  seguradas: string[];
  erros: string[];
};

type Cliente = ReturnType<typeof getSupabaseAdminClient>;

/**
 * Quando a edição de uma data vai ao ar no portal.
 *
 * O primeiro horário do portal naquele dia; sem portal, o da newsletter, que é
 * quando o assinante recebe o link. `null` quando nenhum dos dois publica na
 * data: a edição fica esperando decisão humana em vez de sair num horário
 * inventado.
 */
export function momentoDaEdicao(projeto: Pick<Project, "settings" | "timezone">, dataIso: string): string | null {
  const portal = agendaDoCanal(projeto, "portal", dataIso)[0];
  const newsletter = agendaDoCanal(projeto, "newsletter", dataIso)[0];
  return portal?.quandoIso ?? newsletter?.quandoIso ?? null;
}

/** Quais edições `approved` já venceram. Pura, para o teste produzir o "não". */
export function edicoesQueVenceram<E extends { id: string; edition_date: string }>(
  projeto: Pick<Project, "settings" | "timezone">,
  edicoes: E[],
  agora: Date,
): E[] {
  return edicoes.filter((e) => {
    const momento = momentoDaEdicao(projeto, e.edition_date);
    return momento !== null && Date.parse(momento) <= agora.getTime();
  });
}

export type DependenciasDaPublicacao = {
  /** Quem lê a fila de aprovação. Ausente, a fila do banco. Injetável para o teste. */
  fila?: Pick<FilaStore, "porPeca">;
  env?: Record<string, string | undefined>;
};

export async function publicarDoProjeto(
  projeto: Project,
  agora: Date,
  cliente: Cliente = getSupabaseAdminClient(),
  deps: DependenciasDaPublicacao = {},
): Promise<PublicacaoDoProjeto> {
  const saida: PublicacaoDoProjeto = {
    projeto: projeto.slug,
    edicoesPublicadas: [],
    artigosPublicados: [],
    seguradas: [],
    erros: [],
  };
  const agoraIso = agora.toISOString();
  const hoje = projectToday(projeto, agora);

  /*
   * O portão único (integração de 05/10/2026). Este relógio virava a edição e
   * o artigo em `published` sem perguntar à fila, e era o único dos três
   * caminhos do portal que não perguntava. Com `aprovacao` fora de `off`, as
   * duas viradas passam por `decidirPublicacao`; em `off`, nada muda.
   */
  const perguntaAFila = portalPerguntaAFila(projeto);
  const fila = perguntaAFila ? (deps.fila ?? criarFilaStore(cliente)) : null;
  /*
   * Com os ramos em `enforce`, o artigo do portal nasce `scheduled` e
   * `needs_review` (`ramos/portal.ts`) e a regra do ramo é: só sai aprovado E
   * no horário. Este relógio publicava qualquer `scheduled` vencido, e com a
   * produção na véspera ligada junto dos ramos levaria ao ar, às 06:07, a
   * matéria que ninguém aprovou. A mesma regra de `publicarArtigosAprovados`
   * vale aqui.
   */
  /*
   * Correção de 05/10/2026: a revisão do ramo só existe com a fila em
   * `enforce`, porque é a liberação da fila que grava `approved`. Com a fila em
   * `off` ou `dry_run` e os ramos em `enforce`, exigir `approved` deixava a
   * matéria `scheduled` para sempre. Fora de `enforce` ela sai no horário,
   * como antes da fila, e só `blocked` segura.
   */
  const ramosNoComando = modoDosRamos(deps.env ?? process.env, projeto) === "enforce";
  const exigeRevisaoDoRamo = ramosNoComando && revisaoExigidaPeloProjeto(projeto) === "aprovada";
  const excluiBloqueado = ramosNoComando && !exigeRevisaoDoRamo;

  // 1. Edições aprovadas cuja hora chegou. Só até hoje: a de amanhã espera.
  const { data: edicoes, error: erroEdicoes } = await cliente
    .from("news_editions")
    .select(fila ? "id, edition_date, subject, content_html" : "id, edition_date")
    .eq("project_id", projeto.id)
    .eq("status", "approved")
    .lte("edition_date", hoje);

  if (erroEdicoes) {
    saida.erros.push(`edições: ${erroEdicoes.message}`);
  } else {
    let vencidas = edicoesQueVenceram(projeto, (edicoes ?? []) as unknown as EdicaoCandidata[], agora);
    if (fila) {
      const filtro = await edicoesLiberadasPeloPortao(projeto, vencidas, fila);
      for (const s of filtro.seguradas) saida.seguradas.push(`edição ${s.rotulo}: ${s.motivo}`);
      vencidas = filtro.liberadas;
    }
    for (const e of vencidas) {
      const { error } = await cliente
        .from("news_editions")
        .update({ status: "published", updated_at: agoraIso })
        .eq("id", e.id)
        // A condição repetida é a trava contra corrida: se a aprovação tirou a
        // edição de `approved` entre a leitura e esta escrita, nada acontece.
        .eq("status", "approved");
      if (error) saida.erros.push(`edição ${e.edition_date}: ${error.message}`);
      else saida.edicoesPublicadas.push(e.edition_date);
    }
  }

  // 2. Artigos agendados cuja hora chegou. A hora é a do próprio artigo.
  if (!fila && !exigeRevisaoDoRamo) {
    let escrita = cliente
      .from("articles")
      .update({ status: "published", updated_at: agoraIso })
      .eq("project_id", projeto.id)
      .eq("status", "scheduled");
    if (excluiBloqueado) escrita = escrita.neq("manual_review_status", "blocked");
    const { data: artigos, error: erroArtigos } = await escrita.lte("published_at", agoraIso).select("slug");

    if (erroArtigos) saida.erros.push(`artigos: ${erroArtigos.message}`);
    else saida.artigosPublicados.push(...((artigos ?? []) as Array<{ slug: string }>).map((a) => a.slug));
  } else {
    await publicarArtigosComPortao(cliente, projeto, agoraIso, exigeRevisaoDoRamo, excluiBloqueado, fila, saida);
  }

  // As matérias que entraram no ar agora: o IndexNow avisa sem segurar nada (06/10/2026).
  avisarSemEsperar(cliente, projeto.id, saida.artigosPublicados, "publicada pelo relógio da publicação");

  // 3. O que foi feito vai para o banco. Silêncio quando nada venceu: são
  // 1.440 chamadas por dia, e uma linha por minuto enterraria as que importam.
  // Segurada pela fila entra no evento: é a resposta para "por que não saiu às 06:07?".
  if (saida.edicoesPublicadas.length + saida.artigosPublicados.length + saida.erros.length + saida.seguradas.length > 0) {
    const { error } = await cliente.from("platform_events").insert({
      project_id: projeto.id,
      event_type: "publicacao_agendada",
      payload: { ...saida, agora: agoraIso },
    });
    if (error) console.error(`[PUBLICACAO] evento não gravado: ${error.message}`);
  }

  return saida;
}

/**
 * Os artigos vencidos, lidos primeiro e publicados por id, quando há regra a
 * conferir entre ler e escrever: a revisão do ramo e, ou, o portão da fila.
 * O `update` repete as condições, para quem mudou de estado no meio não ser
 * tocado.
 */
async function publicarArtigosComPortao(
  cliente: Cliente,
  projeto: Project,
  agoraIso: string,
  exigeRevisaoDoRamo: boolean,
  excluiBloqueado: boolean,
  fila: Pick<FilaStore, "porPeca"> | null,
  saida: PublicacaoDoProjeto,
): Promise<void> {
  let leitura = cliente
    .from("articles")
    .select("id, slug, title, content_html, cover_image")
    .eq("project_id", projeto.id)
    .eq("status", "scheduled")
    .lte("published_at", agoraIso);
  if (exigeRevisaoDoRamo) leitura = leitura.eq("manual_review_status", "approved");
  if (excluiBloqueado) leitura = leitura.neq("manual_review_status", "blocked");
  const { data: lidos, error: erroLeitura } = await leitura;
  if (erroLeitura) {
    saida.erros.push(`artigos: ${erroLeitura.message}`);
    return;
  }

  let liberados = (lidos ?? []) as unknown as ArtigoCandidato[];
  if (fila) {
    const filtro = await artigosLiberadosPeloPortao(projeto, liberados, fila);
    for (const s of filtro.seguradas) saida.seguradas.push(`artigo ${s.rotulo}: ${s.motivo}`);
    liberados = filtro.liberadas;
  }
  if (liberados.length === 0) return;

  let escrita = cliente
    .from("articles")
    .update({ status: "published", updated_at: agoraIso })
    .eq("project_id", projeto.id)
    .eq("status", "scheduled")
    .lte("published_at", agoraIso)
    .in(
      "id",
      liberados.map((a) => a.id),
    );
  if (exigeRevisaoDoRamo) escrita = escrita.eq("manual_review_status", "approved");
  if (excluiBloqueado) escrita = escrita.neq("manual_review_status", "blocked");
  const { data: artigos, error: erroArtigos } = await escrita.select("slug");
  if (erroArtigos) saida.erros.push(`artigos: ${erroArtigos.message}`);
  else saida.artigosPublicados.push(...((artigos ?? []) as Array<{ slug: string }>).map((a) => a.slug));
}

/** Todos os projetos ativos que publicam pela produção na véspera. */
export async function publicarOQueVenceu(agora: Date = new Date()): Promise<PublicacaoDoProjeto[]> {
  const projetos = (await listProjects(true)).filter(cicloDasSeisCede);
  const saidas: PublicacaoDoProjeto[] = [];
  for (const projeto of projetos) {
    try {
      saidas.push(await publicarDoProjeto(projeto, agora));
    } catch (e) {
      saidas.push({
        projeto: projeto.slug,
        edicoesPublicadas: [],
        artigosPublicados: [],
        seguradas: [],
        erros: [e instanceof Error ? e.message : String(e)],
      });
    }
  }
  return saidas;
}
