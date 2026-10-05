import { createHash } from "node:crypto";

/**
 * A peça pronta: o que cada ramo entrega para a fila de aprovação.
 *
 * A fila em si é construída em paralelo (05/10/2026), com uma linha por peça
 * contendo ramo, referência e hash do artefato. Este tipo é o contrato entre os
 * dois lados: o ramo produz, a fila enfileira, e nenhum dos dois precisa saber
 * como o outro funciona por dentro.
 *
 * O hash existe para a aprovação valer para O QUE FOI VISTO. Se o conteúdo
 * mudar depois da aprovação (um reparo, uma reescrita), o hash muda e a
 * aprovação antiga deixa de casar. É a mesma lógica do artefato congelado do
 * Instagram, que confere o SHA-256 antes de publicar.
 */
export type Ramo = "newsletter" | "artigo" | "post";

export type PecaPronta<C = unknown> = {
  ramo: Ramo;
  /**
   * O que identifica a peça no próprio canal: o id da edição, o slug do
   * artigo, a chave de idempotência do post. Estável entre execuções do mesmo
   * dia, para a fila não duplicar.
   */
  referenciaId: string;
  /** As pautas que a peça usa, por `storyId`. Uma no artigo e no post. */
  storyIds: string[];
  titulo: string;
  conteudo: C;
  /** SHA-256 do conteúdo serializado de forma estável. */
  hashDoArtefato: string;
  /**
   * O que não bloqueou e precisa ser visto por quem aprova: nota baixa do
   * auditor, apontamento que sobrou depois do reparo, pauta retirada.
   */
  avisos: string[];
  /** Passou no auditor do ramo? Falso quer dizer que a peça NÃO deve sair. */
  aprovadaPeloAuditor: boolean;
  bloqueios: string[];
};

/**
 * Serialização estável: as chaves em ordem, para o mesmo conteúdo dar sempre
 * o mesmo hash. `JSON.stringify` puro depende da ordem de inserção, e duas
 * montagens do mesmo objeto em ordens diferentes dariam aprovações diferentes.
 */
export function serializarEstavel(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(serializarEstavel).join(",")}]`;
  const obj = valor as Record<string, unknown>;
  const chaves = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${serializarEstavel(obj[k])}`).join(",")}}`;
}

export function hashDoArtefato(conteudo: unknown): string {
  return createHash("sha256").update(serializarEstavel(conteudo)).digest("hex");
}

export function montarPeca<C>(dados: Omit<PecaPronta<C>, "hashDoArtefato">): PecaPronta<C> {
  return { ...dados, hashDoArtefato: hashDoArtefato(dados.conteudo) };
}
