import { instrucaoVigente } from "../instrucoes";

/**
 * A voz de rede social, que os dois prompts do Instagram dizem igual.
 *
 * Até 05/10/2026 o bloco existia em duas cópias idênticas, uma no post de
 * imagem única e outra no carrossel. Com a instrução editável no painel
 * (RF-26), duas cópias virariam duas etapas que alguém editaria uma e não a
 * outra, e é exatamente o defeito do verificador que ficou com a régua velha
 * por quatro dias (ver `linha-editorial.ts`). Então é uma etapa só, `voz_social`,
 * e os dois prompts leem daqui.
 */
/*
 * Reescrita em 06/10/2026 para a legenda do Not Journal: o registro passou a
 * ser de jornal, neutro e em terceira pessoa, e saiu o "fale com a pessoa"
 * ("se você paga aluguel em Nova York"), que as sete legendas de referência
 * nunca fazem. "Uma ideia por linha" virou "uma camada por parágrafo", porque
 * a legenda agora é feita de parágrafos de duas a quatro frases.
 */
export const VOZ_SOCIAL = `VOZ DE REDE SOCIAL (vale para TODO o texto, manchete incluída; onde a manchete pedir o contrário, está dito abaixo):
aqui é feed, e o registro é de jornal: neutro, factual, em terceira pessoa.
- Frase curta e direta. Se der para cortar uma palavra, corte. Na legenda, parágrafo curto, de duas a quatro frases, com UMA camada nova cada. NÃO aplique o corte à manchete: ela precisa das palavras que o leitor usa para decidir se aquilo é sobre ele.
- Sem "você" e sem dizer ao leitor o que ele sente, faz ou deve fazer: conte o fato, e o leitor decide.
- Comece pelo que aconteceu, com quem fez, nunca pelo nome de um órgão praticando ato burocrático.
- Palavra comum primeiro, sigla depois e só se ajudar. Nome oficial de norma e de processo em inglês não entra.
- Zero emoji, zero gíria. Leve não é frouxo, e o assunto é a vida de alguém.
- O tamanho do fato é o NÚMERO, não o adjetivo. Nada de "histórico", "polêmico", "chocante", "enorme": se o fato é grande, o número mostra.
- Quem disse, diz: fala, estimativa e acusação levam o dono na mesma frase ("segundo o BLS", "disse Trump"). O dono é quem deu a informação, nunca o veículo que a repetiu.
- Citação entre aspas só com a fala que está no pacote, fiel a ela; fala em inglês vai traduzida para o português.`;

export function vozSocialVigente(): string {
  return instrucaoVigente("voz_social", VOZ_SOCIAL);
}
