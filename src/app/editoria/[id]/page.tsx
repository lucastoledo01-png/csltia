import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaDaEditoria } from "@/components/PaginaDaEditoria";
import { editoriaPeloId, hrefDaEditoria } from "@/lib/editorias";
import { MARCA } from "@/lib/marca";
import { dadosEstruturadosDaEditoria, jsonLdSeguro } from "@/lib/server/dados-estruturados-do-artigo";
import { pautasDaEditoria, pautasRecentes } from "@/lib/server/portal";
import { DEFAULT_PROJECT_ID, getProjectById } from "@/lib/server/projects";
import { modoDosRamos } from "@/lib/server/ramos/modo";

/**
 * A página de uma editoria (05/10/2026): as pautas dela, da mais recente para
 * a mais antiga, no mesmo card do feed "Últimas notícias" da home.
 *
 * Por requisição, como a home, e pelo mesmo motivo: o build na VPS não tem as
 * variáveis do banco, e a página gerada ali nasceria vazia a cada deploy (o
 * incidente "O portal nascia vazio a cada deploy").
 */
export const dynamic = "force-dynamic";

/** Quantas edições a página lê. Ela filtra por editoria, então lê mais que a home. */
const EDICOES_LIDAS = 90;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const editoria = editoriaPeloId(id);
  if (!editoria) return {};
  const url = `${MARCA.site}${hrefDaEditoria(editoria.id)}`;
  return {
    title: `${editoria.nome} | ${MARCA.nome}`,
    description: editoria.descricao,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title: `${editoria.nome} | ${MARCA.nome}`,
      description: editoria.descricao,
      url,
      siteName: MARCA.nome,
      locale: "pt_BR",
    },
  };
}

export default async function EditoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const editoria = editoriaPeloId(id);
  if (!editoria) notFound();

  /*
   * A mesma leitura da home, com a mesma regra dos ramos. Banco fora do ar
   * não derruba a página: ela abre com o aviso de que não há matéria, e o
   * cabeçalho, o rodapé e a inscrição continuam de pé.
   */
  const projeto = await getProjectById(DEFAULT_PROJECT_ID).catch(() => null);
  const pautas = await pautasRecentes(DEFAULT_PROJECT_ID, 1000, {
    incluirArtigosDosRamos: modoDosRamos(process.env, projeto) === "enforce",
    timezone: projeto?.timezone,
    edicoes: EDICOES_LIDAS,
    artigos: 300,
  }).catch(() => []);

  const daEditoria = pautasDaEditoria(pautas, editoria.id);

  /*
   * CollectionPage com a lista do que a página mostra (auditoria de SEO,
   * 05/10/2026). Só matéria com página própria: o link de edição arquivada
   * redireciona e não é item da coleção.
   */
  const vistas = new Set<string>();
  const materias = daEditoria
    .filter((p) => p.href.startsWith("/artigos/") && !p.href.startsWith("/artigos/edicao-") && !vistas.has(p.href) && vistas.add(p.href))
    .map((p) => ({ url: `${MARCA.site}${p.href}`, titulo: p.titulo }));
  const dados = dadosEstruturadosDaEditoria(
    { nome: editoria.nome, descricao: editoria.descricao, url: `${MARCA.site}${hrefDaEditoria(editoria.id)}` },
    materias,
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSeguro(dados) }} />
      <PaginaDaEditoria editoria={editoria.id} pautas={daEditoria} />
    </>
  );
}
