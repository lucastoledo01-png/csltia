import type { AssetVisual, EntidadeVisual } from "./tipos";
import { ehPessoa, normalizarEntidade } from "./tipos";

/**
 * O quanto esta foto é desta pauta.
 *
 * A régua existe para separar três coisas que a fase 1 tratava igual: a foto
 * exata da entidade, a foto de algo relacionado, e a foto conceitual que só
 * ocupa espaço. Sem pontuação, "achou alguma imagem" vira critério, e foi
 * assim que matéria sobre custódia do ICE saiu com estante de livros.
 *
 * O peso maior é da correspondência de entidade, porque é o que o leitor vê
 * primeiro: ou é a pessoa da notícia, ou não é.
 */

export type ConfigDeImagem = {
  larguraMinima: number;
  relevanciaMinima: number;
  /** Piso mais alto para pessoa: foto errada de gente é o pior erro. */
  relevanciaMinimaPessoa: number;
  janelaEmDias: number;
};

function numeroDoAmbiente(nome: string, padrao: number, env: Record<string, string | undefined>): number {
  const bruto = env[nome];
  if (!bruto) return padrao;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : padrao;
}

export function carregarConfigDeImagem(
  env: Record<string, string | undefined> = process.env
): ConfigDeImagem {
  return {
    larguraMinima: numeroDoAmbiente("VISUAL_LARGURA_MINIMA", 800, env),
    relevanciaMinima: numeroDoAmbiente("VISUAL_RELEVANCIA_MINIMA", 45, env),
    relevanciaMinimaPessoa: numeroDoAmbiente("VISUAL_RELEVANCIA_MINIMA_PESSOA", 70, env),
    janelaEmDias: numeroDoAmbiente("EDITORIAL_JANELA_IMAGEM_DIAS", 30, env),
  };
}

export type NotaDaImagem = {
  total: number;
  partes: {
    entidade: number;
    tipo: number;
    qualidade: number;
    proporcao: number;
    licenca: number;
    origem: number;
  };
  explicacao: string;
};

const PESO = { entidade: 45, tipo: 15, qualidade: 15, proporcao: 10, licenca: 5, origem: 10 };

export function pontuarImagem(asset: AssetVisual, entidade: EntidadeVisual): NotaDaImagem {
  const alvo = normalizarEntidade(entidade.nome);
  const texto = normalizarEntidade(
    [asset.sourceAssetId, String(asset.metadata?.descricao ?? ""), String(asset.metadata?.categorias ?? "")].join(" ")
  );

  /*
   * Correspondência de entidade.
   *
   * O caminho mais forte não é o texto: é a imagem que o Wikidata declara
   * para a entidade. Ali não há dúvida de que a foto é dela.
   */
  let entidadePontos = 0;
  const declarada = asset.metadata?.origem_declarada === true;
  if (declarada) entidadePontos = PESO.entidade;
  else if (texto.includes(alvo)) entidadePontos = Math.round(PESO.entidade * 0.85);
  else {
    const palavras = alvo.split(" ").filter((p) => p.length > 3);
    const casadas = palavras.filter((p) => texto.includes(p)).length;
    entidadePontos = palavras.length > 0 ? Math.round((casadas / palavras.length) * PESO.entidade * 0.6) : 0;
  }

  const tipoPontos = asset.entityType === entidade.tipo ? PESO.tipo : 0;

  const larguraOk = asset.width >= 1200 ? PESO.qualidade : asset.width >= 800 ? 10 : 0;

  const razao = asset.height > 0 ? asset.width / asset.height : 0;
  // Retrato muito alto e panorama muito largo quebram o bloco do e-mail.
  const proporcaoPontos = razao >= 0.6 && razao <= 2.2 ? PESO.proporcao : razao > 0 ? 4 : 0;

  const licencaPontos = asset.license ? PESO.licenca : 0;

  const origemPontos =
    asset.source === "wikimedia_commons" || asset.source === "fonte_oficial"
      ? PESO.origem
      : asset.source === "press_kit" || asset.source === "flickr_commons"
        ? 7
        : 3;

  const partes = {
    entidade: entidadePontos,
    tipo: tipoPontos,
    qualidade: larguraOk,
    proporcao: proporcaoPontos,
    licenca: licencaPontos,
    origem: origemPontos,
  };
  const total = Object.values(partes).reduce((a, b) => a + b, 0);

  return {
    total,
    partes,
    explicacao:
      `${total} = entidade ${partes.entidade} + tipo ${partes.tipo} + qualidade ${partes.qualidade} + ` +
      `proporção ${partes.proporcao} + licença ${partes.licenca} + origem ${partes.origem}`,
  };
}

/** O piso que esta pauta exige. Pessoa exige mais. */
export function pisoDeRelevancia(entidade: EntidadeVisual, config: ConfigDeImagem): number {
  return ehPessoa(entidade.tipo) ? config.relevanciaMinimaPessoa : config.relevanciaMinima;
}
