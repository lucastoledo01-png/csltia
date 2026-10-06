import type { Metadata } from "next";
import { PaginaDaMateria, type MateriaDaPagina } from "@/components/PaginaDaMateria";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarFilaStore } from "@/lib/server/aprovacao/fila-store";
import { projetoPeloSlug } from "@/lib/server/aprovacao/rotas";
import { sessaoDoPainelValida } from "@/lib/server/aprovacao/sessao-da-pagina";

/**
 * A matéria da fila desenhada como o leitor vai ver (06/10/2026).
 *
 * Usa `PaginaDaMateria`, o MESMO componente da rota `/artigos/[slug]`, com a
 * linha da tabela como ela está agora, em qualquer status. A rota pública só
 * serve `published` (`getArticleBySlug`), e é por isso que a matéria das 18:00
 * não tinha como ser vista antes da hora. Aqui ela é vista, só com a sessão
 * do painel, sem comentários e fora do índice.
 *
 * O que não entra: o "Leia também" calculado na hora para a matéria que
 * nasceu sem ele (a do ramo já o grava no corpo) e o crédito resolvido na
 * origem (a do ramo já grava o crédito). A prévia não faz chamada externa.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Prévia da matéria", robots: { index: false, follow: false } };

function Aviso({ texto }: { texto: string }) {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, color: "#3f3f46", fontSize: 14 }}>
      <p>{texto}</p>
    </main>
  );
}

export default async function PreviaDaMateria({
  params,
  searchParams,
}: {
  params: Promise<{ projeto: string; id: string }>;
  /** `?moldura=0`: só a matéria, para a prévia embutida no cartão. Sem o parâmetro, a página inteira do portal. */
  searchParams?: Promise<{ moldura?: string }>;
}) {
  if (!(await sessaoDoPainelValida())) {
    return <Aviso texto="Sessão do painel expirada. Entre de novo na fila de aprovação para ver a prévia." />;
  }

  const { projeto: slug, id } = await params;
  const projeto = await projetoPeloSlug(slug);
  if (!projeto) return <Aviso texto="Projeto não encontrado." />;

  const client = getSupabaseAdminClient();
  const aprovacao = await criarFilaStore(client).porId(id);
  if (!aprovacao || aprovacao.projectId !== projeto.id || aprovacao.ramo !== "artigo") {
    return <Aviso texto="Esta peça não é uma matéria da fila deste projeto." />;
  }

  const { data, error } = await client
    .from("articles")
    .select(
      "slug, title, description, excerpt, seo_title, seo_description, category, author, author_id, cover_image, published_at, updated_at, content_html, aeo_questions, tags",
    )
    .eq("id", aprovacao.pecaId)
    .eq("project_id", projeto.id)
    .maybeSingle();
  if (error) return <Aviso texto={`Não consegui ler a matéria: ${error.message}`} />;
  if (!data) return <Aviso texto="A matéria não existe mais na tabela." />;

  const moldura = (await searchParams)?.moldura !== "0";
  return <PaginaDaMateria article={data as unknown as MateriaDaPagina} comComentarios={false} moldura={moldura} />;
}
