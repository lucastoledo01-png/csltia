/**
 * A verificação semântica do carrossel, no verificador que já existe.
 *
 * A conferência determinística pega número, data e nome próprio inventados. Ela
 * não pega a frase que não tem nenhum dos três: "essa categoria permite
 * trabalhar para qualquer empresa nos EUA" é uma afirmação enorme, e passava com
 * zero claims conferidas, porque não havia o que conferir.
 *
 * Não existe verificador novo aqui. `auditarClaims`, em `editorial/claims-semanticas.ts`,
 * já faz exatamente isto para a newsletter: recebe pares de pacote factual e
 * texto, faz UMA chamada para a lista toda e devolve claim por claim com o
 * índice de quem a produziu. Este módulo só traduz slide em item auditável e
 * traduz a resposta de volta em problema com o número do slide.
 *
 * O índice é o que dá rastreabilidade por slide de graça: um slide, um índice,
 * uma chamada para o post inteiro.
 */

import { auditarClaims, type ClaimSemantica, type PautaAuditavel } from "../../editorial/claims-semanticas";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import { MOTIVOS_DO_SOCIAL_GUARD, type ProblemaDoPost } from "../social-guard";
import { textoDoSlide } from "./guarda";
import type { SlideDeTexto } from "./copy";
import { papeisDoModelo, type PapelDeSlide } from "./estrutura";

export type ClaimDeSlide = ClaimSemantica & {
  /** Posição do slide na peça montada, contando a capa como 1. */
  posicao: number;
  papel: string;
  /** O papel é opcional na estrutura, então dá para remover o slide. */
  removivel: boolean;
};

export type AuditoriaDoCarrossel = {
  claims: ClaimDeSlide[];
  naoSustentadas: ClaimDeSlide[];
  problemas: ProblemaDoPost[];
  custoUsd: number;
  tokens: number;
  /**
   * A auditoria não pôde rodar.
   *
   * Vazio NÃO é o mesmo que aprovado, e é por isso que este campo existe: sem
   * ele, uma falha de rede viraria "nenhuma claim não sustentada", que é o
   * carrossel publicando sem verificação nenhuma e parecendo verificado.
   */
  erro: string | null;
};

export type PecaParaAuditar = {
  /** A manchete, que a guarda determinística já ancora, mas que dá contexto. */
  headline: string;
  slides: SlideDeTexto[];
  papeis: PapelDeSlide[];
  pacote: PacoteFactual;
};

export type Auditor = typeof auditarClaims;

/**
 * Audita os slides de um post, numa chamada, com o resultado por slide.
 *
 * Cada slide vira uma "pauta" para o auditor, com o MESMO pacote factual: é a
 * pergunta certa, porque a pergunta é se aquele slide diz o que o pacote
 * sustenta, e o pacote é o do post.
 *
 * A capa não entra: ela é a manchete, e a manchete já é ancorada pela guarda
 * com o motivo dela. O fechamento também não, porque é escrito em código a
 * partir de texto já ancorado, e conferir texto que o código montou seria
 * pagar uma chamada para auditar `ctaDaPosicao`.
 */
export async function auditarCarrossel(
  peca: PecaParaAuditar,
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    auditor?: Auditor;
  } = {},
): Promise<AuditoriaDoCarrossel> {
  const doModelo = papeisDoModelo(peca.papeis);
  const auditor = opcoes.auditor ?? auditarClaims;

  const auditaveis: PautaAuditavel[] = [];
  const porIndice = new Map<number, { posicao: number; papel: string; removivel: boolean }>();

  peca.slides.forEach((slide, i) => {
    const papel = doModelo[i];
    if (!papel) return;

    const texto = textoDoSlide(slide);
    if (!texto.trim()) return;

    const indice = i;
    auditaveis.push({
      indice,
      titulo: `slide ${peca.papeis.indexOf(papel) + 1} (${papel.papel})`,
      texto,
      pacote: peca.pacote,
    });
    porIndice.set(indice, {
      posicao: peca.papeis.indexOf(papel) + 1,
      papel: papel.papel,
      removivel: !papel.obrigatorio,
    });
  });

  if (auditaveis.length === 0) {
    return { claims: [], naoSustentadas: [], problemas: [], custoUsd: 0, tokens: 0, erro: null };
  }

  const r = await auditor(auditaveis, opcoes.env ?? process.env, opcoes.fetcher ?? fetch, {
    comEscopo: true,
  });

  const comSlide = (c: ClaimSemantica): ClaimDeSlide => {
    const dono = porIndice.get(c.pauta) ?? { posicao: 0, papel: "?", removivel: false };
    return { ...c, ...dono };
  };

  const claims = r.claims.map(comSlide);
  const naoSustentadas = claims.filter((c) => !c.sustentada);

  /*
   * Auditoria que não rodou é problema, e problema NÃO reparável.
   *
   * Reparar não resolve falha de rede, e deixar passar publicaria um carrossel
   * cuja verificação semântica nunca aconteceu. Fechar aqui custa um post; o
   * contrário custa a confiança no que o perfil afirma.
   */
  const problemas: ProblemaDoPost[] = r.erro
    ? [
        {
          motivo: MOTIVOS_DO_SOCIAL_GUARD.CLAIM_NAO_AUDITADA,
          detalhe: `a verificação semântica dos slides não rodou: ${r.erro}`,
          reparavel: false,
        },
      ]
    : naoSustentadas.map((c) => ({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.CLAIM_SEM_LASTRO,
        detalhe:
          `o slide ${c.posicao} ("${c.papel}") afirma o que o pacote não sustenta [${c.tipo}]: ` +
          `"${c.trecho}". ${c.motivo}`,
        reparavel: true,
      }));

  return {
    claims,
    naoSustentadas,
    problemas,
    custoUsd: r.custoUsd,
    tokens: r.tokens,
    erro: r.erro,
  };
}

/**
 * A mesma auditoria para o post de imagem única do conteúdo permanente.
 *
 * A legenda inteira como um item. O estático tem menos superfície que um
 * carrossel, e não menos exposição: é uma afirmação sem número num post que
 * alguém lê inteiro.
 */
export async function auditarEstatico(
  entrada: { titulo: string; texto: string; pacote: PacoteFactual },
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    auditor?: Auditor;
  } = {},
): Promise<AuditoriaDoCarrossel> {
  const auditor = opcoes.auditor ?? auditarClaims;

  if (!entrada.texto.trim()) {
    return { claims: [], naoSustentadas: [], problemas: [], custoUsd: 0, tokens: 0, erro: null };
  }

  const r = await auditor(
    [{ indice: 0, titulo: entrada.titulo, texto: entrada.texto, pacote: entrada.pacote }],
    opcoes.env ?? process.env,
    opcoes.fetcher ?? fetch,
    { comEscopo: true },
  );

  const claims: ClaimDeSlide[] = r.claims.map((c) => ({
    ...c,
    posicao: 1,
    papel: "peça única",
    removivel: false,
  }));
  const naoSustentadas = claims.filter((c) => !c.sustentada);

  const problemas: ProblemaDoPost[] = r.erro
    ? [
        {
          motivo: MOTIVOS_DO_SOCIAL_GUARD.CLAIM_NAO_AUDITADA,
          detalhe: `a verificação semântica não rodou: ${r.erro}`,
          reparavel: false,
        },
      ]
    : naoSustentadas.map((c) => ({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.CLAIM_SEM_LASTRO,
        detalhe: `a legenda afirma o que o pacote não sustenta [${c.tipo}]: "${c.trecho}". ${c.motivo}`,
        reparavel: true,
      }));

  return { claims, naoSustentadas, problemas, custoUsd: r.custoUsd, tokens: r.tokens, erro: r.erro };
}
