import { PortaoAdmin } from "@/components/admin/PortaoAdmin";
import { PainelDeAprendizado } from "@/components/admin/PainelDeAprendizado";

/**
 * O painel de aprendizado do projeto, numa URL própria (06/10/2026), como a
 * fila: o dono abre do celular para decidir as propostas da semana. A mesma
 * tela aparece como seção "Aprendizado" no espaço do projeto.
 */
export default async function PaginaDoAprendizado({ params }: { params: Promise<{ projeto: string }> }) {
  const { projeto } = await params;
  return (
    <PortaoAdmin>
      <PainelDeAprendizado slug={projeto} />
    </PortaoAdmin>
  );
}
