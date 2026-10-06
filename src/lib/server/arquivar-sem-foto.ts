import { ehImagemDaBandeira } from "./visual/bandeira";

/**
 * As matérias publicadas que ficaram sem foto real (05/10/2026).
 *
 * A regra nova do dono, "pauta sem foto não vira conteúdo", vale daqui para
 * frente. O que já está no ar sem foto é decisão dele, matéria por matéria:
 * o script `src/scripts/arquivar-sem-foto.ts` lista (ensaio) e só arquiva com
 * `--aplicar`. Puro, sem banco, para o teste conferir a régua.
 *
 * Sem foto quer dizer: capa vazia, ou a capa é uma das bandeiras de último
 * recurso (`ehImagemDaBandeira`, que reconhece também a miniatura do Commons).
 */

export type ArtigoParaConferir = {
  slug: string;
  title?: string | null;
  cover_image: string | null;
  status: string;
  published_at?: string | null;
};

export type MotivoSemFoto = "capa_vazia" | "bandeira";

export function motivoDoArtigoSemFoto(a: Pick<ArtigoParaConferir, "cover_image">): MotivoSemFoto | null {
  const capa = (a.cover_image ?? "").trim();
  if (!capa) return "capa_vazia";
  if (ehImagemDaBandeira(capa)) return "bandeira";
  return null;
}

/** As publicadas sem foto, mais recente primeiro, com o motivo de cada uma. */
export function publicadasSemFoto<A extends ArtigoParaConferir>(artigos: A[]): Array<A & { motivo: MotivoSemFoto }> {
  return artigos
    .filter((a) => a.status === "published")
    .map((a) => ({ ...a, motivo: motivoDoArtigoSemFoto(a) }))
    .filter((a): a is A & { motivo: MotivoSemFoto } => a.motivo !== null)
    .sort((x, y) => String(y.published_at ?? "").localeCompare(String(x.published_at ?? "")));
}
