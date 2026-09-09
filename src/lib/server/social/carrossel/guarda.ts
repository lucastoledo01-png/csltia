/**
 * Cada slide precisa de lastro. Um slide ancorado e cinco de memória não vale.
 *
 * É o risco específico do carrossel, e ele não existe no post de imagem única.
 * Um post estático tem uma manchete e uma legenda, e as duas são conferidas. Um
 * carrossel de seis slides dá ao modelo cinco lugares a mais para completar com
 * o que ele acha que sabe do assunto, e o pacote factual é a única fonte
 * permitida. Slide sem lastro é o defeito que este módulo existe para pegar.
 *
 * A conferência reusa `validarAncoragem`, a mesma função determinística que já
 * confere a manchete e a legenda: números e datas exatos, nome próprio por
 * casamento parcial. Nada de IA verificando IA.
 */

import { validarAncoragem, type PacoteFactual } from "../../editorial/pacote-factual";
import { conferirLinguagemDeUmTexto } from "../../newsroom/leitor";
import { MOTIVOS_DO_SOCIAL_GUARD, type ProblemaDoPost } from "../social-guard";
import type { SlideDeTexto } from "./copy";
import { papeisDoModelo, type PapelDeSlide } from "./estrutura";

/** Os motivos do carrossel vivem no objeto da guarda, para o tipo alcançá-los. */
const MOTIVOS_DO_CARROSSEL = MOTIVOS_DO_SOCIAL_GUARD;

/** Todo o texto de um slide, que é o que precisa ter lastro. */
export function textoDoSlide(slide: SlideDeTexto): string {
  return [slide.titulo, slide.corpo, ...(slide.bullets ?? []), slide.lado_a, slide.lado_b]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

export type SlideSemLastro = {
  /** Posição do slide no carrossel montado, começando na capa como 1. */
  posicao: number;
  papel: string;
  claims: string[];
  /** O papel é opcional na estrutura, então dá para remover o slide. */
  removivel: boolean;
};

/**
 * Quais slides afirmam o que a fonte não diz.
 *
 * A capa não entra: ela é a manchete, e a manchete já é conferida pela guarda
 * com o motivo dela. Conferir duas vezes produziria dois problemas para o mesmo
 * texto, e o reparo receberia a mesma correção em duplicidade.
 */
export function slidesSemLastro(
  slides: SlideDeTexto[],
  papeis: PapelDeSlide[],
  pacote: PacoteFactual,
): SlideSemLastro[] {
  const doModelo = papeisDoModelo(papeis);
  const achados: SlideSemLastro[] = [];

  slides.forEach((slide, i) => {
    const papel = doModelo[i];
    if (!papel) return;

    const resultado = validarAncoragem(textoDoSlide(slide), pacote);
    const bloqueios = resultado.naoSustentadas.filter((c) => c.severidade === "bloqueio");
    if (bloqueios.length === 0) return;

    achados.push({
      /*
       * A posição contada como o leitor vê, e não o índice do array.
       *
       * O array tem só os slides do modelo; o carrossel montado tem a capa na
       * frente. Um apontamento que diz "slide 2" apontando para o terceiro
       * slide da peça manda o modelo corrigir o slide errado.
       */
      posicao: papeis.indexOf(papel) + 1,
      papel: papel.papel,
      claims: bloqueios.map((c) => `${c.tipo} "${c.valor}"`),
      removivel: !papel.obrigatorio,
    });
  });

  return achados;
}

/**
 * O slide cabe na peça sem encolher a fonte até ficar ruim?
 *
 * O schema já apara os campos nos tetos de densidade, então o que sobra aqui é
 * o que aparar não resolve: corpo E bullets cheios ao mesmo tempo, que é o
 * slide virando página de artigo, e a comparação sem as duas colunas, que é o
 * slide de duas colunas desenhado com uma.
 */
const CORPO_MAIS_BULLETS = 200;

export function conferirFormaDosSlides(slides: SlideDeTexto[], papeis: PapelDeSlide[]): ProblemaDoPost[] {
  const doModelo = papeisDoModelo(papeis);
  const problemas: ProblemaDoPost[] = [];

  if (slides.length !== doModelo.length) {
    problemas.push({
      motivo: MOTIVOS_DO_CARROSSEL.SLIDE_FORA_DA_FORMA,
      detalhe: `foram escritos ${slides.length} slides e a estrutura pede ${doModelo.length}`,
      reparavel: true,
    });
    return problemas;
  }

  slides.forEach((slide, i) => {
    const papel = doModelo[i];
    const posicao = papeis.indexOf(papel) + 1;

    const corpo = (slide.corpo ?? "").trim();
    const bullets = (slide.bullets ?? []).filter(Boolean);

    if (corpo.length > CORPO_MAIS_BULLETS && bullets.length > 0) {
      problemas.push({
        motivo: MOTIVOS_DO_CARROSSEL.SLIDE_DENSO,
        detalhe:
          `o slide ${posicao} ("${papel.papel}") tem ${corpo.length} caracteres de corpo E ` +
          `${bullets.length} bullet(s). Escolha um dos dois: corpo OU lista.`,
        reparavel: true,
      });
    }

    /*
     * Na comparação, o conteúdo são as COLUNAS.
     *
     * A régua de "título e nenhum conteúdo" olhava corpo e bullets, e um slide
     * de duas colunas legitimamente tem os dois vazios: o que ele diz está em
     * `lado_a` e `lado_b`. O efeito era reprovar toda comparação bem formada,
     * e o carrossel de comparação nunca sairia.
     */
    const temColunas = papel.variante === "comparacaoDuasColunas";

    if (temColunas) {
      const a = (slide.lado_a ?? "").trim();
      const b = (slide.lado_b ?? "").trim();
      if (!a || !b) {
        problemas.push({
          motivo: MOTIVOS_DO_CARROSSEL.SLIDE_FORA_DA_FORMA,
          detalhe:
            `o slide ${posicao} ("${papel.papel}") é de duas colunas e ${!a && !b ? "as duas estão" : "uma está"} ` +
            `vazia. Preencha "lado_a" e "lado_b" com o que vale de cada lado.`,
          reparavel: true,
        });
      }
    } else if ((slide.lado_a ?? "").trim() || (slide.lado_b ?? "").trim()) {
      problemas.push({
        motivo: MOTIVOS_DO_CARROSSEL.SLIDE_FORA_DA_FORMA,
        detalhe: `o slide ${posicao} ("${papel.papel}") não é de comparação e veio com lado_a/lado_b preenchidos`,
        reparavel: true,
      });
    }

    const semConteudo = temColunas
      ? !(slide.lado_a ?? "").trim() && !(slide.lado_b ?? "").trim()
      : !corpo && bullets.length === 0;

    if (semConteudo) {
      problemas.push({
        motivo: MOTIVOS_DO_CARROSSEL.SLIDE_FORA_DA_FORMA,
        detalhe: `o slide ${posicao} ("${papel.papel}") tem título e nenhum conteúdo`,
        reparavel: true,
      });
    }
  });

  return problemas;
}

/**
 * A régua de leitor sobre o carrossel inteiro.
 *
 * O primeiro slide precisa funcionar sozinho no feed, e é por isso que o teto
 * de título é aplicado à MANCHETE: ela é o texto da capa, e é o único que
 * alguém vê sem deslizar. Já o jargão e a relevância são conferidos no conjunto,
 * porque um termo explicado no slide 3 está explicado para quem leu na ordem, e
 * cobrar explicação slide a slide transformaria o carrossel num glossário.
 */
export function conferirLinguagemDoCarrossel(
  headline: string,
  slides: SlideDeTexto[],
  legenda: string,
): ProblemaDoPost[] {
  const campos = [headline, legenda, ...slides.map((s) => textoDoSlide(s))].filter(Boolean);

  /*
   * A relevância inclui a LEGENDA, e não só o corpo dos slides.
   *
   * Duas das quatro estruturas, comparação e FAQ, não têm slide de "para quem":
   * medir relevância só nos slides reprovaria toda comparação por construção,
   * qualquer que fosse o texto. E é a legenda que carrega esse trabalho num
   * carrossel: ela é o que a pessoa lê antes de decidir deslizar.
   */
  const corpos = slides
    .map((s) => [s.corpo, ...(s.bullets ?? []), s.lado_a, s.lado_b].filter(Boolean).join(" "))
    .join(" ");

  const achados = conferirLinguagemDeUmTexto({
    campos,
    titulo: headline,
    relevancia: `${legenda} ${corpos}`,
  });

  return achados.map((a) => ({
    motivo: a.motivo,
    detalhe: a.descricao,
    reparavel: true,
  }));
}

/**
 * O carrossel depois de remover os slides que não têm lastro.
 *
 * É a saída que o item 6 do pedido pede quando o reparo não resolve: remover ou
 * reestruturar o slide, e só descartar o post se a forma não se sustentar mais.
 * Descartar um carrossel de seis slides porque o sexto, opcional, afirmou um
 * número que a fonte não tem seria jogar cinco slides bons no lixo.
 *
 * Slide obrigatório sem lastro NÃO é removível: sem "o que é", um explainer não
 * explica nada, e o que sobra não é um carrossel mais curto, é um post
 * incompleto.
 */
export function removerSlidesSemLastro(
  slides: SlideDeTexto[],
  papeis: PapelDeSlide[],
  semLastro: SlideSemLastro[],
): { slides: SlideDeTexto[]; papeis: PapelDeSlide[]; removidos: string[]; salvavel: boolean } {
  const doModelo = papeisDoModelo(papeis);
  const insalvaveis = semLastro.filter((s) => !s.removivel);

  if (insalvaveis.length > 0) {
    return { slides, papeis, removidos: [], salvavel: false };
  }

  const paraRemover = new Set(semLastro.map((s) => s.papel));
  const mantidos: SlideDeTexto[] = [];
  const papeisMantidos: PapelDeSlide[] = [];

  slides.forEach((slide, i) => {
    const papel = doModelo[i];
    if (!papel || paraRemover.has(papel.papel)) return;
    mantidos.push(slide);
    papeisMantidos.push(papel);
  });

  /*
   * Sem slide do modelo, não sobrou carrossel.
   *
   * A capa e o fechamento continuariam de pé, e publicá-los sozinhos seria um
   * carrossel de dois slides que não explica nada: a manchete e um pedido de
   * comentário.
   */
  if (mantidos.length === 0) {
    return { slides, papeis, removidos: [], salvavel: false };
  }

  const fixos = papeis.filter((p) => p.escritoEmCodigo);
  const naOrdem = papeis.filter((p) => papeisMantidos.includes(p) || fixos.includes(p));

  return {
    slides: mantidos,
    papeis: naOrdem,
    removidos: [...paraRemover],
    salvavel: true,
  };
}

/** Os problemas de ancoragem por slide, no formato que a guarda entende. */
export function problemasDeAncoragem(semLastro: SlideSemLastro[]): ProblemaDoPost[] {
  return semLastro.map((s) => ({
    motivo: MOTIVOS_DO_CARROSSEL.SLIDE_SEM_ANCORAGEM,
    detalhe:
      `o slide ${s.posicao} ("${s.papel}") afirma o que a fonte não diz: ${s.claims.join(", ")}. ` +
      `Reescreva usando só o pacote factual, ou diga menos nesse slide.`,
    reparavel: true,
  }));
}
