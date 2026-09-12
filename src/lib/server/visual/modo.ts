/**
 * Em que estado o resolvedor de imagem por entidade roda.
 *
 * Mesma disciplina da guarda editorial, e pelo mesmo motivo: subir código não
 * pode trocar o comportamento da newsletter. A troca é uma decisão declarada
 * numa variável, e valor irreconhecível cai no modo que não muda nada.
 *
 *   off       caminho da fase 1, sem tocar em nada
 *   dry_run   o V2 roda inteiro, o diagnóstico volta na resposta, e quem
 *             ilustra a edição continua sendo o caminho da fase 1
 *   enforce   o V2 decide a imagem, e sem imagem válida a pauta sai sem foto
 */

import { resolverCapacidade } from "../capacidades";
import type { ProjetoComCapacidades } from "../capacidades";

export type ModoVisual = "off" | "dry_run" | "enforce";

export function modoDoResolvedorVisual(
  env: Record<string, string | undefined> = process.env,
  projeto?: ProjetoComCapacidades | null,
): ModoVisual {
  return resolverCapacidade("visual", () => doAmbiente(env), projeto);
}

function doAmbiente(env: Record<string, string | undefined>): ModoVisual {
  const bruto = (env.VISUAL_RESOLVER_V2 || "").trim().toLowerCase();
  if (bruto === "enforce") return "enforce";
  if (bruto === "dry_run") return "dry_run";
  return "off";
}

export function descreverModoVisual(modo: ModoVisual): string {
  if (modo === "enforce") return "no comando, decide a imagem de cada pauta";
  if (modo === "dry_run") return "em observação, registra o que escolheria sem alterar a edição";
  return "desligado, a imagem vem do caminho da fase 1";
}

/** Resumo não sensível, para a resposta da rota admin. */
export type DiagnosticoVisual = {
  storiesProcessed: number;
  assetsSelected: number;
  noValidImage: number;
  ambiguousEntity: number;
  sourcesUsed: Record<string, number>;
};

export function diagnosticoVazio(): DiagnosticoVisual {
  return {
    storiesProcessed: 0,
    assetsSelected: 0,
    noValidImage: 0,
    ambiguousEntity: 0,
    sourcesUsed: {},
  };
}
