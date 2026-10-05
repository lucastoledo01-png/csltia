import sharp, { type Sharp } from "sharp";

/**
 * O que a ingestão mede nos pixels, e o derivado que vai para o Storage.
 *
 * Tom e orientação NÃO vêm do nome do arquivo (decisão de 29/09/2026): os dois
 * são medidos aqui, com precisão maior que a do olho, e escrever à mão criaria
 * contradição entre o nome e o arquivo.
 *
 * O derivado é 2160x2880, a proporção 3:4 do canvas do feed (1080x1440) no
 * dobro da resolução. O original em resolução cheia fica no Drive e o sistema
 * nunca o lê; o que o sistema publica é sempre este derivado.
 */

export const LARGURA_DO_DERIVADO = 2160;
export const ALTURA_DO_DERIVADO = 2880;

/**
 * Onde o tom vira "claro".
 *
 * Meio da escala, e não o 0.62 da marca do topo (decisões, 16/09/2026): aquele
 * número responde "a marca branca some atrás desta área?", e este responde "a
 * foto, como um todo, é clara ou escura?". São perguntas diferentes, e a
 * resposta da primeira continua sendo medida no navegador com a peça montada.
 * Aqui gravamos também a luminância do canto da marca, para o painel poder
 * mostrar a tendência sem renderizar nada.
 */
export const LIMIAR_DE_TOM_CLARO = 0.5;

export type Orientacao = "retrato" | "paisagem" | "quadrada";
export type Tom = "claro" | "escuro";

export type Medida = {
  larguraOriginal: number;
  alturaOriginal: number;
  /** Do ORIGINAL: o derivado é sempre 3:4, então medir nele não diria nada. */
  orientacao: Orientacao;
  /** Do DERIVADO, que é o que aparece na peça. De 0 a 1. */
  luminancia: number;
  /** Do canto superior esquerdo do derivado, onde a marca fica. De 0 a 1. */
  luminanciaDoTopo: number;
  tom: Tom;
};

/** Diferença de até 3% entre os lados conta como quadrada. */
export function orientacaoDe(largura: number, altura: number): Orientacao {
  if (largura <= 0 || altura <= 0) return "quadrada";
  const razao = largura / altura;
  if (razao > 1.03) return "paisagem";
  if (razao < 0.97) return "retrato";
  return "quadrada";
}

export function tomDe(luminancia: number): Tom {
  return luminancia >= LIMIAR_DE_TOM_CLARO ? "claro" : "escuro";
}

/** Luminância relativa (Rec. 709) da média de um recorte RGB, de 0 a 1. */
async function luminanciaMedia(imagem: Sharp): Promise<number> {
  const { data } = await imagem
    .clone()
    .removeAlpha()
    .toColourspace("srgb")
    .resize(32, 32, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let soma = 0;
  const pixels = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    soma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return pixels > 0 ? soma / pixels / 255 : 0;
}

export type Derivado = { buffer: Buffer; medida: Medida };

/**
 * Lê o arquivo, mede, e produz o derivado em JPEG.
 *
 * O recorte para 3:4 usa `attention`, que procura a região de maior interesse,
 * e não o centro: foto deitada de uma fachada com o céu à esquerda perderia a
 * fachada num corte centrado. Mesmo assim o corte é decisão de máquina, e a
 * ingestão imprime a orientação do original para quem revisa saber quais
 * fotos foram cortadas mais fundo.
 *
 * `rotate()` sem argumento aplica a orientação do EXIF antes de medir, senão
 * foto de celular em pé seria medida deitada.
 */
export async function produzirDerivado(entrada: Buffer | string): Promise<Derivado> {
  const original = sharp(entrada, { failOn: "error" }).rotate();
  const meta = await original.metadata();

  /*
   * Depois do `rotate()`, `metadata()` ainda devolve as dimensões do arquivo
   * cru. Orientação EXIF de 5 a 8 troca largura e altura.
   */
  const girada = (meta.orientation ?? 1) >= 5;
  const larguraOriginal = (girada ? meta.height : meta.width) ?? 0;
  const alturaOriginal = (girada ? meta.width : meta.height) ?? 0;

  const buffer = await original
    .clone()
    .resize(LARGURA_DO_DERIVADO, ALTURA_DO_DERIVADO, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const derivado = sharp(buffer);
  const luminancia = await luminanciaMedia(derivado);
  const luminanciaDoTopo = await luminanciaMedia(
    derivado.clone().extract({
      left: 0,
      top: 0,
      width: Math.round(LARGURA_DO_DERIVADO * 0.45),
      height: Math.round(ALTURA_DO_DERIVADO * 0.12),
    }),
  );

  return {
    buffer,
    medida: {
      larguraOriginal,
      alturaOriginal,
      orientacao: orientacaoDe(larguraOriginal, alturaOriginal),
      luminancia: arredondar(luminancia),
      luminanciaDoTopo: arredondar(luminanciaDoTopo),
      tom: tomDe(luminancia),
    },
  };
}

function arredondar(n: number): number {
  return Math.round(n * 1000) / 1000;
}
