import sharp from "sharp";
import { MARCA } from "../../marca";
import { agenteDaWikimedia } from "./wikidata";

/**
 * O logotipo como capa (06/10/2026, "imagem certeira").
 *
 * Quando a manchete nomeia uma empresa e não existe foto com a marca legível
 * (a fachada da SpaceX com o nome na parede é o exemplo que o dono aprovou), o
 * segundo recurso é o LOGOTIPO oficial que o Wikidata declara (P154).
 *
 * A arte não precisou mudar, e foi por isso que o cartão entrou: a capa do
 * post, o slide e a capa da matéria desenham a foto com `object-fit: cover`,
 * então o cartão é uma FOTO como outra qualquer, um quadrado de 1600 px com o
 * logotipo no centro sobre um fundo liso. O que o cartão tem de diferente é a
 * área segura: o logotipo cabe inteiro em qualquer recorte que a peça faz.
 *
 *   recorte 3:4 do post     corta 200 px de cada lado; o logotipo ocupa no
 *                           máximo 56% da largura, e sobra margem
 *   recorte 16:9 da matéria corta o alto e o pé; o logotipo fica entre 31% e
 *                           53% da altura, dentro da faixa que fica
 *   faixa da manchete       a manchete da capa ocupa o pé da peça, e o
 *                           logotipo fica acima do meio, fora dela
 *
 * O fundo não é a cor da marca: o Wikidata não declara cor de marca com
 * confiança, e cor inventada é marca adulterada. É neutro e escolhido pelo
 * brilho do próprio logotipo: logotipo escuro sobre papel claro, logotipo claro
 * sobre grafite. A marca do eua.journal no topo da peça já mede o brilho do
 * fundo e escolhe a tinta sozinha (16/09/2026).
 */

export const LADO_DO_CARTAO = 1600;
/** Largura máxima do logotipo, em fração do lado. */
const LARGURA_MAXIMA = 0.56;
/** Altura máxima do logotipo, em fração do lado. */
const ALTURA_MAXIMA = 0.22;
/** Onde fica o centro do logotipo, em fração da altura: acima do meio, longe da manchete. */
const CENTRO_VERTICAL = 0.42;

export const FUNDO_CLARO = { r: 244, g: 242, b: 238 };
export const FUNDO_ESCURO = { r: 22, g: 24, b: 28 };

/** O brilho médio dos pixels visíveis do logotipo, de 0 a 1 (luminância relativa, pesada pela opacidade). */
export async function brilhoDoLogotipo(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().resize(200, 200, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  let soma = 0;
  let peso = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3] / 255;
    if (a < 0.1) continue;
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    soma += l * a;
    peso += a;
  }
  return peso > 0 ? soma / peso : 0;
}

/** Compõe o cartão: o logotipo centrado na área segura, sobre o fundo neutro que contrasta com ele. */
export async function comporCartaoDaMarca(logotipo: Buffer): Promise<{ png: Buffer; fundo: "claro" | "escuro"; brilho: number }> {
  // Corta a margem transparente que o arquivo traga, para o tamanho ser o do desenho.
  const recortado = await sharp(logotipo).ensureAlpha().trim().png().toBuffer().catch(() => logotipo);
  const brilho = await brilhoDoLogotipo(recortado);
  const fundo = brilho < 0.6 ? "claro" : "escuro";
  const cor = fundo === "claro" ? FUNDO_CLARO : FUNDO_ESCURO;

  const caixaL = Math.round(LADO_DO_CARTAO * LARGURA_MAXIMA);
  const caixaA = Math.round(LADO_DO_CARTAO * ALTURA_MAXIMA);
  const logo = await sharp(recortado)
    .resize(caixaL, caixaA, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });

  const left = Math.round((LADO_DO_CARTAO - logo.info.width) / 2);
  const top = Math.round(LADO_DO_CARTAO * CENTRO_VERTICAL - logo.info.height / 2);
  const png = await sharp({
    create: { width: LADO_DO_CARTAO, height: LADO_DO_CARTAO, channels: 4, background: { ...cor, alpha: 1 } },
  })
    .composite([{ input: logo.data, left, top }])
    .flatten({ background: cor })
    .png()
    .toBuffer();
  return { png, fundo, brilho };
}

/** Nome de arquivo do Commons aceito pela rota: sem caminho, sem consulta, só imagem vetorial ou PNG. */
export function arquivoDeLogotipoValido(arquivo: string): boolean {
  return /^[^/\\?#<>|\n]{1,200}\.(svg|png)$/i.test(arquivo.trim());
}

/**
 * O endereço do logotipo renderizado em PNG pelo próprio Commons.
 *
 * `Special:FilePath` com largura devolve a miniatura rasterizada do SVG, que é
 * o que o modelo consegue abrir na conferência e o que o cartão compõe.
 */
export function urlDoLogotipoNoCommons(arquivo: string, largura = 1200): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(arquivo.replace(/^File:/i, "").trim())}?width=${largura}`;
}

/** O endereço público do cartão, servido pela rota `/api/visual/cartao-da-marca`. */
export function urlDoCartaoDaMarca(arquivo: string, base: string = MARCA.site): string {
  return `${base.replace(/\/$/, "")}/api/visual/cartao-da-marca?arquivo=${encodeURIComponent(arquivo.replace(/^File:/i, "").trim())}`;
}

export async function baixarLogotipo(
  arquivo: string,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<Buffer> {
  const r = await (opcoes.fetcher ?? fetch)(urlDoLogotipoNoCommons(arquivo), {
    headers: { "User-Agent": agenteDaWikimedia(opcoes.env ?? process.env) },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`Commons respondeu ${r.status} para o logotipo`);
  return Buffer.from(await r.arrayBuffer());
}
