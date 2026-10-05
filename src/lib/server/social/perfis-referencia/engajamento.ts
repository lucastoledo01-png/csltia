import type { PostDoPerfil } from "./graph";

/**
 * Qual post de um perfil de referência está performando ACIMA do normal dele.
 *
 * O número absoluto não serve. Medido em 05/10/2026 no @braziljournal: posts
 * do mesmo dia variavam de 94 a 2.710 curtidas. Um perfil de 375 mil
 * seguidores com 700 curtidas está num dia comum; um de 20 mil com 700 está
 * num dia raro. Comparar perfis entre si premiaria sempre o maior. Por isso a
 * régua é a razão entre o engajamento do post e a mediana do PRÓPRIO perfil.
 *
 * Mediana, e não média, porque um único post viral puxa a média para cima e
 * esconde exatamente o post que se quer achar.
 */

export type ConfigDoEngajamento = {
  /** Só conta post desta janela. Viral de uma semana atrás já foi pauta. */
  janelaDeHoras: number;
  /** Quantas vezes a mediana do perfil o post precisa render. */
  razaoMinima: number;
  /** Abaixo disto a mediana não diz nada sobre o perfil. */
  minimoDePostsNaBase: number;
  /** Quantos sinais por perfil, no máximo. */
  maximoPorPerfil: number;
};

export const CONFIG_PADRAO_DO_ENGAJAMENTO: ConfigDoEngajamento = {
  janelaDeHoras: 72,
  razaoMinima: 2,
  minimoDePostsNaBase: 6,
  maximoPorPerfil: 2,
};

export type SinalViral = {
  postId: string;
  permalink: string;
  publicadoEm: string;
  engajamento: number;
  razao: number;
  /**
   * Trecho da legenda, só para a extração de assunto e para auditoria.
   *
   * Nunca vira texto publicado: o post é SINAL, e a pauta só existe se a
   * busca achar uma fonte primária. Ver `sinal-nao-e-fonte.ts`.
   */
  trechoDaLegenda: string;
};

/**
 * Comentário pesa o dobro da curtida.
 *
 * Comentar custa mais que tocar duas vezes na tela, e é o sinal de que o
 * assunto gera conversa, que é o que interessa à pauta. Com curtidas
 * escondidas, sobra o comentário, que é melhor que descartar o post.
 */
export function engajamentoDoPost(p: Pick<PostDoPerfil, "curtidas" | "comentarios">): number {
  return (p.curtidas ?? 0) + 2 * (p.comentarios ?? 0);
}

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  return o.length % 2 === 0 ? (o[meio - 1] + o[meio]) / 2 : o[meio];
}

export function sinaisVirais(
  posts: PostDoPerfil[],
  agora: Date,
  config: ConfigDoEngajamento = CONFIG_PADRAO_DO_ENGAJAMENTO,
): { linhaDeBase: number; sinais: SinalViral[]; motivo: string } {
  if (posts.length < config.minimoDePostsNaBase) {
    return {
      linhaDeBase: 0,
      sinais: [],
      motivo: `${posts.length} post(s) lido(s), mínimo de ${config.minimoDePostsNaBase} para ter linha de base`,
    };
  }

  const base = mediana(posts.map(engajamentoDoPost));
  // Perfil sem engajamento nenhum não tem "acima do normal". Sem este piso,
  // qualquer post com uma curtida viraria infinito.
  if (base <= 0) {
    return { linhaDeBase: 0, sinais: [], motivo: "linha de base zero, perfil sem engajamento mensurável" };
  }

  const limiteMs = config.janelaDeHoras * 3600 * 1000;
  const candidatos = posts
    .filter((p) => {
      const t = Date.parse(p.publicadoEm);
      if (Number.isNaN(t)) return false;
      const idade = agora.getTime() - t;
      return idade >= 0 && idade <= limiteMs;
    })
    // Post sem legenda não tem assunto para extrair: é foto ou vídeo solto.
    .filter((p) => p.legenda.trim().length >= 20)
    .map((p) => {
      const engajamento = engajamentoDoPost(p);
      return { p, engajamento, razao: engajamento / base };
    })
    .filter((x) => x.razao >= config.razaoMinima)
    .sort((a, b) => b.razao - a.razao)
    .slice(0, config.maximoPorPerfil);

  return {
    linhaDeBase: base,
    sinais: candidatos.map(({ p, engajamento, razao }) => ({
      postId: p.id,
      permalink: p.permalink,
      publicadoEm: p.publicadoEm,
      engajamento,
      razao: Math.round(razao * 100) / 100,
      trechoDaLegenda: p.legenda.replace(/\s+/g, " ").trim().slice(0, 500),
    })),
    motivo:
      candidatos.length > 0
        ? `${candidatos.length} post(s) acima de ${config.razaoMinima}x a mediana (${base})`
        : `nenhum post das últimas ${config.janelaDeHoras}h passou de ${config.razaoMinima}x a mediana (${base})`,
  };
}
