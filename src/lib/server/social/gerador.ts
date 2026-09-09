import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import { gerarCopyDoPost, levaCta, montarLegenda, repararCopyDoPost } from "./copy";
import type { CopyDoPost, MarcaSocial } from "./copy";
import { avaliarPostSocial } from "./social-guard";
import type { ContextoDoPost, ProblemaDoPost, VeredictoDoPost } from "./social-guard";
import { gerarCopyDoCarrossel, repararCopyDoCarrossel, type SlideDeTexto } from "./carrossel/copy";
import { papeisPara, type EstruturaDoCarrossel, type PapelDeSlide } from "./carrossel/estrutura";
import type { DecisaoDeFormato } from "./carrossel/formato";
import {
  conferirDestaque,
  conferirFormaDosSlides,
  conferirLinguagemDoCarrossel,
  problemasDeAncoragem,
  removerSlidesSemLastro,
  slidesSemLastro,
} from "./carrossel/guarda";

/**
 * Uma candidata problemática não derruba o dia.
 *
 * A newsletter é uma peça só: se ela não fecha, não sai nada, e por isso a
 * guarda editorial bloqueia a edição inteira. O feed é outro bicho. Ele tem
 * de dois a dez posts independentes, e uma pauta que não vira texto aceitável
 * é uma pauta a menos, não um dia perdido.
 *
 * Daí o laço: reescreve o que reescrever resolve, no máximo duas vezes, e
 * descarta o que não resolve. O limite existe porque a terceira tentativa na
 * mesma candidata custa mais que pegar a próxima da fila, e porque um modelo
 * que errou duas vezes o mesmo ponto raramente acerta na terceira.
 */

export const MAX_SOCIAL_REPAIR_ATTEMPTS = 2;

export function maximoDeReparos(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.MAX_SOCIAL_REPAIR_ATTEMPTS);
  return Number.isFinite(n) && n >= 0 ? n : MAX_SOCIAL_REPAIR_ATTEMPTS;
}

export type CarrosselGerado = {
  estrutura: EstruturaDoCarrossel;
  /** Os papéis desenhados, na ordem, incluindo a capa e o fechamento. */
  papeis: PapelDeSlide[];
  slides: SlideDeTexto[];
};

export type PostGerado = {
  pauta: PautaAvaliada;
  copy: CopyDoPost;
  /** Presente só quando o post é carrossel. Ausente é peça única. */
  carrossel?: CarrosselGerado;
  veredicto: VeredictoDoPost;
  tentativas: number;
  tokens: number;
  custoUsd: number;
  /** O que precisou ser consertado no caminho, para o relatório não esconder. */
  reparosAplicados: ProblemaDoPost[][];
};

export type PostDescartado = {
  pauta: PautaAvaliada;
  motivo: string;
  problemas: ProblemaDoPost[];
  tentativas: number;
  tokens: number;
};

export type OpcoesDoGerador = {
  marca: MarcaSocial;
  pacotes?: Map<string, PacoteFactual>;
  candidatas?: Map<string, CandidataPersistida>;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /** Sobrescreve o teto de reescritas. Zero desliga o reparo. */
  maximoDeReparos?: number;
  /**
   * Decide se esta pauta vira carrossel, e com que forma.
   *
   * É um gancho, e não uma regra deste módulo, porque quem sabe decidir isso é
   * quem conhece a fonte da pauta: família editorial, ângulo, catálogo. Sem o
   * gancho, este gerador se comporta exatamente como antes, o que é o que o
   * caminho da notícia precisa.
   *
   * `comCta` vai junto, e calculado AQUI, porque o CTA ocupa um slide. A
   * decisão precisa saber disso para não reservar o fechamento num post que
   * não tem CTA e acabar pedindo ao modelo um slide de conteúdo a mais do que
   * há fato para sustentar, que é justamente o carrossel vazio que a regra
   * proíbe.
   *
   * E é calculado aqui e não por quem monta o gancho porque a keyword que vale
   * é a da marca que ESTE gerador recebeu: o pipeline a substitui pela canônica
   * do funil, e quem monta o gancho lá fora só conhece a da configuração do
   * projeto. Duas contas de `comCta` divergindo é o defeito que este parâmetro
   * existe para impedir.
   */
  decidirCarrossel?: (
    pauta: PautaAvaliada,
    pacote: PacoteFactual | null,
    comCta: boolean,
  ) => DecisaoDeFormato | null;
};

/**
 * Gera o texto de uma candidata, reescrevendo quando vale a pena.
 *
 * Devolve o post pronto ou o motivo do descarte. Nunca lança: uma exceção aqui
 * derrubaria as outras candidatas do dia, que é exatamente o que este módulo
 * existe para evitar.
 */
export async function gerarPostDaPauta(
  pauta: PautaAvaliada,
  posicao: number,
  opcoes: OpcoesDoGerador,
): Promise<{ post: PostGerado | null; descarte: PostDescartado | null }> {
  const env = opcoes.env ?? process.env;
  const teto = opcoes.maximoDeReparos ?? maximoDeReparos(env);
  const pacote = opcoes.pacotes?.get(pauta.storyId) ?? null;
  const candidata = opcoes.candidatas?.get(pauta.storyId) ?? null;

  const contexto = {
    pauta,
    pacote,
    candidata,
    keyword: opcoes.marca.keyword,
    fechamentoDaNewsletter: env.NEWSLETTER_FINAL_LINE,
  };

  let tokens = 0;
  let custoUsd = 0;
  const reparosAplicados: ProblemaDoPost[][] = [];

  /*
   * Carrossel só com pacote factual.
   *
   * Sem pacote, a copy é escrita a partir do texto bruto da matéria e a
   * ancoragem por slide não tem contra o que conferir: seriam seis slides sem
   * verificação nenhuma, que é o oposto do que o formato exige. Sem pacote,
   * peça única.
   */
  const comCta = levaCta(posicao) && Boolean(opcoes.marca.keyword.trim());
  const decisao = pacote ? (opcoes.decidirCarrossel?.(pauta, pacote, comCta) ?? null) : null;

  if (decisao?.formato === "carousel" && decisao.estrutura && pacote) {
    return gerarCarrosselDaPauta(pauta, posicao, decisao, pacote, contexto, opcoes);
  }

  try {
    const primeira = await gerarCopyDoPost(pauta, pacote, opcoes.marca, {
      posicao,
      env,
      fetcher: opcoes.fetcher,
    });
    tokens += primeira.tokens;
    custoUsd += primeira.custoUsd;

    let copy = primeira.copy;
    let veredicto = avaliarPostSocial(copy, contexto, 0);

    for (let tentativa = 1; tentativa <= teto; tentativa += 1) {
      /*
       * Descarte vem antes de reparo, sempre.
       *
       * Reescrever uma pauta desfavorável aos EUA produziria um texto bonito
       * sobre um fato que a linha editorial não publica. O problema não é o
       * texto.
       */
      if (veredicto.finalDecision !== "reparar") break;

      reparosAplicados.push(veredicto.repairableIssues);

      const reparo = await repararCopyDoPost(copy, veredicto.repairableIssues, pauta, pacote, opcoes.marca, {
        posicao,
        env,
        fetcher: opcoes.fetcher,
      });
      tokens += reparo.tokens;
      custoUsd += reparo.custoUsd;

      copy = reparo.copy;
      veredicto = avaliarPostSocial(copy, contexto, tentativa);
    }

    if (veredicto.passed) {
      return {
        post: { pauta, copy, veredicto, tentativas: veredicto.attempts, tokens, custoUsd, reparosAplicados },
        descarte: null,
      };
    }

    const motivo =
      veredicto.fatalIssues.length > 0
        ? `descartada sem reparo: ${veredicto.fatalIssues.map((p) => p.motivo).join(", ")}`
        : `descartada depois de ${veredicto.attempts} reescrita(s): ${veredicto.issues.map((p) => p.motivo).join(", ")}`;

    return {
      post: null,
      descarte: { pauta, motivo, problemas: veredicto.issues, tentativas: veredicto.attempts, tokens },
    };
  } catch (erro) {
    // Uma candidata que explode não pode levar as outras junto.
    return {
      post: null,
      descarte: {
        pauta,
        motivo: `falha técnica ao gerar: ${(erro as Error).message}`,
        problemas: [],
        tentativas: 0,
        tokens,
      },
    };
  }
}

/**
 * Gera um carrossel, com o MESMO laço de reparo do post de imagem única.
 *
 * A guarda é a mesma `avaliarPostSocial`: a copy do carrossel estende a copy do
 * post, então manchete, legenda, negatividade, CTA e hashtags são conferidos
 * pelo código que já existe. O que se acrescenta são os problemas que só o
 * carrossel tem, entregues prontos pela guarda de slides.
 *
 * O que este laço tem de próprio é a saída quando o reparo não resolve: em vez
 * de descartar o post, tenta REMOVER os slides sem lastro. Descartar um
 * carrossel de seis porque o sexto, opcional, afirmou um número que a fonte não
 * tem seria jogar cinco slides bons no lixo. Slide obrigatório sem lastro não é
 * removível, e aí o post cai mesmo.
 */
async function gerarCarrosselDaPauta(
  pauta: PautaAvaliada,
  posicao: number,
  decisao: DecisaoDeFormato,
  pacote: PacoteFactual,
  contexto: ContextoDoPost,
  opcoes: OpcoesDoGerador,
): Promise<{ post: PostGerado | null; descarte: PostDescartado | null }> {
  const env = opcoes.env ?? process.env;
  const teto = opcoes.maximoDeReparos ?? maximoDeReparos(env);
  const estrutura = decisao.estrutura!;

  let tokens = 0;
  let custoUsd = 0;
  const reparosAplicados: ProblemaDoPost[][] = [];

  try {
    const opcoesDaCopy = { estrutura, slides: decisao.slides, posicao, env, fetcher: opcoes.fetcher };

    const primeira = await gerarCopyDoCarrossel(pauta, pacote, opcoes.marca, opcoesDaCopy);
    tokens += primeira.tokens;
    custoUsd += primeira.custoUsd;

    let copy = primeira.copy;
    let papeis = papeisPara(estrutura, decisao.slides, Boolean(copy.cta.trim()));

    const conferir = () => {
      const semLastro = slidesSemLastro(copy.slides, papeis, pacote);
      return {
        semLastro,
        problemas: [
          ...problemasDeAncoragem(semLastro),
          ...conferirFormaDosSlides(copy.slides, papeis),
          ...conferirLinguagemDoCarrossel(copy.headline, copy.slides, montarLegenda(copy)),
          ...conferirDestaque(copy.destaque, copy.headline),
        ],
      };
    };

    let checagem = conferir();
    let veredicto = avaliarPostSocial(copy, { ...contexto, problemasDoFormato: checagem.problemas }, 0);

    for (let tentativa = 1; tentativa <= teto; tentativa += 1) {
      if (veredicto.finalDecision !== "reparar") break;

      reparosAplicados.push(veredicto.repairableIssues);

      const reparo = await repararCopyDoCarrossel(
        copy,
        veredicto.repairableIssues,
        pauta,
        pacote,
        opcoes.marca,
        opcoesDaCopy,
      );
      tokens += reparo.tokens;
      custoUsd += reparo.custoUsd;

      copy = reparo.copy;
      papeis = papeisPara(estrutura, decisao.slides, Boolean(copy.cta.trim()));
      checagem = conferir();
      veredicto = avaliarPostSocial(copy, { ...contexto, problemasDoFormato: checagem.problemas }, tentativa);
    }

    /*
     * Última tentativa: remover o slide que não fecha, em vez de perder o post.
     *
     * Só vale quando o que sobrou de problema é ancoragem de slide. Se a
     * manchete não tem lastro, ou a pauta é desfavorável, remover slide não
     * resolve nada e o post cai como qualquer outro.
     */
    if (!veredicto.passed && checagem.semLastro.length > 0 && veredicto.fatalIssues.length === 0) {
      const enxuto = removerSlidesSemLastro(copy.slides, papeis, checagem.semLastro);

      if (enxuto.salvavel) {
        copy = { ...copy, slides: enxuto.slides };
        papeis = enxuto.papeis;
        checagem = conferir();
        veredicto = avaliarPostSocial(
          copy,
          { ...contexto, problemasDoFormato: checagem.problemas },
          veredicto.attempts,
        );
      }
    }

    if (veredicto.passed) {
      return {
        post: {
          pauta,
          copy,
          carrossel: { estrutura, papeis, slides: copy.slides },
          veredicto,
          tentativas: veredicto.attempts,
          tokens,
          custoUsd,
          reparosAplicados,
        },
        descarte: null,
      };
    }

    const motivo =
      veredicto.fatalIssues.length > 0
        ? `carrossel descartado sem reparo: ${veredicto.fatalIssues.map((p) => p.motivo).join(", ")}`
        : `carrossel descartado depois de ${veredicto.attempts} reescrita(s): ${veredicto.issues.map((p) => p.motivo).join(", ")}`;

    return {
      post: null,
      descarte: { pauta, motivo, problemas: veredicto.issues, tentativas: veredicto.attempts, tokens },
    };
  } catch (erro) {
    return {
      post: null,
      descarte: {
        pauta,
        motivo: `falha técnica ao gerar o carrossel: ${(erro as Error).message}`,
        problemas: [],
        tentativas: 0,
        tokens,
      },
    };
  }
}

export type ResultadoDoGerador = {
  posts: PostGerado[];
  descartadas: PostDescartado[];
  diagnostico: {
    tentadas: number;
    aprovadas: number;
    descartadas: number;
    reparosFeitos: number;
    tokens: number;
    custoUsd: number;
  };
  linhasDeLog: string[];
};

/**
 * Gera os posts do dia, na ordem, parando quando enche as vagas.
 *
 * A fila é maior que as vagas de propósito: candidata descartada é substituída
 * pela próxima, e sem folga o feed encolheria a cada descarte.
 */
export async function gerarPostsDoDia(
  fila: PautaAvaliada[],
  vagas: number,
  opcoes: OpcoesDoGerador,
): Promise<ResultadoDoGerador> {
  const posts: PostGerado[] = [];
  const descartadas: PostDescartado[] = [];
  const linhas: string[] = [];
  let tokens = 0;
  let custoUsd = 0;
  let reparosFeitos = 0;

  for (const pauta of fila) {
    if (posts.length >= vagas) break;

    const { post, descarte } = await gerarPostDaPauta(pauta, posts.length, opcoes);

    if (post) {
      posts.push(post);
      tokens += post.tokens;
      custoUsd += post.custoUsd;
      reparosFeitos += post.reparosAplicados.length;
      linhas.push(
        `[GERADOR] post ${posts.length}: ${post.copy.headline.slice(0, 55)}` +
          (post.tentativas > 0 ? ` (${post.tentativas} reescrita(s))` : ""),
      );
    } else if (descarte) {
      descartadas.push(descarte);
      tokens += descarte.tokens;
      linhas.push(`[GERADOR] descartada: ${descarte.motivo.slice(0, 90)} :: ${pauta.grupo.primary.title.slice(0, 45)}`);
    }
  }

  linhas.push(
    `[GERADOR] ${posts.length} post(s) de ${fila.length} candidata(s) na fila, ` +
      `${descartadas.length} descartada(s), ${reparosFeitos} reescrita(s)`,
  );

  return {
    posts,
    descartadas,
    diagnostico: {
      tentadas: posts.length + descartadas.length,
      aprovadas: posts.length,
      descartadas: descartadas.length,
      reparosFeitos,
      tokens,
      custoUsd,
    },
    linhasDeLog: linhas,
  };
}

export { montarLegenda };
