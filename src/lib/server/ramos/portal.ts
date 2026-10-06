import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedTimeToUtc } from "../time";
import { MARCA } from "@/lib/marca";
import type { ProjetoComCapacidades } from "../capacidades";
import { horariosDoPortal as horariosDaCadencia } from "../cadencia";
import { modoDaFila } from "../aprovacao/modo";
import { secoesParaConteudo, type Artigo } from "./artigo";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PecaPronta } from "./peca";
import type { ArtigoCandidato } from "../aprovacao/portao-do-portal";

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
/*
 * Correção de 05/10/2026, depois da integração: "alguém o aprovou" só existe
 * com a fila de aprovação em `enforce`. É a liberação da fila
 * (`despacharArtigo`, em `aprovacao/pecas-supabase.ts`) quem grava `approved`,
 * e ela só despacha em `enforce`. Com os ramos em `enforce` e a fila em `off`
 * ou `dry_run`, ninguém gravava `approved`, e o relógio exigia `approved`: a
 * matéria nascia `scheduled` e ficava assim para sempre, sem erro e sem
 * alerta. Fora de `enforce` a fila não é portão, então a matéria sai no
 * horário dela, como saía antes da fila existir. Só `blocked` continua
 * segurando, porque é uma decisão gravada por alguém.
 */
export type RevisaoExigida = "aprovada" | "nao_bloqueada";

/** A revisão que o projeto exige para a matéria sair: só a fila em `enforce` exige gente. */
export function revisaoExigidaPeloProjeto(projeto: ProjetoComCapacidades | null | undefined): RevisaoExigida {
  return modoDaFila(projeto) === "enforce" ? "aprovada" : "nao_bloqueada";
}
export const HORARIOS_PADRAO_DO_PORTAL = ["06:07", "12:00", "18:00"] as const;

/*
 * Na integração de 05/10/2026 a leitura passou a ser a de `cadencia.ts`, que é
 * a cadência configurável por projeto. Esta função fica como ponto de
 * entrada do ramo, para nenhum chamador mudar.
 */
export function horariosDoPortal(projeto?: ProjetoComCapacidades | null): string[] {
  return horariosDaCadencia(projeto);
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

/**
 * De onde a matéria saiu, guardado para a refação da fila de aprovação.
 *
 * Integração de 05/10/2026: a fila reprova o TEXTO ou a IMAGEM de uma matéria
 * e pede que só aquela etapa seja refeita (RF-22). Refazer o texto exige o
 * pacote factual e a classificação da pauta, e nenhum dos dois estava gravado
 * em lugar nenhum depois do ciclo. Sem isto, a refação teria de remontar a
 * pauta por fora, que é um segundo gerador do lado de fora do gerador.
 */
export type OrigemDoArtigo = {
  storyId: string;
  titulo: string;
  resumo: string;
  eixo: string;
  pais: string;
  atores: string[];
  lugares: string[];
  acontecimento: string[];
  fonteNome: string;
  fonteUrl: string;
  pacote: PacoteFactual;
};

export type ConteudoDoArtigo = {
  /** Ausente nas peças anteriores a 05/10/2026 e nos testes antigos. */
  origem?: OrigemDoArtigo;
  artigo: Artigo;
  html: string;
  categoria: string;
  fonte: { nome: string; url: string };
  sourceUrls: string[];
  capa: string | null;
  publicarEm: string;
  slug: string;
  /** Assuntos e entidades, no formato de `indexacao-do-artigo.ts`. Ausente nas peças antigas. */
  tags?: string[];
  /**
   * O pool aprovado do dia, por `storyId`, para a troca de pauta na fila de
   * aprovação (06/10/2026). Só referência: a troca relê as candidatas.
   */
  poolDoDia?: string[];
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
          content: secoesParaConteudo(c.artigo),
          status: "scheduled",
          manual_review_status: "needs_review",
          category: c.categoria,
          author: MARCA.nome,
          reading_minutes: Math.max(1, Math.ceil(palavras / 200)),
          seo_title: c.artigo.titulo_seo,
          seo_description: c.artigo.descricao_seo.slice(0, 160),
          aeo_questions: c.artigo.perguntas,
          source_urls: c.sourceUrls,
          tags: [c.categoria, ...(c.tags ?? [])],
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
export type PortaoDosArtigos = (
  candidatos: ArtigoCandidato[],
) => Promise<{ liberadas: ArtigoCandidato[]; seguradas: Array<{ rotulo: string; motivo: string }> }>;

export async function publicarArtigosAprovados(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  agora: Date = new Date(),
  /*
   * O portão da fila de aprovação (integração de 05/10/2026), só quando a
   * capacidade `aprovacao` não está em `off`. Ausente, a publicação é o
   * `update` de antes, numa consulta só, e nada mais é lido.
   */
  portao?: PortaoDosArtigos,
  /*
   * `aprovada` é a regra com gente no meio (fila em `enforce`);
   * `nao_bloqueada` é a regra sem portão humano. Quem decide é quem chama,
   * por `revisaoExigidaPeloProjeto`. O padrão é o mais restrito, para um
   * chamador esquecido segurar em vez de publicar.
   */
  revisao: RevisaoExigida = "aprovada",
): Promise<{ publicados: string[]; erro: string | null; segurados?: Array<{ rotulo: string; motivo: string }> }> {
  if (portao) return publicarPeloPortao(client, projectId, agora, portao, revisao);

  let escrita = client
    .from("articles")
    .update({ status: "published", updated_at: agora.toISOString() })
    .eq("project_id", projectId)
    .eq("status", "scheduled");
  escrita = revisao === "aprovada" ? escrita.eq("manual_review_status", "approved") : escrita.neq("manual_review_status", "blocked");
  const { data, error } = await escrita.lte("published_at", agora.toISOString()).select("slug");

  if (error) return { publicados: [], erro: error.message };
  return { publicados: ((data ?? []) as Array<{ slug: string }>).map((r) => r.slug), erro: null };
}

/**
 * As mesmas três condições, e entre ler e escrever, a pergunta ao portão.
 *
 * O `update` final repete as três condições e acrescenta o id: um artigo que
 * mudou de estado entre a leitura e a escrita não é tocado. A versão conferida
 * pelo portão é a que estava na linha no momento da leitura; se alguém a
 * regravar nesse intervalo, o próximo giro pergunta de novo.
 */
async function publicarPeloPortao(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  agora: Date,
  portao: PortaoDosArtigos,
  revisao: RevisaoExigida,
): Promise<{ publicados: string[]; erro: string | null; segurados: Array<{ rotulo: string; motivo: string }> }> {
  const agoraIso = agora.toISOString();
  let leitura = client
    .from("articles")
    .select("id, slug, title, content_html, cover_image")
    .eq("project_id", projectId)
    .eq("status", "scheduled");
  leitura = revisao === "aprovada" ? leitura.eq("manual_review_status", "approved") : leitura.neq("manual_review_status", "blocked");
  const { data: lidos, error: erroDeLeitura } = await leitura.lte("published_at", agoraIso);
  if (erroDeLeitura) return { publicados: [], erro: erroDeLeitura.message, segurados: [] };

  const { liberadas, seguradas } = await portao((lidos ?? []) as ArtigoCandidato[]);
  if (liberadas.length === 0) return { publicados: [], erro: null, segurados: seguradas };

  let escrita = client
    .from("articles")
    .update({ status: "published", updated_at: agoraIso })
    .eq("project_id", projectId)
    .eq("status", "scheduled");
  escrita = revisao === "aprovada" ? escrita.eq("manual_review_status", "approved") : escrita.neq("manual_review_status", "blocked");
  const { data, error } = await escrita
    .lte("published_at", agoraIso)
    .in(
      "id",
      liberadas.map((a) => a.id),
    )
    .select("slug");
  if (error) return { publicados: [], erro: error.message, segurados: seguradas };
  return { publicados: ((data ?? []) as Array<{ slug: string }>).map((r) => r.slug), erro: null, segurados: seguradas };
}
