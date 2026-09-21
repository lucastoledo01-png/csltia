import type { GramaticaDaCapa } from "./arte";
import { TODOS_OS_MOLDES, type MoldesLigados } from "./moldes-do-feed";

/**
 * Qual das duas gramáticas de capa cada peça usa.
 *
 * São duas, e a diferença não é de gosto. O JORNAL afirma: foto sangrando,
 * chapéu de editoria, manchete em caixa alta sobre o degradê. O RECORTE
 * comenta: fundo branco, autor no topo, texto corrido em caixa baixa, com a
 * foto como cartão no meio da fala.
 *
 * Decisão do dono em 17/09/2026: o EIXO decide, e a alternância é a rede.
 * O recorte estava pronto desde 16/09 e não entrava em nenhuma peça, porque
 * nenhum ponto da produção pedia a gramática e o padrão era "jornal".
 *
 * NÃO há sorteio, e isso é deliberado. O projeto já decide assim em outros
 * pontos: a proporção de CTA vem da posição do post no dia, e o ritmo da bolha
 * vem do feed. Com sorteio, um dia sai com seis recortes seguidos e não há
 * como saber se foi acaso ou defeito; com alternância derivada, sabe-se.
 */

/**
 * Os eixos que COMENTAM.
 *
 * Custo de vida, trabalho, cultura e tecnologia chegam como leitura da
 * realidade: o que ficou mais caro, o que mudou na profissão, o que a
 * ferramenta nova faz. O recorte serve isso, porque ele é uma fala.
 *
 * Fora daqui ficam os eixos que AFIRMAM um fato com data e efeito: política,
 * segurança, imigração e economia. Uma decisão judicial, um prazo que muda, o
 * Fed mexendo no juro. Esses pedem a peça que afirma, não a que comenta.
 *
 * "brasil" e "outro" caem no jornal pelo mesmo motivo: sem sinal claro, a
 * gramática que aceita qualquer tamanho de texto é a escolha segura.
 */
const EIXOS_QUE_COMENTAM = new Set(["custo_de_vida", "trabalho", "cultura", "tecnologia"]);

export function gramaticaDoEixo(eixo: string | null | undefined): GramaticaDaCapa {
  return EIXOS_QUE_COMENTAM.has((eixo ?? "").trim()) ? "recorte" : "jornal";
}

/**
 * Quantos recortes seguidos o feed aguenta antes de exigir um jornal.
 *
 * Dois, e não um. A bolha alterna a cada peça porque ela é ornamento; a
 * gramática é o formato inteiro da peça, e trocar a cada post faria o feed
 * parecer indeciso. Dois seguidos ainda leem como variação; três em sequência
 * já leem como se a conta tivesse mudado de identidade.
 */
export const TETO_DE_RECORTES_SEGUIDOS = 2;

export type PedidoDeGramatica = {
  eixo: string | null | undefined;
  /**
   * O texto desta peça cabe no recorte?
   *
   * Quem responde é `cabeNoRecorte`, no módulo da arte, porque o orçamento de
   * caracteres é propriedade do desenho e não deste ritmo. Aqui ele entra
   * como fato dado: sem caber, não adianta a editoria querer.
   */
  cabeNoRecorte: boolean;
  /**
   * Esta peça tem foto?
   *
   * O recorte EXIGE foto, e isso foi descoberto renderizando, não lendo. O
   * `.r-texto` é uma faixa de 76% da altura com o corpo do tipo travado em
   * 46px, e nada faz o texto crescer para ocupar o resto: um gancho de 65
   * caracteres sem foto deixa dois terços da peça em branco.
   *
   * Havia um comentário meu, no módulo da arte, afirmando que sem foto "o que
   * muda é só o corpo do tipo, que cresce". Não cresce. O comentário descrevia
   * a intenção, e o CSS nunca implementou.
   *
   * Sem foto a peça certa é a capa tipográfica do jornal, que MEDE o texto no
   * navegador e cresce até encher o canvas. Ela existe para exatamente isso.
   */
  temFoto: boolean;
};

/**
 * Decide a gramática de cada peça da leva, na ordem em que elas vão ao ar.
 *
 * `recortesNoFimDoFeed` é o estado que vem do banco: sem ele, cada leva
 * recomeçaria a contagem e três recortes se encostariam na virada do dia, que
 * é justamente onde o leitor percebe repetição.
 */
export function alternarGramatica(
  pedidos: PedidoDeGramatica[],
  recortesNoFimDoFeed: number,
  ligados: MoldesLigados = TODOS_OS_MOLDES,
): Array<GramaticaDaCapa | null> {
  const decisoes: Array<GramaticaDaCapa | null> = [];
  let seguidos = Math.max(0, recortesNoFimDoFeed);

  for (const pedido of pedidos) {
    /*
     * O molde de jornal desta peça depende de ela ter foto: com foto é a capa
     * de jornal, sem foto é a capa tipográfica. São dois interruptores no
     * painel porque são duas peças diferentes na tela, e quem desliga uma
     * raramente quer desligar a outra.
     */
    const jornalDisponivel = pedido.temFoto ? ligados.jornal : ligados.sem_foto;
    const recorteDisponivel = ligados.recorte && pedido.temFoto && pedido.cabeNoRecorte;
    const querRecorte = gramaticaDoEixo(pedido.eixo) === "recorte";

    if (querRecorte && recorteDisponivel && seguidos < TETO_DE_RECORTES_SEGUIDOS) {
      decisoes.push("recorte");
      seguidos += 1;
      continue;
    }

    if (jornalDisponivel) {
      decisoes.push("jornal");
      seguidos = 0;
      continue;
    }

    /*
     * Sem jornal, o teto de recortes seguidos deixa de valer.
     *
     * Ele é ritmo, e ritmo existe para o feed não parecer indeciso. Quando o
     * operador desliga o jornal, não há para onde alternar, e obedecer ao teto
     * aqui significaria não publicar a peça por causa de uma regra de
     * variedade. Publicar em recorte é o que o painel pediu.
     */
    if (recorteDisponivel) {
      decisoes.push("recorte");
      seguidos += 1;
      continue;
    }

    /*
     * Nenhum molde ligado serve para esta peça, e ela não vira post.
     *
     * `null` em vez de cair no jornal: silenciar o desligamento seria publicar
     * exatamente o que o operador mandou parar de publicar. O contador não
     * anda, porque peça que não sai não entra no ritmo do feed.
     */
    decisoes.push(null);
  }

  return decisoes;
}

/**
 * Quantas peças de recorte estão coladas no fim do feed.
 *
 * Recebe as capas em ordem do mais novo para o mais antigo, como o banco
 * devolve, e para na primeira que não for recorte. Peça antiga não tem o campo
 * gravado, e ausência conta como jornal: o efeito é permitir o recorte a
 * seguir, que é o lado neutro do erro.
 */
export function recortesSeguidosNoFim(historico: Array<{ gramatica?: string | null }>): number {
  let seguidos = 0;
  for (const capa of historico) {
    if ((capa.gramatica ?? "jornal") !== "recorte") break;
    seguidos += 1;
  }
  return seguidos;
}
