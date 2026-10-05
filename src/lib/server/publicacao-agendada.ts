import { agendaDoCanal } from "./cadencia";
import { listProjects, projectToday, type Project } from "./projects";
import { cicloDasSeisCede } from "./producao-vespera";
import { getSupabaseAdminClient } from "./supabase-admin";

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
export function edicoesQueVenceram(
  projeto: Pick<Project, "settings" | "timezone">,
  edicoes: Array<{ id: string; edition_date: string }>,
  agora: Date,
): Array<{ id: string; edition_date: string }> {
  return edicoes.filter((e) => {
    const momento = momentoDaEdicao(projeto, e.edition_date);
    return momento !== null && Date.parse(momento) <= agora.getTime();
  });
}

export async function publicarDoProjeto(
  projeto: Project,
  agora: Date,
  cliente: Cliente = getSupabaseAdminClient(),
): Promise<PublicacaoDoProjeto> {
  const saida: PublicacaoDoProjeto = {
    projeto: projeto.slug,
    edicoesPublicadas: [],
    artigosPublicados: [],
    erros: [],
  };
  const agoraIso = agora.toISOString();
  const hoje = projectToday(projeto, agora);

  // 1. Edições aprovadas cuja hora chegou. Só até hoje: a de amanhã espera.
  const { data: edicoes, error: erroEdicoes } = await cliente
    .from("news_editions")
    .select("id, edition_date")
    .eq("project_id", projeto.id)
    .eq("status", "approved")
    .lte("edition_date", hoje);

  if (erroEdicoes) {
    saida.erros.push(`edições: ${erroEdicoes.message}`);
  } else {
    for (const e of edicoesQueVenceram(projeto, (edicoes ?? []) as Array<{ id: string; edition_date: string }>, agora)) {
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
  const { data: artigos, error: erroArtigos } = await cliente
    .from("articles")
    .update({ status: "published", updated_at: agoraIso })
    .eq("project_id", projeto.id)
    .eq("status", "scheduled")
    .lte("published_at", agoraIso)
    .select("slug");

  if (erroArtigos) saida.erros.push(`artigos: ${erroArtigos.message}`);
  else saida.artigosPublicados.push(...((artigos ?? []) as Array<{ slug: string }>).map((a) => a.slug));

  // 3. O que foi feito vai para o banco. Silêncio quando nada venceu: são
  // 1.440 chamadas por dia, e uma linha por minuto enterraria as que importam.
  if (saida.edicoesPublicadas.length + saida.artigosPublicados.length + saida.erros.length > 0) {
    const { error } = await cliente.from("platform_events").insert({
      project_id: projeto.id,
      event_type: "publicacao_agendada",
      payload: { ...saida, agora: agoraIso },
    });
    if (error) console.error(`[PUBLICACAO] evento não gravado: ${error.message}`);
  }

  return saida;
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
        erros: [e instanceof Error ? e.message : String(e)],
      });
    }
  }
  return saidas;
}
