import { PortalHome } from "@/components/PortalHome";
import { montarHome, pautasRecentes } from "@/lib/server/portal";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";

/**
 * A home não é pré-renderizada, e a razão é concreta.
 *
 * Com `revalidate = 300` ela era gerada no build e revalidada a cada cinco
 * minutos. O problema não é a janela: é que **o build não tem as variáveis do
 * banco**. O EasyPanel injeta o ambiente em execução, não na construção, então
 * a leitura falhava, o `catch` devolvia lista vazia, e a página nascia sem
 * notícia nenhuma. Em 16/09 o dono abriu o site depois de um deploy e viu
 * exatamente isso: portal no ar, zero matérias.
 *
 * Ela se curava sozinha na primeira visita depois dos cinco minutos, o que é
 * pior que falhar: o defeito aparecia para quem chegasse primeiro e sumia
 * antes de alguém conseguir olhar.
 *
 * O custo de renderizar por requisição é uma consulta de 0,3s numa página que
 * publica uma edição por dia. Um site de notícia vazio custa mais.
 */
export const dynamic = "force-dynamic";

/**
 * A home é um jornal, e a unidade dela é a pauta.
 *
 * Antes era uma landing de newsletter com um índice de edições. Quem chega
 * procurando "o que mudou no H1B" não encontrava nada: o assunto estava dentro
 * de uma edição chamada "edicao-2026-09-12", a quatro cliques de distância.
 *
 * Banco fora do ar não deixa a página em branco: sem pauta, o corpo não
 * renderiza os blocos e o cabeçalho, o rodapé e a inscrição continuam de pé.
 */
export default async function Home() {
  const pautas = await pautasRecentes(DEFAULT_PROJECT_ID).catch(() => []);

  return <PortalHome dados={montarHome(pautas)} />;
}
