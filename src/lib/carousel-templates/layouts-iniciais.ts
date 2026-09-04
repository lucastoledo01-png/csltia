import { blocoNovo, type Bloco, type Layout } from "./layout";
import type { InstagramSlideType } from "./types";

/**
 * Ponto de partida para cada tipo de slide.
 *
 * Existe por um motivo prático: tela em branco é o pior lugar para começar a
 * desenhar. Sem isto, a primeira decisão de quem abre o editor é "onde fica o
 * título?" — e a resposta certa é a que já funciona hoje. Partir do que está no
 * ar e mexer é um problema; partir do nada é outro, bem maior.
 *
 * Não é o que fica salvo. O botão carrega estes blocos na mesa do editor; só o
 * "Salvar" grava. Quem não gostar apaga tudo e desenha do zero, e quem nunca
 * abrir o editor continua com a variante de código — nada aqui muda um post
 * sozinho.
 *
 * Os números saem do desenho atual das variantes: título grande na base,
 * chapéu logo acima, marca no topo, imagem sangrada com véu. Não é uma cópia
 * fiel — é o mesmo esqueleto, em blocos que se pode arrastar.
 */

const TINTA = "#111111";
const PAPEL = "#FFFFFF";
const ACENTO = "#FF4A1C";

function texto(patch: Partial<Bloco>, z: number): Bloco {
  return { ...blocoNovo("texto", z), ...patch } as Bloco;
}

/** Marca no topo. Texto fixo: não é slot, não vem da IA. */
function marca(z: number, cor: string): Bloco {
  return texto(
    {
      textoFixo: "desbuguei.ia",
      x: 7, y: 5, w: 50, h: 4,
      tamanho: 32, tamanhoMinimo: 20, peso: 800,
      fonte: "body", cor, espacamento: -0.02, ajuste: "cortar",
    },
    z,
  );
}

/** Fundo sangrado com véu — é o véu que garante texto legível sobre a foto. */
function fundo(z: number, veu = 0.5): Bloco {
  return { ...blocoNovo("imagem", z), x: 0, y: 0, w: 100, h: 100, imagem: "fundo", veu } as Bloco;
}

/** Capa: imagem cheia, título na base, chapéu acima dele. */
function capa(): Layout {
  return {
    canvas: { width: 1080, height: 1440 },
    blocks: [
      fundo(1),
      marca(2, PAPEL),
      texto(
        {
          slot: "chapeu",
          x: 7, y: 60, w: 60, h: 5,
          tamanho: 30, tamanhoMinimo: 18, peso: 800,
          fonte: "body", cor: ACENTO, caixaAlta: true, espacamento: 0.14,
          ajuste: "cortar",
        },
        3,
      ),
      texto(
        {
          slot: "titulo",
          x: 7, y: 66, w: 86, h: 24,
          tamanho: 96, tamanhoMinimo: 44, peso: 900,
          cor: PAPEL, entrelinha: 0.95, espacamento: -0.035,
          alinhamentoVertical: "end",
        },
        4,
      ),
    ],
  };
}

/** Passo/dica: fundo claro, número grande, título e corpo. */
function passo(comNumero: boolean): Layout {
  const blocos: Bloco[] = [marca(2, TINTA)];

  if (comNumero) {
    blocos.push(
      texto(
        {
          slot: "numero",
          x: 7, y: 16, w: 24, h: 12,
          tamanho: 140, tamanhoMinimo: 60, peso: 900,
          cor: ACENTO, entrelinha: 0.9, ajuste: "cortar",
        },
        3,
      ),
    );
  }

  blocos.push(
    texto(
      {
        slot: "titulo",
        // Caixa justa. Alta demais, um título de uma linha deixa um vão até o
        // corpo — e o vão não é escolha de design, é sobra de caixa.
        x: 7, y: comNumero ? 30 : 18, w: 86, h: 15,
        tamanho: 72, tamanhoMinimo: 36, peso: 900,
        cor: TINTA, entrelinha: 1.0, espacamento: -0.03,
      },
      4,
    ),
    texto(
      {
        slot: "corpo",
        x: 7, y: comNumero ? 47 : 35, w: 86, h: 43,
        tamanho: 40, tamanhoMinimo: 24, peso: 500,
        fonte: "body", cor: "#4A4A4A", entrelinha: 1.45, espacamento: 0,
      },
      5,
    ),
  );

  return { canvas: { width: 1080, height: 1440 }, blocks: blocos };
}

/** CTA: tarja de acento e chamada curta. */
function cta(): Layout {
  return {
    canvas: { width: 1080, height: 1440 },
    blocks: [
      marca(2, TINTA),
      { ...blocoNovo("forma", 3), x: 7, y: 40, w: 20, h: 1, fundo: ACENTO } as Bloco,
      texto(
        {
          slot: "titulo",
          x: 7, y: 45, w: 86, h: 22,
          tamanho: 84, tamanhoMinimo: 40, peso: 900,
          cor: TINTA, entrelinha: 0.98, espacamento: -0.035,
        },
        4,
      ),
      texto(
        {
          slot: "cta",
          x: 7, y: 70, w: 86, h: 10,
          tamanho: 44, tamanhoMinimo: 26, peso: 700,
          fonte: "body", cor: ACENTO, entrelinha: 1.3,
        },
        5,
      ),
    ],
  };
}

/**
 * Galeria: a imagem é o conteúdo.
 *
 * Nos posts de prompt, os slides depois da capa são o resultado gerado em tela
 * cheia. Texto por cima competiria com aquilo que a pessoa veio ver — só a
 * marca fica, e discreta.
 */
function galeria(): Layout {
  return {
    canvas: { width: 1080, height: 1440 },
    blocks: [fundo(1, 0), marca(2, PAPEL)],
  };
}

export const LAYOUT_INICIAL: Partial<Record<InstagramSlideType, () => Layout>> = {
  cover: capa,
  intro: () => passo(false),
  content: () => passo(false),
  quote_highlight: () => passo(false),
  practical_impact: () => passo(false),
  step: () => passo(true),
  tip: () => passo(false),
  personalization: () => passo(false),
  cta,
  gallery: galeria,
};

/** O ponto de partida do tipo, ou uma capa quando o tipo não tem um próprio. */
export function layoutInicial(tipo: InstagramSlideType): Layout {
  return (LAYOUT_INICIAL[tipo] ?? capa)();
}
