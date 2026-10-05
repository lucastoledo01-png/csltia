import { PortaoAdmin } from "@/components/admin/PortaoAdmin";
import { FilaDeAprovacao } from "@/components/admin/FilaDeAprovacao";

/**
 * A fila de aprovação do projeto, numa URL própria (05/10/2026, RF-24).
 *
 * Fora das abas do espaço do projeto de propósito: é a tela que o dono abre do
 * celular, de manhã, por um link guardado. Uma aba dentro do painel custaria um
 * toque a mais em cada aprovação, e o PRD pede no máximo três.
 */
export default async function PaginaDaFila({ params }: { params: Promise<{ projeto: string }> }) {
  const { projeto } = await params;
  return (
    <PortaoAdmin>
      <FilaDeAprovacao slug={projeto} />
    </PortaoAdmin>
  );
}
