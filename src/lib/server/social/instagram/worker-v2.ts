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
    if (carga.foto && !arte.capa.comFoto) {
      throw new Error(
        `A linha declara foto (${carga.foto.imageUrl.slice(0, 80)}) e a arte saiu sem ela: ` +
          `${arte.capa.motivoSemFoto}. Não publico peça diferente da aprovada.`,
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
