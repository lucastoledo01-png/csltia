import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import { gerarCopyDoPost, montarLegenda, repararCopyDoPost } from "./copy";
import type { CopyDoPost, MarcaSocial } from "./copy";
import { avaliarPostSocial } from "./social-guard";
import type { ProblemaDoPost, VeredictoDoPost } from "./social-guard";

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

export type PostGerado = {
  pauta: PautaAvaliada;
  copy: CopyDoPost;
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
