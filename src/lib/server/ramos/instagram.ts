import type { ResultadoDoSocialDoDia } from "../social/ciclo-do-dia";
import { montarLegenda } from "../social/copy";
import type { LivroDeCustos } from "./custos";
import { montarPeca } from "./peca";
import type { PecaPronta } from "./peca";

/**
 * O ramo do Instagram visto de fora: as peças prontas e o custo.
 *
 * O ciclo social já era independente da newsletter desde setembro (ele roda
 * sobre o pool, antes da composição do e-mail). O que faltava para ele ser um
 * RAMO no sentido de 05/10/2026 era falar a mesma língua dos outros dois: uma
 * peça por post, com referência e hash, para a fila de aprovação, e o custo
 * no livro do dia.
 *
 * Só o que passou na guarda do post vira peça: o que a guarda descartou não
 * tem preview, e não vai para a fila.
 */
export function pecasDoInstagram(social: Pick<ResultadoDoSocialDoDia, "ciclo">): PecaPronta[] {
  return (social.ciclo?.previews ?? []).map((preview) =>
    montarPeca({
      ramo: "post",
      referenciaId: preview.chaveDeIdempotencia,
      storyIds: [preview.post.pauta.storyId],
      titulo: preview.post.copy.headline,
      conteudo: {
        copy: preview.post.copy,
        legenda: montarLegenda(preview.post.copy),
        carrossel: preview.post.carrossel ?? null,
        imagem: preview.visual?.asset?.imageUrl ?? null,
        vaga: preview.vaga,
      },
      avisos: preview.post.reparosAplicados.flat().map((r) => `reparado: ${r.motivo}`),
      aprovadaPeloAuditor: true,
      bloqueios: [],
    }),
  );
}

export function lancarCustosDoInstagram(
  livro: LivroDeCustos,
  social: Pick<ResultadoDoSocialDoDia, "ciclo" | "conferencia">,
): void {
  const d = social.conferencia?.diagnostico;
  livro.lancar("verificacao", "post", d?.custoUsd ?? 0, d?.tokens ?? 0);
  for (const preview of social.ciclo?.previews ?? []) {
    livro.lancar("redacao", "post", preview.post.custoUsd, preview.post.tokens);
  }
}
