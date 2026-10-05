import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedTimeToUtc } from "../time";
import { MARCA } from "@/lib/marca";
import type { ProjetoComCapacidades } from "../capacidades";
import type { Artigo } from "./artigo";
import type { PecaPronta } from "./peca";

/**
 * A agenda do portal (RF-14): três horários, e só sai o que foi aprovado.
 *
 * Os horários de hoje são 06:07, 12:00 e 18:00, no fuso do projeto. A cadência
 * está sendo tornada configurável em paralelo (05/10/2026), e por isso a
 * leitura mora numa função só: quem fizer a cadência editável troca o corpo de
 * `horariosDoPortal` e nenhum chamador muda. Hoje ela aceita
 * `settings.cadencia.portal` quando é uma lista válida de "HH:MM", e cai nos
 * três de sempre em qualquer outro caso.
 *
 * A aprovação é a coluna que a tabela já tinha e ninguém usava:
 * `articles.manual_review_status` (`needs_review`, `approved`, `blocked`). O
 * artigo nasce `scheduled` com `needs_review`, com `published_at` no horário
 * dele. Ele só vira `published` quando alguém o aprovou E o horário chegou.
 * Artigo que ninguém aprovou não sai, nem atrasado.
 */
export const HORARIOS_PADRAO_DO_PORTAL = ["06:07", "12:00", "18:00"] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function horariosDoPortal(projeto?: ProjetoComCapacidades | null): string[] {
  const cadencia = (projeto?.settings as Record<string, unknown> | null | undefined)?.cadencia;
  const lista = cadencia && typeof cadencia === "object" ? (cadencia as Record<string, unknown>).portal : null;
  if (Array.isArray(lista) && lista.length > 0 && lista.every((h) => typeof h === "string" && HHMM.test(h))) {
    return [...(lista as string[])].sort();
  }
  return [...HORARIOS_PADRAO_DO_PORTAL];
}

/**
 * Um horário por artigo, na ordem da seleção.
 *
 * O primeiro artigo (o de maior nota) pega o primeiro horário. Mais artigos que
 * horários: os excedentes ficam no último, e não somem; a seleção já limita a
 * três, então isso só acontece se a cadência for encurtada.
 */
export function horariosDosArtigos(
  quantos: number,
  data: string,
  timezone: string,
  horarios: string[] = [...HORARIOS_PADRAO_DO_PORTAL],
): string[] {
  if (horarios.length === 0) return [];
  return Array.from({ length: quantos }, (_, i) =>
    zonedTimeToUtc(data, horarios[Math.min(i, horarios.length - 1)], timezone).toISOString(),
  );
}

/** Slug estável: o mesmo título no mesmo dia dá o mesmo slug, e o upsert não duplica. */
export function slugDoArtigo(titulo: string, data: string): string {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return `${base || "materia"}-${data}`;
}

export type ConteudoDoArtigo = {
  artigo: Artigo;
  html: string;
  categoria: string;
  fonte: { nome: string; url: string };
  sourceUrls: string[];
  capa: string | null;
  publicarEm: string;
  slug: string;
};

/**
 * Grava os artigos aprovados pelo auditor como agendados e à espera de
 * aprovação humana.
 *
 * Só o que passou no auditor do ramo chega aqui: peça reprovada não vira linha
 * em `articles`, porque a fila de aprovação não é lugar de consertar fato
 * inventado. Falha de gravação de um artigo não impede os outros.
 */
export async function gravarArtigosAgendados(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  pecas: Array<PecaPronta<ConteudoDoArtigo>>,
): Promise<{ gravados: string[]; erros: string[] }> {
  const gravados: string[] = [];
  const erros: string[] = [];

  for (const peca of pecas) {
    if (!peca.aprovadaPeloAuditor) continue;
    const c = peca.conteudo;
    const palavras = c.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    try {
      const { error } = await client.from("articles").upsert(
        {
          project_id: projectId,
          slug: c.slug,
          title: c.artigo.titulo,
          excerpt: c.artigo.subtitulo || c.artigo.descricao_seo,
          description: c.artigo.descricao_seo,
          cover_image: c.capa,
          content_html: c.html,
          content: c.artigo.secoes.map((s) => ({ heading: s.intertitulo, paragraphs: s.paragrafos })),
          status: "scheduled",
          manual_review_status: "needs_review",
          category: c.categoria,
          author: MARCA.nome,
          reading_minutes: Math.max(1, Math.ceil(palavras / 200)),
          seo_title: c.artigo.titulo_seo,
          seo_description: c.artigo.descricao_seo.slice(0, 160),
          aeo_questions: c.artigo.perguntas,
          source_urls: c.sourceUrls,
          tags: [c.categoria],
          canonical_url: `${MARCA.site}/artigos/${c.slug}`,
          published_at: c.publicarEm,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,slug" },
      );
      if (error) erros.push(`${c.slug}: ${error.message}`);
      else gravados.push(c.slug);
    } catch (erro) {
      erros.push(`${c.slug}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  return { gravados, erros };
}

/**
 * Publica o que está aprovado e cujo horário já chegou.
 *
 * As três condições estão no filtro do banco, e não num `if` depois de ler:
 * `scheduled`, `approved` e `published_at <= agora`. Um artigo que não
 * cumpra as três não é tocado, e a prova está no teste que oferece um de cada.
 */
export async function publicarArtigosAprovados(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  agora: Date = new Date(),
): Promise<{ publicados: string[]; erro: string | null }> {
  const { data, error } = await client
    .from("articles")
    .update({ status: "published", updated_at: agora.toISOString() })
    .eq("project_id", projectId)
    .eq("status", "scheduled")
    .eq("manual_review_status", "approved")
    .lte("published_at", agora.toISOString())
    .select("slug");

  if (error) return { publicados: [], erro: error.message };
  return { publicados: ((data ?? []) as Array<{ slug: string }>).map((r) => r.slug), erro: null };
}
