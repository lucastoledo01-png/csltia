import {
  POSICOES_DA_BOLHA,
  caixaEmPixels,
  circuloCruzaCaixa,
  circuloDaPosicao,
  type CaixaNormalizada,
  type Circulo,
  type PosicaoDaBolha,
} from "@/lib/carousel-templates/bolha";
import type { FotoDaCapa } from "./arte";

/**
 * A bolha nunca cobre um rosto (pedido do dono, 06/10/2026).
 *
 * O caso que motivou: o retrato oficial de Biden de fundo, com o rosto no
 * centro, e a bolha desenhada em cima da metade dele. A posição era fixa, e
 * nada na esteira sabia onde ficava o rosto, porque nenhuma barreira olhava a
 * foto com essa pergunta.
 *
 * Agora a pergunta é feita, e a regra tem três saídas:
 *
 *   - a primeira posição da lista que não encosta em rosto nenhum, com folga;
 *   - nenhuma serve: a capa sai SEM bolha, e o motivo fica gravado;
 *   - não deu para saber onde estão os rostos: SEM bolha também. É a regra de
 *     17/09/2026, "falha de conferência é recusa", aplicada aqui: capa sem
 *     bolha é peça publicável, bolha em cima de rosto não é.
 *
 * Este arquivo é puro. Quem detecta é `visual/rostos-na-foto.ts`, quem busca a
 * segunda foto é o resolvedor, e os dois entram injetados, para o laço inteiro
 * ser testável sem rede e sem modelo.
 */

/**
 * A folga em volta de cada rosto, em fração da LARGURA do canvas.
 *
 * O detector devolve uma caixa aproximada, e o anel branco da bolha (7px) e a
 * sombra passam do círculo. Com 3% (32px num canvas de 1080), um rosto que
 * a caixa cortou rente pela orelha ainda fica fora do anel.
 */
export const FOLGA_DO_ROSTO = 0.03;

/** O anel branco do `.j-bolha`, que fica FORA do círculo (box-shadow de 7px). */
export const ANEL_DA_BOLHA_PX = 7;

export type Canvas = { width: number; height: number };

/** O círculo de uma posição, já com o anel. É o que ocupa a foto de verdade. */
export function circuloComAnel(posicao: PosicaoDaBolha, canvas: Canvas): Circulo {
  const c = circuloDaPosicao(posicao, canvas);
  return { ...c, raio: c.raio + ANEL_DA_BOLHA_PX };
}

/** O círculo encosta em algum rosto, com a folga? */
export function cruzaAlgumRosto(
  circulo: Circulo,
  rostos: CaixaNormalizada[],
  canvas: Canvas,
  folga = FOLGA_DO_ROSTO,
): boolean {
  const folgaPx = folga * canvas.width;
  return rostos.some((r) => circuloCruzaCaixa(circulo, caixaEmPixels(r, canvas), folgaPx));
}

export type EscolhaDePosicao =
  | { posicao: PosicaoDaBolha; recusadas: string[] }
  | { posicao: null; recusadas: string[]; motivo: string };

/**
 * A primeira posição da lista que não encosta em rosto nenhum.
 *
 * A lista é a ordem de preferência (ver `POSICOES_DA_BOLHA`): sem rosto, ou
 * com rosto longe do lugar de sempre, sai a posição padrão e a peça fica
 * idêntica ao desenho aprovado.
 */
export function escolherPosicaoDaBolha(
  rostos: CaixaNormalizada[],
  canvas: Canvas,
  posicoes: readonly PosicaoDaBolha[] = POSICOES_DA_BOLHA,
  folga = FOLGA_DO_ROSTO,
): EscolhaDePosicao {
  const recusadas: string[] = [];
  for (const posicao of posicoes) {
    if (!cruzaAlgumRosto(circuloComAnel(posicao, canvas), rostos, canvas, folga)) {
      return { posicao, recusadas };
    }
    recusadas.push(posicao.chave);
  }
  return {
    posicao: null,
    recusadas,
    motivo: `${rostos.length} rosto(s) na foto de fundo e nenhuma das ${posicoes.length} posições fica livre deles`,
  };
}

// --------------------------------------------------------------------------
// A decisão da peça, com o ritmo
// --------------------------------------------------------------------------

/** O que o detector devolve. Ver `visual/rostos-na-foto.ts`. */
export type DeteccaoDeRostos =
  | { ok: true; rostos: CaixaNormalizada[]; custoUsd: number; tokens: number; emCache: boolean; modelo: string }
  | { ok: false; motivo: string; custoUsd: number; tokens: number };

/** O que a busca extra devolve. Ver `buscarSegundaFoto` no resolvedor. */
export type BuscaDaSegundaFoto = {
  asset: FotoDaCapa | null;
  nota: string;
  custoUsd?: number;
};

export type ResultadoDaBolha =
  | "com_bolha"
  | "nao_era_a_vez"
  | "molde_desligado"
  | "sem_foto_de_fundo"
  | "gramatica_sem_bolha"
  | "deteccao_falhou"
  | "sem_posicao_livre"
  | "sem_segunda_foto"
  /** A decisão pediu a bolha e o render não a desenhou: foto que não baixou ou círculo medido sobre rosto. */
  | "tirada_no_render";

/**
 * O registro da decisão, que vai para `content_json.arte.bolha_decisao`.
 *
 * Existe para a pergunta "por que este post não tem bolha?" ter resposta na
 * linha, e não num log de contêiner que ninguém alcança. E para a pergunta
 * "a bolha deste post cobria alguém?" ter as caixas dos rostos ao lado da
 * posição escolhida, que é o que permite conferir sem renderizar de novo.
 */
export type DecisaoDaBolha = {
  /** Era a vez desta peça, pelo ritmo do feed? */
  vez: boolean;
  resultado: ResultadoDaBolha;
  motivo: string;
  /** Os rostos em fração do canvas, como a peça os mostra. Nulo quando não se perguntou. */
  rostos: CaixaNormalizada[] | null;
  posicao: string | null;
  posicoesRecusadas: string[];
  segundaFoto: { url: string; origem: "resolvedor" | "busca_extra" } | null;
  /** O que a busca extra encontrou ou por que não encontrou. */
  notaDaBusca: string;
  custoUsd: number;
  tokens: number;
};

export type PedidoDaBolha = {
  /** O molde `jornal_bolha` está ligado no painel? */
  moldeLigado: boolean;
  /** A peça anterior do FEED saiu com bolha? É o que decide a vez. */
  anteriorTeveBolha: boolean;
  /** A bolha só existe na capa de jornal com foto. */
  gramatica: "jornal" | "recorte";
  fotoDeFundo: string | null;
  /** A vice do resolvedor, quando houve. */
  segundaFoto: FotoDaCapa | null;
  canvas: Canvas;
  /** Detecta os rostos da foto de fundo, como ela aparece na peça. */
  detectar?: (urlDaFoto: string) => Promise<DeteccaoDeRostos>;
  /** Procura mais uma segunda foto, só quando é a vez e a vice não veio. */
  buscarSegunda?: () => Promise<BuscaDaSegundaFoto>;
};

export type BolhaDaPeca = {
  decisao: DecisaoDaBolha;
  /** A foto do círculo, quando a decisão é `com_bolha`. Fica fora do registro: o crédito dela é do resolvedor. */
  asset: FotoDaCapa | null;
};

function semBolha(
  vez: boolean,
  resultado: ResultadoDaBolha,
  motivo: string,
  extra: Partial<DecisaoDaBolha> = {},
): BolhaDaPeca {
  return { asset: null, decisao: {
    vez,
    resultado,
    motivo,
    rostos: null,
    posicao: null,
    posicoesRecusadas: [],
    segundaFoto: null,
    notaDaBusca: "",
    custoUsd: 0,
    tokens: 0,
    ...extra,
  } };
}

/**
 * Decide a bolha de UMA peça: se é a vez, onde ela fica, e com que foto.
 *
 * A ordem é a do custo, do mais barato para o mais caro:
 *
 *   1. o ritmo, que é de graça: fora da vez, nada é perguntado;
 *   2. os rostos, uma chamada de modelo por foto (com memória por URL): se
 *      nenhuma posição fica livre, procurar segunda foto seria dinheiro jogado;
 *   3. a segunda foto, que só é buscada de novo quando o resolvedor não trouxe
 *      vice, e que pode abrir até quatro imagens na conferência visual.
 *
 * Quando a vez não se cumpre, por qualquer motivo, ela PASSA: o chamador grava
 * `bolha: false` e a próxima peça do feed é que tenta. É o que torna a
 * alternância um alvo, e não um acaso.
 */
export async function decidirBolha(pedido: PedidoDaBolha): Promise<BolhaDaPeca> {
  if (!pedido.moldeLigado) return semBolha(false, "molde_desligado", "molde jornal_bolha desligado no painel");

  const vez = !pedido.anteriorTeveBolha;
  if (!vez) return semBolha(false, "nao_era_a_vez", "a peça anterior do feed saiu com bolha");

  if (pedido.gramatica !== "jornal") {
    return semBolha(true, "gramatica_sem_bolha", `a gramática ${pedido.gramatica} não desenha bolha; a vez passa`);
  }
  if (!pedido.fotoDeFundo) {
    return semBolha(true, "sem_foto_de_fundo", "capa sem foto de fundo não tem onde pôr a bolha; a vez passa");
  }

  // 2. Os rostos.
  let custoUsd = 0;
  let tokens = 0;
  if (!pedido.detectar) {
    return semBolha(true, "deteccao_falhou", "sem detector de rostos configurado: sem bolha, a vez passa");
  }
  let deteccao: DeteccaoDeRostos;
  try {
    deteccao = await pedido.detectar(pedido.fotoDeFundo);
  } catch (erro) {
    deteccao = { ok: false, motivo: (erro as Error).message, custoUsd: 0, tokens: 0 };
  }
  custoUsd += deteccao.custoUsd;
  tokens += deteccao.tokens;
  if (!deteccao.ok) {
    return semBolha(true, "deteccao_falhou", `não deu para saber onde estão os rostos: ${deteccao.motivo}`, {
      custoUsd,
      tokens,
    });
  }

  const escolha = escolherPosicaoDaBolha(deteccao.rostos, pedido.canvas);
  if (!escolha.posicao) {
    return semBolha(true, "sem_posicao_livre", `${escolha.motivo}; a vez passa`, {
      rostos: deteccao.rostos,
      posicoesRecusadas: escolha.recusadas,
      custoUsd,
      tokens,
    });
  }

  // 3. A segunda foto.
  let segunda = pedido.segundaFoto?.imageUrl ? pedido.segundaFoto : null;
  let origem: "resolvedor" | "busca_extra" = "resolvedor";
  let notaDaBusca = "";
  if (!segunda && pedido.buscarSegunda) {
    try {
      const busca = await pedido.buscarSegunda();
      custoUsd += busca.custoUsd ?? 0;
      notaDaBusca = busca.nota;
      if (busca.asset?.imageUrl) {
        segunda = busca.asset;
        origem = "busca_extra";
      }
    } catch (erro) {
      notaDaBusca = `busca extra falhou: ${(erro as Error).message}`;
    }
  }

  if (!segunda || segunda.imageUrl === pedido.fotoDeFundo) {
    return semBolha(true, "sem_segunda_foto", "nenhuma segunda foto da pauta passou na régua de identidade; a vez passa", {
      rostos: deteccao.rostos,
      posicao: escolha.posicao.chave,
      posicoesRecusadas: escolha.recusadas,
      notaDaBusca,
      custoUsd,
      tokens,
    });
  }

  return { asset: segunda, decisao: {
    vez: true,
    resultado: "com_bolha",
    motivo:
      escolha.recusadas.length > 0
        ? `posição ${escolha.posicao.chave}: ${escolha.recusadas.join(", ")} cruzavam rosto`
        : `posição ${escolha.posicao.chave}, livre de rosto`,
    rostos: deteccao.rostos,
    posicao: escolha.posicao.chave,
    posicoesRecusadas: escolha.recusadas,
    segundaFoto: { url: segunda.imageUrl, origem },
    notaDaBusca,
    custoUsd,
    tokens,
  } };
}
