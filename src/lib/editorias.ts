/**
 * As editorias do portal, e o mapa do que a redação escreve para elas.
 *
 * A redação escreve a categoria da pauta em texto livre, e ela é boa como
 * rótulo de uma matéria: "Boletim de vistos" diz mais que "Vistos". O que ela
 * não serve é para AGRUPAR: em 23 pautas publicadas apareceram 19 categorias
 * distintas, e seção com uma matéria cada não é seção.
 *
 * Então há duas camadas. O rótulo da pauta continua o que a redação escreveu,
 * e aparece no card. A editoria é um conjunto fixo, inferido do rótulo, e é
 * quem organiza a home.
 *
 * O conjunto é curto de propósito. Editoria que raramente tem matéria vira
 * bloco vazio na página, que é pior que não existir.
 */

export const EDITORIAS = [
  { id: "vistos", nome: "Vistos" },
  { id: "trabalho", nome: "Trabalho" },
  { id: "green-card", nome: "Green Card" },
  { id: "fiscalizacao", nome: "Fiscalização" },
  { id: "governo", nome: "Governo" },
  { id: "brasil", nome: "Brasil" },
] as const;

export type EditoriaId = (typeof EDITORIAS)[number]["id"];

export const EDITORIA_PADRAO: EditoriaId = "governo";

/**
 * Termos que apontam para cada editoria, do mais específico para o mais geral.
 *
 * A ordem importa: "green card profissional" tem que cair em Green Card, e não
 * em Trabalho por causa de "profissional". Por isso a busca é sequencial e a
 * primeira editoria que casa vence.
 */
const SINAIS: Array<{ editoria: EditoriaId; termos: string[] }> = [
  { editoria: "green-card", termos: ["green card", "residência permanente", "ajuste de status", "consular"] },
  { editoria: "fiscalizacao", termos: ["ice", "deportaç", "detenç", "fiscalizaç", "cbp", "fronteira"] },
  { editoria: "brasil", termos: ["brasil", "câmbio", "dólar", "real"] },
  { editoria: "vistos", termos: ["visto", "boletim", "h1b", "h-1b", "o-1", "eb-", "f-1", "j-1", "uscis", "família"] },
  { editoria: "trabalho", termos: ["trabalho", "emprego", "empregador", "carreira", "profissional", "contrataç"] },
  { editoria: "governo", termos: ["governo", "congresso", "suprema corte", "justiça", "corte", "juiz", "decreto"] },
];

/** A editoria de uma pauta, a partir do rótulo que a redação escreveu. */
export function editoriaDaPauta(rotulo: string, titulo = ""): EditoriaId {
  const texto = `${rotulo} ${titulo}`.toLowerCase();
  for (const { editoria, termos } of SINAIS) {
    if (termos.some((t) => texto.includes(t))) return editoria;
  }
  return EDITORIA_PADRAO;
}

export function nomeDaEditoria(id: EditoriaId): string {
  return EDITORIAS.find((e) => e.id === id)?.nome ?? "Notícias";
}
