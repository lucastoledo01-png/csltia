import { PerfisDeReferencia } from "./PerfisDeReferencia";

/**
 * Os perfis de referência do Instagram de um projeto (RF-16).
 *
 * Rota própria, e não uma seção nova dentro de `EspacoDoProjeto`, de
 * propósito em 05/10/2026: várias frentes do MVP mexem no menu do projeto ao
 * mesmo tempo, e uma rota separada entra sem disputar o mesmo arquivo.
 */
export default async function PaginaDosPerfis({ params }: { params: Promise<{ projeto: string }> }) {
  const { projeto } = await params;
  return <PerfisDeReferencia slug={projeto} />;
}
