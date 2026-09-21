import { EspacoDoProjeto } from "./EspacoDoProjeto";

/**
 * A área de um projeto, endereçável.
 *
 * O painel inteiro morava numa URL só, com a aba em estado de componente: não
 * dava para mandar a alguém o link dos logs, nem voltar para onde se estava
 * depois de recarregar. O projeto vai no caminho e a seção no hash.
 */
export default async function PaginaDoProjeto({
  params,
}: {
  params: Promise<{ projeto: string }>;
}) {
  const { projeto } = await params;
  return <EspacoDoProjeto slug={projeto} />;
}
