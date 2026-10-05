import { PainelDoAcervo } from "./PainelDoAcervo";

/**
 * O acervo próprio do projeto: o que tem, o que está livre, o que falta.
 *
 * Página própria, e não seção do `EspacoDoProjeto`, em 05/10/2026: o painel
 * está sendo reorganizado por outra frente no mesmo dia, e um endereço novo
 * não disputa linha com ninguém. Quando o painel assentar, vira uma entrada do
 * menu apontando para cá.
 */
export default async function PaginaDoAcervo({ params }: { params: Promise<{ projeto: string }> }) {
  const { projeto } = await params;
  return <PainelDoAcervo slug={projeto} />;
}
