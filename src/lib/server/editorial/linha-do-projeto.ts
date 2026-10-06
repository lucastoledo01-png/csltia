/**
 * A linha do PROJETO, sem os textos dos prompts (06/10/2026).
 *
 * Separado de `linha-editorial.ts` porque `config.ts` precisa ler o modo e é
 * importado por meio repositório: o texto dos prompts arrasta `instrucoes.ts`
 * e o contexto assíncrono, e a config não deve pesar isso. Os textos ficam em
 * `linha-editorial.ts`, que reexporta tudo daqui.
 */

/**
 * A política brasileira, por projeto (`settings.linha.politica_brasileira`).
 *
 *   "so_mercado"  o comportamento de antes de 06/10/2026, e o padrão do código:
 *                 o Brasil entra pelo eixo do bolso e da instituição (`brasil`,
 *                 `economia`, `custo_de_vida`); disputa, fala e campanha não.
 *   "eleicao"     a abertura eleitoral de 06/10/2026: política brasileira e
 *                 eleição entram em qualquer tom, inclusive notícia e
 *                 bastidor de campanha do segundo turno. É TEMPORÁRIA: o dono
 *                 fecha depois do segundo turno trocando o valor no projeto
 *                 para "so_mercado" (ou apagando a chave).
 *   "fora"        o Brasil só entra pelo bolso (`economia`, `custo_de_vida`);
 *                 decisão institucional e política, nada.
 *
 * Valor ausente ou irreconhecível vale "so_mercado": um erro de digitação no
 * projeto não pode ABRIR a linha, só deixá-la como estava.
 */
export const MODOS_DA_POLITICA_BRASILEIRA = ["eleicao", "so_mercado", "fora"] as const;
export type PoliticaBrasileira = (typeof MODOS_DA_POLITICA_BRASILEIRA)[number];

export type LinhaDoProjeto = { politicaBrasileira: PoliticaBrasileira };

export const LINHA_PADRAO: LinhaDoProjeto = { politicaBrasileira: "so_mercado" };

export function linhaDoProjeto(projeto?: { settings?: Record<string, unknown> | null } | null): LinhaDoProjeto {
  const settings = projeto?.settings;
  const linha = settings && typeof settings === "object" ? (settings as Record<string, unknown>).linha : null;
  const bruto =
    linha && typeof linha === "object" && !Array.isArray(linha)
      ? (linha as Record<string, unknown>).politica_brasileira
      : null;
  const valor = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
  return (MODOS_DA_POLITICA_BRASILEIRA as readonly string[]).includes(valor)
    ? { politicaBrasileira: valor as PoliticaBrasileira }
    : LINHA_PADRAO;
}

/**
 * Os eixos em que a citação de famoso entra como formato. Fora deles a fala
 * volta a ser fala, com o teto de declaração de sempre: a fala do CEO sobre
 * imigração continua fora porque o eixo é `imigracao`, e a do chefe de governo
 * sobre segurança, porque segurança é fato, não fala.
 */
export const EIXOS_DA_CITACAO: ReadonlySet<string> = new Set([
  "economia",
  "trabalho",
  "tecnologia",
  "custo_de_vida",
  "politica",
  "brasil",
]);

/** Os eixos por onde a política brasileira entra em cada modo. */
export function eixosDoBrasil(linha: LinhaDoProjeto = LINHA_PADRAO): ReadonlySet<string> {
  if (linha.politicaBrasileira === "fora") return new Set(["economia", "custo_de_vida"]);
  if (linha.politicaBrasileira === "eleicao") return new Set(["brasil", "economia", "custo_de_vida", "politica"]);
  return new Set(["brasil", "economia", "custo_de_vida"]);
}
