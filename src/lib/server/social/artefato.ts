import crypto from "node:crypto";
import { renderizarCapas } from "./arte";
import type { ArteRenderizada, EntradaDaCapa } from "./arte";
import { subirPngParaStorage } from "./instagram/armazenamento";

/**
 * A peça aprovada vira arquivo, e o arquivo é o que publica.
 *
 * Antes disto, o worker re-renderizava na hora de publicar. Determinístico não
 * bastava: o render depende do tema no banco, do desenho salvo no painel, das
 * fontes vindas da rede e da foto ainda estar no Commons com os mesmos bytes.
 * Cada uma dessas quatro coisas pode mudar entre a aprovação e a publicação, e
 * quando muda a peça publicada não é a peça que passou pelo Social Guard.
 *
 * Depois de congelado, o Commons serve só para o registro de direito: autor,
 * licença, procedência, auditoria. Ele deixa de ser necessário para produzir o
 * arquivo.
 *
 * O SHA-256 é o que fecha o contrato. Sem ele, "o arquivo no Storage" seria
 * apenas mais um recurso remoto que pode mudar.
 */

/**
 * Teto externo da Meta para uma imagem.
 *
 * Estourar aqui é caro e tardio: o container é criado, a Meta baixa a URL, e a
 * recusa chega como falha genérica depois de o arquivo já estar no Storage.
 */
export const TETO_DA_META = 8 * 1024 * 1024;

/**
 * Limite interno, deliberadamente abaixo do externo.
 *
 * A margem existe porque o teto da Meta não é o único número em jogo: há
 * cabeçalho, há a medida deles do que conta como tamanho, e há o dia em que
 * eles apertam sem avisar. Um arquivo de 7,9 MB passa hoje e é uma aposta.
 */
export const LIMITE_INTERNO_DE_BYTES = 6 * 1024 * 1024;

/** Proporções que a Meta aceita no feed: de 1.91:1 a 4:5. */
export const PROPORCAO_MINIMA = 0.8;
export const PROPORCAO_MAXIMA = 1.91;

export type ArtefatoCongelado = {
  /** URL pública, o que o worker baixa e a Meta busca. */
  url: string;
  /** Caminho no bucket, para auditoria e remoção. */
  path: string;
  filename: string;
  mime: string;
  /** SHA-256 dos bytes exatos que foram subidos. */
  sha256: string;
  bytes: number;
  largura: number;
  altura: number;
  /** Se foi preciso trocar de formato para caber no limite interno. */
  otimizado: boolean;
};

export function sha256De(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Qual dos dois arquivos publica, e o critério é só o tamanho.
 *
 * PNG primeiro porque é sem perda. Passando do limite interno, o JPEG de
 * qualidade fixa entra: mesma resolução, mesma peça, arquivo muito menor. Os
 * dois saem do MESMO desenho, então a troca não muda o que se vê — muda o
 * formato do arquivo.
 *
 * Nenhum dos dois cabendo, o post não publica. Reduzir resolução aqui seria uma
 * terceira peça, diferente da que foi aprovada.
 */
export function escolherArquivo(arte: {
  png: Buffer;
  jpegPublicavel: Buffer;
}): { buffer: Buffer; mime: string; extensao: string; otimizado: boolean } | { erro: string } {
  if (arte.png.byteLength <= LIMITE_INTERNO_DE_BYTES) {
    return { buffer: arte.png, mime: "image/png", extensao: "png", otimizado: false };
  }

  if (arte.jpegPublicavel.byteLength <= LIMITE_INTERNO_DE_BYTES) {
    return { buffer: arte.jpegPublicavel, mime: "image/jpeg", extensao: "jpg", otimizado: true };
  }

  return {
    erro:
      `nem o PNG (${(arte.png.byteLength / 1024 / 1024).toFixed(1)} MB) nem o JPEG ` +
      `(${(arte.jpegPublicavel.byteLength / 1024 / 1024).toFixed(1)} MB) cabem no limite interno de ` +
      `${LIMITE_INTERNO_DE_BYTES / 1024 / 1024} MB`,
  };
}

/**
 * A peça está publicável? Tudo que precisa ser verdade antes de virar arquivo.
 *
 * As três primeiras conferências são sobre a peça ser a peça aprovada; a quarta
 * é sobre ela ser aceitável pela Meta. Todas acontecem ANTES do upload, porque
 * arquivo no Storage que não pode publicar é lixo com URL.
 */
export function conferirArte(
  arte: Pick<ArteRenderizada, "capa" | "fontesQueFaltaram" | "temaDegradado" | "largura" | "altura">,
  temFoto: boolean,
): string | null {
  if (arte.temaDegradado) {
    return `o tema não veio do banco (${arte.temaDegradado}): canvas, paleta e fontes sairiam diferentes`;
  }

  if (arte.fontesQueFaltaram.length > 0) {
    return (
      `as fontes ${arte.fontesQueFaltaram.join(", ")} não carregaram: o corpo do texto é medido ` +
      `com a fonte real, então a peça sairia com outra quebra`
    );
  }

  if (temFoto && !arte.capa.comFoto) {
    return `a pauta tem foto aprovada e a arte saiu sem ela (${arte.capa.motivoSemFoto})`;
  }

  if (arte.largura <= 0 || arte.altura <= 0) {
    return `dimensão inválida: ${arte.largura}x${arte.altura}`;
  }

  return null;
}

export type EntradaDoCongelamento = {
  capa: EntradaDaCapa;
  /** Nome estável do arquivo no bucket. Um retry sobrescreve o mesmo objeto. */
  path: string;
  fetcher?: typeof fetch;
  renderizar?: typeof renderizarCapas;
  subir?: typeof subirPngParaStorage;
};

export type ResultadoDoCongelamento =
  | { ok: true; artefato: ArtefatoCongelado }
  | { ok: false; motivo: string };

/**
 * Renderiza, confere, escolhe o formato, sobe e sela com o hash.
 *
 * A ordem importa: tudo que pode reprovar a peça acontece antes do upload, e o
 * hash é calculado sobre os bytes exatos que subiram — não sobre o que se
 * pretendia subir.
 */
export async function congelarArtefato(
  entrada: EntradaDoCongelamento,
): Promise<ResultadoDoCongelamento> {
  const renderizar = entrada.renderizar ?? renderizarCapas;
  const subir = entrada.subir ?? subirPngParaStorage;

  const artes = await renderizar([entrada.capa], { fetcher: entrada.fetcher ?? fetch });
  if (artes.length === 0) return { ok: false, motivo: "o renderizador não devolveu arte" };

  const arte = artes[0];

  const problema = conferirArte(arte, Boolean(entrada.capa.asset));
  if (problema) return { ok: false, motivo: problema };

  const escolha = escolherArquivo(arte);
  if ("erro" in escolha) return { ok: false, motivo: escolha.erro };

  const filename = `social-v2.${escolha.extensao}`;
  const path = `${entrada.path}/${filename}`;
  const url = await subir(escolha.buffer, path);

  if (!url) return { ok: false, motivo: `falha ao subir o artefato para ${path}` };

  return {
    ok: true,
    artefato: {
      url,
      path,
      filename,
      mime: escolha.mime,
      sha256: sha256De(escolha.buffer),
      bytes: escolha.buffer.byteLength,
      largura: arte.largura,
      altura: arte.altura,
      otimizado: escolha.otimizado,
    },
  };
}
