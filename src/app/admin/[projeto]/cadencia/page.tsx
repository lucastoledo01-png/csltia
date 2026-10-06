import { EditorDeCadencia } from "./EditorDeCadencia";

/**
 * A cadência do projeto, editável (06/10/2026): dia, horário e volume de cada
 * canal, mais a produção e a aprovação, com a prévia da semana seguinte.
 *
 * Rota própria, como o acervo e os perfis de referência: outras frentes mexem
 * no `EspacoDoProjeto` ao mesmo tempo, e um endereço novo não disputa linha.
 */
export default async function PaginaDaCadencia({ params }: { params: Promise<{ projeto: string }> }) {
  const { projeto } = await params;
  return <EditorDeCadencia slug={projeto} />;
}
