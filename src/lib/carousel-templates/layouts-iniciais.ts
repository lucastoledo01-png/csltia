import { blocoNovo, type Bloco, type Layout } from "./layout";
import type { InstagramSlideType } from "./types";
import { MARCA } from "@/lib/marca";

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

/**
 * Vermelho da bandeira dos EUA, na versão contemporânea (Old Glory Red,
 * #B31942), clareada para o realce.
 *
 * O tom oficial é escuro demais para pintar uma palavra dentro de manchete
 * branca sobre foto: some. A função do realce é ser lido de relance no feed —
 * um vermelho que precisa de esforço para ser notado não realça nada.
 */
export const VERMELHO_REALCE = "#E4344A";

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

/**
 * Capa de notícia no formato das newsletters do gênero (referência: the news).
 *
 * Foto sangrada de ponta a ponta, marca centralizada no topo, manchete grande
 * na base com uma expressão em vermelho.
 *
 * ## Degradê, não tarja
 *
 * Cheguei a testar com tarja preta sólida embaixo da foto: garante contraste
 * máximo em qualquer imagem, mas corta o post em dois e a foto perde a força.
 * O degradê mantém a arte inteira — é o que as referências fazem.
 *
 * O preço é que a legibilidade passa a depender da foto, e quem desenha o
 * layout não escolhe a foto de amanhã. Daí a curva ser agressiva embaixo
 * (onde só há texto) e sumir antes da metade (onde está o assunto da imagem):
 * escurece o que precisa e não toca o rosto que faz alguém parar de rolar.
 *
 * O véu curto no topo é da mesma família e existe por um motivo concreto: no
 * primeiro teste a marca branca desapareceu numa foto de céu claro.
 *
 * ## Realce inline
 *
 * O "235 mil" em cor no meio da frase branca. Não dá para fazer com um bloco
 * separado — a expressão destacada muda de posição a cada notícia. Ela vem do
 * campo de destaque que a IA preenche, e o renderizador pinta o trecho dentro
 * do texto.
 */
function capaNoticiaEUA(): Layout {
  return {
    canvas: { width: 1080, height: 1440 },
    blocks: [
      {
        ...blocoNovo("imagem", 1),
        x: 0, y: 0, w: 100, h: 100,
        imagem: "fundo", encaixe: "cover",
        veu: 0.9, veuTipo: "base",
      } as Bloco,

      // Forma, não imagem: bloco de imagem sem URL não renderiza nada, e o
      // degradê aqui é o *fundo* da forma, que vale para qualquer tipo.
      {
        ...blocoNovo("forma", 2),
        x: 0, y: 0, w: 100, h: 18,
        fundo: "linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0))",
      } as Bloco,

      texto(
        {
          textoFixo: MARCA.nome,
          x: 20, y: 4, w: 60, h: 5,
          tamanho: 48, tamanhoMinimo: 30, peso: 800,
          fonte: "body", cor: PAPEL, espacamento: -0.02,
          alinhamento: "center", alinhamentoVertical: "center",
          ajuste: "cortar",
        },
        3,
      ),

      texto(
        {
          slot: "titulo",
          // Base do texto em 81% e não em 91%: colado na borda o texto briga
          // com a barra de ações do feed, e no Instagram a manchete é o que
          // fica mais perto do polegar.
          x: 6, y: 57, w: 88, h: 24,
          tamanho: 80, tamanhoMinimo: 42, peso: 800,
          cor: PAPEL, entrelinha: 1.08, espacamento: -0.03,
          alinhamentoVertical: "end",
          realcarDestaque: true,
          corDoRealce: VERMELHO_REALCE,
        },
        4,
      ),
    ],
  };
}

export const LAYOUT_INICIAL: Partial<Record<InstagramSlideType, () => Layout>> = {
  cover: capaNoticiaEUA,
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

/** Alternativas de capa, para o seletor do editor. */
export const CAPAS = {
  noticiaEUA: { rotulo: "Notícia (foto + manchete)", montar: capaNoticiaEUA },
  editorial: { rotulo: "Editorial (chapéu + título)", montar: capa },
} as const;

/** O ponto de partida do tipo, ou uma capa quando o tipo não tem um próprio. */
export function layoutInicial(tipo: InstagramSlideType): Layout {
  return (LAYOUT_INICIAL[tipo] ?? capa)();
}
