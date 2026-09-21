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
 * banco; quem sabe alternar é esta função; e a separação é o que torna o
 * ritmo testável sem subir um Supabase.
 */

export type PedidoDeBolha = {
  /** Existe uma segunda foto aprovada, diferente da foto de fundo? */
  temSegundaFoto: boolean;
};

/**
 * Decide a bolha de cada peça da leva, na ordem em que elas vão ao ar.
 *
 * `ultimaPecaTeveBolha` é o estado que vem do feed: sem ele, cada leva
 * recomeçaria o ritmo do zero e duas capas com bolha se encostariam na virada
 * do dia, que é justamente onde o leitor percebe repetição.
 */
export function alternarBolha(
  pedidos: PedidoDeBolha[],
  ultimaPecaTeveBolha: boolean,
  /**
   * O molde da bolha está ligado no painel?
   *
   * Desligado, nenhuma peça leva bolha, e o ritmo nem é consultado: não há o
   * que alternar. A segunda foto continua sendo resolvida, porque ela também
   * serve de reserva quando a primeira falha no congelamento.
   */
  moldeLigado = true,
): boolean[] {
  const decisoes: boolean[] = [];
  let anteriorTeveBolha = ultimaPecaTeveBolha;

  for (const pedido of pedidos) {
    const leva = moldeLigado && pedido.temSegundaFoto && !anteriorTeveBolha;
    decisoes.push(leva);
    anteriorTeveBolha = leva;
  }

  return decisoes;
}

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
