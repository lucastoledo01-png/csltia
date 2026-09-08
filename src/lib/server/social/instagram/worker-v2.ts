import { renderizarCapas } from "../arte";
import { subirPngParaStorage } from "./armazenamento";
import type { CargaV2 } from "./carga-v2";

/**
 * O ramo do worker que publica o que já foi aprovado.
 *
 * A diferença com o caminho legado não é de estilo: o legado RECEBE uma vaga e
 * PRODUZ o post (chama o modelo, escreve a copy, escolhe a imagem, desenha os
 * slides). Este recebe o post inteiro e só o materializa.
 *
 * O que ele não pode fazer, e por que está separado num módulo próprio:
 *
 *   - não chama gerador de copy, então manchete, legenda, CTA e hashtags
 *     chegam ao Instagram como o Social Guard as aprovou;
 *   - não importa `opendesign-renderer`, que puxa banco de fotos de estoque;
 *   - não importa nada de `prompt-system`, onde vive a geração de imagem por
 *     IA (`gpt-image-1`).
 *
 * Essas três ausências são verificáveis lendo o grafo de imports deste
 * arquivo, e `worker-v2-alcance.test.ts` as verifica. Um mock não provaria
 * isso: mock demonstra que não foi chamado nesta execução, e o que se quer
 * afirmar é que não HÁ caminho.
 */

/**
 * Teto de bytes por imagem na API da Meta.
 *
 * O PNG em 2x de uma peça com fotografia deu 5,5 MB numa simulação. Não é
 * hipótese: está a uma foto mais detalhada de estourar. E o modo de estourar é
 * ruim — o container é criado, a Meta baixa a URL, rejeita, e o erro chega como
 * falha genérica de container depois de a arte já estar no Storage.
 */
export const TETO_DE_BYTES_DA_META = 8 * 1024 * 1024;

export type ArteV2Pronta = {
  urls: string[];
  /** Para comparar antes/depois: o mesmo insumo produz o mesmo PNG. */
  bytes: number[];
};

export type OpcoesDaArteV2 = {
  projectSlug: string;
  editionDate: string;
  socialPostId: string;
  fetcher?: typeof fetch;
  /** Trocado só em teste. O padrão é o renderizador determinístico do V2. */
  renderizar?: typeof renderizarCapas;
  /** Trocado só em teste. */
  subir?: typeof subirPngParaStorage;
};

/**
 * Rende a arte da carga e sobe para o Storage.
 *
 * Uma peça, sempre: o formato de notícia do V2 é post único, e a contagem de
 * slides é o que decide se a Meta recebe imagem única ou carrossel. Devolver
 * uma lista de uma posição mantém o caminho de publicação igual para os dois
 * ramos, sem um `if` a mais perto da parte irreversível.
 *
 * O caminho do arquivo inclui o `socialPostId`, então uma segunda tentativa
 * sobrescreve o mesmo objeto em vez de espalhar arquivos órfãos no bucket.
 */
export async function prepararArteV2(
  carga: CargaV2,
  opcoes: OpcoesDaArteV2,
): Promise<ArteV2Pronta> {
  const renderizar = opcoes.renderizar ?? renderizarCapas;
  const subir = opcoes.subir ?? subirPngParaStorage;

  const artes = await renderizar(
    [
      {
        headline: carga.headline,
        eixo: carga.eixo,
        asset: carga.foto,
        motivoSemFoto: carga.motivoSemFoto,
      },
    ],
    { fetcher: opcoes.fetcher ?? fetch },
  );

  if (artes.length === 0) {
    throw new Error("O renderizador V2 não devolveu arte para uma carga válida.");
  }

  const urls: string[] = [];
  const bytes: number[] = [];

  for (const [i, arte] of artes.entries()) {
    /*
     * Foto que não baixou vira capa de texto dentro de `renderizarCapas`, e
     * isso é aceitável para uma peça sozinha. O que não é aceitável é passar
     * batido: a linha diz que tem foto e a arte publicada não tem.
     */
    /*
     * Fonte ausente é peça diferente da aprovada.
     *
     * O ajuste de corpo do texto mede com a fonte que o navegador TEM. Sem
     * Playfair Display, a manchete é medida na serifa do sistema, encolhe de
     * outro jeito, quebra em outro ponto e sai com outro desenho. Publicar isso
     * seria publicar uma peça que ninguém aprovou, e a diferença é justamente
     * pequena o bastante para passar batida.
     */
    if (arte.temaDegradado) {
      throw new Error(
        `A arte foi desenhada sem o tema do banco (${arte.temaDegradado}). Canvas, paleta e fontes ` +
          `saem dos tokens, então a peça sairia com outra proporção e outras cores.`,
      );
    }

    if (arte.fontesQueFaltaram.length > 0) {
      throw new Error(
        `A arte foi desenhada sem as fontes ${arte.fontesQueFaltaram.join(", ")}. ` +
          `O corpo do texto é medido com a fonte real, então a peça sairia diferente da aprovada.`,
      );
    }

    if (carga.foto && !arte.capa.comFoto) {
      throw new Error(
        `A linha declara foto (${carga.foto.imageUrl.slice(0, 80)}) e a arte saiu sem ela: ` +
          `${arte.capa.motivoSemFoto}. Não publico peça diferente da aprovada.`,
      );
    }

    /*
     * Conferir antes de subir, e não depois de a Meta recusar.
     *
     * `arte.png.byteLength` já estava sendo medido e jogado fora. Medir e não
     * conferir é o mesmo que não medir.
     */
    if (arte.png.byteLength > TETO_DE_BYTES_DA_META) {
      throw new Error(
        `A arte tem ${(arte.png.byteLength / 1024 / 1024).toFixed(1)} MB e o teto da Meta é ` +
          `${TETO_DE_BYTES_DA_META / 1024 / 1024} MB. Não subo peça que não pode ser publicada.`,
      );
    }

    const caminho = `${opcoes.projectSlug}/${opcoes.editionDate}/${opcoes.socialPostId}/social-v2-${i + 1}.png`;
    const url = await subir(arte.png, caminho);

    if (!url) throw new Error(`Falha ao subir a arte V2 do post ${opcoes.socialPostId} para o Storage.`);

    urls.push(url);
    bytes.push(arte.png.byteLength);
  }

  return { urls, bytes };
}
