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

/*
 * Vistos, Green Card e Fiscalização saíram em 05/10/2026, quando imigração
 * deixou a pauta. No lugar entraram as editorias que a classificação aprova
 * de verdade: economia, tecnologia e custo de vida.
 */
/*
 * A descrição de cada editoria aparece no card de "Seções em foco" e na
 * página dela (05/10/2026). É fixa, curta e segue a linha: o lado bom dos
 * EUA para quem sonha com eles, o lado que não vai bem no Brasil.
 */
export const EDITORIAS = [
  { id: "economia", nome: "Economia", descricao: "Juros, bolsa e empresas que fazem a economia americana crescer." },
  { id: "trabalho", nome: "Trabalho", descricao: "Vagas, salários e carreiras que estão em alta nos EUA." },
  { id: "tecnologia", nome: "Tecnologia", descricao: "IA, big techs e o que sai primeiro dos laboratórios americanos." },
  { id: "custo-de-vida", nome: "Custo de vida", descricao: "Moradia, preços e quanto custa viver em cada canto dos EUA." },
  { id: "governo", nome: "Política", descricao: "Casa Branca, Congresso e as decisões que mudam o país." },
  { id: "brasil", nome: "Brasil", descricao: "Juros, câmbio e contas públicas: o que pesa no bolso por aqui." },
] as const;

export type EditoriaId = (typeof EDITORIAS)[number]["id"];

export const EDITORIA_PADRAO: EditoriaId = "governo";

/**
 * Termos que apontam para cada editoria, do mais específico para o mais geral.
 *
 * A ordem importa: a primeira editoria que casa vence. Brasil vem antes de
 * tudo porque "inflação no Brasil" é pauta do Brasil, e não de economia.
 */
const SINAIS: Array<{ editoria: EditoriaId; termos: string[] }> = [
  { editoria: "brasil", termos: ["brasil", "câmbio", "dólar", "real"] },
  { editoria: "tecnologia", termos: ["tecnologia", "inteligência artificial", "startup", "aplicativo", "chip", "robô", "big tech"] },
  { editoria: "custo-de-vida", termos: ["custo de vida", "aluguel", "moradia", "imóve", "gasolina", "combustível", "energia", "plano de saúde"] },
  { editoria: "trabalho", termos: ["trabalho", "emprego", "empregador", "carreira", "profissional", "contrataç", "salário"] },
  { editoria: "economia", termos: ["economia", "juros", "fed", "inflação", "mercado", "bolsa", "pib", "investi", "empresa"] },
  { editoria: "governo", termos: ["governo", "congresso", "suprema corte", "justiça", "corte", "juiz", "decreto", "eleiç", "casa branca"] },
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

/** A editoria pelo id da URL, ou `null` quando o id não é de editoria nenhuma. */
export function editoriaPeloId(id: string): (typeof EDITORIAS)[number] | null {
  return EDITORIAS.find((e) => e.id === id) ?? null;
}

/** O endereço da página da editoria. */
export function hrefDaEditoria(id: EditoriaId): string {
  return `/editoria/${id}`;
}
