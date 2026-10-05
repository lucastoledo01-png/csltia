import { CANAIS, agendaDoCanal, diaDaSemana, lerCadencia, somarDiasIso, type Canal } from "./cadencia";
import { datasDoAno } from "./editorial/calendario";
import { zonedTimeToUtc } from "./time";
import type { Project } from "./projects";
import type { getSupabaseAdminClient } from "./supabase-admin";

/**
 * O calendário de conteúdo, SÓ LEITURA (PRD de 05/10/2026).
 *
 * Uma semana, de segunda a domingo, com três camadas por dia: o que a cadência
 * do projeto PLANEJA (os horários de cada canal), o que existe no banco para
 * aquele dia (edição, artigos, posts, com o status de cada um) e as datas do
 * `editorial/calendario.ts` que caem nele. Nada aqui grava: quem muda o plano
 * é a cadência do projeto, e quem muda a peça é a fila de aprovação.
 */

export type ItemDoDia = {
  canal: Canal;
  hora: string | null;
  titulo: string;
  status: string;
  id: string;
};

export type DiaDaSemanaNoCalendario = {
  data: string;
  diaDaSemana: number;
  planejado: Record<Canal, string[]>;
  itens: ItemDoDia[];
  datas: Array<{ nome: string; pais: string; tipo: string; peso: number }>;
};

/** A segunda-feira da semana que contém a data. */
export function inicioDaSemana(dataIso: string): string {
  const dia = diaDaSemana(dataIso);
  return somarDiasIso(dataIso, dia === 0 ? -6 : 1 - dia);
}

function horaLocal(iso: string | null | undefined, timezone: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false });
}

function dataLocal(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export type LinhasDaSemana = {
  edicoes: Array<{ id: string; edition_date: string; status: string; headline: string; subject: string }>;
  artigos: Array<{ id: string; slug: string; title: string; status: string; published_at: string | null }>;
  posts: Array<{
    id: string;
    title: string;
    status: string;
    scheduled_at: string | null;
    published_at: string | null;
    edition_date: string;
  }>;
};

/** Pura: monta a semana a partir das linhas já lidas. */
export function montarSemana(
  projeto: Pick<Project, "settings" | "timezone">,
  segunda: string,
  linhas: LinhasDaSemana,
): DiaDaSemanaNoCalendario[] {
  const tz = projeto.timezone;
  const dias: DiaDaSemanaNoCalendario[] = [];
  const anos = new Set([segunda.slice(0, 4), somarDiasIso(segunda, 6).slice(0, 4)]);
  const datasEditoriais = [...anos].flatMap((a) => datasDoAno(Number(a)));

  for (let i = 0; i < 7; i += 1) {
    const data = somarDiasIso(segunda, i);
    const planejado = Object.fromEntries(
      CANAIS.map((c) => [c, agendaDoCanal(projeto, c, data).map((a) => a.horaLocal)]),
    ) as Record<Canal, string[]>;

    const itens: ItemDoDia[] = [];
    for (const e of linhas.edicoes.filter((x) => x.edition_date === data)) {
      itens.push({ canal: "newsletter", hora: planejado.newsletter[0] ?? null, titulo: e.subject || e.headline, status: e.status, id: e.id });
    }
    for (const a of linhas.artigos.filter((x) => x.published_at && dataLocal(x.published_at, tz) === data)) {
      itens.push({ canal: "portal", hora: horaLocal(a.published_at, tz), titulo: a.title, status: a.status, id: a.id });
    }
    for (const p of linhas.posts) {
      const quando = p.published_at ?? p.scheduled_at;
      const dataDoPost = quando ? dataLocal(quando, tz) : p.edition_date;
      if (dataDoPost !== data) continue;
      itens.push({ canal: "instagram", hora: horaLocal(quando, tz), titulo: p.title, status: p.status, id: p.id });
    }
    itens.sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.canal.localeCompare(b.canal));

    dias.push({
      data,
      diaDaSemana: diaDaSemana(data),
      planejado,
      itens,
      datas: datasEditoriais
        .filter((d) => d.data === data)
        .map((d) => ({ nome: d.nome, pais: d.pais, tipo: d.tipo, peso: d.pesoParaOBrasileiro })),
    });
  }

  return dias;
}

type Cliente = ReturnType<typeof getSupabaseAdminClient>;

export async function calendarioDaSemana(cliente: Cliente, projeto: Project, qualquerDia: string) {
  const segunda = inicioDaSemana(qualquerDia);
  const domingo = somarDiasIso(segunda, 6);
  const deIso = zonedTimeToUtc(segunda, "00:00", projeto.timezone).toISOString();
  const ateIso = zonedTimeToUtc(somarDiasIso(segunda, 7), "00:00", projeto.timezone).toISOString();

  const [edicoes, artigos, agendados, publicados] = await Promise.all([
    cliente
      .from("news_editions")
      .select("id, edition_date, status, headline, subject")
      .eq("project_id", projeto.id)
      .gte("edition_date", segunda)
      .lte("edition_date", domingo),
    cliente
      .from("articles")
      .select("id, slug, title, status, published_at")
      .eq("project_id", projeto.id)
      .gte("published_at", deIso)
      .lt("published_at", ateIso),
    cliente
      .from("social_posts")
      .select("id, title, status, scheduled_at, published_at, edition_date")
      .eq("project_id", projeto.id)
      .gte("scheduled_at", deIso)
      .lt("scheduled_at", ateIso),
    // Post publicado fora da vaga (atraso do worker) ainda é desta semana.
    cliente
      .from("social_posts")
      .select("id, title, status, scheduled_at, published_at, edition_date")
      .eq("project_id", projeto.id)
      .gte("published_at", deIso)
      .lt("published_at", ateIso),
  ]);

  const erros = [edicoes.error, artigos.error, agendados.error, publicados.error]
    .filter(Boolean)
    .map((e) => (e as { message: string }).message);

  const posts = new Map<string, LinhasDaSemana["posts"][number]>();
  for (const p of [...(agendados.data ?? []), ...(publicados.data ?? [])] as LinhasDaSemana["posts"]) posts.set(p.id, p);

  const { cadencia, avisos } = lerCadencia(projeto);

  return {
    segunda,
    domingo,
    erros,
    cadencia,
    avisosDaCadencia: avisos,
    dias: montarSemana(projeto, segunda, {
      edicoes: (edicoes.data ?? []) as LinhasDaSemana["edicoes"],
      artigos: (artigos.data ?? []) as LinhasDaSemana["artigos"],
      posts: [...posts.values()],
    }),
  };
}
