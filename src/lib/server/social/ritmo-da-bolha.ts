/**
 * Quando a capa leva a bolha, e quando ela não leva.
 *
 * A bolha é o círculo com a segunda foto. Ela funciona porque quebra o padrão
 * da capa: o olho encontra duas coisas em vez de uma. Um recurso que quebra
 * padrão só funciona enquanto for exceção, e quando ele aparece em todo post
 * ele VIRA o padrão, deixa de chamar atenção e o feed fica com cara de
 * template. Foi o que o dono apontou em 16/09/2026.
 *
 * Então a regra é de ritmo, e não de disponibilidade: ter a segunda foto é
 * condição necessária, não suficiente. Depois de uma capa com bolha vem uma
 * capa sem, mesmo que a segunda foto exista e seja boa.
 *
 * Este arquivo é puro de propósito. Quem sabe o que foi publicado ontem é o
 * banco; quem sabe alternar é `decidirBolha`; e a separação é o que torna o
 * ritmo testável sem subir um Supabase.
 */

/*
 * A alternância em si mora em `decidirBolha`, em `bolha-sem-rosto.ts`, desde
 * 06/10/2026. Ela era uma passada pura sobre a leva (`alternarBolha`), feita
 * antes do render, e isso deixou de servir: a vez de uma peça depende de a
 * ANTERIOR ter saído com bolha de verdade, e agora isso só se sabe depois de
 * localizar os rostos, achar a segunda foto e medir o círculo no render.
 *
 * O que mudou na regra, a pedido do dono: a alternância virou ALVO. Depois de
 * uma capa com bolha vem uma sem, como antes; e quando é a vez e ela não se
 * cumpre (sem segunda foto, sem posição livre de rosto), a vez passa para a
 * peça seguinte em vez de se perder.
 */

/**
 * A peça mais recente do feed teve bolha?
 *
 * Recebe as capas em ordem do mais novo para o mais antigo, como o banco
 * devolve. Sem histórico a resposta é `false`, e isso é deliberado: no
 * primeiro post da vida da conta, a bolha pode entrar.
 */
export function ultimaTeveBolha(historico: Array<{ bolha: boolean }>): boolean {
  return historico[0]?.bolha ?? false;
}
