import { AutoresDoProjeto } from "./AutoresDoProjeto";

/**
 * Os autores do portal de um projeto (06/10/2026): cadastro, edição,
 * desativação e a atribuição do autor a cada matéria.
 *
 * Rota própria, como os perfis de referência, para não disputar o arquivo do
 * menu do projeto com as outras frentes; o menu ganha só o link.
 */
export default async function PaginaDosAutores({ params }: { params: Promise<{ projeto: string }> }) {
  const { projeto } = await params;
  return <AutoresDoProjeto slug={projeto} />;
}
