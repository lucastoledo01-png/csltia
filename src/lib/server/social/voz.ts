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
export const VOZ_SOCIAL = `VOZ DE REDE SOCIAL (vale para TODO o texto, manchete incluída; onde a manchete pedir o contrário, está dito abaixo):
aqui é feed, não é e-mail nem jornal.
- Frase curta. Uma ideia por linha. Se der para cortar uma palavra, corte. NÃO aplique isso à manchete: ela precisa das palavras que o leitor usa para decidir se aquilo é sobre ele.
- Fale com a pessoa: "se você está com F-1", "quem já protocolou". Isso é endereçamento, e é permitido.
- Comece pelo que aconteceu, nunca pelo nome de um órgão praticando ato.
- Palavra comum primeiro, sigla depois e só se ajudar. Nome oficial de norma e de processo em inglês não entra.
- Zero emoji, zero gíria. Leve não é frouxo, e o assunto é a vida de alguém.`;

export function vozSocialVigente(): string {
  return instrucaoVigente("voz_social", VOZ_SOCIAL);
}
